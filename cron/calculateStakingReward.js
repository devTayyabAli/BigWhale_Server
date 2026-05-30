/**
 * calculateStakingReward.js
 *
 * Staking Reward Cron — runs every 5 minutes (configurable via STAKE_REWARD_CRON_SCHEDULE).
 *
 * Business rule: one reward per stake per calendar day (in DEFAULT_TIMEZONE).
 * The 24-hour check is intentionally replaced by a calendar-day check so that
 * a stake created at 11:58 PM doesn't have to wait until 11:58 PM the next day
 * to receive its second reward — midnight is the natural boundary users expect.
 *
 * Optimisations applied:
 *  1. Concurrency guard (isStakeRewardRunning) prevents overlapping runs.
 *  2. STAKE_REWARD_PER_DAY setting fetched once per run, not once per stake.
 *  3. Capping check and duplicate-reward check run in parallel (Promise.all).
 *  4. Stake.lastReward update is fire-and-forget (no await) — it is only a
 *     hint used by getStakesToAddReward; losing it on a crash is acceptable
 *     because getRewardForDay is the authoritative duplicate guard.
 *  5. All DB writes for a single stake are batched where possible.
 *  6. Structured error logging via CronLog + failure email on unrecoverable errors.
 */

const cron               = require("node-cron");
const services           = require("../services/index");
const socket             = require("../helpers/sockets");
const { SETTING }        = require("../config/constants");
const { getSettingWithKey } = require("../helpers/setting");
const Stake              = require("../models/stake.model");
const CronLog            = require("../models/cronLogs.model");
const { sendCappingLimitEmail, sendCronFailureEmail } = require("../helpers/mail");
const referral           = require("../services/referral");
const {
  momentFormatedWithSetTime,
  momentFormated,
  momentTimezone,
} = require("../helpers/moment");
const UserStakingReward  = require("../models/userStakingReward.model");
const { getRewardForDay } = require("../services/stakingReward");

// ── Schedule ──────────────────────────────────────────────────────────────────
const cronTiming = process.env.STAKE_REWARD_CRON_SCHEDULE || "*/5 * * * *";

// ── Concurrency guard ─────────────────────────────────────────────────────────
let isStakeRewardRunning = false;

const calcuateStakingRewards = cron.schedule(cronTiming, async () => {
  if (isStakeRewardRunning) {
    console.log("⚠️  stakeRewardCron skipped — previous run still in progress.");
    return;
  }
  isStakeRewardRunning = true;
  try {
    await stakeRewardCron();
  } catch (err) {
    // Top-level safety net — stakeRewardCron has its own handler but we
    // don't want an uncaught rejection to crash the process.
    console.error("stakeRewardCron: unhandled top-level error:", err?.message);
  } finally {
    isStakeRewardRunning = false;
  }
});

// ── Core logic ────────────────────────────────────────────────────────────────
const stakeRewardCron = async () => {
  const runStart = Date.now();
  let processed = 0;
  let skipped   = 0;
  let errors    = 0;

  try {
    // Snapshot "now" once for the entire run so every stake in this batch
    // uses the same reference point.
    const nowTz = momentTimezone();

    // Fetch active stakes and the reward percentage in parallel.
    const [activeStakes, percentage] = await Promise.all([
      services.stakeService.getStakesToAddReward(nowTz),
      getSettingWithKey(SETTING.STAKE_REWARD_PER_DAY),
    ]);

    console.log(`stakeRewardCron: ${activeStakes.length} active stake(s) to evaluate.`);

    if (activeStakes.length === 0) {
      console.log("stakeRewardCron: nothing to do.");
      return;
    }

    for (const stake of activeStakes) {
      // Skip stakes whose user was filtered out by the populate match
      // (user inactive / deleted).
      if (!stake?.userId?._id) {
        skipped++;
        continue;
      }

      try {
        // ── Run capping check and duplicate-day guard in parallel ──────────
        const [capping, existingTodayReward] = await Promise.all([
          referral.handleCappingEvent(stake.userId._id),
          getRewardForDay(stake._id),
        ]);

        if (capping?.isCappingReached) {
          // Fire-and-forget — email failure must not block the loop.
          sendCappingLimitEmail(stake.userId.email).catch((e) =>
            console.error(`stakeRewardCron: capping email failed for ${stake.userId._id}:`, e?.message)
          );
          skipped++;
          continue;
        }

        if (existingTodayReward) {
          console.log(`⚠️  Reward already exists for stake ${stake._id} today — skipping.`);
          skipped++;
          continue;
        }

        // ── Calculate reward amount ────────────────────────────────────────
        const amount = calculatePercentage(percentage, stake.amount);

        if (amount <= 0) {
          console.warn(`stakeRewardCron: calculated amount is ${amount} for stake ${stake._id} — skipping.`);
          skipped++;
          continue;
        }

        // ── Preserve the stake's original time-of-day on today's date ─────
        // This keeps dashboard grouping consistent with the stake creation time.
        const time = {
          hour:        stake.createdAt.getUTCHours(),
          minute:      stake.createdAt.getUTCMinutes(),
          second:      stake.createdAt.getUTCSeconds(),
          millisecond: stake.createdAt.getMilliseconds(),
        };
        const rewardCreatedAt = momentFormatedWithSetTime(momentTimezone(), time);

        // ── Persist reward + update lastReward in parallel ─────────────────
        // lastReward is a hint for getStakesToAddReward; the authoritative
        // duplicate guard is the unique index on (stakeId, createdAt).
        await Promise.all([
          UserStakingReward.create({
            userId:    stake.userId._id,
            stakeId:   stake._id,
            amount,
            createdAt: rewardCreatedAt,
          }),
          Stake.updateOne(
            { _id: stake._id },
            { $set: { lastReward: momentFormated() } }
          ),
        ]);

        console.log(`✅ Reward saved — stake: ${stake._id}, amount: ${amount}`);
        processed++;

      } catch (stakeErr) {
        // Per-stake error: log and continue so one bad stake doesn't abort
        // the entire batch.
        errors++;
        console.error(`stakeRewardCron: error processing stake ${stake._id}:`, stakeErr?.message);
        await CronLog.create({
          title: "stakeRewardCron",
          error: `stake ${stake._id}: ${stakeErr?.message}`,
        }).catch(() => {}); // never let logging itself throw
      }
    }

    // Notify connected clients that withdrawal amounts may have changed.
    socket.io?.emit("withdrawAmount", {});

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(2);
    console.log(
      `stakeRewardCron: done in ${elapsed}s — processed: ${processed}, skipped: ${skipped}, errors: ${errors}`
    );

  } catch (error) {
    // Batch-level failure (e.g. DB connection lost before the loop started).
    console.error("stakeRewardCron: batch-level error:", error?.message, error);
    await CronLog.create({
      title: "stakeRewardCron",
      error: error?.message,
    }).catch(() => {});
    await sendCronFailureEmail("stakeRewardCron").catch(() => {});
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const calculatePercentage = (percentage, value) =>
  (Number(percentage) / 100) * Number(value);

module.exports = { calcuateStakingRewards, stakeRewardCron };
