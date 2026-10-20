/**
 * fastTrackRankSync.js
 *
 * Daily safety-net for the 2X Fast-Track rank system.
 *
 * Ranks are normally promoted in real time by services/fastTrack.js when a
 * direct confirms a stake (see stake.handleStakeEvent). This cron re-syncs
 * every sponsor once a day so that any missed blockchain event, manual DB
 * fix, or legacy data still converges to the correct rank / 2X unlock.
 *
 * Rules (from FAST_TRACK constants):
 *   • staked directs ≥ 5      → is2XDailyUnlocked = true
 *   • 5 / 25 / 125 / 625 / 3125 / 15625 / 78125 staked directs → Rank 1..7
 *   • promotion only — ranks are lifetime and never go down.
 *
 * This REPLACES the legacy starRewardCalculation / processMemberParentRank
 * crons, which used turnover-based criteria and reset userRankId to null.
 */

const cron    = require("node-cron");
const CronLog = require("../models/cronLogs.model");
const fastTrack = require("../services/fastTrack");

const cronTiming = process.env.APP_ENV !== "production" ? "*/10 * * * *" : "10 0 * * *";

let isRunning = false;

const fastTrackRankSyncCron = cron.schedule(cronTiming, async () => {
  if (isRunning) {
    console.log("⚠️  fastTrackRankSync skipped — previous run still in progress.");
    return;
  }
  isRunning = true;
  const start = Date.now();
  try {
    const result = await fastTrack.recalculateAllRanks();
    console.log(
      `fastTrackRankSync: done in ${((Date.now() - start) / 1000).toFixed(2)}s — ` +
      `sponsors: ${result.sponsors}, promoted: ${result.promoted}`
    );
  } catch (error) {
    console.error("fastTrackRankSync: failed —", error?.message);
    await CronLog.create({ title: "fastTrackRankSync", error: error?.message }).catch(() => {});
  } finally {
    isRunning = false;
  }
});

module.exports = { fastTrackRankSyncCron };
