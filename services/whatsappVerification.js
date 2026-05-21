/**
 * BIGWHALE — WhatsApp Verification Service
 *
 * Flow:
 *  1. generateWhatsAppCode(userId)
 *     → creates a 6-char alphanumeric code, stores it on the user with a 10-min expiry
 *     → returns a wa.me deep-link so the user can send the code to your WhatsApp number
 *
 *  2. checkWhatsAppCodeReceived(userId)
 *     → called by the polling endpoint every 3s
 *     → uses Meta Cloud API to read recent messages on the business number
 *     → if it finds "VERIFY-XXXXXX" matching the user's code → marks verified
 *     → works WITHOUT webhook / app publishing
 *
 *  3. handleIncomingWhatsAppMessage(from, body)  [webhook fallback]
 *     → called when Meta webhook fires (after app is published)
 *
 * Requirements (Server/.env):
 *   WHATSAPP_BUSINESS_NUMBER   — digits only, no +
 *   WHATSAPP_PHONE_NUMBER_ID   — from Meta Developer Console → API Setup
 *   WHATSAPP_ACCESS_TOKEN      — from Meta Developer Console → API Setup
 *   WHATSAPP_VERIFY_TOKEN      — random secret for webhook handshake
 */

const crypto = require("crypto");
const axios  = require("axios");
const User   = require("../models/user.model");

// ── Config ────────────────────────────────────────────────────────────
const BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
const CODE_EXPIRY_MS  = 10 * 60 * 1000; // 10 minutes

// ── Generate a verification code for a user ───────────────────────────
const generateWhatsAppCode = async (userId) => {
  const code      = crypto.randomBytes(3).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  await User.findByIdAndUpdate(userId, {
    $set: {
      "socialConfirmed.whatsappVerifyCode":      code,
      "socialConfirmed.whatsappVerifyExpiresAt": expiresAt,
      "socialConfirmed.whatsappJoined":          false,
      "socialConfirmed.whatsappLastCheckedAt":   null,
    },
  });

  const message = encodeURIComponent(`VERIFY-${code}`);
  const link    = `https://wa.me/${BUSINESS_NUMBER}?text=${message}`;

  return { link, code, expiresAt };
};

// ── Poll Meta API for the user's code (no webhook needed) ─────────────
/**
 * Reads recent messages from the Meta Cloud API conversations endpoint.
 * Looks for a message matching "VERIFY-{user's code}" sent within the
 * last 15 minutes. If found → marks the user as verified.
 *
 * This works even when the Meta app is unpublished / in development mode.
 *
 * @param {string} userId
 * @returns {{ verified: boolean, reason?: string }}
 */
const checkWhatsAppCodeReceived = async (userId) => {
  try {
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return { verified: false, reason: "Meta API not configured" };
    }

    // Load the user's pending code
    const user = await User.findById(userId).select("socialConfirmed");
    if (!user) return { verified: false, reason: "User not found" };

    const sc = user.socialConfirmed || {};

    // Already verified
    if (sc.whatsappJoined) return { verified: true };

    const code      = sc.whatsappVerifyCode;
    const expiresAt = sc.whatsappVerifyExpiresAt;

    if (!code) return { verified: false, reason: "No pending code" };
    if (new Date() > new Date(expiresAt)) {
      return { verified: false, reason: "Code expired" };
    }

    const expectedText = `VERIFY-${code}`;

    // ── Fetch recent messages from Meta Cloud API ─────────────────
    // GET /v19.0/{phone-number-id}/messages
    // Returns messages sent TO the business number (incoming)
    const since = Math.floor((Date.now() - 15 * 60 * 1000) / 1000); // last 15 min

    let messages = [];
    try {
      const resp = await axios.get(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          params: {
            fields: "from,text,timestamp,type",
            limit:  50,
          },
          timeout: 8000,
        }
      );
      messages = resp.data?.data || [];
    } catch (apiErr) {
      console.error("Meta messages API error:", apiErr?.response?.data || apiErr.message);
      return { verified: false, reason: "Could not reach Meta API" };
    }

    // ── Search for the matching code ──────────────────────────────
    const match = messages.find(m => {
      if (m.type !== "text") return false;
      const body = (m?.text?.body || "").trim().toUpperCase();
      return body === expectedText && parseInt(m.timestamp, 10) >= since;
    });

    if (!match) {
      return { verified: false, reason: "Code not received yet" };
    }

    // ── Mark verified ─────────────────────────────────────────────
    const now = new Date();
    await User.findByIdAndUpdate(userId, {
      $set: {
        "socialConfirmed.whatsappJoined":          true,
        "socialConfirmed.whatsappVerifiedAt":       now,
        "socialConfirmed.whatsappLastCheckedAt":    now,
        "socialConfirmed.whatsappVerifyCode":       null,
        "socialConfirmed.whatsappVerifyExpiresAt":  null,
      },
    });

    // Send a friendly reply (non-fatal if it fails)
    await sendWhatsAppReply(
      match.from,
      "✅ Verified! You can now proceed with your withdrawal on BIGWHALE."
    );

    return { verified: true, userId: String(user._id) };
  } catch (err) {
    console.error("checkWhatsAppCodeReceived error:", err.message);
    return { verified: false, reason: "Internal error" };
  }
};

// ── Handle an incoming WhatsApp message (webhook path) ────────────────
const handleIncomingWhatsAppMessage = async (from, body) => {
  try {
    const match = (body || "").trim().toUpperCase().match(/^VERIFY-([A-F0-9]{6})$/);
    if (!match) return { verified: false, reason: "Format mismatch" };

    const code = match[1];
    const now  = new Date();

    const user = await User.findOne({
      "socialConfirmed.whatsappVerifyCode":      code,
      "socialConfirmed.whatsappVerifyExpiresAt": { $gt: now },
    });

    if (!user) return { verified: false, reason: "Code not found or expired" };

    await User.findByIdAndUpdate(user._id, {
      $set: {
        "socialConfirmed.whatsappJoined":          true,
        "socialConfirmed.whatsappVerifiedAt":       now,
        "socialConfirmed.whatsappLastCheckedAt":    now,
        "socialConfirmed.whatsappVerifyCode":       null,
        "socialConfirmed.whatsappVerifyExpiresAt":  null,
      },
    });

    return { verified: true, userId: String(user._id) };
  } catch (err) {
    console.error("handleIncomingWhatsAppMessage error:", err.message);
    return { verified: false, reason: "Internal error: " + err.message };
  }
};

// ── Send a reply via Meta Cloud API ──────────────────────────────────
const sendWhatsAppReply = async (to, message) => {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) return;
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );
  } catch (err) {
    console.error("sendWhatsAppReply error:", err?.response?.data || err.message);
  }
};

module.exports = {
  generateWhatsAppCode,
  checkWhatsAppCodeReceived,
  handleIncomingWhatsAppMessage,
  sendWhatsAppReply,
};
