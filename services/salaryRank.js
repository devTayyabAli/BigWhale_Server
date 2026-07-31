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

const Rank            = require("../models/rank.model");
const User            = require("../models/user.model");
const Stake           = require("../models/stake.model");
const UserOtherReward = require("../models/userOtherReward.model");
const UserStakeReward = require("../models/userStakingReward.model");
const { OTHER_REWARD, DEFAULT_STATUS, SETTING } = require("../config/constants");
const { getSettingsWithKeys }                   = require("../helpers/setting");

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

    // ── 2. Pre-fetch capping multipliers once (reused for every rank) ────
    const cappingSettings = await getSettingsWithKeys([
      SETTING.NORMAL_CAPPING,
      SETTING.MARKET_CAPPING,
    ]);

    // ── 3. Process each rank ─────────────────────────────────────────────
    const rewardDocs = [];

    for (const rank of ranks) {
      // rewardPercentage is stored as String in the DB schema — coerce safely.
      const rewardPercentage = Number(rank.rewardPercentage) || 0;
      if (rewardPercentage <= 0) {
        console.warn(
          `distributeSalaryRankReward: rank starKey=${rank.starKey} has no ` +
          `rewardPercentage set in DB — skipping this rank. ` +
          `Please update the rank document to add a rewardPercentage value.`
        );
        continue;
      }

      // starKey must be a valid number for the $gte query to work correctly.
      if (rank.starKey == null || isNaN(rank.starKey)) {
        console.warn(
          `distributeSalaryRankReward: rank _id=${rank._id} has no starKey — skipping.`
        );
        continue;
      }

      // Pool share for this rank (e.g. 2% of total withdrawal)
      const rankPoolAmount = Number(
        (totalWithdrawalAmount * (rewardPercentage / 100)).toFixed(8)
      );

      if (rankPoolAmount <= 0) continue;

      // ── 3. Find all active users who have achieved this rank ───────────
      //       userRankId stores the starKey of the highest achieved rank.
      //       A user qualifies if their userRankId >= this rank's starKey.
      const candidateHolders = await User.find({
        status:     DEFAULT_STATUS.ACTIVE,
        userRankId: { $gte: rank.starKey },
      })
        .select("_id")
        .lean();

      // Filter candidateHolders to only include non-capped users with an active stake.
      // IMPORTANT: We do NOT call handleCappingEvent() here because:
      //  1. It has a side-effect (updates lastCappingReachedAt on the user document).
      //  2. It counts ALL UserOtherReward (including salary rewards themselves) toward
      //     the capping limit, creating a self-reinforcing exclusion loop where users
      //     who earned salary bonuses eventually stop receiving them.
      //  Instead we do a direct, lightweight, side-effect-free inline capping check
      //  that only counts staking rewards (UserStakeReward) against the cap.
      const eligibleHolders = [];
      if (candidateHolders && candidateHolders.length > 0) {
        await Promise.all(
          candidateHolders.map(async (holder) => {
            // 1. Must have at least one active stake (trust DB status, no endDate filter
            //    because endDate may lag if the cron hasn't expired the stake yet).
            const activeStake = await Stake.findOne({
              userId: holder._id,
              status: DEFAULT_STATUS.ACTIVE,
            }).lean();

            if (!activeStake) {
              console.log(`distributeSalaryRankReward: userId=${holder._id} skipped — no active stake.`);
              return;
            }

            // 2. Resolve the holder's full user record to get userRankId & capping reset date.
            const holderUser = await User.findById(holder._id)
              .select("userRankId lastCappingReachedAt")
              .lean();

            // 3. Calculate capping threshold from active stake amounts only.
            const cappingFormula = holderUser?.userRankId === null
              ? (Number(cappingSettings[SETTING.NORMAL_CAPPING]) || 2)
              : (Number(cappingSettings[SETTING.MARKET_CAPPING])  || 3);

            const stakeAgg = await Stake.aggregate([
              {
                $match: {
                  userId: holder._id,
                  status: DEFAULT_STATUS.ACTIVE,
                },
              },
              { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
            ]);
            const totalActiveStake = stakeAgg.length > 0 ? stakeAgg[0].total : 0;
            const cappingAmount    = totalActiveStake * cappingFormula;

            if (cappingAmount <= 0) {
              // No measurable stake → treat as not capped (safe default — include them).
              eligibleHolders.push(holder);
              return;
            }

            // 4. Sum ONLY staking rewards (not salary/other rewards) since
            //    the user's last capping reset, to avoid double-counting.
            const earnSince   = holderUser?.lastCappingReachedAt || null;
            const dateFilter  = earnSince ? { $gte: new Date(earnSince) } : undefined;
            const matchFilter = {
              userId: holder._id,
              ...(dateFilter && { createdAt: dateFilter }),
            };
            const stakeRewardAgg = await UserStakeReward.aggregate([
              { $match: matchFilter },
              { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
            ]);
            const earnAmount = stakeRewardAgg.length > 0 ? stakeRewardAgg[0].total : 0;

            const isCapped = earnAmount >= cappingAmount;
            if (isCapped) {
              console.log(
                `distributeSalaryRankReward: userId=${holder._id} skipped — capped ` +
                `(earned ${earnAmount} >= cap ${cappingAmount}).`
              );
            } else {
              eligibleHolders.push(holder);
            }
          })
        );
      }

      if (!eligibleHolders || eligibleHolders.length === 0) {
        // No eligible non-capped holder for this rank — amount goes to company wallet
        console.log(
          `distributeSalaryRankReward: rank ${rank.starKey} (${rewardPercentage}%) ` +
          `has no eligible holders — ${rankPoolAmount} BW → company/liquidity wallet.`
        );
        totalUnachieved = Number((totalUnachieved + rankPoolAmount).toFixed(8));
        continue;
      }

      // ── 4. Split pool equally among all eligible holders ───────────────
      const perUserAmount = Number(
        (rankPoolAmount / eligibleHolders.length).toFixed(8)
      );

      if (perUserAmount <= 0) continue;

      for (const holder of eligibleHolders) {
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
        `${rankPoolAmount} BW split among ${eligibleHolders.length} holder(s) = ` +
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
