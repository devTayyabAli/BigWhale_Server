const ResponseHelper = require("../helpers/response");
const services = require("../services/index");

class RankController {
  static async getStakeRewardForUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    try {
      response = await services.rankService.getStakeRankDetails(req, response);
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

module.exports = RankController;
