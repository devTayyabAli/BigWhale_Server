require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const referral = require("./services/referral");
const User = require("./models/user.model");

const run = async () => {
  try {
    console.log("Connecting to database...");
    await new Promise((resolve) => {
      connectDB();
      mongoose.connection.once("open", resolve);
    });

    const users = await User.find({ status: "active" });
    for (const user of users) {
      const capping = await referral.handleCappingEvent(user._id);
      console.log(`User: ${user.email} (${user._id})`);
      console.log(`- cappingAmount: ${capping.cappingAmount}`);
      console.log(`- earnAmount: ${capping.earnAmount}`);
      console.log(`- isCappingReached: ${capping.isCappingReached}`);
      console.log(`-------------------------------------`);
    }

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

run();
