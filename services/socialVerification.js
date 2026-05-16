/**
 * BIGWHALE — Social Verification Service
 *
 * Telegram : Telegram Login Widget → getChatMember (no username needed)
 * Twitter/X: Twitter OAuth 2.0 PKCE → check following (no username needed)
 *
 * The user just clicks a button and approves in their app.
 * We receive their verified platform ID automatically.
 */

const axios  = require("axios");
const crypto = require("crypto");

// ── Config ────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_GROUP_ID        = process.env.TELEGRAM_GROUP_ID;
const TWITTER_CLIENT_ID        = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET    = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_BEARER_TOKEN     = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_ACCOUNT_USERNAME = process.env.TWITTER_ACCOUNT_USERNAME;
const FRONTEND_BASE_URL        = process.env.FRONTEND_BASE_URL;

// ── Telegram Login Widget Verification ───────────────────────────────
/**
 * Verify the data hash sent by Telegram Login Widget.
 * Telegram signs the auth data with HMAC-SHA256 using SHA256(bot_token) as key.
 *
 * @param {object} telegramData  — { id, first_name, username, hash, auth_date, ... }
 * @returns {{ valid: boolean, reason?: string }}
 */
const verifyTelegramWidgetData = (telegramData) => {
  try {
    const { hash, ...data } = telegramData;

    // Build the data-check string: sorted key=value pairs joined by \n
    const checkString = Object.keys(data)
      .sort()
      .map(k => `${k}=${data[k]}`)
      .join("\n");

    // Key = SHA256 of bot token
    const secretKey = crypto
      .createHash("sha256")
      .update(TELEGRAM_BOT_TOKEN)
      .digest();

    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    if (computedHash !== hash) {
      return { valid: false, reason: "Invalid Telegram auth data (hash mismatch)" };
    }

    // Check auth_date is not older than 24 hours
    const authDate = parseInt(data.auth_date, 10);
    const now      = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, reason: "Telegram auth data expired. Please try again." };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: "Telegram verification error: " + err.message };
  }
};

/**
 * Check if a Telegram user (by numeric ID) is a member of the group.
 *
 * @param {string|number} telegramUserId  — numeric Telegram user ID
 * @returns {{ verified: boolean, reason: string }}
 */
const checkTelegramMembership = async (telegramUserId) => {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_GROUP_ID) {
      return { verified: false, reason: "Telegram bot not configured on server" };
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember`;
    const res = await axios.get(url, {
      params: { chat_id: TELEGRAM_GROUP_ID, user_id: telegramUserId },
      timeout: 8000,
    });

    if (!res.data?.ok) {
      return { verified: false, reason: "Failed to check Telegram group membership" };
    }

    const status = res.data?.result?.status;
    const isMember = ["member", "administrator", "creator"].includes(status);

    if (isMember) return { verified: true, reason: "Verified as group member" };

    return {
      verified: false,
      reason: "You have not joined the BIGWHALE Telegram group yet. Please join and try again.",
    };
  } catch (err) {
    console.error("checkTelegramMembership error:", err?.response?.data || err.message);
    return {
      verified: false,
      reason: err?.response?.data?.description || "Telegram membership check failed",
    };
  }
};

// ── Twitter OAuth 2.0 PKCE ────────────────────────────────────────────
/**
 * Generate a Twitter OAuth 2.0 authorization URL (PKCE flow).
 * The user is redirected here to approve access.
 *
 * @param {string} state  — random state string to prevent CSRF
 * @param {string} codeVerifier  — PKCE code verifier
 * @returns {{ authUrl: string, codeChallenge: string }}
 */
const generateTwitterAuthUrl = (state, codeVerifier) => {
  // Generate code_challenge from code_verifier (S256 method)
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const redirectUri = `${FRONTEND_BASE_URL}/api/auth/twitter-callback`;

  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             TWITTER_CLIENT_ID,
    redirect_uri:          redirectUri,
    scope:                 "tweet.read users.read follows.read",
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  return { authUrl, codeChallenge };
};

/**
 * Exchange Twitter OAuth code for access token.
 *
 * @param {string} code          — authorization code from callback
 * @param {string} codeVerifier  — original PKCE code verifier
 * @returns {{ accessToken: string } | { error: string }}
 */
const exchangeTwitterCode = async (code, codeVerifier) => {
  try {
    const redirectUri = `${FRONTEND_BASE_URL}/api/auth/twitter-callback`;

    const credentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString("base64");

    const res = await axios.post(
      "https://api.twitter.com/2/oauth2/token",
      new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
      {
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          "Authorization": `Basic ${credentials}`,
        },
        timeout: 10000,
      }
    );

    return { accessToken: res.data.access_token };
  } catch (err) {
    console.error("exchangeTwitterCode error:", err?.response?.data || err.message);
    return { error: err?.response?.data?.error_description || "Failed to exchange Twitter code" };
  }
};

/**
 * Get the authenticated Twitter user's ID and username.
 *
 * @param {string} accessToken
 * @returns {{ id: string, username: string } | { error: string }}
 */
const getTwitterUser = async (accessToken) => {
  try {
    const res = await axios.get("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 8000,
    });
    return { id: res.data.data.id, username: res.data.data.username };
  } catch (err) {
    return { error: "Failed to get Twitter user info" };
  }
};

/**
 * Check if a Twitter user (by ID) follows the BIGWHALE account.
 *
 * @param {string} twitterUserId
 * @returns {{ verified: boolean, reason: string }}
 */
const checkTwitterFollow = async (twitterUserId) => {
  try {
    if (!TWITTER_BEARER_TOKEN || !TWITTER_ACCOUNT_USERNAME) {
      return { verified: false, reason: "Twitter API not configured on server" };
    }

    const headers = { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` };

    // Resolve BIGWHALE account ID
    const bwRes = await axios.get(
      `https://api.twitter.com/2/users/by/username/${TWITTER_ACCOUNT_USERNAME}`,
      { headers, timeout: 8000 }
    );
    const bwAccountId = bwRes.data?.data?.id;
    if (!bwAccountId) return { verified: false, reason: "BIGWHALE Twitter account not found" };

    // Check following (paginated)
    let nextToken = null;
    do {
      const params = { max_results: 1000 };
      if (nextToken) params.pagination_token = nextToken;

      const res = await axios.get(
        `https://api.twitter.com/2/users/${twitterUserId}/following`,
        { headers, params, timeout: 10000 }
      );

      const following = res.data?.data || [];
      if (following.some(u => u.id === bwAccountId)) {
        return { verified: true, reason: "Verified as follower" };
      }
      nextToken = res.data?.meta?.next_token || null;
    } while (nextToken);

    return {
      verified: false,
      reason: "You are not following @bigwhaleofficial on X. Please follow and try again.",
    };
  } catch (err) {
    if (err?.response?.status === 429) {
      return { verified: false, reason: "Twitter rate limit reached. Please try again in a few minutes." };
    }
    return { verified: false, reason: "Twitter follow check failed. Please try again." };
  }
};

module.exports = {
  verifyTelegramWidgetData,
  checkTelegramMembership,
  generateTwitterAuthUrl,
  exchangeTwitterCode,
  getTwitterUser,
  checkTwitterFollow,
};
