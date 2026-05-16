const cron = require("node-cron");
const database = require("../services/index");
const { getWeb3 } = require("../contract/index");
const validatePendingRegisterUsers = cron.schedule("*/5 * * * *", async () => {
    try {
      const pendingRegisterUsers =
        await database.authService.getPendingRegisterUsers();
      const web3 = getWeb3();

      if (pendingRegisterUsers?.length > 0) {
        for (user of pendingRegisterUsers) {
          if (user?.registrationTransactionId?.txHash) {
            const receipt = await web3.eth.getTransactionReceipt(
              user?.registrationTransactionId?.txHash
            );
            if (receipt) {
              if (receipt.status) {
                await database.authService.handleRegisterEvent(
                  user?.registrationTransactionId?.txHash
                );
              } else {
                await database.authService.updateUser(
                  { _id: user?._id, status: DEFAULT_STATUS.PENDING },
                  { status: DEFAULT_STATUS.FAILED }
                );
                await database.transactionService.updateTransaction(
                  {
                    _id: user?.registrationTransactionId?._id,
                    status: DEFAULT_STATUS.PENDING,
                  },
                  { status: DEFAULT_STATUS.FAILED }
                );
              }
            } 
          }
        }
      }
    } catch (err) {
      console.log(err, "err==>");
    }
  }
);

module.exports = validatePendingRegisterUsers;
