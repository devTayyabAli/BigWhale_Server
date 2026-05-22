require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const UserStakeReward = require("./models/userStakingReward.model");
const UserOtherReward = require("./models/userOtherReward.model");

const run = async () => {
  try {
    console.log("Connecting to database...");
    await new Promise((resolve) => {
      connectDB();
      mongoose.connection.once("open", resolve);
    });

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    console.log(`Searching for records created since: ${thirtyMinutesAgo.toISOString()}`);

    const stakeRewards = await UserStakeReward.find({
      createdAt: { $gte: thirtyMinutesAgo }
    }).sort({ createdAt: -1 });

    const otherRewards = await UserOtherReward.find({
      createdAt: { $gte: thirtyMinutesAgo }
    }).sort({ createdAt: -1 });

    console.log(`\n--- Staking Rewards Created in Last 30 Minutes (${stakeRewards.length}) ---`);
    stakeRewards.forEach((r) => {
      console.log(`ID: ${r._id}, UserId: ${r.userId}, StakeId: ${r.stakeId}, Amount: ${r.amount}, CreatedAt: ${r.createdAt}`);
    });

    console.log(`\n--- Level Income Rewards Created in Last 30 Minutes (${otherRewards.length}) ---`);
    otherRewards.forEach((r) => {
      console.log(`ID: ${r._id}, UserId: ${r.userId}, StakeId: ${r.stakeId}, StakeRewardId: ${r.stakeRewardId}, Amount: ${r.amount}, CreatedAt: ${r.createdAt}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Failed:", error);
    process.exit(1);
  }
};

run();
