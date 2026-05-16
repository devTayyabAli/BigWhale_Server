const ResponseHelper = require("../helpers/response");
const services = require("../services/index");
const User = require("../models/user.model");
const { ObjectId } = require("mongoose").Types;
const { DEFAULT_STATUS } = require("../config/constants");
const Transaction = require("../models/transaction.model");
const Stake = require("../models/stake.model");
const TokenExchange = require("../models/tokenExchange.model");
const Withdrawal = require("../models/withdrawal.model");
const { totalWithdrawalAmount, totalPartialWithdrawalAmount } = require("../services/withdrawal");
const Web3 = require("web3");
const conractInfo = require("../contract/contractInfo");


const PRIVATE_KEY = process.env.KGC_TOKENS_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.KGC_TOKEN_ADDRESS;

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.CHAIN_STACK_HTTP_URL));


const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

const contract = new web3.eth.Contract(conractInfo.kgc.abi, conractInfo.kgc.address);




class FundsTransferController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async create(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      if (req?.body?.toUserId) {
        const user = await User.findById(new ObjectId(req?.body?.toUserId));
        if (user?.status === DEFAULT_STATUS.BANNED) {
          response.message = "Invalid User Id";
          response.status = 400;
          return;
        }
      }

      response = await services.fundsTranferService.createFundsTransfer(
        req.body,
        response
      );
    } catch (error) {
      console.error("create funds error: ", error);
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

      response = await services.fundsTranferService.completeFundsTransfer(
        req,
        response
      );
    } catch (error) {
      console.error("create funds error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getFundsByUser(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
    response = await services.fundsTranferService.getFundsTransferByPayload(
      req,
      response
    );

    try {
    } catch (error) {
      console.error("funds fetch error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
  static async availableToConvert(req, res) {
    try {
      const userId = req.params.userId;
      if (!userId) {
        return res.status(400).json(ResponseHelper.getResponse(false, "User ID is required", {}, 400));
      }

      const objectIdUserId = new ObjectId(userId);

      const partialWithdrawalAmount = await totalPartialWithdrawalAmount(objectIdUserId)
      const withdrawalAmount = await totalWithdrawalAmount(objectIdUserId);
      const withdrawalAmountToDeduct = (withdrawalAmount[0]?.totalAmount || 0) + (partialWithdrawalAmount[0]?.totalAmount || 0)
      // console.log("withdrawalAmountToDeduct",withdrawalAmountToDeduct)
      // Aggregate the total sell amount
      const [registerAmount,] = await Promise.all([
        TokenExchange.aggregate([
          { $match: { userId: objectIdUserId, type: "sell", status: "completed" } },
          { $group: { _id: null, totalSell: { $sum: "$amount" } } }
        ]),

      ]);


      const totalRegister = registerAmount[0]?.totalSell || 0;
      const availableAmountToConvert = withdrawalAmountToDeduct - totalRegister;

      return res.status(200).json(
        ResponseHelper.getResponse(true, "Available amount to convert retrieved successfully", { availableAmountToConvert }, 200)
      );
    } catch (error) {
      console.error("Error fetching available amount to convert:", error);
      return res.status(500).json(
        ResponseHelper.getResponse(false, error.message || "An internal server error occurred", {}, 500)
      );
    }
  }
  static async blockUser(req, res) {

    const { addresses } = req.body;

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({ error: "addresses must be a non-empty array" });
    }

    const results = [];
    let nonce = await web3.eth.getTransactionCount(account.address, "pending");

    for (const userAddress of addresses) {
      if (!web3.utils.isAddress(userAddress)) {
        results.push({ address: userAddress, status: "invalid_address" });
        continue;
      }

      try {
        const isBlacklisted = await contract.methods.blackListed(userAddress).call();
        if (isBlacklisted) {
          console.log(`⚠️ ${userAddress} already blacklisted`);
          results.push({ address: userAddress, status: "already_blacklisted" });
          continue;
        }
        // Encode the contract call
        const txData = contract.methods.addInBlackList(userAddress).encodeABI();

        // Estimate gas
        const gas = await contract.methods.addInBlackList(userAddress).estimateGas({
          from: account.address,
        });

        const gasPrice = await web3.eth.getGasPrice();

        const tx = {
          from: account.address,
          to: CONTRACT_ADDRESS,
          gas,
          gasPrice,
          nonce,
          data: txData,
        };

        // Sign transaction
        const signedTx = await web3.eth.accounts.signTransaction(tx, PRIVATE_KEY);

        // Send transaction
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        results.push({
          address: userAddress,
          status: "success",
          txHash: receipt.transactionHash,
        });

        console.log(`✅ Sent to ${userAddress}: ${receipt.transactionHash}`);

        nonce++; // increment nonce for next transaction
      } catch (err) {
        console.error(`❌ Error for ${userAddress}:`, err.message);
        results.push({ address: userAddress, status: "failed", error: err.message });
      }
    }
    res.status(200).json(
      ResponseHelper.getResponse(true, "Available amount to convert retrieved successfully", { results }, 200)
    );
    // res.json({ success: true, results });



  }


}

module.exports = FundsTransferController;
