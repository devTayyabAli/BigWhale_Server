const { name } = require("ejs");
const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        subject: {
            type: String,
            required: false,
        },
        description: {
            type: String,
            required: false,
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "Urgent", "Critical Error"],
            default: "Low",
        },
        status: {
            type: String,
            enum: ["ToDo", "Pending", "Completed", "Failed"],
            default: "ToDo",
        },
        picturesOrVideos: [
            {
                size:{
                    type: String,
                    required: true,
                },
                name: {
                    type: String,
                    required: true,
                },
                type: {
                    type: String,
                    enum: ["image", "video"],
                    required: true,
                },
                url: {
                    type: String,
                    required: true,
                },
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Uncomment for media file count validation (if needed)
// supportSchema.path("picturesOrVideos").validate(function (value) {
//     return value.length >= 2 && value.length <= 4;
// }, "There must be between 2 and 4 images or videos.");

const SupportTickets = mongoose.model("SupportTickets", supportSchema);

module.exports = SupportTickets;
