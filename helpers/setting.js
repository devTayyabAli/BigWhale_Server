/**
 * BIGWHALE — Settings Helper with In-Memory Cache
 *
 * Problem: getSettingWithKey() was hitting MongoDB on every single call.
 * In the cron job alone it was called 4+ times per user per iteration
 * (normalCapping, marketCapping, stakeRewardPerDay, instantBonusPercentage, etc.)
 * With 1000 users that's 4000+ DB round-trips per cron run.
 *
 * Solution: Cache all settings in memory for a configurable TTL (default 5 min).
 * Settings rarely change, so this is safe and dramatically reduces DB load.
 */

const Setting = require('../models/setting.model');

// ── In-memory cache ───────────────────────────────────────────────────
let _cache = null;           // { key: value, ... }
let _cacheLoadedAt = null;   // Date when cache was last populated
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load all settings from DB into the in-memory cache.
 * Called automatically when cache is empty or expired.
 */
const _loadCache = async () => {
  const settings = await Setting.find({}).lean();
  _cache = {};
  for (const s of settings) {
    _cache[s.key] = s.value;
  }
  _cacheLoadedAt = Date.now();
};

/**
 * Get a single setting value by key.
 * Uses in-memory cache; refreshes from DB if cache is expired.
 *
 * @param {string} key
 * @returns {Promise<any>}
 */
const getSettingWithKey = async (key) => {
  const now = Date.now();
  const isExpired = !_cacheLoadedAt || (now - _cacheLoadedAt) > CACHE_TTL_MS;

  if (!_cache || isExpired) {
    await _loadCache();
  }

  return _cache[key];
};

/**
 * Get multiple settings at once in a single cache read.
 * Much more efficient than calling getSettingWithKey() N times.
 *
 * @param {string[]} keys
 * @returns {Promise<Record<string, any>>}
 */
const getSettingsWithKeys = async (keys) => {
  const now = Date.now();
  const isExpired = !_cacheLoadedAt || (now - _cacheLoadedAt) > CACHE_TTL_MS;

  if (!_cache || isExpired) {
    await _loadCache();
  }

  const result = {};
  for (const key of keys) {
    result[key] = _cache[key];
  }
  return result;
};

/**
 * Force-invalidate the cache.
 * Call this after any admin update to settings so the next read is fresh.
 */
const invalidateSettingsCache = () => {
  _cache = null;
  _cacheLoadedAt = null;
};

module.exports = {
  getSettingWithKey,
  getSettingsWithKeys,
  invalidateSettingsCache,
};
