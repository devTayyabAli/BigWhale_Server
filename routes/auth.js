var express = require("express");
var router = express.Router();
const validate = require("express-joi-validate");
const { uploadProfileImage } = require("../utils/upload.utils");
const {
  signupValidation,
  completeSignupUpdation,
} = require("../middleware/validations/auth.validation");
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const AuthController = require("../controllers/auth.controller");

router.post("/signup", validate(signupValidation), AuthController.registration);
router.post(
  "/signup/complete",
  validate(completeSignupUpdation),
  AuthController.completeRegistration
);

router.post("/signin", AuthController.login);
router.get("/profile/:id", checkIfAuthenticated, AuthController.getProfile);
router.post(
  "/update-profile/:userId",
  checkIfAuthenticated,
  uploadProfileImage,
  AuthController.updateProfile
);
router.post("/change-password", AuthController.changePassword);
router.post("/forget-password", AuthController.forgetPassword);
router.post("/reset-password/:token", AuthController.resetPassword);
router.post("/generate-2fa", checkIfAuthenticated, AuthController.generateTwoFa);
router.post("/verify-2fa", checkIfAuthenticated, AuthController.verifyTwoFa);
router.post("/disable-2fa", checkIfAuthenticated, AuthController.disableTwoFa);
router.get("/get-referral-detail/:userName?", AuthController.getReferralDetail);
router.get("/check-username-email", AuthController.checkUserNameEmail);
router.post("/email/sendOTP", AuthController.sendEmailVerficationOtp);
router.post("/email/verifyOTP", AuthController.verifyEmailOTP);
router.post("/deactive-account", checkIfAuthenticated, AuthController.deactiveAccount);
router.delete("/pending/:id", AuthController.deletePendingUser);
router.post("/verify-2fa-otp", AuthController.verifyTwoFaOtp);
router.post("/send-2fa-otp", AuthController.sendTwoFa);
router.post('/missing-reward', AuthController.getMissingIncomeReward);

// ── BIGWHALE Social Verification Routes ─────────────────────────────
// Telegram Login Widget callback
// POST /auth/verify-telegram  { userId, telegramData: { id, hash, auth_date, ... } }
router.post('/verify-telegram', AuthController.verifyTelegram);

// WhatsApp Channel self-attestation
// POST /auth/verify-whatsapp  { userId }
router.post('/verify-whatsapp', AuthController.verifyWhatsApp);

// GET  /auth/social-status/:userId
router.get('/social-status/:userId', AuthController.getSocialStatus);

module.exports = router;
