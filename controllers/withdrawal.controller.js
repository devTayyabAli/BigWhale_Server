const ResponseHelper = require("../helpers/response");

const services = require("../services/index");

class StakeController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async addWithdrawal(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    try {
      response = await services.withdrawalService.create(req, response);
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async completeWithdrawal(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.withdrawalService.completeWithdrawal(
        req,
        response
      );
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getWithdrawalByUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.withdrawalService.getWithdrawalByPayload(
        req,
        response
      );
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getAllWithdrawalsByUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.withdrawalService.getAllWithdrawalsByPayload(
        req,
        response
      );
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getWithdrawalAmount(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    try {
      response = await services.withdrawalService.getWithdrawalAmount(
        req,
        response
      );
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async transferWithdrawalFunds(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
   const {amount,userId}=req.body
    try {
      const txHash = await services.withdrawalService.withdrawAmount(
        req.params.address,
        amount,
        userId
      );
      response.message = "ok";
      response.status = 200;
      response.success = true;
      response.data = txHash;
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  
  static async getWithdrawalHistory(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const {  page = 1, limit = 10 } = req.query;
      response = await services.withdrawalService.getWithdrawalHistoryByID(req.params.userId,page,limit);
    } catch (error) {
      console.error("Withdrawal error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = StakeController;
