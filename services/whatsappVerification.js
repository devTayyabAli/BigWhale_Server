/**
 * BIGWHALE — WhatsApp Verification Service
 *
 * How it works:
 *  1. generateWhatsAppCode(userId)
 *     → generates a unique 6-char code, saves it on the user with 10-min expiry
 *     → returns a wa.me deep-link: user opens WhatsApp, "VERIFY-XXXXXX" is pre-filled
 *     → user taps Send to your WhatsApp Business number
 *
 *  2. Meta webhook fires POST /auth/whatsapp-webhook
 *     → handleIncomingWhatsAppMessage(from, body) is called
 *     → matches "VERIFY-XXXXXX" against DB, marks whatsappJoined = true
 *     → emits socket "whatsappVerified" for instant frontend update
 *
 *  3. Frontend polls GET /auth/whatsapp-check/:userId every 3s
 *     → checkWhatsAppCodeReceived(userId) reads DB only (no Meta API call)
 *     → returns { verified: true } once DB is updated by the webhook
 *     → this is the fallback if socket doesn't reach the client
 *
 * NOTE: Meta only delivers webhooks to test numbers while the app is in
 * development mode. Add your number as a test number in Meta Developer
 * Console → WhatsApp → API Setup → "To" field, then send a test message.
 * Once the app is published, all numbers receive webhooks.
 *
 * Required env vars:
 *   WHATSAPP_BUSINESS_NUMBER   — digits only, no + (e.g. 923041517931)
 *   WHATSAPP_PHONE_NUMBER_ID   — from Meta Developer Console → API Setup
 *   WHATSAPP_ACCESS_TOKEN      — from Meta Developer Console → API Setup
 *   WHATSAPP_VERIFY_TOKEN      — random secret for webhook handshake
 */

const crypto = require("crypto");
const axios  = require("axios");
const User   = require("../models/user.model");

const BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;
const CODE_EXPIRY_MS  = 10 * 60 * 1000; // 10 minutes

// ── 1. Generate a verification code ──────────────────────────────────
const generateWhatsAppCode = async (userId) => {
  const code      = crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F9C2"
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  await User.findByIdAndUpdate(userId, {
    $set: {
      "socialConfirmed.whatsappVerifyCode":      code,
      "socialConfirmed.whatsappVerifyExpiresAt": expiresAt,
      // Reset so a fresh verification is required
      "socialConfirmed.whatsappJoined":          false,
      "socialConfirmed.whatsappLastCheckedAt":   null,
    },
  });

  const message = encodeURIComponent(`VERIFY-${code}`);
  const link    = `https://wa.me/${BUSINESS_NUMBER}?text=${message}`;

  return { link, code, expiresAt };
};

// ── 2. Handle incoming webhook message ───────────────────────────────
// Called by whatsappWebhookReceive when Meta delivers a message.
// Parses "VERIFY-XXXXXX", finds the matching user, marks verified.
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

    // Send a friendly reply
    await sendWhatsAppReply(
      from,
      "✅ Verified! You can now proceed with your withdrawal on BIGWHALE."
    );

    return { verified: true, userId: String(user._id) };
  } catch (err) {
    console.error("handleIncomingWhatsAppMessage error:", err.message);
    return { verified: false, reason: "Internal error: " + err.message };
  }
};

// ── 3. Poll DB for verification status (frontend calls every 3s) ──────
// Does NOT call Meta API — just reads the DB which the webhook already updated.
// This is the reliable fallback when the socket event doesn't reach the client.
const checkWhatsAppCodeReceived = async (userId) => {
  try {
    const user = await User.findById(userId).select("socialConfirmed");
    if (!user) return { verified: false, reason: "User not found" };

    const sc = user.socialConfirmed || {};

    // Webhook already marked this user as verified
    if (sc.whatsappJoined === true) {
      return { verified: true, userId: String(user._id) };
    }

    // Check if code is still pending
    const code      = sc.whatsappVerifyCode;
    const expiresAt = sc.whatsappVerifyExpiresAt;

    if (!code) return { verified: false, reason: "No pending code — generate a new one" };

    if (new Date() > new Date(expiresAt)) {
      return { verified: false, reason: "Code expired — please get a new code" };
    }

    return { verified: false, reason: "Waiting for your WhatsApp message..." };
  } catch (err) {
    console.error("checkWhatsAppCodeReceived error:", err.message);
    return { verified: false, reason: "Internal error" };
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
    // Non-fatal — log and continue
    console.error("sendWhatsAppReply error:", err?.response?.data || err.message);
  }
};

module.exports = {
  generateWhatsAppCode,
  handleIncomingWhatsAppMessage,
  checkWhatsAppCodeReceived,
  sendWhatsAppReply,
};
