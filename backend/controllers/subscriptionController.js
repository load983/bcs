// ================== controllers/subscriptionController.js ==================
// শিক্ষকের দিক: প্ল্যান দেখা, নিজের অবস্থা দেখা, ম্যানুয়াল পেমেন্ট জমা, অনলাইন (SSLCommerz) পেমেন্ট
const crypto = require('crypto');
const { getPaymentNumbers } = require('../utils/paymentNumbers');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { getTeacherStatus, activateSubscription } = require('../utils/subscription');
const { applyPromo, normalize } = require('../utils/promo');
const { getGatewayConfig } = require('../utils/gatewayConfig');
const { createSession, validateAndActivate, checkTransactionStatus, rupCreateSession, rupValidateAndActivate } = require('../utils/gatewayPay');
const mongoose = require('mongoose');
const SiteSettings = require('../models/SiteSettings');
const { buildReceipt, isReceiptEligible, receiptNumber } = require('../utils/receiptPdf');

// প্ল্যান + (ঐচ্ছিক) প্রোমো কোড থেকে চূড়ান্ত দাম ও সাবস্ক্রিপশনের অতিরিক্ত ফিল্ড বের করা
const priceWithPromo = async (plan, rawCode) => {
  if (!String(rawCode || '').trim()) return { amount: plan.price, extra: {} };
  const r = await applyPromo(rawCode, plan);
  if (r.error) return { error: r.error };
  return {
    amount: r.finalPrice,
    extra: { promoCode: r.promo.code, discountPercent: r.percent, originalAmount: r.originalPrice },
  };
};

// ১০০% ছাড়ে দাম ০ হলে পেমেন্ট ছাড়াই সাথে সাথে চালু
const createFreeSubscription = async (userId, plan, extra) => {
  const sub = await Subscription.create({
    teacher: userId,
    plan: plan._id,
    planName: plan.name,
    durationDays: plan.durationDays,
    examLimitType: plan.examLimitType,
    examLimit: plan.examLimit,
    amount: 0,
    method: 'manual',
    provider: 'promo',
    status: 'pending',
    ...extra,
  });
  return activateSubscription(sub);
};

// গেটওয়ের কনফিগ (Store ID/Password, Sandbox, URL) অ্যাডমিন প্যানেল থেকে আসে — utils/gatewayConfig.js

// ম্যানুয়াল পেমেন্টের নাম্বার: অ্যাডমিন প্যানেলের সেটিং (না থাকলে .env) — utils/paymentNumbers.js

// ১. প্ল্যান তালিকা + পেমেন্ট নির্দেশনা
exports.getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
    const cfg = await getGatewayConfig();
    res.json({ plans, paymentInfo: await getPaymentNumbers(), gatewayEnabled: cfg.live });
  } catch (err) {
    res.status(500).json({ message: 'প্ল্যান আনতে সমস্যা হয়েছে' });
  }
};

// ১ক. প্রোমো কোড যাচাই — কার্ডে কত ছাড় হবে দেখানোর জন্য
exports.validatePromo = async (req, res) => {
  try {
    const plan = await Plan.findOne({ _id: req.body.planId, isActive: true });
    if (!plan) return res.status(404).json({ message: 'প্ল্যান পাওয়া যায়নি' });
    const r = await applyPromo(req.body.code, plan);
    if (r.error) return res.status(400).json({ message: r.error });
    res.json({
      code: r.promo.code,
      discountPercent: r.percent,
      originalPrice: r.originalPrice,
      finalPrice: r.finalPrice,
    });
  } catch (err) {
    res.status(500).json({ message: 'প্রোমো কোড যাচাই করতে সমস্যা হয়েছে' });
  }
};

// ২. নিজের অবস্থা ও ইতিহাস
exports.getMySubscription = async (req, res) => {
  try {
    const [status, history] = await Promise.all([
      getTeacherStatus(req.user.id),
      Subscription.find({ teacher: req.user.id }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    // পেমেন্ট সফল হলেই রসিদ ডাউনলোডের বাটন দেখানোর জন্য
    const withReceipt = history.map((h) => ({ ...h, receiptAvailable: isReceiptEligible(h) }));
    res.json({ status, history: withReceipt });
  } catch (err) {
    res.status(500).json({ message: 'সাবস্ক্রিপশনের তথ্য আনতে সমস্যা হয়েছে' });
  }
};

// ৩. ম্যানুয়াল পেমেন্ট জমা (বিকাশ/নগদ/রকেটে Send Money করে TrxID দেওয়া) → অ্যাডমিন approve করবেন
exports.submitManualPayment = async (req, res) => {
  try {
    const { planId, provider, trxId, senderNumber, promoCode } = req.body;

    const plan = await Plan.findOne({ _id: planId, isActive: true });
    if (!plan) return res.status(404).json({ message: 'প্ল্যান পাওয়া যায়নি' });

    const priced = await priceWithPromo(plan, promoCode);
    if (priced.error) return res.status(400).json({ message: priced.error });

    // ১০০% ছাড় → পেমেন্ট লাগবে না, সাথে সাথে চালু
    if (priced.amount <= 0) {
      const sub = await createFreeSubscription(req.user.id, plan, priced.extra);
      return res.status(201).json({ message: 'প্রোমো কোড কাজ করেছে! সাবস্ক্রিপশন চালু হয়েছে।', subscription: sub, activated: true });
    }

    if (!['bkash', 'nagad', 'rocket'].includes(provider)) {
      return res.status(400).json({ message: 'পেমেন্ট মাধ্যম বেছে নাও' });
    }
    const cleanTrx = String(trxId || '').trim().toUpperCase();
    if (cleanTrx.length < 6) return res.status(400).json({ message: 'সঠিক ট্রানজেকশন আইডি (TrxID) দাও' });

    // একই TrxID দিয়ে দ্বিতীয়বার দাবি ঠেকানো
    const used = await Subscription.findOne({ trxId: cleanTrx, status: { $in: ['pending', 'active', 'suspended'] } });
    if (used) return res.status(400).json({ message: 'এই TrxID আগেই ব্যবহার বা জমা দেওয়া হয়েছে' });

    const sub = await Subscription.create({
      teacher: req.user.id,
      plan: plan._id,
      planName: plan.name,
      durationDays: plan.durationDays,
      examLimitType: plan.examLimitType,
      examLimit: plan.examLimit,
      amount: priced.amount,
      ...priced.extra,
      method: 'manual',
      provider,
      trxId: cleanTrx,
      senderNumber: String(senderNumber || '').trim(),
      status: 'pending',
    });
    res.status(201).json({ message: 'পেমেন্টের তথ্য জমা হয়েছে। অ্যাডমিন যাচাই করলে সাবস্ক্রিপশন চালু হবে।', subscription: sub });
  } catch (err) {
    res.status(500).json({ message: 'পেমেন্ট জমা দিতে সমস্যা হয়েছে' });
  }
};

// ৪. অনলাইন পেমেন্ট শুরু (SSLCommerz)
exports.initGatewayPayment = async (req, res) => {
  try {
    const cfg = await getGatewayConfig(req);
    if (!cfg.live) {
      return res.status(503).json({ message: 'অনলাইন পেমেন্ট এখনো চালু করা হয়নি, ম্যানুয়াল পেমেন্ট ব্যবহার করো' });
    }
    const plan = await Plan.findOne({ _id: req.body.planId, isActive: true });
    if (!plan) return res.status(404).json({ message: 'প্ল্যান পাওয়া যায়নি' });
    if (plan.price <= 0) return res.status(400).json({ message: 'এই প্ল্যানে অনলাইন পেমেন্ট প্রযোজ্য নয়' });

    const priced = await priceWithPromo(plan, req.body.promoCode);
    if (priced.error) return res.status(400).json({ message: priced.error });
    // ১০০% ছাড় → গেটওয়ে ছাড়াই চালু
    if (priced.amount <= 0) {
      await createFreeSubscription(req.user.id, plan, priced.extra);
      return res.json({ url: `${cfg.clientUrl}/teacher/subscribe?payment=success` });
    }

    const teacher = await User.findById(req.user.id).select('name email');
    const tranId = `SUB${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const isRup = cfg.active === 'rupantorpay';

    const sub = await Subscription.create({
      teacher: req.user.id,
      plan: plan._id,
      planName: plan.name,
      durationDays: plan.durationDays,
      examLimitType: plan.examLimitType,
      examLimit: plan.examLimit,
      amount: priced.amount,
      ...priced.extra,
      method: 'gateway',
      provider: isRup ? 'rupantorpay' : 'sslcommerz',
      tranId,
      status: 'pending',
    });

    if (isRup) {
      const r = await rupCreateSession(cfg, { tranId, amount: priced.amount, customer: teacher });
      if (!r.payment_url) {
        sub.status = 'failed';
        sub.note = String(r.message || 'gateway init failed').slice(0, 200);
        await sub.save();
        return res.status(502).json({ message: 'পেমেন্ট গেটওয়ে চালু করা যায়নি, একটু পরে চেষ্টা করো' });
      }
      return res.json({ url: r.payment_url });
    }

    const data = await createSession(cfg, { tranId, amount: priced.amount, productName: plan.name, customer: teacher });
    if (!data.GatewayPageURL) {
      sub.status = 'failed';
      sub.note = data.failedreason || 'gateway init failed';
      await sub.save();
      return res.status(502).json({ message: 'পেমেন্ট গেটওয়ে চালু করা যায়নি, একটু পরে চেষ্টা করো' });
    }
    res.json({ url: data.GatewayPageURL });
  } catch (err) {
    console.error('gateway init error:', err.message);
    res.status(500).json({ message: 'অনলাইন পেমেন্ট শুরু করতে সমস্যা হয়েছে' });
  }
};

const redirectToClient = async (res, result) => {
  const cfg = await getGatewayConfig();
  return res.redirect(303, `${cfg.clientUrl}/teacher/subscribe?payment=${result}`);
};

exports.gatewaySuccess = async (req, res) => {
  try {
    const ok = await validateAndActivate(req.body.tran_id, req.body.val_id);
    return redirectToClient(res, ok ? 'success' : 'failed');
  } catch (err) {
    console.error('gateway success error:', err.message);
    return redirectToClient(res, 'failed');
  }
};

exports.gatewayIpn = async (req, res) => {
  try {
    await validateAndActivate(req.body.tran_id, req.body.val_id);
  } catch (err) {
    console.error('gateway ipn error:', err.message);
  }
  res.sendStatus(200);
};

const markUnpaid = (status) => async (req, res) => {
  try {
    const tranId = req.body.tran_id;
    if (tranId) {
      const provider = await checkTransactionStatus(tranId);
      if (provider.status === 'paid' && provider.valId) {
        const activated = await validateAndActivate(tranId, provider.valId, { retry: true });
        return redirectToClient(res, activated ? 'success' : 'failed');
      }
      // Unknown/ambiguous provider responses are deliberately non-mutating.
      if (provider.status === 'unpaid') {
        await Subscription.updateOne({ tranId, status: 'pending' }, { $set: { status } });
      }
    }
  } catch (err) {
    /* keep the current state if validation is unavailable or errors */
  }
  return redirectToClient(res, status === 'cancelled' ? 'cancelled' : 'failed');
};
exports.gatewayFail = markUnpaid('failed');
exports.gatewayCancel = markUnpaid('cancelled');

// ---------- RupantorPay কলব্যাক ----------
// ব্রাউজার success/cancel URL-এ GET দিয়ে ফেরে (?ref=<আমাদের tranId>&transactionId=...), আর সার্ভার webhook-এ POST পাঠায়।
// কোনোটার কথাই বিশ্বাস করা হয় না — প্রতিবার verify API দিয়ে যাচাই হয়।
const cleanRef = (v) => String(v || '').trim().slice(0, 80);
const pickTxn = (req) => {
  const src = { ...(req.query || {}), ...(req.body || {}) };
  return String(src.transactionId || src.transaction_id || src.invoice_id || '').trim();
};

exports.rupSuccess = async (req, res) => {
  try {
    const r = await rupValidateAndActivate(cleanRef(req.query.ref), pickTxn(req));
    return redirectToClient(res, r === 'paid' ? 'success' : r === 'pending' ? 'pending' : 'failed');
  } catch (err) {
    console.error('rupantorpay success error:', err.message);
    return redirectToClient(res, 'failed');
  }
};

exports.rupCancel = async (req, res) => {
  try {
    const ref = cleanRef(req.query.ref);
    if (ref) await Subscription.updateOne({ tranId: ref, provider: 'rupantorpay', status: 'pending', gatewayValId: { $in: [null, ''] } }, { status: 'cancelled' });
  } catch (err) { /* ignore */ }
  return redirectToClient(res, 'cancelled');
};

exports.rupWebhook = async (req, res) => {
  try {
    await rupValidateAndActivate(cleanRef(req.query.ref), pickTxn(req));
  } catch (err) {
    console.error('rupantorpay webhook error:', err.message);
  }
  res.sendStatus(200);
};

// ৫. রসিদ/ইনভয়েস PDF — শুধু নিজের সফল পেমেন্টের (active/suspended; ট্রায়াল ও অ্যাডমিনের দেওয়া সাবস্ক্রিপশনে নেই)
exports.downloadReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ message: 'রসিদ পাওয়া যায়নি' });
    const sub = await Subscription.findOne({ _id: id, teacher: req.user.id });
    if (!sub) return res.status(404).json({ message: 'রসিদ পাওয়া যায়নি' });
    if (!isReceiptEligible(sub)) {
      return res.status(400).json({ message: 'এই পেমেন্টের রসিদ নেই — রসিদ শুধু সফল পেমেন্টের জন্য পাওয়া যায়' });
    }
    const teacher = await User.findById(req.user.id).select('name email').lean();

    // সাইটের লোগো থাকলে (PNG/JPEG হলে) রসিদে বসবে; অন্য ফরম্যাট বা সমস্যা হলে লোগো ছাড়াই
    let logo = null;
    try {
      const site = await SiteSettings.findOne({ key: 'main' }).select('+logo.data logo.contentType').lean();
      if (site?.logo?.data && /^image\/(png|jpeg)$/.test(site.logo.contentType || '')) {
        logo = Buffer.isBuffer(site.logo.data) ? site.logo.data : Buffer.from(site.logo.data.buffer || site.logo.data);
      }
    } catch (e) { /* লোগো ছাড়াই চলবে */ }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${receiptNumber(sub)}.pdf`);
    res.setHeader('Cache-Control', 'private, no-store');
    buildReceipt(res, { sub, teacher, logo });
  } catch (err) {
    console.error('receipt error:', err.message);
    if (!res.headersSent) res.status(500).json({ message: 'রসিদ তৈরি করতে সমস্যা হয়েছে' });
    else res.end();
  }
};
