const mongoose = require("mongoose");

const cronLogSchema = new mongoose.Schema(
  {
    title: { type: String, required: false },
    error: { type: String, required: false },
  },
  { timestamps: true,
    // collection: 'cron_logs' 
  }
);

const CronLog = mongoose.model("CronLog", cronLogSchema);

module.exports = CronLog;
