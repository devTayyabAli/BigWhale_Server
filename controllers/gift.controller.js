const ResponseHelper = require("../helpers/response");
const services = require("../services/index");

class GiftController {
  static async getRankGiftRequests(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.giftService.getGiftRequests(req, response);
    } catch (error) {
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async updateGiftRequestStatus(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.giftService.updateGiftRequestStatus(
        req,
        response
      );
    } catch (error) {
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = GiftController;
