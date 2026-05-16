const ResponseHelper = require("../helpers/response");
const services = require("../services/index");
class SettingController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async addSetting(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.settingService.addSetting(req.body, response);
    } catch (error) {
      console.error("addConfigError: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getAll(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.settingService.getAllSetting(response);
    } catch (error) {
      console.error("Config error error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async update(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { id: _id } = req.params;
      response = await services.settingService.updateSetting(
        { _id },
        req.body,
        response
      );
    } catch (error) {
      console.error("Config error error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = SettingController;
