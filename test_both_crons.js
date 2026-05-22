require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");

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

    const UserStakeReward = require("./models/userStakingReward.model");
    const UserOtherReward = require("./models/userOtherReward.model");

    // ── STEP 1: Snapshot counts before ─────────────────────────────────
    const beforeStake = await UserStakeReward.countDocuments();
    const beforeIncome = await UserOtherReward.countDocuments();
    console.log(SEPARATOR);
    console.log(`📊 BEFORE — StakeRewards: ${beforeStake}, IncomeRewards: ${beforeIncome}`);
    console.log(SEPARATOR);

    // ── STEP 2: Run Staking Cron ────────────────────────────────────────
    console.log("\n🚀 Running STAKING CRON...");
    const { stakeRewardCron } = require("./cron/calculateStakingReward");
    await stakeRewardCron();
    console.log("✅ Staking cron finished.\n");

    // ── STEP 3: Check staking reward results ───────────────────────────
    const afterStake = await UserStakeReward.countDocuments();
    const newStakeCount = afterStake - beforeStake;
    console.log(SEPARATOR);
    console.log(`📊 STAKING RESULTS — New rewards created: ${newStakeCount}`);

    const recentStakeRewards = await UserStakeReward.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "email userName");

    console.log(`\n  Last ${recentStakeRewards.length} staking rewards:`);
    for (const r of recentStakeRewards) {
      console.log(`  ✔ User: ${r.userId?.email || r.userId}, Amount: ${r.amount}, CreatedAt: ${r.createdAt}`);
    }

    if (newStakeCount === 0) {
      console.log("\n  ⚠️  No new staking rewards — either all rewards were already created in the lookback window, or no active stakes were found.");
    }

    // ── STEP 4: Run Income Cron ─────────────────────────────────────────
    console.log(`\n${SEPARATOR}`);
    console.log("\n🚀 Running INCOME (LEVEL BONUS) CRON...");
    const { saveIncomeLevelReward } = require("./cron/incomeReward");

    // Temporarily reset referralProcessedAt so the cron treats all users as unprocessed
    const User = require("./models/user.model");
    const resetResult = await User.updateMany(
      {},
      { $unset: { referralProcessedAt: "" } }
    );
    console.log(`  ℹ️  Reset referralProcessedAt for ${resetResult.modifiedCount} users so cron processes all.`);

    await saveIncomeLevelReward();
    console.log("✅ Income cron finished.\n");

    // ── STEP 5: Check income reward results ────────────────────────────
    const afterIncome = await UserOtherReward.countDocuments();
    const newIncomeCount = afterIncome - beforeIncome;
    console.log(SEPARATOR);
    console.log(`📊 INCOME RESULTS — New level rewards created: ${newIncomeCount}`);

    const recentIncomeRewards = await UserOtherReward.find({ type: "income_level" })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "email userName");

    console.log(`\n  Last ${recentIncomeRewards.length} income rewards:`);
    for (const r of recentIncomeRewards) {
      console.log(`  ✔ User: ${r.userId?.email || r.userId}, Amount: ${r.amount}, StakeRewardId: ${r.stakeRewardId}, CreatedAt: ${r.createdAt}`);
    }

    if (newIncomeCount === 0) {
      console.log("\n  ⚠️  No new income rewards — either no eligible team members were found or all rewards already exist.");
    }

    // ── STEP 6: Timestamp alignment check ─────────────────────────────
    console.log(`\n${SEPARATOR}`);
    console.log("🔍 TIMESTAMP ALIGNMENT CHECK — Do income createdAt match staking createdAt?");
    let mismatches = 0;
    for (const income of recentIncomeRewards) {
      if (!income.stakeRewardId) continue;
      const sourceStakeReward = await UserStakeReward.findById(income.stakeRewardId);
      if (!sourceStakeReward) continue;
      const diff = Math.abs(new Date(income.createdAt) - new Date(sourceStakeReward.createdAt));
      const aligned = diff < 1000; // within 1 second
      if (!aligned) mismatches++;
      console.log(`  ${aligned ? "✅" : "❌"} IncomeReward ${income._id}: createdAt=${income.createdAt} | Source StakeReward: ${sourceStakeReward.createdAt} | diff=${diff}ms`);
    }
    if (mismatches === 0 && recentIncomeRewards.length > 0) {
      console.log("\n  ✅ All income reward timestamps correctly align with their source staking rewards!");
    } else if (mismatches > 0) {
      console.log(`\n  ⚠️  ${mismatches} income reward(s) have mismatched timestamps.`);
    }

    // ── STEP 7: Idempotency check ──────────────────────────────────────
    console.log(`\n${SEPARATOR}`);
    console.log("🔄 IDEMPOTENCY CHECK — Running income cron again (should create 0 new records)...");
    const beforeIdempotency = await UserOtherReward.countDocuments();

    // Reset referralProcessedAt again so the cron re-evaluates all users
    await User.updateMany({}, { $unset: { referralProcessedAt: "" } });
    await saveIncomeLevelReward();

    const afterIdempotency = await UserOtherReward.countDocuments();
    const idempotentNew = afterIdempotency - beforeIdempotency;
    if (idempotentNew === 0) {
      console.log("  ✅ Idempotent — 0 duplicate records created on second run.");
    } else {
      console.log(`  ❌ ${idempotentNew} unexpected duplicate records were created!`);
    }

    // ── SUMMARY ────────────────────────────────────────────────────────
    console.log(`\n${SEPARATOR}`);
    console.log("📋 FINAL SUMMARY");
    console.log(`  Staking rewards created   : ${newStakeCount}`);
    console.log(`  Level income rewards created: ${newIncomeCount}`);
    console.log(`  Timestamp mismatches      : ${mismatches}`);
    console.log(`  Idempotency duplicates    : ${idempotentNew}`);
    console.log(SEPARATOR);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
};

run();
