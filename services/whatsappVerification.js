/**
 * BIGWHALE — WhatsApp Verification Service
 *
 * Flow:
 *  1. generateWhatsAppCode(userId)
 *     → creates a 6-char alphanumeric code, stores it on the user with a 10-min expiry
 *     → returns a wa.me deep-link so the user can send the code to your WhatsApp number
 *
 *  2. handleIncomingWhatsAppMessage(from, body)
 *     → called by the webhook when a message arrives on your WhatsApp Business number
 *     → parses "VERIFY-XXXXXX", finds the matching user, marks whatsappJoined = true
 *
 * Requirements (add to Server/.env):
 *   WHATSAPP_BUSINESS_NUMBER   — your WhatsApp Business number in international format, digits only
 *                                e.g. 923001234567  (no + sign)
 *   WHATSAPP_VERIFY_TOKEN      — any random secret string for webhook verification
 *
 * Optional (Meta Cloud API — for sending reply messages):
 *   WHATSAPP_ACCESS_TOKEN      — Meta permanent access token
 *   WHATSAPP_PHONE_NUMBER_ID   — Meta phone number ID
 */

const crypto = require("crypto");
const User   = require("../models/user.model");

// ── Config ────────────────────────────────────────────────────────────
const BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER; // digits only, no +
const CODE_EXPIRY_MS  = 10 * 60 * 1000; // 10 minutes

// ── Generate a verification code for a user ───────────────────────────
/**
 * Creates a unique 6-char uppercase alphanumeric code, saves it on the user
 * with an expiry timestamp, and returns the wa.me deep-link.
 *
 * @param {string} userId
 * @returns {{ link: string, code: string, expiresAt: Date }}
 */
const generateWhatsAppCode = async (userId) => {
  const code      = crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F9C2"
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  await User.findByIdAndUpdate(userId, {
    $set: {
      "socialConfirmed.whatsappVerifyCode":      code,
      "socialConfirmed.whatsappVerifyExpiresAt": expiresAt,
      // Reset join status so a fresh verification is required
      "socialConfirmed.whatsappJoined":          false,
      "socialConfirmed.whatsappLastCheckedAt":   null,
    },
  });

  const message = encodeURIComponent(`VERIFY-${code}`);
  const link    = `https://wa.me/${BUSINESS_NUMBER}?text=${message}`;

  return { link, code, expiresAt };
};

// ── Handle an incoming WhatsApp message ───────────────────────────────
/**
 * Called by the webhook controller when a message arrives.
 * Parses "VERIFY-XXXXXX" from the message body, finds the matching user,
 * and marks them as verified.
 *
 * @param {string} from   — sender's phone number (digits only, no +)
 * @param {string} body   — raw message text
 * @returns {{ verified: boolean, userId?: string, reason?: string }}
 */
const handleIncomingWhatsAppMessage = async (from, body) => {
  try {
    const match = (body || "").trim().toUpperCase().match(/^VERIFY-([A-F0-9]{6})$/);
    if (!match) {
      return { verified: false, reason: "Message does not match VERIFY-XXXXXX format" };
    }

    const code = match[1];
    const now  = new Date();

    // Find user with this code that hasn't expired
    const user = await User.findOne({
      "socialConfirmed.whatsappVerifyCode":      code,
      "socialConfirmed.whatsappVerifyExpiresAt": { $gt: now },
    });

    if (!user) {
      return { verified: false, reason: "Code not found or expired" };
    }

    // Mark verified
    await User.findByIdAndUpdate(user._id, {
      $set: {
        "socialConfirmed.whatsappJoined":          true,
        "socialConfirmed.whatsappVerifiedAt":       now,
        "socialConfirmed.whatsappLastCheckedAt":    now,
        // Clear the one-time code
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

// ── Send a reply via Meta Cloud API (optional) ────────────────────────
/**
 * Sends a WhatsApp text reply to the user after successful verification.
 * Only runs if WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set.
 *
 * @param {string} to      — recipient phone number (digits only, no +)
 * @param {string} message — text to send
 */
const sendWhatsAppReply = async (to, message) => {
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return; // not configured — skip silently

  try {
    const axios = require("axios");
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
  sendWhatsAppReply,
};
