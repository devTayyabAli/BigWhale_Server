var express = require('express');
var router = express.Router();
const {
} = require('../middleware/validations/auth.validation');

const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const ReferralController = require('../controllers/referral.controller');

router.get('/', checkIfAuthenticated, ReferralController.getReferralByType);

router.get('/stats', checkIfAuthenticated, ReferralController.getReferralStats);
router.get('/stats/:userId', checkIfAuthenticated, ReferralController.getReferralStatsByUserID);


router.get('/income-level', checkIfAuthenticated, ReferralController.getReferralBonusLevel);

router.get('/cronjob-reward/:date', checkIfAuthenticated, ReferralController.getReferralReward);

router.get('/leadership-bonus', checkIfAuthenticated, ReferralController.getLeadershipBonus);

router.get('/stake-bonus', checkIfAuthenticated, ReferralController.getStakeBonus);

router.get('/level-bonus', checkIfAuthenticated, ReferralController.getLevelBonus);

router.get('/instant-bonus', checkIfAuthenticated, ReferralController.getInstantBonus);

module.exports = router;
