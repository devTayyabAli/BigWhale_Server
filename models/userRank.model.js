const mongoose = require("mongoose");

const userRankSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rank",
      required: false,
    },
    processedAt: { type: Date, default: null, required: false },
  },
  {
    timestamps: true,
    // collection: 'user_ranks'
  }
);

const UserRank = mongoose.model("UserRank", userRankSchema);

module.exports = UserRank;
