/**
 * fastTrack.js
 *
 * Central service for the BigWhale 2X Fast-Track plan.
 * Every other module (stake, withdrawal, salary, crons) should call into
 * this file instead of re-implementing the rules, so they can never drift.
 *
 * Rules implemented here:
 *  • A "staked direct" = a direct referral that has at least one CONFIRMED
 *    stake (active or completed). Registration alone does not count.
 *  • Sponsor gets +1 withdrawal credit (unusedDirectCount) ONLY when a direct
 *    confirms their FIRST stake — daily re-stakes never add credits.
 *  • 2X unlocks at FAST_TRACK.UNLOCK_DIRECTS staked directs.
 *  • Ranks 1..7 are promotion-only (lifetime) based on staked-direct count
 *    (5, 25, 125, 625, 3125, 15625, 78125).
 *  • Withdrawal quota (1 × 10 BW per rolling 24h + 1 joining credit) is
 *    consumed only when a withdrawal is CONFIRMED.
 */

const User          = require("../models/user.model");
const Stake         = require("../models/stake.model");
const Rank          = require("../models/rank.model");
const UserRank      = require("../models/userRank.model");
const Notification  = require("../models/notification.model");
const socket        = require("../helpers/sockets");
const { sendRankUpdationEmail } = require("../helpers/mail");
const { DEFAULT_STATUS, STAKE_TYPE, FAST_TRACK } = require("../config/constants");

const HOUR_MS = 60 * 60 * 1000;

// ── Stake helpers ─────────────────────────────────────────────────────────────

const isFastTrackStake = (stake) => stake?.stakeType === STAKE_TYPE.FAST_TRACK_2X;

const isFixedStakeAmount = (amount) =>
  Math.abs(Number(amount) - FAST_TRACK.STAKE_AMOUNT) <= FAST_TRACK.AMOUNT_TOLERANCE;

/** Filter that matches stakes which were really confirmed on-chain. */
const confirmedStakeFilter = {
  status: { $in: [DEFAULT_STATUS.ACTIVE, DEFAULT_STATUS.INACTIVE] },
  transactionId: { $ne: null },
};

/** True if this is the user's first confirmed stake (ignores `stake` itself). */
const isFirstConfirmedStake = async (stake) => {
  const userId = stake?.userId?._id || stake?.userId;
  if (!userId) return false;
  const others = await Stake.countDocuments({
    userId,
    _id: { $ne: stake._id },
    ...confirmedStakeFilter,
  });
  return others === 0;
};

/**
 * A user is "staked" for eligibility purposes (instant bonus to sponsor,
 * salary rank payouts) if they have an active stake, OR a fast-track stake
 * that was paid out within the re-stake grace window.
 */
const hasQualifyingStake = async (userId) => {
  if (!userId) return false;
  const graceStart = new Date(Date.now() - FAST_TRACK.RESTAKE_GRACE_HOURS * HOUR_MS);
  const stake = await Stake.findOne({
    userId,
    $or: [
      { status: DEFAULT_STATUS.ACTIVE },
      { stakeType: STAKE_TYPE.FAST_TRACK_2X, fastTrackPaidAt: { $gte: graceStart } },
    ],
  })
    .select("_id")
    .lean();
  return Boolean(stake);
};

// ── Directs & ranks ───────────────────────────────────────────────────────────

/** Number of direct referrals that have at least one confirmed stake. */
const countStakedDirects = async (userId) => {
  if (!userId) return 0;
  const directs = await User.find({ referredBy: userId, status: { $ne: DEFAULT_STATUS.BANNED } })
    .select("_id")
    .lean();
  if (directs.length === 0) return 0;
  const stakedIds = await Stake.distinct("userId", {
    userId: { $in: directs.map((d) => d._id) },
    ...confirmedStakeFilter,
  });
  return stakedIds.length;
};

/** Rank (1..7) for a given staked-direct count, or null. */
const getRankForDirects = (count) => {
  let rank = null;
  FAST_TRACK.RANK_DIRECT_THRESHOLDS.forEach((threshold, idx) => {
    if (count >= threshold) rank = idx + 1;
  });
  return rank;
};

/** Directs still needed for the next rank (null when max rank reached). */
const getNextRankTarget = (count) => {
  const next = FAST_TRACK.RANK_DIRECT_THRESHOLDS.find((t) => count < t);
  return next ?? null;
};

const notifyRankPromotion = async (userId, starKey) => {
  try {
    const [user, rank] = await Promise.all([
      User.findById(userId).select("email userName").lean(),
      Rank.findOne({ starKey }).lean(),
    ]);
    if (!user || !rank) return;

    await UserRank.create({ userId, rankId: rank._id });

    sendRankUpdationEmail(user.email, rank).catch((e) =>
      console.error("fastTrack.notifyRankPromotion: email failed:", e?.message)
    );

    const notification = await Notification.create({
      userId,
      notificationType: "Rank Updation",
      description: `${userId} rank has been updated to ${rank.title}`,
    });

    socket.io?.to(`${userId}`).emit("rankUpdationNotification", {
      title: notification?.notificationType,
      description: notification?.description,
    });
    socket.io?.emit("admin-events", {
      type: "rank_achieved",
      title: "🏆 Rank Achieved",
      description: `${user.userName || user.email} has achieved ${rank.title}`,
      userId,
      rankTitle: rank.title,
      starKey: rank.starKey,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("fastTrack.notifyRankPromotion error:", err?.message);
  }
};

/**
 * Re-evaluate a sponsor's 2X unlock + rank from their staked-direct count.
 * Promotion only — ranks are lifetime and never go down here.
 *
 * @param {ObjectId|string} referrerId
 * @param {{ creditWithdrawal?: boolean }} opts  add +1 unusedDirectCount
 * @returns {{ stakedDirects:number, unlocked:boolean, rank:number|null, promoted:boolean }}
 */
const syncReferrerStatus = async (referrerId, { creditWithdrawal = false } = {}) => {
  const referrer = await User.findById(referrerId)
    .select("userRankId is2XDailyUnlocked unusedDirectCount")
    .lean();
  if (!referrer) return { stakedDirects: 0, unlocked: false, rank: null, promoted: false };

  const stakedDirects = await countStakedDirects(referrerId);
  const update = { $set: {}, $inc: {} };

  if (creditWithdrawal) update.$inc.unusedDirectCount = 1;

  const unlocked = stakedDirects >= FAST_TRACK.UNLOCK_DIRECTS;
  if (unlocked && !referrer.is2XDailyUnlocked) update.$set.is2XDailyUnlocked = true;

  const computedRank = getRankForDirects(stakedDirects);
  const currentRank  = referrer.userRankId == null ? null : Number(referrer.userRankId);
  const promoted     = computedRank !== null && (currentRank === null || computedRank > currentRank);
  if (promoted) update.$set.userRankId = computedRank;

  if (Object.keys(update.$set).length === 0) delete update.$set;
  if (Object.keys(update.$inc).length === 0) delete update.$inc;

  if (Object.keys(update).length > 0) {
    await User.updateOne({ _id: referrerId }, update);
  }

  if (promoted) await notifyRankPromotion(referrerId, computedRank);

  return {
    stakedDirects,
    unlocked: unlocked || Boolean(referrer.is2XDailyUnlocked),
    rank: promoted ? computedRank : currentRank,
    promoted,
  };
};

/**
 * Called when a direct's stake is confirmed on-chain.
 * Credits the sponsor only if this was the direct's FIRST confirmed stake.
 */
const onDirectStakeConfirmed = async (stake) => {
  const referrerId = stake?.userId?.referredBy;
  if (!referrerId) return null;
  const firstStake = await isFirstConfirmedStake(stake);
  return syncReferrerStatus(referrerId, { creditWithdrawal: firstStake });
};

/** Daily safety-net: re-sync every sponsor (promotion only, no credits). */
const recalculateAllRanks = async () => {
  const sponsorIds = await User.distinct("referredBy", { referredBy: { $ne: null } });
  let promoted = 0;
  for (const id of sponsorIds) {
    try {
      const res = await syncReferrerStatus(id);
      if (res.promoted) promoted++;
    } catch (err) {
      console.error(`fastTrack.recalculateAllRanks: sponsor ${id} failed:`, err?.message);
    }
  }
  return { sponsors: sponsorIds.length, promoted };
};

// ── Withdrawal quota ─────────────────────────────────────────────────────────

const getWithdrawalWindowRemainingMs = (lastWithdrawalAt) => {
  if (!lastWithdrawalAt) return 0;
  const elapsed = Date.now() - new Date(lastWithdrawalAt).getTime();
  return Math.max(0, FAST_TRACK.WITHDRAWAL_WINDOW_HOURS * HOUR_MS - elapsed);
};

/**
 * Consume the fast-track withdrawal quota on CONFIRMATION.
 * Clamps unusedDirectCount at 0 and stamps the rolling-window timestamp.
 */
const consumeWithdrawalQuota = async (userId, joinings = 1) => {
  const user = await User.findById(userId).select("unusedDirectCount").lean();
  if (!user) return;
  const current = Number(user.unusedDirectCount || 0);
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        unusedDirectCount: Math.max(0, current - Number(joinings || 0)),
        lastWithdrawalAt: new Date(),
        dailyWithdrawalCount: 1,
      },
    }
  );
};

module.exports = {
  isFastTrackStake,
  isFixedStakeAmount,
  isFirstConfirmedStake,
  hasQualifyingStake,
  countStakedDirects,
  getRankForDirects,
  getNextRankTarget,
  syncReferrerStatus,
  onDirectStakeConfirmed,
  recalculateAllRanks,
  getWithdrawalWindowRemainingMs,
  consumeWithdrawalQuota,
};
