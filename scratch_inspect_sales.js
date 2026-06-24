require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const TokenExchange = require("./models/tokenExchange.model");
const Transaction = require("./models/transaction.model");

const run = async () => {
  try {
    console.log("Connecting to database...");
    await new Promise((resolve) => {
      connectDB();
      mongoose.connection.once("open", resolve);
    });

    console.log("\n--- Searching for completed sell exchanges ---");
    const exchanges = await TokenExchange.find({ status: "completed", type: "sell" })
      .populate("userId", "userName")
      .populate("transactionId")
      .limit(5);

    console.log(`Found ${exchanges.length} completed sell exchanges`);
    exchanges.forEach((ex) => {
      console.log(JSON.stringify(ex, null, 2));
    });

    process.exit(0);
  } catch (error) {
    console.error("Failed:", error);
    process.exit(1);
  }
};

run();
