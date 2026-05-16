const mongoose = require("mongoose");

const RankSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    starKey: {
      type: Number,
      required: false,
    },
    selfBusiness: {
      type: String,
      required: true,
    },
    directTeam: {
      type: String,
      required: false,
    },
    directBussiness: {
      type: String,
      required: false,
    },
    totalTeamBusiness: {
      type: String,
      required: false,
    },
    totalTeamSize: {
      type: String,
      required: true,
    },
    rankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rank",
      required: false,
    },
    referralCount: { type: Number, required: false },
    rewardPercentage: {
      type: String,
      required: false,
    },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
      required: false,
    },
  },
  {
    timestamps: true,
    // collection: 'ranks'
  }
);

const Rank = mongoose.model("Rank", RankSchema);

module.exports = Rank;
