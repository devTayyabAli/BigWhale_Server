const mongoose = require("mongoose");

const newsUpdatesSchema = new mongoose.Schema(
    {
        picture: [
            {
                size:{
                    type: Number,
                    required: true,
                },
                name: {
                    type: String,
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


const NewsUpdates = mongoose.model("NewsUpdates", newsUpdatesSchema);

module.exports = NewsUpdates;
