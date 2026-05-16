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
      enum: ["income_level", "leadership", "instant_bonus"],
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

const UserOtherReward = mongoose.model(
  "UserOtherReward",
  userOtherRewardSchema
);

module.exports = UserOtherReward;
