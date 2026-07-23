const referral = require("./services/referral");
const stakeService = require("./services/stake");
const salaryRankService = require("./services/salaryRank");
const User = require("./models/user.model");
const Stake = require("./models/stake.model");

console.log("Checking modules loaded successfully...");
console.log("handleCappingEvent:", typeof referral.handleCappingEvent);
console.log("handleStakeEvent:", typeof stakeService.handleStakeEvent);
console.log("distributeSalaryRankReward:", typeof salaryRankService.distributeSalaryRankReward);
console.log("All modules imported cleanly!");
