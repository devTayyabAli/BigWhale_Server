const mongoose = require("mongoose");

const userOtherRewardSchema = new mongoose.Schema(
  {
    stakeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stake",
      required: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["income_level", "leadership", "instant_bonus", "salary_rank"],
      required: false,
    },
    amount: { type: String, required: true, default: 0 },
    day: {
      type: Number,
    },
    rankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rank",
      required: false,
    },
    leadershipBonusId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadershipBonus",
      required: false,
    },
    levelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncomeLevel",
      required: false,
    },
    rewardPercentage: {
      type: Number,
      required: false,
    },
    date: {
      type: String,
      required: false,
    },
    stakeRewardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserStakeReward",
      required: false,
    },
  },
  {
    timestamps: true,
    // collection: "user_other_rewards"
  }
);

// Prevent duplicate income-level rewards for the same stakeRewardId per user.
// sparse: true so records where stakeRewardId is null/undefined (leadership,
// instant_bonus) are excluded from this index entirely — they have their own
// dedup guard via the unique index below.
userOtherRewardSchema.index(
  { userId: 1, stakeRewardId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "income_level" },
    name: "unique_user_stakeReward_type",
  }
);

// Prevent duplicate instant_bonus rewards for the same (upline user, stake).
// One instant bonus per stakeId per upline user — regardless of how many times
// the stake event fires (e.g. blockchain re-delivery, retry logic).
// partialFilterExpression scopes this index to instant_bonus docs only so it
// does not interfere with income_level or leadership records.
userOtherRewardSchema.index(
  { userId: 1, stakeId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { type: "instant_bonus" },
    name: "unique_instant_bonus_per_user_stake",
  }
);

const UserOtherReward = mongoose.model(
  "UserOtherReward",
  userOtherRewardSchema
);

module.exports = UserOtherReward;
