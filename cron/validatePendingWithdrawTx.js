const cron = require("node-cron");
const database = require("../services/index");
const { getWeb3 } = require("../contract/index");
const PartialWithdrawals = require("../models/partialWithdrawal.model.js");
const web3 = getWeb3();
const validatePendingWithdrawTx = cron.schedule("*/5 * * * *", async () => {
  const pendingWithdrawals =
    await database.withdrawalService.getPendingWithdrawals();
  const pendingPartialWithdrawals =
    await database.withdrawalService.getPendingPartialWithdrawals();
  await handlePendingWithdrawals(pendingWithdrawals);
  await handlePendingPartialWithdrawalTx(pendingPartialWithdrawals);
});
const handlePendingPartialWithdrawalTx = async (pendingPartialWthdrawals) => {
  if (pendingPartialWthdrawals?.length > 0) {
    for (withdrawal of pendingPartialWthdrawals) {
      if (withdrawal?.transactionId?.txHash) {
        const receipt = await web3.eth.getTransactionReceipt(
          withdrawal?.transactionId?.txHash
        );
        if (receipt) {
          if (receipt.status) {
            await database.withdrawalService.updatePartialWithdrawal(
              withdrawal?.transactionId?.txHash
            );
          } else {
            await PartialWithdrawals.findByIdAndUpdate(
              { _id: withdrawal?._id, status: DEFAULT_STATUS.PENDING },
              { status: DEFAULT_STATUS.FAILED }
            );
            await database.transactionService.updateTransaction(
              {
                _id: withdrawal?.transactionId?._id,
                status: DEFAULT_STATUS.PENDING,
              },
              { status: DEFAULT_STATUS.FAILED }
            );
          }
        } 
      }
    }
  }
};
const handlePendingWithdrawals = async (pendingWithdrawals) => {
  if (pendingWithdrawals?.length > 0) {
    for (withdrawal of pendingWithdrawals) {
      if (withdrawal?.transactionId?.txHash) {
        const receipt = await web3.eth.getTransactionReceipt(
          withdrawal?.transactionId?.txHash
        );
        if (receipt) {
          if (receipt.status) {
            await database.withdrawalService.handleWithdrawalEvent(
              withdrawal?.transactionId?.txHash
            );
          } else {
            await database.withdrawalService.updateWithdrawal(
              { _id: withdrawal?._id, status: DEFAULT_STATUS.PENDING },
              { status: DEFAULT_STATUS.FAILED }
            );
            await database.transactionService.updateTransaction(
              {
                _id: withdrawal?.transactionId?._id,
                status: DEFAULT_STATUS.PENDING,
              },
              { status: DEFAULT_STATUS.FAILED }
            );
          }
        } 
      }
    }
  }
};

module.exports = validatePendingWithdrawTx;
