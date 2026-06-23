require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const User = require("./models/user.model");
const UserOtherReward = require("./models/userOtherReward.model");
const Rank = require("./models/rank.model");
const salaryRankService = require("./services/salaryRank");

const SEPARATOR = "─".repeat(60);

const run = async () => {
  try {
    console.log(SEPARATOR);
    console.log("🔌 Connecting to database...");
    await new Promise((resolve) => {
      connectDB();
      mongoose.connection.once("open", resolve);
    });
    console.log("✅ Connected.\n");

    const emailOrWallet = process.argv[2];
    const rankToSet = parseInt(process.argv[3]) || 1;
    const testWithdrawalAmount = parseFloat(process.argv[4]) || 1000;

    if (!emailOrWallet) {
      console.log("❌ Missing user parameter.");
      console.log("Usage: node test_salary_reward.js <email_or_wallet> [rank_to_set: 1-7] [withdrawal_amount]");
      console.log("\nListing top 10 users in DB to help you choose:");
      const users = await User.find({}).limit(10).select("email walletAddress userRankId").lean();
      for (const u of users) {
        console.log(`  - Email: ${u.email} | Wallet: ${u.walletAddress || "N/A"} | Current Rank: ${u.userRankId || "None"}`);
      }
      process.exit(1);
    }

    // Find User
    const user = await User.findOne({
      $or: [
        { email: emailOrWallet.toLowerCase() },
        { walletAddress: { $regex: new RegExp(`^${emailOrWallet}$`, "i") } }
      ]
    });

    if (!user) {
      console.log(`❌ No user found matching: ${emailOrWallet}`);
      process.exit(1);
    }

    console.log(SEPARATOR);
    console.log(`👤 Found User:`);
    console.log(`  ID: ${user._id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Wallet: ${user.walletAddress || "N/A"}`);
    console.log(`  Current userRankId: ${user.userRankId || "None"}`);
    console.log(SEPARATOR);

    // Promote User
    console.log(`⭐ Setting userRankId to ${rankToSet}...`);
    user.userRankId = rankToSet;
    user.status = "active"; // Ensure user is active to receive rewards
    await user.save();
    console.log(`✅ userRankId updated successfully to ${rankToSet} and status set to active.`);
    console.log(SEPARATOR);

    // Run Salary Distribution
    console.log(`💸 Simulating a withdrawal of ${testWithdrawalAmount} BW...`);
    console.log(`   (This will distribute 20% total = ${testWithdrawalAmount * 0.2} BW across active ranks)`);
    
    const beforeCount = await UserOtherReward.countDocuments({ userId: user._id, type: "salary_rank" });
    
    const result = await salaryRankService.distributeSalaryRankReward(testWithdrawalAmount);
    console.log("✅ Distribution service finished run:", result);
    console.log(SEPARATOR);

    // Verify rewards created
    const rewards = await UserOtherReward.find({ userId: user._id, type: "salary_rank" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("rankId", "title starKey rewardPercentage")
      .lean();

    const afterCount = await UserOtherReward.countDocuments({ userId: user._id, type: "salary_rank" });
    const newRewardsCount = afterCount - beforeCount;

    console.log(`📊 SALARY REWARD HISTORY for ${user.email}:`);
    console.log(`Total salary rank records: ${afterCount} (${newRewardsCount} new created in this run)`);
    console.log(`\nLast ${rewards.length} rewards:`);
    for (const r of rewards) {
      console.log(`  ✔ Rank: ${r.rankId?.title} (Star ${r.rankId?.starKey}) | Shared Reward: ${r.amount} BW | Date: ${r.createdAt}`);
    }
    console.log(SEPARATOR);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test script failed:", error);
    process.exit(1);
  }
};

run();
