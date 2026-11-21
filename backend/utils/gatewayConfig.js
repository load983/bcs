// ================== utils/gatewayConfig.js ==================
// অনলাইন পেমেন্ট গেটওয়ের কনফিগ (SSLCommerz): অ্যাডমিন প্যানেলে সেভ করা মান আগে, না থাকলে .env।
// Store Password ডাটাবেসে AES-256-GCM দিয়ে এনক্রিপ্ট করা থাকে (aiConfig-এর encrypt/decrypt)।
const SiteSettings = require('../models/SiteSettings');
const { decrypt, cleanBaseUrl } = require('./aiConfig');

const stripSlash = (u) => String(u || '').replace(/\/+$/, '');

// req দিলে SERVER_URL না থাকলে রিকোয়েস্টের ডোমেইন থেকে অনুমান করা হয় (trust proxy চালু আছে)
const getGatewayConfig = async (req) => {
  let g = {};
  try {
    const s = await SiteSettings.findOne({ key: 'main' }).select('+gateway.storePasswordEnc +gateway.rupantorpayKeyEnc').lean();
    g = s?.gateway || {};
  } catch { /* .env-এ ফিরে যাবে */ }

  const dbPass = g.storePasswordEnc ? decrypt(g.storePasswordEnc) : '';
  const dbStore = String(g.storeId || '').trim();
  const dbOk = !!(dbStore && dbPass);
  const envStore = process.env.SSLC_STORE_ID || '';
  const envPass = process.env.SSLC_STORE_PASSWORD || '';
  const envOk = !!(envStore && envPass);

  // দুই জায়গার মান মেশানো হয় না — অ্যাডমিনের জোড়া পূর্ণ হলে সেটা, নইলে .env-এর জোড়া
  const source = dbOk ? 'admin' : envOk ? 'env' : 'none';
  const storeId = dbOk ? dbStore : envStore;
  const storePassword = dbOk ? dbPass : envPass;

  const sandbox = typeof g.sandbox === 'boolean' ? g.sandbox : String(process.env.SSLC_SANDBOX || 'true') !== 'false';
  const reqOrigin = req ? `${req.protocol}://${req.get('host')}` : '';
  const serverUrl = stripSlash(cleanBaseUrl(g.serverUrl) || process.env.SERVER_URL || reqOrigin || `http://localhost:${process.env.PORT || 5000}`);
  const clientUrl = stripSlash(cleanBaseUrl(g.clientUrl) || process.env.CLIENT_URL || 'http://localhost:5173');

  // ---- RupantorPay ----
  const rupDb = g.rupantorpayKeyEnc ? decrypt(g.rupantorpayKeyEnc) : '';
  const rupEnv = process.env.RUPANTORPAY_API_KEY || '';
  const rupKey = rupDb || rupEnv;
  const rupDomainSaved = String(g.rupantorpayDomain || '').trim();
  let rupDomain = rupDomainSaved;
  if (!rupDomain) { try { rupDomain = new URL(clientUrl).host; } catch { rupDomain = ''; } }
  const rupantorpay = {
    apiKey: rupKey,
    configured: !!rupKey,
    source: rupDb ? 'admin' : rupEnv ? 'env' : 'none',
    hint: rupDb ? g.rupantorpayHint || rupDb.slice(-4) : rupEnv ? rupEnv.slice(-4) : '',
    domain: rupDomain,
    domainSaved: rupDomainSaved,
  };

  const active = g.active === 'rupantorpay' ? 'rupantorpay' : 'sslcommerz';
  const enabled = g.enabled !== false;
  const configured = source !== 'none'; // SSLCommerz
  const activeConfigured = active === 'rupantorpay' ? rupantorpay.configured : configured;
  return {
    enabled,
    active,
    configured,
    activeConfigured,
    rupantorpay,
    live: enabled && activeConfigured, // শিক্ষক এখন অনলাইনে পেমেন্ট করতে পারবে কিনা
    source, // admin | env | none
    storeId,
    storePassword,
    passwordHint: dbOk ? g.passwordHint || dbPass.slice(-4) : envOk ? envPass.slice(-4) : '',
    sandbox,
    base: sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com',
    serverUrl,
    clientUrl,
    saved: {
      sandbox: typeof g.sandbox === 'boolean' ? g.sandbox : null,
      storeId: dbStore,
      hasPassword: !!dbPass,
      serverUrl: g.serverUrl || '',
      clientUrl: g.clientUrl || '',
    },
  };
};

module.exports = { getGatewayConfig };
