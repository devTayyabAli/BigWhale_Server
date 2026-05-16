const cron = require("node-cron");
const marketEventListener = require("../contract/marketEventListener");
const eventsTestCron = cron.schedule("*/4 * * * * *", async () => {
  marketEventListener.addContractToListen(
    process.env.REGISTER_CONTRACT_ADDRESS,
    true
  );
});

module.exports = eventsTestCron;
