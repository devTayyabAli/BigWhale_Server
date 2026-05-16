const mongoose = require("mongoose");

const giftSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    amount: { type: Number, required: false, defaultValue: 0 },
  },
  { timestamps: true,
    // collection: 'gifts' 
  },
);

const Gift = mongoose.model("Gift", giftSchema);

module.exports = Gift;
