const mongoose = require("mongoose");
const { DEFAULT_STATUS } = require("../config/constants");

const rankGiftRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    rankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rank",
      required: false,
    },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
      required: false,
    },
    status: {
      type: String,
      enum: [
        DEFAULT_STATUS.PENDING,
        DEFAULT_STATUS.ACTIVE,
        DEFAULT_STATUS.INACTIVE,
      ],
      default: DEFAULT_STATUS.PENDING,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  { timestamps: true,
    // collection: 'rank_gift_requests' 

  }
);

const RankGiftRequest = mongoose.model("RankGiftRequest", rankGiftRequestSchema);

module.exports = RankGiftRequest;
