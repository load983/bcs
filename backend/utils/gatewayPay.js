// ================== utils/gatewayPay.js ==================
// SSLCommerz-এর সার্ভার-টু-সার্ভার কাজ: সেশন শুরু, পেমেন্ট যাচাই, ট্রানজেকশন আইডি দিয়ে খোঁজা।
// ব্রাউজার বা কলব্যাকের পাঠানো ডেটা কখনো বিশ্বাস করা হয় না — গেটওয়ের সার্ভার থেকে আবার যাচাই হয়।
const Subscription = require('../models/Subscription');
const { activateSubscription } = require('./subscription');
const { getGatewayConfig } = require('./gatewayConfig');
const { logSystemPayment } = require('./auditLog');

const PAID = ['VALID', 'VALIDATED'];
const UNPAID = ['FAILED', 'CANCELLED', 'CANCELED', 'UNATTEMPTED', 'EXPIRED', 'INVALID_TRANSACTION'];

// নতুন পেমেন্ট সেশন (GatewayPageURL ফেরত দেয়)
const createSession = async (cfg, { tranId, amount, productName, customer }) => {
  const base = `${cfg.serverUrl}/api/subscription/gateway`;
  const body = new URLSearchParams({
    store_id: cfg.storeId,
    store_passwd: cfg.storePassword,
    total_amount: String(amount),
    currency: 'BDT',
    tran_id: tranId,
    success_url: `${base}/success`,
    fail_url: `${base}/fail`,
    cancel_url: `${base}/cancel`,
    ipn_url: `${base}/ipn`,
    product_name: productName,
    product_category: 'subscription',
    product_profile: 'non-physical-goods',
    shipping_method: 'NO',
    cus_name: customer?.name || 'Teacher',
    cus_email: customer?.email || 'no-email@example.com',
    cus_add1: 'Bangladesh',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone: '01000000000',
  });
  const resp = await fetch(`${cfg.base}/gwprocess/v4/api.php`, { method: 'POST', body });
  return resp.json();
};

// গেটওয়ের সার্ভার থেকে পেমেন্ট আসলেই সফল কিনা যাচাই করে সাবস্ক্রিপশন চালু করা।
// retry=true হলে failed/cancelled-ও আবার চেষ্টা হয় (অ্যাডমিনের "পুনরায় যাচাই")
const validateAndActivate = async (tranId, valId, { retry = false } = {}) => {
  if (!tranId || !valId) return false;
  const sub = await Subscription.findOne({ tranId });
  if (!sub) return false;
  if (sub.status === 'active') return true; // আগেই চালু হয়েছে (IPN + success দুইবার এলে সমস্যা নেই)
  const okStates = retry ? ['pending', 'failed', 'cancelled'] : ['pending'];
  if (!okStates.includes(sub.status)) return false;

  const cfg = await getGatewayConfig();
  if (!cfg.configured) return false;
  const url =
    `${cfg.base}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}` +
    `&store_id=${encodeURIComponent(cfg.storeId)}` +
    `&store_passwd=${encodeURIComponent(cfg.storePassword)}&format=json`;
  const v = await (await fetch(url)).json();

  const paid = PAID.includes(v.status);
  const sameTran = v.tran_id === sub.tranId;
  const sameAmount = Math.abs(parseFloat(v.currency_amount || v.amount) - sub.amount) < 0.01;
  if (!(paid && sameTran && sameAmount)) return false;

  sub.gatewayValId = valId;
  const activated = await activateSubscription(sub);
  if (activated) logSystemPayment(activated); // অ্যাক্টিভিটি লগ (অ্যাডমিন না, সিস্টেম), claim winner only
  if (activated) return true;
  const current = await Subscription.findById(sub._id).select('status').lean();
  return current?.status === 'active';
};

// শুধু ট্রানজেকশন আইডি জানা থাকলে গেটওয়েকে জিজ্ঞেস করা। Unknown মানে
// গেটওয়ে/উত্তরটি নির্ভরযোগ্য নয়; এ অবস্থায় local state বদলানো যাবে না।
const checkTransactionStatus = async (tranId) => {
  if (!tranId) return { status: 'unknown' };
  try {
    const cfg = await getGatewayConfig();
    if (!cfg.configured) return { status: 'unknown' };
    const url =
      `${cfg.base}/validator/api/merchantTransIDvalidationAPI.php?tran_id=${encodeURIComponent(tranId)}` +
      `&store_id=${encodeURIComponent(cfg.storeId)}` +
      `&store_passwd=${encodeURIComponent(cfg.storePassword)}&format=json`;
    const response = await fetch(url);
    if (response.ok === false) return { status: 'unknown' };
    const data = await response.json();
    const elements = Array.isArray(data.element) ? data.element : [];
    const matches = elements.filter((entry) => entry && entry.tran_id === tranId);
    // The merchant lookup can return multiple attempts for one tran_id. A
    // confirmed paid attempt must win over earlier failed attempts.
    const paid = matches.find((entry) => PAID.includes(String(entry.status || '').toUpperCase()));
    if (paid) return { status: 'paid', valId: paid.val_id };

    // SSLCommerz explicitly reports zero records when a checkout was opened
    // but no transaction was completed. This is safe to classify as unpaid.
    const count = Number(data.no_of_trans_found);
    if (matches.length === 0 && elements.length === 0 && count === 0) {
      return { status: 'unpaid', providerStatus: 'NO_TRANSACTION' };
    }

    const allUnpaid = matches.length > 0 && matches.every((entry) =>
      UNPAID.includes(String(entry.status || '').toUpperCase())
    );
    if (allUnpaid) {
      return { status: 'unpaid', providerStatus: String(matches[0].status || '').toUpperCase() };
    }
    const providerStatus = matches.map((entry) => String(entry.status || '').toUpperCase()).filter(Boolean).join(',');
    return { status: 'unknown', providerStatus };
  } catch (e) {
    return { status: 'unknown' };
  }
};

// শুধু ট্রানজেকশন আইডি জানা থাকলে গেটওয়েকে জিজ্ঞেস করা: পেমেন্ট হয়েছে কিনা, হলে val_id কত
const findPaidValId = async (tranId) => {
  const result = await checkTransactionStatus(tranId);
  return result.status === 'paid' ? result.valId : null;
};

module.exports = { createSession, validateAndActivate, findPaidValId, checkTransactionStatus };

// ====================== RupantorPay ======================
// ফ্লো: চেকআউট API → payment_url-এ পাঠানো → success/cancel URL-এ ফেরত (GET) + webhook → verify API দিয়ে যাচাই।
// RupantorPay নিজের transaction_id বানায়; আমাদের tranId আমরা success/cancel/webhook URL-এর ?ref= ও metadata-তে পাঠাই।
const RUP_BASE = 'https://payment.rupantorpay.com/api/payment';

const rupHeaders = (cfg) => ({
  'X-API-KEY': cfg.rupantorpay.apiKey,
  'X-CLIENT': cfg.rupantorpay.domain,
  'Content-Type': 'application/json',
});

const rupCreateSession = async (cfg, { tranId, amount, customer }) => {
  const q = `?ref=${encodeURIComponent(tranId)}`;
  const base = `${cfg.serverUrl}/api/subscription/gateway/rupantorpay`;
  const meta = { tranId };
  const resp = await fetch(`${RUP_BASE}/checkout`, {
    method: 'POST',
    headers: rupHeaders(cfg),
    body: JSON.stringify({
      fullname: customer?.name || 'Teacher',
      email: customer?.email || 'no-email@example.com',
      amount: String(amount),
      success_url: `${base}/success${q}`,
      cancel_url: `${base}/cancel${q}`,
      webhook_url: `${base}/webhook${q}`,
      metadata: meta,
      meta_data: meta, // ডকুমেন্টেশনে দুই নামই আছে — দুটোই পাঠানো হলো
    }),
  });
  return resp.json();
};

const rupVerify = async (cfg, transactionId) => {
  const resp = await fetch(`${RUP_BASE}/verify-payment`, {
    method: 'POST',
    headers: rupHeaders(cfg),
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  return resp.json();
};

// ফেরত: 'paid' | 'pending' | 'failed'
// retry=true হলে failed/cancelled-ও আবার চেষ্টা হয় (অ্যাডমিনের "পুনরায় যাচাই")
const rupValidateAndActivate = async (tranId, gwTxnId, { retry = false } = {}) => {
  if (!tranId) return 'failed';
  const sub = await Subscription.findOne({ tranId, provider: 'rupantorpay' });
  if (!sub) return 'failed';
  if (sub.status === 'active') return 'paid';
  const okStates = retry ? ['pending', 'failed', 'cancelled'] : ['pending'];
  if (!okStates.includes(sub.status)) return 'failed';

  const txn = String(gwTxnId || sub.gatewayValId || '').trim();
  if (!txn || !/^[A-Za-z0-9_-]{4,80}$/.test(txn)) return 'pending';

  const cfg = await getGatewayConfig();
  if (!cfg.rupantorpay.configured) return 'failed';
  const v = await rupVerify(cfg, txn);

  const status = String(v.status || '').toUpperCase();
  if (status === 'PENDING') {
    // টাকা এসেছে কিন্তু নিশ্চিত হয়নি — আইডি রেখে দিই, webhook বা অ্যাডমিনের পুনরায় যাচাই-এ চালু হবে
    if (!sub.gatewayValId) { sub.gatewayValId = txn; await sub.save(); }
    return 'pending';
  }
  if (status !== 'COMPLETED') return 'failed';

  // এই অ্যাকাউন্টের পেমেন্ট কিনা — metadata ফেরত এলে আমাদের tranId মিলতে হবে
  const meta = v.metadata || v.meta_data || {};
  const metaTran = meta.tranId || meta.tran_id;
  if (metaTran && metaTran !== sub.tranId) return 'failed';
  if (v.transaction_id && String(v.transaction_id) !== txn) return 'failed';

  const sameAmount = Math.abs(parseFloat(v.amount) - sub.amount) < 0.01;
  if (!sameAmount) return 'failed';

  // একই গেটওয়ে-ট্রানজেকশন দিয়ে দ্বিতীয় সাবস্ক্রিপশন চালু করা ঠেকানো
  const reused = await Subscription.findOne({ gatewayValId: txn, _id: { $ne: sub._id }, status: { $in: ['active', 'suspended'] } });
  if (reused) return 'failed';

  sub.gatewayValId = txn;
  if (v.trx_id) sub.trxId = String(v.trx_id).toUpperCase();
  const activated = await activateSubscription(sub);
  if (activated) logSystemPayment(activated);
  if (activated) return 'paid';
  const current = await Subscription.findById(sub._id).select('status').lean();
  return current?.status === 'active' ? 'paid' : 'failed';
};

module.exports.rupCreateSession = rupCreateSession;
module.exports.rupVerify = rupVerify;
module.exports.rupValidateAndActivate = rupValidateAndActivate;
