const services = require("../services/auth");
const ResponseHelper = require("../helpers/response");
const Logs = require("../models/webhookLogs");
class KycController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async listenKycEvents(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const log = await Logs.create({ data: req.body });
      const updatedUser = await services.handleKYCEvents(req.body, log?._id);
      if (updatedUser) {
        response.message = "User updated successfully";
        response.status = 200;
        response.success = true;
      } else {
        response.message = "something went wrong";
        response.status = 400;
        response.success = false;
      }
    } catch (error) {
      console.error("stake error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async getKycInfo(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    const { id } = req.params;
    try {
      response = await services.getkycUserByRefId(id, response);
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

module.exports = KycController;
