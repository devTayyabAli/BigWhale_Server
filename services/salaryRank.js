/**
 * salaryRank.js
 *
 * Salary Rank Distribution Service
 *
 * How it works:
 *  On every confirmed withdrawal, 20% of the total amount is distributed
 *  as "Lifetime Salary" to active salary rank holders (Ranks 1–7).
 *
 *  Each rank has a nominal percentage of the withdrawal (from the Rank
 *  collection, seeded by seeders/updateSalaryRankPercentages.js):
 *    Rank 1 → 2%    Rank 2 → 4%    Rank 3 → 6%    Rank 4 → 8.5%
 *    Rank 5 → 11.5% Rank 6 → 15%   Rank 7 → 20%   (nominal sum = 67%)
 *
 *  SOLVENCY CAP: the company only retains FAST_TRACK.SALARY_POOL_PERCENTAGE
 *  (20%) of each withdrawal, so the total actually paid can never exceed
 *  that. Ranks that currently have eligible holders receive their nominal
 *  share in full while the sum of achieved ranks' nominal shares fits inside
 *  20%; once it exceeds 20% every achieved rank is scaled down
 *  proportionally so the payout equals exactly 20%.
 *    e.g. only Rank 1 & 2 achieved → 2% + 4% = 6% paid as-is (14% to company)
 *         all 7 achieved → 67% scaled to 20% (Rank 1 gets 2/67×20 ≈ 0.6%)
 *
 *  If multiple users hold the same rank they SPLIT that rank's pool equally.
 *
 *  Pool money that is not paid out (unachieved ranks / cap remainder) is
 *  logged as "unachieved" — to be credited to the company/liquidity wallet.
 *
 *  Distribution is fire-and-forget; failures are logged but never
 *  block or roll back the underlying withdrawal.
 */

const Rank            = require("../models/rank.model");
const User            = require("../models/user.model");
const Stake           = require("../models/stake.model");
const UserOtherReward = require("../models/userOtherReward.model");
const UserStakeReward = require("../models/userStakingReward.model");
const fastTrack       = require("./fastTrack");
const { OTHER_REWARD, DEFAULT_STATUS, SETTING, STAKE_TYPE, FAST_TRACK } = require("../config/constants");
const { getSettingsWithKeys } = require("../helpers/setting");

/**
 * Side-effect-free eligibility check for a salary rank holder.
 *  1. Must be "staked": active stake OR fast-track stake paid within the
 *     re-stake grace window (fastTrack.hasQualifyingStake).
 *  2. Legacy capping: only LEGACY active stakes build the cap, and only
 *     legacy staking rewards count against it. Fast-track-only holders have
 *     cappingAmount = 0 → never capped.
 */
const isHolderEligible = async (holderId, cappingSettings) => {
  const staked = await fastTrack.hasQualifyingStake(holderId);
  if (!staked) {
    console.log(`distributeSalaryRankReward: userId=${holderId} skipped — no qualifying stake.`);
    return false;
  }

  const holderUser = await User.findById(holderId)
    .select("userRankId lastCappingReachedAt")
    .lean();

  const cappingFormula = holderUser?.userRankId === null
    ? (Number(cappingSettings[SETTING.NORMAL_CAPPING]) || 2)
    : (Number(cappingSettings[SETTING.MARKET_CAPPING])  || 3);

  const [stakeAgg, fastTrackStakeIds] = await Promise.all([
    Stake.aggregate([
      {
        $match: {
          userId: holderId,
          status: DEFAULT_STATUS.ACTIVE,
          stakeType: { $ne: STAKE_TYPE.FAST_TRACK_2X },
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
    ]),
    Stake.distinct("_id", { userId: holderId, stakeType: STAKE_TYPE.FAST_TRACK_2X }),
  ]);

  const totalLegacyStake = stakeAgg.length > 0 ? stakeAgg[0].total : 0;
  const cappingAmount    = totalLegacyStake * cappingFormula;
  if (cappingAmount <= 0) return true; // fast-track only → no cap

  const earnSince  = holderUser?.lastCappingReachedAt || null;
  const matchFilter = {
    userId: holderId,
    ...(earnSince && { createdAt: { $gte: new Date(earnSince) } }),
    ...(fastTrackStakeIds.length > 0 && { stakeId: { $nin: fastTrackStakeIds } }),
  };
  const rewardAgg = await UserStakeReward.aggregate([
    { $match: matchFilter },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
  ]);
  const earnAmount = rewardAgg.length > 0 ? rewardAgg[0].total : 0;

  if (earnAmount >= cappingAmount) {
    console.log(
      `distributeSalaryRankReward: userId=${holderId} skipped — capped ` +
      `(earned ${earnAmount} >= cap ${cappingAmount}).`
    );
    return false;
  }
  return true;
};

/**
 * Distribute salary rank rewards for a single confirmed withdrawal.
 *
 * @param {number} totalWithdrawalAmount  - The FULL withdrawal amount (BW)
 *                                          before the 80/20 split.
 * @returns {Promise<{ distributed: number, unachieved: number, poolAmount: number, scale: number }>}
 */
const distributeSalaryRankReward = async (totalWithdrawalAmount) => {
  const total = Number(totalWithdrawalAmount);
  if (!total || total <= 0) {
    return { distributed: 0, unachieved: 0, poolAmount: 0, scale: 1 };
  }

  // The only money available for salaries: the retained fee.
  const poolAmount = Number((total * (FAST_TRACK.SALARY_POOL_PERCENTAGE / 100)).toFixed(8));

  try {
    // ── 1. Load all salary ranks ordered by starKey ──────────────────────
    const ranks = await Rank.find({}).sort({ starKey: 1 }).lean();
    if (!ranks || ranks.length === 0) {
      console.warn("distributeSalaryRankReward: no ranks found in DB — skipping.");
      return { distributed: 0, unachieved: poolAmount, poolAmount, scale: 1 };
    }

    const cappingSettings = await getSettingsWithKeys([
      SETTING.NORMAL_CAPPING,
      SETTING.MARKET_CAPPING,
    ]);

    // ── 2. Resolve eligible holders + nominal share per rank ─────────────
    const achieved = []; // { rank, pct, nominal, holders[] }
    for (const rank of ranks) {
      const pct = Number(rank.rewardPercentage) || 0;
      if (pct <= 0 || rank.starKey == null || isNaN(rank.starKey)) {
        console.warn(`distributeSalaryRankReward: rank _id=${rank._id} has invalid starKey/rewardPercentage — skipping.`);
        continue;
      }

      // userRankId stores the starKey of the highest achieved rank; a user
      // qualifies for every rank at or below their own.
      const candidates = await User.find({
        status: DEFAULT_STATUS.ACTIVE,
        userRankId: { $gte: rank.starKey },
      })
        .select("_id")
        .lean();

      const holders = [];
      await Promise.all(
        candidates.map(async (c) => {
          if (await isHolderEligible(c._id, cappingSettings)) holders.push(c._id);
        })
      );

      if (holders.length === 0) {
        console.log(`distributeSalaryRankReward: rank ${rank.starKey} (${pct}%) has no eligible holders.`);
        continue;
      }

      achieved.push({
        rank,
        pct,
        nominal: Number((total * (pct / 100)).toFixed(8)),
        holders,
      });
    }

    // ── 3. Apply the 20% solvency cap ────────────────────────────────────
    const nominalSum = achieved.reduce((s, a) => s + a.nominal, 0);
    const scale = nominalSum > poolAmount && nominalSum > 0 ? poolAmount / nominalSum : 1;

    // ── 4. Build reward docs ─────────────────────────────────────────────
    const rewardDocs = [];
    let totalDistributed = 0;

    for (const a of achieved) {
      const rankPoolAmount = Number((a.nominal * scale).toFixed(8));
      const perUserAmount  = Number((rankPoolAmount / a.holders.length).toFixed(8));
      if (perUserAmount <= 0) continue;

      for (const holderId of a.holders) {
        rewardDocs.push({
          userId:           holderId,
          type:             OTHER_REWARD.SALARY_RANK,
          amount:           String(perUserAmount),
          rankId:           a.rank._id,
          rewardPercentage: a.pct,
        });
      }
      totalDistributed = Number((totalDistributed + perUserAmount * a.holders.length).toFixed(8));

      console.log(
        `distributeSalaryRankReward: rank ${a.rank.starKey} (${a.pct}%${scale < 1 ? ` ×${scale.toFixed(4)}` : ""}) — ` +
        `${rankPoolAmount} BW split among ${a.holders.length} holder(s) = ${perUserAmount} BW each.`
      );
    }

    const totalUnachieved = Number(Math.max(0, poolAmount - totalDistributed).toFixed(8));

    // ── 5. Bulk-insert ───────────────────────────────────────────────────
    if (rewardDocs.length > 0) {
      await UserOtherReward.insertMany(rewardDocs, { ordered: false }).catch((err) => {
        if (err.code !== 11000) throw err;
        console.warn(`distributeSalaryRankReward: ${err.writeErrors?.length ?? "some"} duplicate(s) skipped.`);
      });
    }

    console.log(
      `✅ distributeSalaryRankReward: withdrawal ${total} BW → pool ${poolAmount} BW | ` +
      `distributed ${totalDistributed} BW to ${rewardDocs.length} holder(s) | ` +
      `unachieved → company ${totalUnachieved} BW${scale < 1 ? ` | cap scale ${scale.toFixed(4)}` : ""}`
    );

    return { distributed: totalDistributed, unachieved: totalUnachieved, poolAmount, scale };
  } catch (err) {
    console.error("distributeSalaryRankReward: error —", err?.message);
    throw err;
  }
};

module.exports = { distributeSalaryRankReward, isHolderEligible };
