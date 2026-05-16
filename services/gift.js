const { DEFAULT_STATUS, SEARCH_KEY } = require("../config/constants");
const { sendRankGiftRequestEmail } = require("../helpers/mail");
const RankGiftRequest = require("../models/rankGiftRequest.model");
const User = require("../models/user.model");
const Notification = require("../models/notification.model");
const socket = require("../helpers/sockets");
const { ObjectId } = require("mongoose").Types;
const moment = require('moment');
const Rank = require("../models/rank.model");
const Gift = require("../models/gift.model");

const saveAndNotifyRankGiftRequest = async (userDetails) => {
  const admin = await User.find({ role: "admin" });

  for (let i = 0; i < userDetails.length; i++) {
    await saveRankGiftRequest(userDetails[i]);
    if (admin.length > 0) {
      await notifyAdminAndFireEmit(admin, userDetails[i]);
    }
  }
};

const notifyAdminAndFireEmit = async (admin, object) => {
  await sendRankGiftRequestEmail(admin?.email, object);
  const createNotification = await Notification.create({
    userId: object?.users?._id,
    notificationType: "Rank Gift Request",
    description: `User with email ${object?.users?.email} requested for gift ${object?.rank?.giftId?.title}`,
  });

  if (createNotification) {
    socket.io.emit("admin-events", {
      title: createNotification?.notificationType,
      description: createNotification?.description,
    });
  }
};

const saveRankGiftRequest = async (data) => {
  const filter = {
    userId: data.userId,
    rankId: data.rankId,
    giftId: data?.rank?.giftId,
    status: DEFAULT_STATUS.PENDING,
  };

  const update = {
    userId: data?.userId,
    rankId: data?.rankId,
    giftId: data?.rank?.giftId,
    status: DEFAULT_STATUS.PENDING,
  };

  const options = {
    upsert: true,
    new: true,
  };

  return await RankGiftRequest.updateOne(filter, update, options);
};

const getGiftRequests = async (req, response) => {
  const { status, page = 1, limit = 10, startDate, endDate, search, starReward, gift } = req.query;
  const skip = (page - 1) * limit;
  const matchQuery = {};

  if (status !== null && status !== undefined) {
    matchQuery.status = status;
  }

  if (startDate && endDate) {
    matchQuery.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else if (search === SEARCH_KEY.DAILY) {
    matchQuery.createdAt = {
      $gte: moment().startOf('day').toDate(),
      $lte: moment().endOf('day').toDate()
    };
  } else if (search === SEARCH_KEY.WEEKLY) {
    matchQuery.createdAt = {
      $gte: moment().startOf('week').toDate(),
      $lte: moment().endOf('week').toDate()
    };
  } else if (search === SEARCH_KEY.MONTHLY) {
    matchQuery.createdAt = {
      $gte: moment().startOf('month').toDate(),
      $lte: moment().endOf('month').toDate()
    };
  }

  if (starReward) {
    const modifiedVal = starReward.split("-").join(" ");
    const rank = await Rank.findOne({ title: modifiedVal });
    if (rank) {
      matchQuery.rankId = rank._id;
    }
  }

  if (gift) {
    const giftObj = await Gift.findOne({ title: gift });
    if (giftObj) {
      matchQuery.giftId = giftObj._id;
    }
  }
  
  const giftRequest = await RankGiftRequest.find(matchQuery)
    .populate("giftId")
    .populate("rankId")
    .populate("userId")
    .skip(skip)
    .limit(parseInt(limit));

  const totalCount = await RankGiftRequest.countDocuments(matchQuery);
  response.message = "Gift's request fetched successfully";
  response.status = 200;
  response.data = {
    giftRequest,
    page,
    next: page * limit < totalCount,
    previous: page > 1,
    totalRecords: totalCount,
  } || [];
  return response;
};

const updateGiftRequestStatus = async (req, response) => {
  const giftRequestId = req.params?.id;
  const { status } = req.body;

  const updatedRequest = await RankGiftRequest.findOneAndUpdate(
    { _id: new ObjectId(giftRequestId), status: DEFAULT_STATUS.PENDING },
    { status: status, updatedBy: req.user?.id }
  );

  if (!updatedRequest) {
    response.success = false;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }

  response.message = "Gift's request updated successfully";
  response.status = 200;
  return response;
};

module.exports = {
  saveAndNotifyRankGiftRequest,
  getGiftRequests,
  updateGiftRequestStatus,
};
