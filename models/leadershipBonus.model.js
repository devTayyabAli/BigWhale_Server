const mongoose = require("mongoose");
const { Schema } = mongoose;

const leadershipBonusSchema = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    startDay: {
      type: String,
      required: true,
    },
    endDay: {
      type: String,
      required: true,
    },
    totalTurnOver: {
      type: Number,
      required: true,
    },
    rewardAmount: {
      type: Number,
      required: true,
    },
    rewardPercentage: {
      type: Number,
      required: true,
    },
    rankId: {
      type: Schema.Types.ObjectId,
      ref: "Rank",
      required: true,
    },
    processedAt: { type: Date, default: null, required: false },
  },
  { timestamps: true,
    // collection: 'leadership_bonuses' 
  }
);

leadershipBonusSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const LeadershipBonus = mongoose.model(
  "LeadershipBonus",
  leadershipBonusSchema
);

module.exports = LeadershipBonus;
