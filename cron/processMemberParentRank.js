const moment = require("moment");
const UserParent = require("../models/userParent.model");
const rankService = require("../services/rank");
const giftService = require("../services/gift");
const { sendRankUpdationEmail } = require("../helpers/mail");
const socket = require("../helpers/sockets");
const Notification = require("../models/notification.model");
const cron = require("node-cron");
const CronLog = require("../models/cronLogs.model");
const { sendCronFailureEmail } = require("../helpers/mail");

let timeout;
let retryCount = 0;

const processParentRankCron = cron.schedule("15 0 * * *", async () => {
  try {
    await processMemberParentRank();
    console.log("Successfully process the processParentRankCron cron");
  } catch (error) {
    console.log(
      "Failed to process processParentRankCron cron: ",
      error?.message
    );
  }
});

const processMemberParentRank = async () => {
  try {
    let rankDetails = {};
    const startDate = moment().subtract(1, "day").toDate();
    const startOfToday = new Date(startDate.setUTCHours(0, 0, 0, 0));

    const memberParents = await UserParent.find({ processedAt: null }).sort({
      createdAt: -1,
    });

    if (memberParents.length > 0) {
      const userIds = memberParents.map((parent) => parent.userId);
      const userDetails = await rankService.getDetailsForMemberParent(
        startOfToday,
        userIds
      );

      rankDetails = await rankService.processDataForRankDetails(
        userDetails,
        startDate
      );
      await rankService.updateParentRank(rankDetails);
      await updateParentProcessedAt(memberParents, startOfToday);

      await notifyUserAndFireEmit(rankDetails);
      await giftService.saveAndNotifyRankGiftRequest(rankDetails);
    }
  } catch (error) {
    CronLog.create({
      title: "processParentRankCron",
      error: error?.message,
    });
    console.log("🚀 ~ Something went wrong in processParentRankCron:", error.message);
    if (retryCount < process.env.MAX_RETRIES) {
      if (timeout) clearTimeout(timeout);
      retryCount++;

      console.log(
        `Retrying in ${process.env.RETRY_INTERVAL / 1000} seconds...`
      );

      timeout = setTimeout(async () => {
        console.log("Retrying processParentRankCron ...");
        await processMemberParentRank();
      }, process.env.RETRY_INTERVAL);
    } else {
      console.error(`Maximum retries reached for processParentRankCron.`);
      await sendCronFailureEmail("processParentRankCron");
    }
  }
};

const updateParentProcessedAt = async (payload, startOfToday) => {
  payload.map(async (data) => {
    await UserParent.updateOne(
      { _id: new ObjectId(data?._id) },
      { processedAt: startOfToday }
    );
  });
};

const notifyUserAndFireEmit = async (object) => {
  for (let i = 0; i < object.length; i++) {
    const user = object[i]?.users;
    const rank = object[i]?.rank;

    await sendRankUpdationEmail(user?.email, rank);

    const createNotification = await Notification.create({
      userId: user?._id,
      notificationType: "Rank Updation",
      description: `${user?._id} rank has been updated to ${rank?.title}`,
    });

    if (createNotification) {
      // ── Notify the user in their own room ─────────────────────────────
      socket.io
        .to(`${user?._id}`)
        .emit("rankUpdationNotification", {
          title: createNotification?.notificationType,
          description: createNotification?.description,
        });

      // ── Notify all admins via the global admin-events channel ──────────
      socket.io.emit("admin-events", {
        type: "rank_achieved",
        title: "🏆 Rank Achieved",
        description: `${user?.userName || user?.email} has achieved ${rank?.title}`,
        userId: user?._id,
        rankTitle: rank?.title,
        starKey: rank?.starKey,
        createdAt: new Date(),
      });
    }
  }
};

module.exports = { processMemberParentRank, processParentRankCron };
