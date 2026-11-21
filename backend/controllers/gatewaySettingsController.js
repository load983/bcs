// ================== controllers/gatewaySettingsController.js ==================
// অ্যাডমিন প্যানেল: অটো পেমেন্ট গেটওয়ে (SSLCommerz) — চালু/বন্ধ, Store ID/Password, Sandbox/Live, URL, টেস্ট, পুনরায় যাচাই
const crypto = require('crypto');
const Subscription = require('../models/Subscription');
const { getSettings } = require('../utils/siteSettings');
const { encrypt, cleanBaseUrl } = require('../utils/aiConfig');
const { getGatewayConfig } = require('../utils/gatewayConfig');
const { createSession, validateAndActivate, findPaidValId, rupVerify, rupValidateAndActivate } = require('../utils/gatewayPay');

const view = (c) => {
  const base = `${c.serverUrl}/api/subscription/gateway`;
  const rbase = `${base}/rupantorpay`;
  return {
    enabled: c.enabled,
    active: c.active,
    configured: c.configured,
    live: c.live,
    source: c.source, // admin | env | none
    sandbox: c.sandbox,
    sandboxSaved: c.saved.sandbox, // null = .env অনুযায়ী
    storeId: c.storeId,
    storeIdSaved: c.saved.storeId,
    hasPassword: c.configured,
    passwordHint: c.passwordHint,
    serverUrl: c.serverUrl,
    serverUrlSaved: c.saved.serverUrl,
    clientUrl: c.clientUrl,
    clientUrlSaved: c.saved.clientUrl,
    callbacks: { success: `${base}/success`, fail: `${base}/fail`, cancel: `${base}/cancel`, ipn: `${base}/ipn` },
    rupantorpay: {
      configured: c.rupantorpay.configured,
      source: c.rupantorpay.source,
      hint: c.rupantorpay.hint,
      domain: c.rupantorpay.domain,
      domainSaved: c.rupantorpay.domainSaved,
      callbacks: { success: `${rbase}/success`, cancel: `${rbase}/cancel`, webhook: `${rbase}/webhook` },
    },
  };
};

exports.getGatewaySettings = async (req, res) => {
  try {
    res.json(view(await getGatewayConfig(req)));
  } catch (err) {
    res.status(500).json({ message: 'গেটওয়ে সেটিং লোড করা যায়নি' });
  }
};

exports.saveGatewaySettings = async (req, res) => {
  try {
    const b = req.body || {};
    const s = await getSettings();

    if (b.enabled !== undefined) s.set('gateway.enabled', !!b.enabled);
    if (b.active !== undefined) {
      if (!['sslcommerz', 'rupantorpay'].includes(b.active)) return res.status(400).json({ message: 'গেটওয়ে বাছাই সঠিক নয়' });
      s.set('gateway.active', b.active);
    }
    const rupKey = String(b.rupantorpayKey || '').trim();
    if (rupKey) {
      if (!/^[A-Za-z0-9._-]{16,300}$/.test(rupKey)) return res.status(400).json({ message: 'RupantorPay API key সঠিক নয় — Brands পেজ থেকে পুরো key টি স্পেস ছাড়া দিন' });
      s.set('gateway.rupantorpayKeyEnc', encrypt(rupKey));
      s.set('gateway.rupantorpayHint', rupKey.slice(-4));
    }
    if (b.rupantorpayDomain !== undefined) {
      const d = String(b.rupantorpayDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (d && !/^[a-z0-9.-]{3,200}(:\d{1,5})?$/.test(d)) return res.status(400).json({ message: 'ডোমেইন সঠিক নয় — যেমন: yoursite.com' });
      s.set('gateway.rupantorpayDomain', d);
    }
    if (b.sandbox !== undefined) s.set('gateway.sandbox', b.sandbox === null || b.sandbox === 'env' ? null : !!b.sandbox);

    if (b.storeId !== undefined) {
      const id = String(b.storeId || '').trim();
      if (id && !/^[A-Za-z0-9._@-]{3,100}$/.test(id)) return res.status(400).json({ message: 'Store ID সঠিক নয় — স্পেস ছাড়া শুধু অক্ষর/অঙ্ক দিন' });
      s.set('gateway.storeId', id);
    }
    const pass = String(b.storePassword || '').trim();
    if (pass) {
      if (!/^[\x21-\x7E]{4,200}$/.test(pass)) return res.status(400).json({ message: 'Store Password সঠিক নয় — স্পেস ছাড়া শুধু key টি দিন' });
      s.set('gateway.storePasswordEnc', encrypt(pass));
      s.set('gateway.passwordHint', pass.slice(-4));
    }
    if (b.clearCredentials === 'rupantorpay') {
      s.set('gateway.rupantorpayKeyEnc', '');
      s.set('gateway.rupantorpayHint', '');
    } else if (b.clearCredentials) {
      s.set('gateway.storeId', '');
      s.set('gateway.storePasswordEnc', '');
      s.set('gateway.passwordHint', '');
    }
    for (const k of ['serverUrl', 'clientUrl']) {
      if (b[k] === undefined) continue;
      const raw = String(b[k] || '').trim();
      if (raw && !cleanBaseUrl(raw)) return res.status(400).json({ message: 'URL সঠিক নয় — https:// দিয়ে শুরু করে পুরো ঠিকানা দিন (শেষে / ছাড়া)' });
      s.set(`gateway.${k}`, raw ? cleanBaseUrl(raw) : '');
    }
    await s.save();
    res.json({ message: 'গেটওয়ে সেটিং সেভ হয়েছে', ...view(await getGatewayConfig(req)) });
  } catch (err) {
    console.error('gateway save error:', err.message);
    res.status(500).json({ message: 'সেভ করা যায়নি' });
  }
};

// কানেকশন টেস্ট: গেটওয়েতে একটা ১০ টাকার টেস্ট সেশন খোলা হয় (কোনো টাকা কাটে না, কোনো সাবস্ক্রিপশন তৈরি হয় না)
exports.testGateway = async (req, res) => {
  try {
    const cfg = await getGatewayConfig(req);

    if (cfg.active === 'rupantorpay') {
      if (!cfg.rupantorpay.configured) return res.status(400).json({ message: 'আগে RupantorPay API key সেভ করুন' });
      // কোনো পেমেন্ট না খুলে শুধু key ঠিক কিনা দেখা: একটা অচেনা আইডি যাচাই করতে পাঠাই — key ভুল হলে গেটওয়ে আলাদা ধরনের উত্তর দেয়
      const r = await rupVerify(cfg, `TEST${Date.now()}`);
      const msg = String(r.message || '').toLowerCase();
      if (/api.?key|unauthor|invalid.*key|domain|client/.test(msg)) {
        return res.status(400).json({ ok: false, message: `❌ ${r.message || 'API key / ডোমেইন গ্রহণ করেনি'} (X-CLIENT: ${cfg.rupantorpay.domain})` });
      }
      return res.json({ ok: true, message: `✅ গেটওয়ে পৌঁছানো গেছে — key গ্রহণ করেছে (ডোমেইন: ${cfg.rupantorpay.domain}). আসল পরীক্ষা: ছোট অংকের একটা প্ল্যান কিনে দেখুন।` });
    }

    if (!cfg.configured) return res.status(400).json({ message: 'আগে Store ID ও Store Password সেভ করুন' });
    const data = await createSession(cfg, {
      tranId: `TEST${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      amount: 10,
      productName: 'Connection test',
    });
    const mode = cfg.sandbox ? 'Sandbox' : 'Live';
    if (data.GatewayPageURL) return res.json({ ok: true, message: `✅ কানেকশন ঠিক আছে (${mode})` });
    res.status(400).json({ ok: false, message: `❌ ${data.failedreason || 'গেটওয়ে key গ্রহণ করেনি'} (${mode})` });
  } catch (err) {
    res.status(502).json({ ok: false, message: 'গেটওয়ের সাথে যোগাযোগ করা যায়নি — ইন্টারনেট/সার্ভার ঠিক আছে কিনা দেখুন' });
  }
};

// টাকা কেটেছে কিন্তু কলব্যাক/IPN আসেনি — গেটওয়েকে জিজ্ঞেস করে পেমেন্ট সত্যিই হয়ে থাকলে সাবস্ক্রিপশন চালু
exports.reverifyPayment = async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub || sub.method !== 'gateway' || !sub.tranId) return res.status(404).json({ message: 'অনলাইন পেমেন্ট পাওয়া যায়নি' });
    if (sub.status === 'active') return res.status(400).json({ message: 'এটি আগেই চালু হয়ে আছে' });
    if (!['pending', 'failed', 'cancelled'].includes(sub.status)) return res.status(400).json({ message: 'এই অবস্থায় পুনরায় যাচাই করা যায় না' });

    if (sub.provider === 'rupantorpay') {
      // RupantorPay-এর transaction_id আমাদের কাছে না থাকলে (ব্রাউজার ফেরেনি) অ্যাডমিন তাদের ড্যাশবোর্ড থেকে এনে দেবেন
      const txn = String(req.body?.transactionId || sub.gatewayValId || '').trim();
      if (!txn) return res.status(400).json({ message: 'RupantorPay-এর Transaction ID দিন (তাদের ড্যাশবোর্ডে পেমেন্টের পাশে থাকে)', needTransactionId: true });
      const r = await rupValidateAndActivate(sub.tranId, txn, { retry: true });
      if (r === 'paid') return res.json({ message: 'পেমেন্ট সফল পাওয়া গেছে — সাবস্ক্রিপশন চালু হয়েছে' });
      if (r === 'pending') return res.status(400).json({ message: 'গেটওয়ে বলছে পেমেন্ট এখনো নিশ্চিত হয়নি (Pending) — একটু পরে আবার দেখুন' });
      return res.status(400).json({ message: 'যাচাই মেলেনি — আইডি, পরিমাণ বা পেমেন্ট সফল হয়েছে কিনা দেখুন' });
    }

    const valId = await findPaidValId(sub.tranId);
    if (!valId) return res.status(400).json({ message: 'গেটওয়ে বলছে এই পেমেন্ট সফল হয়নি — টাকা কাটেনি' });
    const ok = await validateAndActivate(sub.tranId, valId, { retry: true });
    if (!ok) return res.status(400).json({ message: 'যাচাই মেলেনি (পরিমাণ বা আইডি আলাদা) — গেটওয়ের ড্যাশবোর্ডে দেখুন' });
    res.json({ message: 'পেমেন্ট সফল পাওয়া গেছে — সাবস্ক্রিপশন চালু হয়েছে' });
  } catch (err) {
    console.error('reverify error:', err.message);
    res.status(500).json({ message: 'যাচাই করতে সমস্যা হয়েছে' });
  }
};
