// ================== utils/paymentNumbers.js ==================
// পেমেন্ট নাম্বার: অ্যাডমিন প্যানেলে সেট করা মান আগে; সেট না থাকলে .env (PAYMENT_*_NUMBER)
const { getSettings } = require('./siteSettings');

const PROVIDERS = ['bkash', 'nagad', 'rocket'];
const ENV_KEY = { bkash: 'PAYMENT_BKASH_NUMBER', nagad: 'PAYMENT_NAGAD_NUMBER', rocket: 'PAYMENT_ROCKET_NUMBER' };

const getPaymentNumbers = async () => {
  let saved = {};
  try { saved = (await getSettings())?.payment || {}; } catch (e) { /* .env-এ ফিরে যাবে */ }
  const out = {};
  for (const k of PROVIDERS) {
    out[k] = typeof saved[k] === 'string' ? saved[k] : (process.env[ENV_KEY[k]] || '');
  }
  return out;
};

module.exports = { getPaymentNumbers, PROVIDERS };
