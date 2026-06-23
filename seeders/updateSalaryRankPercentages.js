/**
 * updateSalaryRankPercentages.js
 *
 * One-shot DB migration seeder
 * ─────────────────────────────
 * Updates the `rewardPercentage` field on each of the 7 Salary Rank
 * documents to match the new Salary Rank structure:
 *
 *   starKey 1 → 2%      starKey 2 → 2%      starKey 3 → 2%
 *   starKey 4 → 2.5%    starKey 5 → 3%      starKey 6 → 3.5%
 *   starKey 7 → 5%
 *
 * Run ONCE with:
 *   node seeders/updateSalaryRankPercentages.js
 *
 * Safe to re-run — uses updateOne with no side-effects beyond the field change.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Rank     = require("../models/rank.model");

const SALARY_RANK_PERCENTAGES = [
  { starKey: 1, rewardPercentage: "2"   },
  { starKey: 2, rewardPercentage: "2"   },
  { starKey: 3, rewardPercentage: "2"   },
  { starKey: 4, rewardPercentage: "2.5" },
  { starKey: 5, rewardPercentage: "3"   },
  { starKey: 6, rewardPercentage: "3.5" },
  { starKey: 7, rewardPercentage: "5"   },
];

const run = async () => {
  await mongoose.connect(process.env.DB_URI || process.env.MONGO_URI, {
    useNewUrlParser:    true,
    useUnifiedTopology: true,
  });

  console.log("✅ Connected to MongoDB");
  console.log("📦 Updating Salary Rank rewardPercentage values...\n");

  for (const entry of SALARY_RANK_PERCENTAGES) {
    const result = await Rank.updateOne(
      { starKey: entry.starKey },
      { $set: { rewardPercentage: entry.rewardPercentage } }
    );

    if (result.matchedCount === 0) {
      console.warn(
        `  ⚠️  starKey ${entry.starKey} — no matching Rank found in DB. ` +
        `Please ensure this rank exists.`
      );
    } else {
      console.log(
        `  ✅ starKey ${entry.starKey} → rewardPercentage set to ${entry.rewardPercentage}%` +
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
