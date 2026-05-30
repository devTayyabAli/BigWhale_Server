/**
 * incomeReward.js
 *
 * Income Level Reward Cron
 *
 * Schedule (production):  "5 0 * * *"  — daily at 12:05 AM
 * Schedule (development): configurable via INCOME_REWARD_CRON_SCHEDULE env var
 *
 * What it does:
 *   For every active user whose income-level processing is due, walk their
 *   downline team, find stake rewards issued in the lookback window, and
 *   credit the appropriate income-level percentage to the upline user as a
 *   UserOtherReward (type: income_level).
 *
 * Optimisations applied vs. previous version:
 *  1.  Concurrency guard — skips the run if a previous one is still in progress.
 *  2.  Capping check hoisted out of the inner stake loop — checked once per
 *      user, not once per (member × stake). If capping is reached the user is
 *      marked processed and we move on immediately.
 *  3.  IncomeLevel lookup cached per run in a Map — avoids repeated DB hits
 *      for the same level range across many team members.
 *  4.  Duplicate-reward check (UserOtherReward.findOne) replaced by a single
 *      Set-based in-memory lookup built from a bulk query at the start of each
 *      user's processing, reducing N findOne calls to 1 aggregate per user.
 *  5.  UserOtherReward inserts batched with insertMany (with ordered:false so
 *      a duplicate-key violation on one doc doesn't abort the rest).
 *  6.  Capping email is fire-and-forget — failure must not block the loop.
 *  7.  retryCount reset correctly at the top of saveIncomeLevelReward so
 *      retries from a previous run don't bleed into the next.
 *  8.  Structured error logging via CronLog + failure email on max retries.
 *  9.  Per-user errors are caught and logged without aborting the batch.
 * 10.  Run summary (processed / skipped / errors / elapsed) logged at the end.
 */

const cron             = require("node-cron");
const CronLog          = require("../models/cronLogs.model");
const UserOtherReward  = require("../models/userOtherReward.model");
const UserStakeReward  = require("../models/userStakingReward.model");
const User             = require("../models/user.model");
const Team             = require("../models/team.model");
const TeamMember       = require("../models/teamMember.model");
const IncomeLevel      = require("../models/incomeLevel.model");
const Stake            = require("../models/stake.model");
const referral         = require("../services/referral");
const helper           = require("../helpers/index");
const { sendCronFailureEmail, sendCappingLimitEmail } = require("../helpers/mail");
const { DEFAULT_STATUS, OTHER_REWARD }                = require("../config/constants");
const { momentToSubtract }                            = require("../helpers/moment");

// ── Schedule ──────────────────────────────────────────────────────────────────
const LOOKBACK_DURATION = Number(process.env.INCOME_REWARD_LOOKBACK_DURATION) || 24;
const LOOKBACK_UNIT     = process.env.INCOME_REWARD_LOOKBACK_UNIT             || "hours";
const BATCH_SIZE        = Number(process.env.BATCH_SIZE_FOR_STAR_RANK)        || 50;
const MAX_RETRIES       = Number(process.env.MAX_RETRIES)                     || 3;
const RETRY_INTERVAL_MS = Number(process.env.RETRY_INTERVAL)                  || 30_000;

// Production: daily at 12:05 AM.  Dev/staging: every 6 minutes by default.
const cronTiming =
  process.env.INCOME_REWARD_CRON_SCHEDULE ||
  (process.env.APP_ENV === "production" ? "5 0 * * *" : "*/6 * * * *");

// ── Concurrency guard ─────────────────────────────────────────────────────────
let isIncomeRewardRunning = false;

const saveIncomeRewardCron = cron.schedule(cronTiming, async () => {
  if (isIncomeRewardRunning) {
    console.log("⚠️  saveIncomeRewardCron skipped — previous run still in progress.");
    return;
  }
  isIncomeRewardRunning = true;
  try {
    console.log("🚀 saveIncomeRewardCron started");
    await saveIncomeLevelReward();
    console.log("✅ saveIncomeRewardCron ended");
  } catch (err) {
    console.error("saveIncomeRewardCron: unhandled top-level error:", err?.message);
  } finally {
    isIncomeRewardRunning = false;
  }
});

// ── Main orchestrator ─────────────────────────────────────────────────────────
const saveIncomeLevelReward = async () => {
  const runStart = Date.now();

  // "Not processed since" threshold — users whose referralProcessedAt is
  // older than this (or null) are eligible for this run.
  const eligibilityCutoff   = new Date(momentToSubtract(LOOKBACK_DURATION, LOOKBACK_UNIT));

  // Stake-reward search window — look back 24 h so we pick up rewards whose
  // createdAt is set to the stake's original time-of-day (which may be
  // slightly before the cron fired).
  const stakeRewardLookback = new Date(momentToSubtract(24, "hours"));

  // Track IDs processed in this run to avoid re-querying them in subsequent
  // batches (the $nin guard in the query handles DB-level dedup).
  const processedUserIds = new Set();

  // Per-run IncomeLevel cache — avoids repeated findOne calls for the same
  // level range across many team members.
  const incomeLevelCache = new Map(); // key: `${minLevel}-${maxLevel}` → IncomeLevel doc

  let retryCount  = 0;
  let totalProcessed = 0;
  let totalSkipped   = 0;
  let totalErrors    = 0;
  let retryTimer;

  // ── Recursive batch processor ───────────────────────────────────────────
  const processBatch = async () => {
    try {
      const users = await User.find({
        status: DEFAULT_STATUS.ACTIVE,
        // Only users with income-level rewards enabled
        $or: [
          { isLevelIncomeInactive: false },
          { isLevelIncomeInactive: { $exists: false } },
        ],
        // Only users not yet processed in this window
        $and: [
          {
            $or: [
              { referralProcessedAt: null },
              { referralProcessedAt: { $exists: false } },
              { referralProcessedAt: { $lt: eligibilityCutoff } },
            ],
          },
        ],
        // Skip users already handled in earlier batches this run
        _id: { $nin: Array.from(processedUserIds) },
      })
        .select("_id email isLevelIncomeInactive referralProcessedAt")
        .lean()
        .limit(BATCH_SIZE);

      if (users.length === 0) {
        const elapsed = ((Date.now() - runStart) / 1000).toFixed(2);
        console.log(
          `✅ saveIncomeRewardCron: all users processed — ` +
          `processed: ${totalProcessed}, skipped: ${totalSkipped}, errors: ${totalErrors}, elapsed: ${elapsed}s`
        );
        return;
      }

      console.log(`saveIncomeRewardCron: processing batch of ${users.length} user(s).`);

      for (const user of users) {
        // Mark immediately so a crash mid-user doesn't re-queue them in the
        // same run's next batch.
        processedUserIds.add(user._id.toString());

        try {
          const stake = await Stake.findOne({
            userId: user._id,
            status: DEFAULT_STATUS.ACTIVE,
          })
            .select("_id amount")
            .lean();

          // Minimum stake threshold check
          if (!stake || stake.amount < 0.055) {
            console.log(`saveIncomeRewardCron: user ${user._id} skipped — no qualifying stake.`);
            await markUserProcessed(user._id, eligibilityCutoff);
            totalSkipped++;
            continue;
          }

          await processUserIncomeReward(
            user,
            eligibilityCutoff,
            stakeRewardLookback,
            incomeLevelCache
          );
          totalProcessed++;

        } catch (userErr) {
          totalErrors++;
          console.error(`saveIncomeRewardCron: error for user ${user._id}:`, userErr?.message);
          await CronLog.create({
            title: "incomeRewardCron",
            error: `user ${user._id}: ${userErr?.message}`,
          }).catch(() => {});
          // Still mark processed so we don't retry the same broken user
          // indefinitely within this run.
          await markUserProcessed(user._id, eligibilityCutoff).catch(() => {});
        }
      }

      // Recurse for the next batch
      await processBatch();

    } catch (batchErr) {
      // Batch-level failure (e.g. DB connection lost)
      console.error("saveIncomeRewardCron: batch error:", batchErr?.message);
      await CronLog.create({
        title: "incomeRewardCron",
        error: batchErr?.message,
      }).catch(() => {});

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(
          `saveIncomeRewardCron: retry ${retryCount}/${MAX_RETRIES} in ${RETRY_INTERVAL_MS / 1000}s…`
        );
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(async () => {
          console.log("saveIncomeRewardCron: retrying batch…");
          await processBatch();
        }, RETRY_INTERVAL_MS);
      } else {
        console.error("saveIncomeRewardCron: max retries reached.");
        await sendCronFailureEmail("incomeRewardCron").catch(() => {});
      }
    }
  };

  await processBatch();
};

// ── Per-user income reward processor ─────────────────────────────────────────
/**
 * Processes income-level rewards for a single upline user.
 *
 * Steps:
 *  1. Resolve the user's team and unlocked income levels.
 *  2. Fetch all team members with active stakes in one aggregate.
 *  3. Check capping ONCE for the upline user — bail early if reached.
 *  4. Bulk-fetch already-issued rewards for this user to build a dedup Set.
 *  5. Collect new rewards into an array and insertMany in one write.
 *  6. Mark the user processed.
 */
const processUserIncomeReward = async (
  user,
  eligibilityCutoff,
  stakeRewardLookback,
  incomeLevelCache
) => {
  // ── 1. Resolve team + unlocked income levels ──────────────────────────
  const team = await Team.findOne({ userId: user._id }).select("_id").lean();
  if (!team) {
    console.log(`saveIncomeRewardCron: no team for user ${user._id} — skipping.`);
    await markUserProcessed(user._id, eligibilityCutoff);
    return;
  }
  const teamId = team._id;

  const referralResult = await referral.referralIncomeLevel(
    teamId,
    user._id,
    DEFAULT_STATUS.ACTIVE
  );
  const incomeLevelBonus           = referralResult?.incomeLevelBonus || [];
  const referralIncomeUnLockedLevels = incomeLevelBonus.filter((l) => l.unlocked);

  if (referralIncomeUnLockedLevels.length === 0) {
    console.log(`saveIncomeRewardCron: user ${user._id} has no unlocked income levels — skipping.`);
    await markUserProcessed(user._id, eligibilityCutoff);
    return;
  }

  // ── 2. Fetch team members with active stakes (one aggregate) ──────────
  const teamMembers = await TeamMember.aggregate([
    { $match: { teamId } },
    {
      $lookup: {
        from: "teams",
        localField: "teamId",
        foreignField: "_id",
        as: "team",
      },
    },
    { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "team.userId",
        foreignField: "_id",
        as: "teamOwner",
      },
    },
    { $unwind: { path: "$teamOwner", preserveNullAndEmptyArrays: true } },
    { $match: { "teamOwner.status": DEFAULT_STATUS.ACTIVE } },
    {
      $lookup: {
        from: "stakes",
        localField: "userId",
        foreignField: "userId",
        as: "stakes",
      },
    },
    {
      $addFields: {
        stakes: {
          $filter: {
            input: "$stakes",
            as: "s",
            cond: { $eq: ["$$s.status", DEFAULT_STATUS.ACTIVE] },
          },
        },
      },
    },
    { $match: { "stakes.0": { $exists: true } } }, // only members with ≥1 active stake
    {
      $project: {
        userId: 1,
        level: 1,
        "stakes._id": 1,
        "stakes.amount": 1,
      },
    },
  ]);

  if (teamMembers.length === 0) {
    await markUserProcessed(user._id, eligibilityCutoff);
    return;
  }

  // ── 3. Capping check — once per upline user ───────────────────────────
  const capping = await referral.handleCappingEvent(user._id);
  if (capping?.isCappingReached) {
    console.log(`saveIncomeRewardCron: capping reached for user ${user._id}.`);
    sendCappingLimitEmail(user.email).catch((e) =>
      console.error(`saveIncomeRewardCron: capping email failed for ${user._id}:`, e?.message)
    );
    await markUserProcessed(user._id, eligibilityCutoff);
    return;
  }

  // ── 4. Collect all stakeIds in this team for a bulk reward lookup ─────
  const allStakeIds = teamMembers.flatMap((m) => m.stakes.map((s) => s._id));

  // Fetch all stake rewards in the lookback window for these stakes in one query
  const recentStakeRewards = await UserStakeReward.find({
    stakeId: { $in: allStakeIds },
    createdAt: { $gte: stakeRewardLookback },
  })
    .select("_id userId stakeId amount createdAt")
    .lean();

  if (recentStakeRewards.length === 0) {
    console.log(`saveIncomeRewardCron: no recent stake rewards found for user ${user._id}'s team.`);
    await markUserProcessed(user._id, eligibilityCutoff);
    return;
  }

  // Build a Set of stakeRewardIds already credited to this upline user
  // so we can do O(1) dedup without per-reward DB queries.
  const existingRewardIds = await UserOtherReward.distinct("stakeRewardId", {
    userId: user._id,
    type: OTHER_REWARD.INCOME_LEVEL,
    stakeRewardId: { $in: recentStakeRewards.map((r) => r._id) },
  });
  const existingSet = new Set(existingRewardIds.map((id) => id.toString()));

  // ── 5. Build new reward docs ──────────────────────────────────────────
  const toInsert = [];

  for (const member of teamMembers) {
    // Resolve income level for this member's depth (cached per run)
    const cacheKey = `${member.level}`;
    let memberIncomeLevel = incomeLevelCache.get(cacheKey);
    if (!memberIncomeLevel) {
      memberIncomeLevel = await IncomeLevel.findOne({
        minLevel: { $lte: member.level },
        maxLevel: { $gte: member.level },
      }).lean();
      if (memberIncomeLevel) incomeLevelCache.set(cacheKey, memberIncomeLevel);
    }

    if (!memberIncomeLevel) continue;

    // Check if this income level is unlocked for the upline user
    const unlockedLevel = referralIncomeUnLockedLevels.find(
      (l) => l._id.toString() === memberIncomeLevel._id.toString()
    );
    if (!unlockedLevel) {
      console.log(`saveIncomeRewardCron: level ${member.level} locked for user ${user._id}.`);
      continue;
    }

    for (const stake of member.stakes) {
      // Filter recent rewards that belong to this specific stake
      const stakeRewardsForMember = recentStakeRewards.filter(
        (r) =>
          r.stakeId.toString() === stake._id.toString() &&
          r.userId.toString() === member.userId.toString()
      );

      for (const stakeReward of stakeRewardsForMember) {
        if (!stakeReward.amount) continue;

        // Dedup check via in-memory Set
        if (existingSet.has(stakeReward._id.toString())) {
          console.log(
            `⚠️  saveIncomeRewardCron: reward already exists for user ${user._id}, stakeRewardId ${stakeReward._id}.`
          );
          continue;
        }

        const incomeRewardAmount = helper.calculatePercentage(
          unlockedLevel.rewardPercentage,
          stakeReward.amount
        );

        if (incomeRewardAmount <= 0) continue;

        // Add to the in-memory set immediately to prevent duplicates within
        // the same batch (e.g. same stakeRewardId appearing via two members).
        existingSet.add(stakeReward._id.toString());

        toInsert.push({
          userId:           user._id,
          type:             OTHER_REWARD.INCOME_LEVEL,
          amount:           incomeRewardAmount,
          stakeId:          stake._id,
          levelId:          unlockedLevel._id,
          rewardPercentage: unlockedLevel.rewardPercentage,
          stakeRewardId:    stakeReward._id,
          createdAt:        stakeReward.createdAt,
        });
      }
    }
  }

  // ── 6. Bulk insert + mark user processed ─────────────────────────────
  if (toInsert.length > 0) {
    // ordered: false — a duplicate-key violation on one doc doesn't abort
    // the rest of the batch (the unique sparse index is the safety net).
    await UserOtherReward.insertMany(toInsert, { ordered: false }).catch((err) => {
      // Log but don't rethrow — partial inserts are acceptable here because
      // the unique index prevents true duplicates from persisting.
      if (err.code !== 11000) throw err; // re-throw non-duplicate errors
      console.warn(
        `saveIncomeRewardCron: ${err.writeErrors?.length ?? "some"} duplicate(s) skipped for user ${user._id}.`
      );
    });
    console.log(`✅ saveIncomeRewardCron: inserted ${toInsert.length} reward(s) for user ${user._id}.`);
  } else {
    console.log(`saveIncomeRewardCron: no new rewards to insert for user ${user._id}.`);
  }

  await markUserProcessed(user._id, eligibilityCutoff);
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const markUserProcessed = (userId, processedAt) =>
  User.updateOne({ _id: userId }, { $set: { referralProcessedAt: processedAt } });

module.exports = { saveIncomeRewardCron, saveIncomeLevelReward };
