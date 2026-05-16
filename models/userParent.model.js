const mongoose = require("mongoose");

const userParentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    processedAt: { type: Date, default: null, required: false },
  },
  {
    timestamps: true,
  }
);

const UserParent = mongoose.model("UserParent", userParentSchema);
module.exports = UserParent;
