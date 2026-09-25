const ResponseHelper = require("../../helpers/response");
const systemWalletService = require("../../services/systemWallet.service");

class OwnerWalletController {
  /**
   * GET /api/admin/owner-wallet/status
   * Safely returns configuration status and derived public address.
   * NEVER returns the private key!
   */
  static async getStatus(req, res) {
    try {
      const status = await systemWalletService.getOwnerWalletStatus();
      return res
        .status(200)
        .json(
          ResponseHelper.getResponse(
            true,
            "Owner wallet status retrieved successfully",
            status,
            200
          )
        );
    } catch (error) {
      console.error("OwnerWallet getStatus error:", error);
      return res
        .status(500)
        .json(
          ResponseHelper.getResponse(
            false,
            error.message || "Failed to retrieve wallet status",
            {},
            500
          )
        );
    }
  }

  /**
   * POST /api/admin/owner-wallet
   * Encrypts and updates/saves the owner private key in database.
   * Body: { privateKey: string }
   */
  static async updateKey(req, res) {
    try {
      const { privateKey } = req.body;
      if (!privateKey || typeof privateKey !== "string") {
        return res
          .status(400)
          .json(
            ResponseHelper.getResponse(
              false,
              "Valid private key string is required",
              {},
              400
            )
          );
      }

      const adminEmail = req.user?.email || "admin";
      const result = await systemWalletService.saveOwnerPrivateKey(
        privateKey,
        adminEmail
      );

      return res
        .status(200)
        .json(
          ResponseHelper.getResponse(
            true,
            result.message,
            { address: result.address, updatedAt: result.updatedAt },
            200
          )
        );
    } catch (error) {
      console.error("OwnerWallet updateKey error:", error);
      return res
        .status(400)
        .json(
          ResponseHelper.getResponse(
            false,
            error.message || "Failed to update owner private key",
            {},
            400
          )
        );
    }
  }

  /**
   * DELETE /api/admin/owner-wallet
   * Deletes the encrypted owner private key from the database.
   */
  static async deleteKey(req, res) {
    try {
      const result = await systemWalletService.deleteOwnerPrivateKey();
      return res
        .status(200)
        .json(
          ResponseHelper.getResponse(true, result.message, {}, 200)
        );
    } catch (error) {
      console.error("OwnerWallet deleteKey error:", error);
      return res
        .status(500)
        .json(
          ResponseHelper.getResponse(
            false,
            error.message || "Failed to remove private key",
            {},
            500
          )
        );
    }
  }
}

module.exports = OwnerWalletController;
