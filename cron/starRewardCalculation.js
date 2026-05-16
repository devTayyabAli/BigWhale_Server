const { sendRankUpdationEmail, sendCronFailureEmail } = require("../helpers/mail");
const socket = require("../helpers/sockets");
const rankService = require("../services/rank");
const Notification = require("../models/notification.model");
const moment = require("moment");
const cron = require("node-cron");
const User = require("../models/user.model");
const { ObjectId } = require("mongoose").Types;
const giftService = require("../services/gift");
const CronLog = require("../models/cronLogs.model")

let timeout;
let retryCount = 0;
const cronTiming = process.env.APP_ENV !== "production" ? "*/10 * * * *" : "10 0 * * *";

const calculateAndUpdateUserStarRank = cron.schedule(cronTiming, async () => {
  try {
    const response = await getAndUpdateUserRanks();
    console.log(
      "Successfully process the calculateAndUpdateUserStarRank cron job",
      response
    );
  } catch (error) {
    console.log(
      "Failed to process calculateAndUpdateUserStarRank cron: ",
      error?.message
    );
  }
});

const getAndUpdateUserRanks = async () => {
  try {
    let response = {};
    const startDate = moment().subtract(1, "day").toDate();
    const startOfToday = new Date(startDate.setUTCHours(0, 0, 0, 0));
    const users = await rankService.getUserDetailsForStarRank(startOfToday);

    if (users.length > 0) {
      let userRankPayload = await rankService.processDataForRankDetails(
        users,
        startDate
      );

      let userRankPayloadIds = userRankPayload.map((item) => item?.userId);
      const userIdsToUpdate = users
        .filter((user) => user?._id && !userRankPayloadIds.includes(user?._id))
        .map((user) => user?._id);

      if (userIdsToUpdate?.length > 0) {
        await User.updateMany(
          { _id: { $in: userIdsToUpdate } },
          { $set: { userRankId: null } }
        );
      }
    
      // if user's previous rank and current rank is same
      // then do not update
      userRankPayloadIds = userRankPayload
        .filter((rankPayload) => rankPayload?.users?.userRankId != rankPayload?.rank?.starKey)
        .map((item) => item.userId);
        
      await updateProcessedRecords(users, startOfToday);
      userRankPayload = userRankPayload.filter((data) => data?.userId && userRankPayloadIds.includes(data?.userId))

      response = await rankService.createUserRank(
        userRankPayloadIds,
        users,
        userRankPayload
      );
      
      await notifyUserAndFireEmit(userRankPayload);
      await giftService.saveAndNotifyRankGiftRequest(userRankPayload);
    }

    return response;
  } catch (error) {
    CronLog.create({
      title: "starRewardCalculationCron",
      error: error?.message,
    });
    console.log("🚀 ~ Something went wrong in updateStarRankCron:", error?.message);
    if (retryCount < process.env.MAX_RETRIES) {
      if (timeout) clearTimeout(timeout);
      retryCount++;

      console.log(
        `Retrying in ${process.env.RETRY_INTERVAL / 1000} seconds...`
      );

      timeout = setTimeout(async () => {
        console.log("Retrying calculateAndUpdateUserStarRank ...");
        await getAndUpdateUserRanks();
      }, process.env.RETRY_INTERVAL);
    } else {
      console.error(`Maximum retries reached for starRewardCalculationCron.`);
      await sendCronFailureEmail("starRewardCalculationCron");
    }
  }
};

const updateProcessedRecords = async (payload, startOfToday) => {
  payload.map(async (data) => {
    await User.updateOne(
      { _id: new ObjectId(data?._id) },
      { processedAt: startOfToday }
    );
  });
};

const notifyUserAndFireEmit = async (object) => {
  for (let i = 0; i < object.length; i++) {
    await sendRankUpdationEmail(object[i]?.users?.email, object[i]?.rank);
    const createNotification = await Notification.create({
      userId: object[i]?.users?._id,
      notificationType: "Rank Updation",
      description: `${object[i]?.users?._id} rank has been updated to ${object[i]?.rank?.title}`,
    });

    if (createNotification) {
      socket.io
        .to(`${object[i]?.users?._id}`)
        .emit("rankUpdationNotification", {
          title: createNotification?.notificationType,
          description: createNotification?.description,
        });
    }
  }
};

module.exports = {
  getAndUpdateUserRanks,
  calculateAndUpdateUserStarRank,
};
