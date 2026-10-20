/**
 * updateSalaryRankPercentages.js
 *
 * One-shot DB migration seeder
 * ─────────────────────────────
 * Updates the 7 Salary Rank documents to the 2X Fast-Track structure:
 *
 *   Rank 1 →     5 directs →  2%      Rank 2 →    25 directs →  4%
 *   Rank 3 →   125 directs →  6%      Rank 4 →   625 directs →  8.5%
 *   Rank 5 →  3125 directs → 11.5%    Rank 6 → 15625 directs → 15%
 *   Rank 7 → 78125 directs → 20%
 *
 * NOTE: percentages are NOMINAL shares of each withdrawal. The salary
 * service caps the total paid at FAST_TRACK.SALARY_POOL_PERCENTAGE (20%)
 * and scales achieved ranks proportionally when their sum exceeds it.
 *
 * Legacy qualification fields (selfBusiness / directBussiness /
 * totalTeamBusiness / totalTeamSize) are also aligned to the 5 BW model so
 * nothing else in the system still carries the old $100/$1000 thresholds.
 *
 * Run ONCE with:
 *   node seeders/updateSalaryRankPercentages.js
 *
 * Safe to re-run — uses updateOne with no side-effects beyond the field change.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Rank     = require("../models/rank.model");
const { FAST_TRACK } = require("../config/constants");

const PERCENTAGES = ["2", "4", "6", "8.5", "11.5", "15", "20"];

const SALARY_RANK_PERCENTAGES = FAST_TRACK.RANK_DIRECT_THRESHOLDS.map((directs, idx) => ({
  starKey: idx + 1,
  directTeam: String(directs),
  rewardPercentage: PERCENTAGES[idx],
  selfBusiness: String(FAST_TRACK.STAKE_AMOUNT),
  directBussiness: String(directs * FAST_TRACK.STAKE_AMOUNT),
  totalTeamBusiness: "0",
  totalTeamSize: "0",
}));

const run = async () => {
  const uri = process.env.MONGO_DATABASE_BASE_URI;
  if (!uri) {
    throw new Error(
      "MONGO_DATABASE_BASE_URI is missing. Add it to Server/.env (same variable the API uses)."
    );
  }
  await mongoose.connect(uri);

  console.log("✅ Connected to MongoDB");
  console.log("📦 Updating Salary Rank directTeam & rewardPercentage values...\n");

  for (const entry of SALARY_RANK_PERCENTAGES) {
    const result = await Rank.updateOne(
      { starKey: entry.starKey },
      {
        $set: {
          rewardPercentage:  entry.rewardPercentage,
          directTeam:        entry.directTeam,
          selfBusiness:      entry.selfBusiness,
          directBussiness:   entry.directBussiness,
          totalTeamBusiness: entry.totalTeamBusiness,
          totalTeamSize:     entry.totalTeamSize,
        },
      }
    );

    if (result.matchedCount === 0) {
      console.warn(
        `  ⚠️  starKey ${entry.starKey} — no matching Rank found in DB. ` +
        `Please ensure this rank exists.`
      );
    } else {
      console.log(
        `  ✅ starKey ${entry.starKey} → directs: ${entry.directTeam}, rewardPercentage: ${entry.rewardPercentage}%` +
        (result.modifiedCount === 0 ? " (already up to date)" : " (updated)")
      );
    }
  }

  console.log("\n🎉 Migration complete.");

  // Verify — print all ranks for confirmation
  const allRanks = await Rank.find({}).sort({ starKey: 1 }).lean();
  console.log("\nCurrent Rank rewardPercentages:");
  allRanks.forEach((r) => {
    console.log(`  Rank ${r.starKey} (${r.title}): ${r.rewardPercentage}%`);
  });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
