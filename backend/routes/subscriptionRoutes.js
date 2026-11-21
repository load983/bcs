// ================== routes/subscriptionRoutes.js ==================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/subscriptionController');

// গেটওয়ে কলব্যাক (পাবলিক — SSLCommerz এখানে POST করে; সফলতা গেটওয়ের সার্ভার থেকে আবার যাচাই করা হয়)
router.post('/gateway/success', ctrl.gatewaySuccess);
router.post('/gateway/fail', ctrl.gatewayFail);
router.post('/gateway/cancel', ctrl.gatewayCancel);
router.post('/gateway/ipn', ctrl.gatewayIpn);

// RupantorPay: success/cancel-এ ব্রাউজার GET দিয়ে ফেরে, webhook POST; সবই verify API দিয়ে যাচাই হয়
router.get('/gateway/rupantorpay/success', ctrl.rupSuccess);
router.post('/gateway/rupantorpay/success', ctrl.rupSuccess);
router.get('/gateway/rupantorpay/cancel', ctrl.rupCancel);
router.post('/gateway/rupantorpay/cancel', ctrl.rupCancel);
router.post('/gateway/rupantorpay/webhook', ctrl.rupWebhook);
router.get('/gateway/rupantorpay/webhook', ctrl.rupWebhook);

// শিক্ষকের রুট (এখানে সাবস্ক্রিপশন লাগে না, নাহলে কেনাই যাবে না)
router.use(protect, authorize('teacher'));
router.get('/plans', ctrl.getPlans);
router.get('/me', ctrl.getMySubscription);
router.get('/receipt/:id', ctrl.downloadReceipt); // সফল পেমেন্টের রসিদ PDF
router.post('/promo/validate', ctrl.validatePromo);
router.post('/manual', ctrl.submitManualPayment);
router.post('/gateway/init', ctrl.initGatewayPayment);

module.exports = router;
