/**
 * Admin controls for the 2X Fast-Track plan.
 *
 * Business rules live in services/fastTrack.js and config/constants.js
 * (FAST_TRACK). This controller only reads them and exposes admin actions:
 *   • view / edit the 7 salary ranks (percentages + direct targets)
 *   • plan-wide stats
 *   • per-user status, joining-credit adjustment, 24h window reset, rank re-sync
 *   • a manual full rank re-sync
 *
 * Every mutation is written to CronLog so there is an audit trail.
 */

const Rank             = require("../../models/rank.model");
const User             = require("../../models/user.model");
const Stake            = require("../../models/stake.model");
const Withdrawal       = require("../../models/withdrawal.model");
const UserStakeReward  = require("../../models/userStakingReward.model");
const UserOtherReward  = require("../../models/userOtherReward.model");
const CronLog          = require("../../models/cronLogs.model");
const fastTrack        = require("../../services/fastTrack");
const { FAST_TRACK, STAKE_TYPE, DEFAULT_STATUS, OTHER_REWARD } = require("../../config/constants");
const { ObjectId } = require("mongoose").Types;

const RANK_TITLES = {
  1: "Bronze Leader",
  2: "Silver Leader",
  3: "Gold Leader",
  4: "Platinum Leader",
  5: "Diamond Leader",
  6: "Crown Leader",
  7: "BigWhale Legend",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const ok  = (res, data, message = "OK") => res.status(200).json({ success: true, message, data });
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });

const audit = (title, detail) =>
  CronLog.create({ title, error: detail }).catch((e) =>
    console.error("fastTrack admin audit failed:", e?.message)
  );

const validUserId = (userId, res) => {
  if (!ObjectId.isValid(userId)) {
    bad(res, "Invalid user id");
    return false;
  }
  return true;
};

/** Nominal rank percentages, the 20% pool, and the live scale factor. */
const salaryMath = (ranks) => {
  const nominalSum = ranks.reduce((sum, r) => sum + (Number(r.rewardPercentage) || 0), 0);
  const pool = FAST_TRACK.SALARY_POOL_PERCENTAGE;
  const scale = nominalSum > pool && nominalSum > 0 ? pool / nominalSum : 1;
  return { nominalSum: Number(nominalSum.toFixed(4)), poolPercentage: pool, scale };
};

const decorateRank = (rank, scale) => {
  const pct = Number(rank.rewardPercentage) || 0;
  return {
    ...rank,
    displayTitle: RANK_TITLES[rank.starKey] || rank.title,
    nominalPercentage: pct,
    effectivePercentage: Number((pct * scale).toFixed(4)),
  };
};

// ── Ranks ─────────────────────────────────────────────────────────────────────

const getRanks = async (req, res) => {
  try {
    const ranks = await Rank.find({}).sort({ starKey: 1 }).lean();
    const math = salaryMath(ranks);
    const unlockDirects = await fastTrack.getUnlockDirects();
    return ok(res, {
      ranks: ranks.map((r) => decorateRank(r, math.scale)),
      ...math,
      rules: {
        stakeAmount: FAST_TRACK.STAKE_AMOUNT,
        withdrawalChunk: FAST_TRACK.WITHDRAWAL_CHUNK,
        windowHours: FAST_TRACK.WITHDRAWAL_WINDOW_HOURS,
        unlockDirects,
        restakeGraceHours: FAST_TRACK.RESTAKE_GRACE_HOURS,
      },
    });
  } catch (err) {
    console.error("admin.getRanks:", err?.message);
    return bad(res, "Failed to load ranks", 500);
  }
};

const updateRanks = async (req, res) => {
  try {
    const { ranks } = req.body || {};
    if (!Array.isArray(ranks) || ranks.length === 0) {
      return bad(res, "Provide a ranks array.");
    }

    const updates = [];
    for (const entry of ranks) {
      const starKey = Number(entry.starKey);
      const pct = Number(entry.rewardPercentage);
      const directs = Number(entry.directTeam);

      if (!Number.isInteger(starKey) || starKey < 1 || starKey > 7) {
        return bad(res, `Invalid starKey: ${entry.starKey}`);
      }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        return bad(res, `Rank ${starKey}: percentage must be between 0 and 100.`);
      }
      if (!Number.isInteger(directs) || directs < 1) {
        return bad(res, `Rank ${starKey}: direct members must be a whole number of 1 or more.`);
      }
      updates.push({ starKey, pct, directs });
    }

    for (const u of updates) {
      const result = await Rank.updateOne(
        { starKey: u.starKey },
        {
          $set: {
            rewardPercentage: String(u.pct),
            directTeam: String(u.directs),
            directBussiness: String(u.directs * FAST_TRACK.STAKE_AMOUNT),
          },
        }
      );
      if (result.matchedCount === 0) {
        return bad(res, `No rank found for starKey ${u.starKey}. Run the rank seeder first.`);
      }
    }

    fastTrack.invalidateRankCache();

    await audit(
      "fastTrackAdminRanks",
      `${req.user?.email} updated ranks: ${updates
        .map((u) => `R${u.starKey}=${u.pct}%/${u.directs}`)
        .join(", ")}`
    );

    return getRanks(req, res);
  } catch (err) {
    console.error("admin.updateRanks:", err?.message);
    return bad(res, "Failed to update ranks", 500);
  }
};

// ── Stats & audit ─────────────────────────────────────────────────────────────

/** How many non-admin users have 0, 1, 2, 3 or 4 staked directs (still locked). */
const unlockFunnel = async () => {
  const confirmedIds = await Stake.distinct("userId", {
    status: { $in: [DEFAULT_STATUS.ACTIVE, DEFAULT_STATUS.INACTIVE] },
    transactionId: { $ne: null },
  });
  const [grouped, totalUsers] = await Promise.all([
    User.aggregate([
      {
        $match: {
          _id: { $in: confirmedIds },
          referredBy: { $ne: null },
          status: { $ne: DEFAULT_STATUS.BANNED },
        },
      },
      { $group: { _id: "$referredBy", directs: { $sum: 1 } } },
    ]),
    User.countDocuments({ role: { $ne: "admin" }, status: { $ne: DEFAULT_STATUS.BANNED } }),
  ]);

  const buckets = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const sponsorIds = new Set();
  grouped.forEach((row) => {
    sponsorIds.add(String(row._id));
    if (row.directs >= 1 && row.directs <= 4) buckets[row.directs] += 1;
  });
  buckets[0] = Math.max(0, totalUsers - sponsorIds.size);
  return buckets;
};

const getStats = async (req, res) => {
  try {
    const since = new Date(Date.now() - DAY_MS);

    const staleBefore = new Date(Date.now() - FAST_TRACK.PENDING_WITHDRAWAL_STALE_MINUTES * 60 * 1000);

    const [unlockedUsers, rankGroups, stakeGroups, payouts, pendingWithdrawals, salary, feeRows, funnel] =
      await Promise.all([
        User.countDocuments({ is2XDailyUnlocked: true }),
        User.aggregate([
          { $match: { userRankId: { $gte: 1, $lte: 7 } } },
          { $group: { _id: "$userRankId", count: { $sum: 1 } } },
        ]),
        Stake.aggregate([
          { $match: { stakeType: STAKE_TYPE.FAST_TRACK_2X } },
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: {
                $switch: {
                  branches: [
                    { case: { $ne: [{ $ifNull: ["$fastTrackPaidAt", null] }, null] }, then: "paid" },
                    { case: { $eq: ["$status", DEFAULT_STATUS.PENDING] }, then: "pending" },
                    { case: { $eq: ["$user.is2XDailyUnlocked", true] }, then: "waiting24h" },
                  ],
                  default: "waitingUnlock",
                },
              },
              count: { $sum: 1 },
              amount: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ]),
        UserStakeReward.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $lookup: {
              from: "stakes",
              localField: "stakeId",
              foreignField: "_id",
              as: "stake",
            },
          },
          { $unwind: "$stake" },
          { $match: { "stake.stakeType": STAKE_TYPE.FAST_TRACK_2X } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
        ]),
        Withdrawal.countDocuments({ status: DEFAULT_STATUS.PENDING, payoutPercentage: 80 }),
        UserOtherReward.aggregate([
          { $match: { type: OTHER_REWARD.SALARY_RANK, createdAt: { $gte: since } } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $toDouble: "$amount" } } } },
        ]),
        Withdrawal.aggregate([
          {
            $match: {
              payoutPercentage: 80,
              status: DEFAULT_STATUS.ACTIVE,
              updatedAt: { $gte: since },
            },
          },
          { $group: { _id: null, net: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        unlockFunnel(),
      ]);

    const byKey = (groups) =>
      Object.fromEntries(groups.map((g) => [String(g._id), { count: g.count, amount: g.amount || 0 }]));

    const ranks = {};
    for (let i = 1; i <= 7; i++) ranks[i] = { title: RANK_TITLES[i], count: 0 };
    rankGroups.forEach((g) => {
      if (ranks[g._id]) ranks[g._id].count = g.count;
    });

    const stakes = byKey(stakeGroups);
    const stakedAmount = Object.values(stakes).reduce((s, g) => s + (g.amount || 0), 0);
    // Stored amount is the 80% paid out; the salary pool is the 20% kept back.
    const poolFee = Number((((feeRows[0]?.net || 0) / 0.8) * 0.2).toFixed(8));
    const distributed = Number((salary[0]?.amount || 0).toFixed(8));

    return ok(res, {
      unlockedUsers,
      ranks,
      funnel,
      stakes: {
        paid: stakes.paid?.count || 0,
        waiting24h: stakes.waiting24h?.count || 0,
        waitingUnlock: stakes.waitingUnlock?.count || 0,
        pending: stakes.pending?.count || 0,
        stakedAmount,
      },
      payouts24h: { count: payouts[0]?.count || 0, amount: payouts[0]?.amount || 0 },
      salary24h: {
        count: salary[0]?.count || 0,
        amount: distributed,
        poolFee,
        retained: Number(Math.max(0, poolFee - distributed).toFixed(8)),
        withdrawals: feeRows[0]?.count || 0,
      },
      pendingWithdrawals,
      staleAfterMinutes: FAST_TRACK.PENDING_WITHDRAWAL_STALE_MINUTES,
      staleBefore,
    });
  } catch (err) {
    console.error("admin.getStats:", err?.message);
    return bad(res, "Failed to load stats", 500);
  }
};

const getAudit = async (req, res) => {
  try {
    const logs = await CronLog.find({ title: /^fastTrack/ })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();
    return ok(res, logs);
  } catch (err) {
    console.error("admin.getAudit:", err?.message);
    return bad(res, "Failed to load audit log", 500);
  }
};

const resetRanks = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (req.body?.confirmReset !== true) {
      return bad(res, "Confirm the reset before it runs.");
    }
    if (reason.length < 3) return bad(res, "A reason (at least 3 characters) is required.");

    const result = await fastTrack.resetRanksToQualification();
    await audit(
      "fastTrackRankReset",
      `${req.user?.email} reset ranks to staked-direct qualification: ${JSON.stringify(result)}. Reason: ${reason}`
    );
    return ok(res, result, "Ranks reset to current qualification");
  } catch (err) {
    console.error("admin.resetRanks:", err?.message);
    return bad(res, "Rank reset failed", 500);
  }
};

const listWithdrawals = async (req, res) => {
  try {
    const status = String(req.query.status || DEFAULT_STATUS.PENDING);
    const filter = { payoutPercentage: 80 };
    if (status !== "all") filter.status = status;

    const rows = await Withdrawal.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("userId", "name userName email")
      .lean();

    const staleMs = FAST_TRACK.PENDING_WITHDRAWAL_STALE_MINUTES * 60 * 1000;
    const now = Date.now();
    const data = rows.map((row) => ({
      ...row,
      stale:
        row.status === DEFAULT_STATUS.PENDING &&
        !row.transactionId &&
        now - new Date(row.createdAt).getTime() > staleMs,
    }));
    return ok(res, data);
  } catch (err) {
    console.error("admin.listWithdrawals:", err?.message);
    return bad(res, "Failed to load withdrawals", 500);
  }
};

const cancelWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return bad(res, "Invalid withdrawal id");

    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return bad(res, "A reason (at least 3 characters) is required.");

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) return bad(res, "Withdrawal not found", 404);
    if (withdrawal.status !== DEFAULT_STATUS.PENDING) {
      return bad(res, "Only a pending withdrawal can be cancelled.");
    }
    if (withdrawal.fastTrackQuotaConsumedAt) {
      return bad(res, "This withdrawal already consumed a joining credit, so it cannot be cancelled.");
    }

    withdrawal.status = DEFAULT_STATUS.INACTIVE;
    await withdrawal.save();

    await audit(
      "fastTrackWithdrawalCancel",
      `${req.user?.email} cancelled withdrawal ${id} (${withdrawal.amount} BW, user ${withdrawal.userId}). Reason: ${reason}`
    );
    return ok(res, { id, status: withdrawal.status }, "Withdrawal cancelled");
  } catch (err) {
    console.error("admin.cancelWithdrawal:", err?.message);
    return bad(res, "Failed to cancel withdrawal", 500);
  }
};

const resyncAll = async (req, res) => {
  try {
    const result = await fastTrack.recalculateAllRanks();
    await audit("fastTrackRankSync", `manual run by ${req.user?.email}: ${JSON.stringify(result)}`);
    return ok(res, result, "Rank sync complete");
  } catch (err) {
    console.error("admin.resyncAll:", err?.message);
    return bad(res, "Rank sync failed", 500);
  }
};

// ── Per user ──────────────────────────────────────────────────────────────────

const getUserFastTrack = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!validUserId(userId, res)) return;

    const user = await User.findById(userId)
      .select("name userName email status userRankId is2XDailyUnlocked unusedDirectCount lastWithdrawalAt dailyWithdrawalCount")
      .lean();
    if (!user) return bad(res, "User not found", 404);

    const [stakedDirects, stakes, unlockTarget] = await Promise.all([
      fastTrack.countStakedDirects(userId),
      Stake.find({ userId, stakeType: STAKE_TYPE.FAST_TRACK_2X })
        .sort({ createdAt: -1 })
        .limit(8)
        .select("amount status activatedAt fastTrackPaidAt createdAt")
        .lean(),
      fastTrack.getUnlockDirects(),
    ]);

    return ok(res, {
      user,
      stakedDirects,
      nextRankTarget: await fastTrack.getNextRankTarget(stakedDirects),
      computedRank: await fastTrack.getRankForDirects(stakedDirects),
      rankTitle: RANK_TITLES[user.userRankId] || null,
      windowRemainingMs: fastTrack.getWithdrawalWindowRemainingMs(user.lastWithdrawalAt),
      unlockTarget,
      stakes,
    });
  } catch (err) {
    console.error("admin.getUserFastTrack:", err?.message);
    return bad(res, "Failed to load user fast-track status", 500);
  }
};

const setCredits = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!validUserId(userId, res)) return;

    const unusedDirectCount = Number(req.body?.unusedDirectCount);
    const reason = String(req.body?.reason || "").trim();

    if (!Number.isInteger(unusedDirectCount) || unusedDirectCount < 0 || unusedDirectCount > 1_000_000) {
      return bad(res, "Credits must be a whole number from 0 to 1,000,000.");
    }
    if (reason.length < 3) return bad(res, "A reason (at least 3 characters) is required.");

    const user = await User.findById(userId).select("unusedDirectCount email");
    if (!user) return bad(res, "User not found", 404);

    const before = Number(user.unusedDirectCount || 0);
    user.unusedDirectCount = unusedDirectCount;
    await user.save();

    await audit(
      "fastTrackAdminCredit",
      `${req.user?.email} set credits ${before} -> ${unusedDirectCount} for ${user.email} (${userId}). Reason: ${reason}`
    );

    return ok(res, { unusedDirectCount }, "Withdrawal credits updated");
  } catch (err) {
    console.error("admin.setCredits:", err?.message);
    return bad(res, "Failed to update credits", 500);
  }
};

const resetWindow = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!validUserId(userId, res)) return;

    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 3) return bad(res, "A reason (at least 3 characters) is required.");

    const user = await User.findById(userId).select("email lastWithdrawalAt");
    if (!user) return bad(res, "User not found", 404);

    await User.updateOne(
      { _id: userId },
      { $set: { lastWithdrawalAt: null, dailyWithdrawalCount: 0 } }
    );

    await audit(
      "fastTrackAdminWindow",
      `${req.user?.email} reset 24h window for ${user.email} (${userId}), was ${user.lastWithdrawalAt || "unset"}. Reason: ${reason}`
    );

    return ok(res, { lastWithdrawalAt: null }, "24h withdrawal window reset");
  } catch (err) {
    console.error("admin.resetWindow:", err?.message);
    return bad(res, "Failed to reset window", 500);
  }
};

const resyncUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!validUserId(userId, res)) return;

    const exists = await User.exists({ _id: userId });
    if (!exists) return bad(res, "User not found", 404);

    const result = await fastTrack.syncReferrerStatus(userId);
    await audit("fastTrackAdminResync", `${req.user?.email} resynced ${userId}: ${JSON.stringify(result)}`);
    return ok(res, result, "User rank re-synced");
  } catch (err) {
    console.error("admin.resyncUser:", err?.message);
    return bad(res, "Failed to re-sync user", 500);
  }
};

module.exports = {
  getRanks,
  updateRanks,
  getStats,
  getAudit,
  resyncAll,
  resetRanks,
  listWithdrawals,
  cancelWithdrawal,
  getUserFastTrack,
  setCredits,
  resetWindow,
  resyncUser,
};
