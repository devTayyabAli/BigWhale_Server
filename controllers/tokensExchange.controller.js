const ResponseHelper = require("../helpers/response");
const services = require("../services/index");
const { HTTP_STATUS_CODE } = require("../config/constants");
const createPaginator = require("../helpers/paginate");

class TokensExchangeController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method will create user tokens exchange details
   */
  static async create(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      response = await services.tokenExchange.createTokenExchange(
        req.body,
        response
      );
    } catch (error) {
      console.error("tokens exchange: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  
  static async complete(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {

      response = await services.tokenExchange.completeTokenExchange(
        req,
        response
      );
    } catch (error) {
      console.error("create tokensExchange error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  
  static async getTokenExchangeByType(request, response) {
    try {
      const { userId, type } =  request.params;
      const { page, limit } = request.query;
      const {total, tokenExchangeData,sum} = await services.tokenExchange.getTokenExchangeByType( userId, type, page, limit);     
      return response.status(HTTP_STATUS_CODE.OK).json({
         data:tokenExchangeData,
        paginate: createPaginator.paginate(total, limit, page),
        sum
      });
    } catch (error) {
      return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
    }
  }

static async completeExchangeTx(req, res) {
  let response = ResponseHelper.getResponse(
    false,
    "Something went wrong",
    {},
    400
  );
  const { txHash } = req.params;
  try {
    await services.tokenExchange.handleExchangeTx(txHash);
    response.message = "token Exchange tx completed successfully";
    response.status = 200;
    response.success = true;
  } catch (error) {
  } finally {
    return res.status(response.status).json(response);
  }
}
}

module.exports = TokensExchangeController;
