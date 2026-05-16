const jwt = require("jsonwebtoken");
const ResponseHelper = require("../helpers/response");
const services = require("../services/index");
const { momentFormated } = require("../helpers/moment");

class StakeController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async addStake(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.stakeService.create({...req.body,createdAt:momentFormated(),
      }, response);
    } catch (error) {
      console.error("stake error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async completeStake(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.stakeService.completeStake(req, response);
    } catch (error) {
      console.error("stake error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getStakeByUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.stakeService.getStakeByPayload(req, response);
    } catch (error) {
      console.error("stake error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async getAllStakesByUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.stakeService.getAllStakesByPayload(
        req,
        response
      );
    } catch (error) {
      console.error("stake error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = StakeController;

