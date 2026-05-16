const mongoose = require("mongoose");
const tokensRateSchema = new mongoose.Schema(
  {
    txHash: { type: String },
    amount: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const TokenRate = mongoose.model("TokenRate", tokensRateSchema);

module.exports = TokenRate;
