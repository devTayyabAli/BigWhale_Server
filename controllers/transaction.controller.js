const services = require("../services/index");
const transactionLogs=require("../models/transactionLogs.model")
const ResponseHelper = require("../helpers/response");

class KycController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async completeStackTx(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    const { txHash } = req.params;
    try {
      await services.stakeService.handleStakeEvent(txHash);
      response.message = "tx completed successfully";
      response.status = 200;
      response.success = true;
    } catch (error) {
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async completeP2PTx(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    const { txHash } = req.params;
    try {
      await  services.fundsTranferService.handleFundsTransferEvent(txHash)
      response.message = "tx completed successfully";
      response.status = 200;
      response.success = true;
    } catch (error) {
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async completeWithdrawTx(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    const { txHash } = req.params;
    try {
        await services.withdrawalService.handleWithdrawalEvent(txHash);
      response.message = "tx completed successfully";
      response.status = 200;
      response.success = true;
    } catch (error) {
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async completeRegisterTx(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    const { txHash } = req.params;
    try {
        await services.authService.handleRegisterEvent(txHash);
      response.message = "tx completed successfully";
      response.status = 200;
      response.success = true;
    } catch (error) {
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async addTxLog(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    try {
        await transactionLogs.create(req.body);
      response.message = "tx log added successfully";
      response.status = 200;
      response.success = true;
    } catch (error) {
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = KycController;
