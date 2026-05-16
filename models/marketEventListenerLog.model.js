const mongoose = require("mongoose");

const marketEventListenerLog = new mongoose.Schema(
  {
    address: { type: String, required: true },
  },
  { timestamps: true,
    // collection: 'market_event_logs' 
  }
);

const MarketEventLog = mongoose.model("MarketEventLog", marketEventListenerLog);

module.exports = MarketEventLog;
