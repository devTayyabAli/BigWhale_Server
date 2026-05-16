var express = require("express");
var router = express.Router();
const transaction = require("../controllers/transaction.controller");
const {completeTxValidation,txLogValidation}=require('../middleware/validations/transaction.validation')
router.post("/stake/:txHash",completeTxValidation, transaction.completeStackTx);
router.post("/p2p/:txHash",completeTxValidation, transaction.completeP2PTx);
router.post("/withdraw/:txHash",completeTxValidation, transaction.completeWithdrawTx);
router.post("/register/:txHash",completeTxValidation, transaction.completeRegisterTx);
router.post("/log",txLogValidation,transaction.addTxLog)
module.exports = router;

