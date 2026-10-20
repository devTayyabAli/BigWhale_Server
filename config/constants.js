const ERROR_MESSAGE = {
  WALLET_EXIST: "Wallet already exists",
  NO_ACCOUNT_EXIST:
    "There is no account linked to that address, Please signup first",
  WENT_WRONG: "Something went wrong, Please try again",
  LOGO_REQUIRED: "logo image is required",
  SIGN_IN_FIRST: "Please Sign In First",
  USER_ID_NOT_FOUND: "UserId not found",
  PROVIDE_DATA: "please provide data",
  USER_DOES_NOT_EXIST: "User does not exist",
  PASSWORD_INCORRECT: "please enter Correct Password",
  USER_NOT_FOUND: "Please Enter Valid Email",
  UNAUTHORIZED: "Please Login First",
};

const SUCCESS_MESSAGE = {
  USER_REGISTERED: "User registered successfully",
  USER_LOGGEDIN: "User logged in successfully",
  PROFILE_UPDATED: "User profile updated successfully.",
  USER_CREATED: "user is created successfully",
  USER_AUTHENTICATED: "user authenticated successfully",
};

const SUCCESS_STATUS = {
  TRUE: true,
  FALSE: false,
};

// HTTP STATUS CODES
const HTTP_STATUS_CODE = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOW: 405,
  CONFLICT: 409,
  INTERNAL_SERVER: 500,
};
const DEFAULT_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  INACTIVE: "inactive",
  BANNED: "banned",
  FAILED:'failed',
  ACCEPTED: "accepted",
  REJECTED: "rejected",
};

const CONTRACT_EVENTS = {
  REGISTER: "Register",
  STAKE: "Stake",
  WITHDRAWAL: "Withdraw",
  KGCTRANSFER: "KGCTransfer",
  TRANSFER: "Transfer",
};

const TRANSACTION_TYPES = {
  REGISTER: "register",
  STAKE: "stake",
  WITHDRAWAL: "withdraw",
  PARTIALWITHDRAWAL: "partialWithdrawal",
};

const TRANSACTION_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
};

const KYC_STATUS = {
  "user.created": "created",
  "user.readyToReview": "readyToReview",
  "review.approved": "approved",
  "user.inReview": "inReview",
  "review.rejected": "rejected",
  "user.blocked": "blocked",
  "user.deleted": "deleted",
};

const LOGS_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
};

const OTHER_REWARD = {
  INCOME_LEVEL: "income_level",
  LEADERSHIP: "leadership",
  INSTANT_BONUS: "instant_bonus",
  SALARY_RANK: "salary_rank",
};
const SEARCH_KEY = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};
const SOCKET_EVENT = {
  CAPPINGAMOUNT: "cappingAmount",
};
const SETTING = {
  STAKE_DURATION:"stake_duration",
  STAKE_REWARD_PER_DAY:"stake_reward_per_day",
  MINIMUM_WITHDRAWAL_PERCENTAGE:"minimum_withdrawal_percentage",
  WITHDRAWAL_DEDUCTION_PERCENTAGE:"withdrawal_deduction_percentage",
  NORMAL_CAPPING:"normal_capping",   // Investor plan — 2X multiplier
  MARKET_CAPPING:"market_capping",   // Networker plan — 3X multiplier
  P2P_TRANSFER_DEDUCTION_PERCENTAGE:"p2p_transfer_deduction_percentage",
  INSTANT_BONUS_PERCENTAGE:"instant_bonus_percentage",
  OTP_EXPIRY_DURATION:"otp_expiry_duration",
  OTP_EXPIRY_UNIT:"otp_expiry_unit",
  STAKE_DURATION_UNIT:"stake_duration_unit",
  STAKE_DURATION_EXPIRY:"stake_duration_expiry",

};

/**
 * Maps a capping multiplier value to its plan label.
 * Used by both the Server (socket emit) and displayed in the Client.
 *   2  → "Investor 2X"
 *   3  → "Networker 3X"
 */
const CAPPING_PLAN_LABELS = {
  2: "Investor 2X",
  3: "Networker 3X",
};

/**
 * Stake types.
 *  LEGACY        → old daily-% ROI stake (capping applies, runs for STAKE_DURATION)
 *  FAST_TRACK_2X → fixed 5 BW stake, pays 2X ONCE 24h after activation
 *                  (only when the user has unlocked via 5 staked directs),
 *                  then the stake is closed. Capping does NOT apply.
 */
const STAKE_TYPE = {
  LEGACY: "legacy",
  FAST_TRACK_2X: "fast_track_2x",
};

/**
 * BigWhale 2X Fast-Track business rules (single source of truth for Server).
 */
const FAST_TRACK = {
  STAKE_AMOUNT: 5,                 // fixed stake size (BW / USD, 1:1)
  AMOUNT_TOLERANCE: 0.01,          // float tolerance for amount equality checks
  PAYOUT_MULTIPLIER: 2,            // 2X
  PAYOUT_DELAY_HOURS: 24,          // paid once, 24h after activation
  UNLOCK_DIRECTS: 5,               // directs (with a confirmed stake) needed to unlock 2X
  WITHDRAWAL_CHUNK: 10,            // withdrawals are exactly 10 BW
  MAX_WITHDRAWALS_PER_WINDOW: 1,   // 1 withdrawal per rolling window
  WITHDRAWAL_WINDOW_HOURS: 24,     // rolling 24h window
  PENDING_WITHDRAWAL_STALE_MINUTES: 10, // pending w/o tx older than this is discarded
  SALARY_POOL_PERCENTAGE: 20,      // 20% of every withdrawal feeds the salary pool
  RESTAKE_GRACE_HOURS: 48,         // after a 2X payout, user stays "staked" this long to re-stake
  // Direct-count thresholds for Rank 1..7 (5^N)
  RANK_DIRECT_THRESHOLDS: [5, 25, 125, 625, 3125, 15625, 78125],
};
const EMAIL_SUBJECT = {
  REGISTER: "Account Verification",
  FORGOT_PASSWORD: "Password Reset Instructions",
  INVITE: "Invitation",
  RANK_UPDATION: "Rank Updation",
  RANK_GIFT_REQUEST: "Rank Gift Request",
  REQUEST_PROCESS_FAILURE: "Request process failure",
  CAPPING_LIMIT: "Capping Limit",
  CREATE_TICKET: "Create Support Ticket",
  INPROGRESS_TICKET: "Your Ticket InProgress",
  COMPLETE_TICKET: "Your ticket is Now Completed",



};
const EMAIL_TEMPLATE_PATH = {
  REGISTER: "email_template/register.ejs",
  CREATE_TICKET: "email_template/supportTicket.ejs",
  VERIFICATION: "email_template/verifyOTP.ejs",
  FORGOT_PASSWORD: "email_template/forgotPassword.ejs",
  SEND_OTP: "email_template/send-otp.ejs",
  INVITE: "email_template/invite.ejs",
  RANK_UPDATION: "email_template/rankUpdation.ejs",
  RANK_GIFT_REQUEST: "email_template/rankGiftRequest.ejs",
  REQUEST_PROCESS_FAILURE: "email_template/cronFailureEmail.ejs",
  CAPPING_LIMIT: "email_template/cappingLimit.ejs",

}
const EXCHANGE_TYPES = {
  BUY: "buy",
  SELL: "sell"
};

module.exports = {
  ERROR_MESSAGE,
  HTTP_STATUS_CODE,
  SUCCESS_STATUS,
  SUCCESS_MESSAGE,
  DEFAULT_STATUS,
  CONTRACT_EVENTS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  OTHER_REWARD,
  KYC_STATUS,
  LOGS_STATUS,
  SOCKET_EVENT,
  SETTING,
  SEARCH_KEY,
  EMAIL_TEMPLATE_PATH,
  EMAIL_SUBJECT,
  EXCHANGE_TYPES,
  CAPPING_PLAN_LABELS,
  STAKE_TYPE,
  FAST_TRACK,
}
