const cron = require("node-cron");
const database = require("../services/index");
const { getWeb3 } = require("../contract/index");
const validatePendingP2PTx = cron.schedule("*/5 * * * *", async () => {
  const pendingP2PTx =
    await database.fundsTranferService.getPendingFundsTransferTx();
  const web3 = getWeb3();
  if (pendingP2PTx?.length > 0) {
    for (p2p of pendingP2PTx) {
      if (p2p?.transactionId?.txHash) {
        const receipt = await web3.eth.getTransactionReceipt(
          p2p?.transactionId?.txHash
        );
        if (receipt) {
          if (receipt.status) {
            await database.fundsTranferService.handleFundsTransferEvent(
              p2p?.transactionId?.txHash
            );
          } else {
            await database.fundsTranferService.updateFundsTransfer(
              { _id: p2p?._id, status: DEFAULT_STATUS.PENDING },
              { status: DEFAULT_STATUS.FAILED }
            );
            await database.transactionService.updateTransaction(
              {
                _id: p2p?.transactionId?._id,
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

module.exports = validatePendingP2PTx;
