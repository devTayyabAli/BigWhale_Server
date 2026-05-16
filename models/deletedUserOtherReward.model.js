const mongoose = require('mongoose');

const DeletedUserOtherRewardSchema = new mongoose.Schema(
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
    createdAt: { 
      type: Date, 
      default: null, 
      required: false 
    },
    updatedAt: { 
      type: Date, 
      default: null, 
      required: false 
    }
  },
  { 
    timestamps: true, 
  }
);

const DeletedUserOtherReward = mongoose.model('DeletedUserOtherReward', DeletedUserOtherRewardSchema);

module.exports = DeletedUserOtherReward;

