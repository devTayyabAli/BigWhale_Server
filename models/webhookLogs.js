const mongoose = require("mongoose");
const { LOGS_STATUS } = require("../config/constants");
const webhookLogsSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [LOGS_STATUS.PENDING, LOGS_STATUS.COMPETED],
      default: LOGS_STATUS.PENDING,
    },
    data: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true,
    // collection: 'webhook_logs' 
  }
);

const WebHookLogs = mongoose.model("WebhookLogs", webhookLogsSchema);

module.exports = WebHookLogs;
