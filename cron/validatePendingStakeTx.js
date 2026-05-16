const cron = require("node-cron");
const database = require("../services/index");
const { getWeb3 } = require("../contract/index");
const { DEFAULT_STATUS } = require("../config/constants");
const handleFailedTxStakes = cron.schedule("*/5 * * * *", async () => {
  const pendingStakes = await database.stakeService.getPendingStakes();
  const web3 = getWeb3();
  if (pendingStakes?.length > 0) {
    for (stake of pendingStakes) {
      if (stake?.transactionId?.txHash) {
        const receipt = await web3.eth.getTransactionReceipt(
          stake?.transactionId?.txHash
        );
        if (receipt) {
          if (receipt.status) {
            await database.stakeService.handleStakeEvent(
              stake?.transactionId?.txHash
            );
          } else {
            await database.stakeService.updateStake(
              { _id: stake?._id, status: DEFAULT_STATUS.PENDING },
              { status: DEFAULT_STATUS.FAILED }
            );
            await database.transactionService.updateTransaction(
              {
                _id: stake?.transactionId?._id,
                status: DEFAULT_STATUS.PENDING,
              },
              { status: DEFAULT_STATUS.FAILED }
            );
          }
        } 
      }
    }
  }
});

module.exports = handleFailedTxStakes;
