var express = require("express");
var router = express.Router();
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const SettingController = require("../controllers/setting.controller");
const {
  createConfigValidation,
} = require("../middleware/validations/config.validation");
router.post(
  "/",
  //  checkIfAuthenticated,
  createConfigValidation,
  SettingController.addSetting
);

router.get(
  "/",
  //  checkIfAuthenticated,
  SettingController.getAll
);

router.put(
  "/:id",
  //  checkIfAuthenticated,
  SettingController.update
);

module.exports = router;
