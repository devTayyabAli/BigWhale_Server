const cron = require("node-cron");
const services = require("../services/index");

const validateStakeExpiration = cron.schedule('*/2 * * * *', async () => {
  await services.stakeService.updateExpiredStakes();
});

module.exports = validateStakeExpiration;
