require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const UserStakeReward = require("../models/userStakingReward.model");
const UserOtherReward = require("../models/userOtherReward.model");
const moment = require("moment-timezone");

const runCleanup = async () => {
  try {
    console.log("🔌 Connecting to database...");
    await new Promise((resolve) => {
      connectDB();
      mongoose.connection.once("open", resolve);
    });
    console.log("✅ Connected.\n");

    const allRewards = await UserStakeReward.find().sort({ _id: 1 });
    console.log(`Total staking rewards in database: ${allRewards.length}`);

    // Group rewards by stakeId + calendar day (in UTC)
    const groups = new Map();

    for (const reward of allRewards) {
      const dayStr = moment.utc(reward.createdAt).format("YYYY-MM-DD");
      const key = `${reward.stakeId.toString()}_${dayStr}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(reward);
    }

    let deletedStakingRewardsCount = 0;
    let deletedIncomeRewardsCount = 0;

    for (const [key, rewards] of groups.entries()) {
      if (rewards.length > 1) {
        console.log(`\n⚠️  Found ${rewards.length} duplicate rewards for key: ${key}`);
        // Keep the first (earliest), delete the rest
        const keep = rewards[0];
        const duplicates = rewards.slice(1);

        console.log(`  Keeping reward ID: ${keep._id} (Created: ${keep.createdAt})`);

        for (const dup of duplicates) {
          console.log(`  Deleting duplicate reward ID: ${dup._id} (Created: ${dup.createdAt})`);

          // 1. Delete duplicate staking reward
          await UserStakeReward.deleteOne({ _id: dup._id });
          deletedStakingRewardsCount++;

          // 2. Delete corresponding level income rewards linked to this duplicate staking reward
          const deletedIncome = await UserOtherReward.deleteMany({
            stakeRewardId: dup._id,
          });
          deletedIncomeRewardsCount += deletedIncome.deletedCount;
          if (deletedIncome.deletedCount > 0) {
            console.log(`    Deleted ${deletedIncome.deletedCount} associated level income rewards for stakeRewardId ${dup._id}`);
          }
        }
      }
    }

    console.log("\n" + "─".repeat(60));
    console.log("📋 CLEANUP SUMMARY:");
    console.log(`  Deleted Duplicate Staking Rewards : ${deletedStakingRewardsCount}`);
    console.log(`  Deleted Associated Level Income Rewards : ${deletedIncomeRewardsCount}`);
    console.log("─".repeat(60));

    process.exit(0);
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  }
};

runCleanup();
