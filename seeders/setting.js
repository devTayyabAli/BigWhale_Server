const Setting = require("../models/setting.model");

const settingData = [
  { key: "stake_duration", value: "500" }, //change to 500 days before moving to production
  { key: "stake_reward_per_day", value: "0.40" },   
  { key: "minimum_withdrawal_percentage", value: "10" },
  { key: "withdrawal_deduction_percentage", value: "5" },
  { key: "normal_capping", value: "2" },
  { key: "market_capping", value: "5" },
  { key: "p2p_transfer_deduction_percentage", value: "1" },
  { key: "instant_bonus_percentage", value: "10" },
  { key: "otp_expiry_duration", value: "10" },
  { key: "otp_expiry_unit", value: "minutes" },
  { key: "stake_duration_unit", value: "days" },//days
  { key: "stake_duration_expiry", value: "500" },//change to 500 days once ready for production
];

async function seedSettingData() {
  try {
    if (settingData.length > 0) {
      let added = 0;
      for (const setting of settingData) {
        const existingSetting = await Setting.findOne({
          key: setting?.key,
        });
        if (!existingSetting) {
          // Insert the data into the database
          await Setting.insertMany(settingData);
          added++;
        }
      }
      if (added) console.error("Income Level seeder executed.");
    }
  } catch (error) {
    console.error("Error seeding Income Level:", error);
  }
}

seedSettingData();
