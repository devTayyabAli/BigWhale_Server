/**
 * salaryRank.js
 *
 * Salary Rank Distribution Service
 *
 * How it works:
 *  On every confirmed withdrawal, 20% of the total amount is distributed
 *  as "Lifetime Salary" to active salary rank holders (Ranks 1–7).
 *
 *  Each rank has a fixed sub-pool percentage:
 *    Rank 1 → 2%   Rank 2 → 2%   Rank 3 → 2%
 *    Rank 4 → 2.5% Rank 5 → 3%   Rank 6 → 3.5% Rank 7 → 5%
 *    Total  → 20%
 *
 *  If multiple users hold the same rank they SPLIT that rank's pool equally
 *  (Option B — sustainable; company never over-pays beyond 20%).
 *
 *  If no user holds a rank yet, that rank's share is logged as
 *  "unachieved" — to be credited to the company/liquidity wallet.
 *
 *  Distribution is fire-and-forget; failures are logged but never
 *  block or roll back the underlying withdrawal.
 */

const Rank           = require("../models/rank.model");
const User           = require("../models/user.model");
const UserOtherReward = require("../models/userOtherReward.model");
const { OTHER_REWARD, DEFAULT_STATUS } = require("../config/constants");

/**
 * Distribute salary rank rewards for a single confirmed withdrawal.
 *
 * @param {number} totalWithdrawalAmount  - The FULL withdrawal amount (BW)
 *                                          before the 80/20 split.
 * @returns {Promise<{ distributed: number, unachieved: number }>}
 */
const distributeSalaryRankReward = async (totalWithdrawalAmount) => {
  if (!totalWithdrawalAmount || totalWithdrawalAmount <= 0) {
    return { distributed: 0, unachieved: 0 };
  }

  let totalDistributed = 0;
  let totalUnachieved  = 0;

  try {
    // ── 1. Load all 7 salary ranks ordered by starKey ────────────────────
    const ranks = await Rank.find({}).sort({ starKey: 1 }).lean();

    if (!ranks || ranks.length === 0) {
      console.warn("distributeSalaryRankReward: no ranks found in DB — skipping.");
      return { distributed: 0, unachieved: totalWithdrawalAmount };
    }

    // ── 2. Process each rank ─────────────────────────────────────────────
    const rewardDocs = [];

    for (const rank of ranks) {
      const rewardPercentage = Number(rank.rewardPercentage) || 0;
      if (rewardPercentage <= 0) continue;

      // Pool share for this rank (e.g. 2% of total withdrawal)
      const rankPoolAmount = Number(
        (totalWithdrawalAmount * (rewardPercentage / 100)).toFixed(8)
      );

      if (rankPoolAmount <= 0) continue;

      // ── 3. Find all active users who have achieved this rank ───────────
      //       userRankId stores the starKey of the highest achieved rank.
      //       A user qualifies if their userRankId >= this rank's starKey.
      const holders = await User.find({
        status:     DEFAULT_STATUS.ACTIVE,
        userRankId: { $gte: rank.starKey },
      })
        .select("_id")
        .lean();

      if (!holders || holders.length === 0) {
        // No one has achieved this rank yet — amount goes to company wallet
        console.log(
          `distributeSalaryRankReward: rank ${rank.starKey} (${rewardPercentage}%) ` +
          `not achieved — ${rankPoolAmount} BW → company/liquidity wallet.`
        );
        totalUnachieved = Number((totalUnachieved + rankPoolAmount).toFixed(8));
        continue;
      }

      // ── 4. Split pool equally among all holders ────────────────────────
      const perUserAmount = Number(
        (rankPoolAmount / holders.length).toFixed(8)
      );

      if (perUserAmount <= 0) continue;

      for (const holder of holders) {
        rewardDocs.push({
          userId:           holder._id,
          type:             OTHER_REWARD.SALARY_RANK,
          amount:           String(perUserAmount),
          rankId:           rank._id,
          rewardPercentage: rewardPercentage,
        });
      }

      totalDistributed = Number(
        (totalDistributed + rankPoolAmount).toFixed(8)
      );

      console.log(
        `distributeSalaryRankReward: rank ${rank.starKey} (${rewardPercentage}%) — ` +
        `${rankPoolAmount} BW split among ${holders.length} holder(s) = ` +
        `${perUserAmount} BW each.`
      );
    }

    // ── 5. Bulk-insert all reward documents ──────────────────────────────
    if (rewardDocs.length > 0) {
      await UserOtherReward.insertMany(rewardDocs, { ordered: false }).catch(
        (err) => {
          // Duplicate-key errors are acceptable (dedup safety net).
          // Re-throw anything else.
          if (err.code !== 11000) throw err;
          console.warn(
            `distributeSalaryRankReward: ${err.writeErrors?.length ?? "some"} ` +
            "duplicate(s) skipped."
          );
        }
      );
      console.log(
        `✅ distributeSalaryRankReward: inserted ${rewardDocs.length} salary reward(s). ` +
        `Distributed: ${totalDistributed} BW | Unachieved → company: ${totalUnachieved} BW`
      );
    }

    return { distributed: totalDistributed, unachieved: totalUnachieved };

  } catch (err) {
    console.error("distributeSalaryRankReward: error —", err?.message);
    // Re-throw so the caller's .catch() handler can log/alert if needed.
    throw err;
  }
};

module.exports = { distributeSalaryRankReward };
