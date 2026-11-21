// ================== utils/subscription.js ==================
// সাবস্ক্রিপশনের সব লজিক এক জায়গায়: স্ট্যাটাস হিসাব, চালু করা, ইত্যাদি
const Subscription = require('../models/Subscription');
const SiteSettings = require('../models/SiteSettings');
const { buildReceiptBuffer, isReceiptEligible, receiptNumber } = require('./receiptPdf');

const DAY = 24 * 60 * 60 * 1000;

// এই মুহূর্তে চালু (active + মেয়াদের ভেতরে) সাবস্ক্রিপশনের শিক্ষক-আইডির তালিকা (স্টুডেন্ট পাশের ফিল্টারের জন্য)
const getActiveTeacherIds = async () => {
  const now = new Date();
  return Subscription.distinct('teacher', {
    status: 'active',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  });
};

// শিক্ষকের বর্তমান অবস্থা:
// state = active | suspended | expired | none
const getTeacherStatus = async (teacherId) => {
  const now = new Date();

  const current = await Subscription.findOne({
    teacher: teacherId,
    status: 'active',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  }).sort({ expiresAt: -1 });

  if (current) {
    // পরপর কেনা (queue করা) সাবস্ক্রিপশন থাকলে সবচেয়ে শেষের মেয়াদটাই আসল মেয়াদ
    const last = await Subscription.findOne({ teacher: teacherId, status: 'active' }).sort({ expiresAt: -1 });
    const expiresAt = last.expiresAt;
    return {
      isActive: true,
      state: 'active',
      planName: current.planName,
      expiresAt,
      daysLeft: Math.max(0, Math.ceil((expiresAt - now) / DAY)),
      // Unlimit হলে examLimitType='unlimited' থাকে — তখন আগের মতোই কোনো এক্সাম-সীমা প্রযোজ্য হয় না
      examLimitType: current.examLimitType || 'unlimited',
      examLimit: current.examLimit || 0,
      // ফ্রি ট্রায়াল হলে কোন ফিচার চালু আছে (পেইড হলে featureLimited=false → সব চালু)
      isTrial: !!current.isTrial,
      featureLimited: !!current.featureLimited,
      features: current.featureLimited ? current.features || [] : [],
      catalogVersion: current.catalogVersion,
    };
  }

  const suspended = await Subscription.findOne({ teacher: teacherId, status: 'suspended' }).sort({ suspendedAt: -1 });
  if (suspended) {
    return { isActive: false, state: 'suspended', planName: suspended.planName, expiresAt: suspended.expiresAt, daysLeft: 0 };
  }

  const lastEver = await Subscription.findOne({ teacher: teacherId, status: 'active' }).sort({ expiresAt: -1 });
  if (lastEver) {
    return { isActive: false, state: 'expired', planName: lastEver.planName, expiresAt: lastEver.expiresAt, daysLeft: 0 };
  }

  return { isActive: false, state: 'none', planName: null, expiresAt: null, daysLeft: 0 };
};

// পেমেন্ট যাচাই হলে বা অ্যাডমিন দিলে সাবস্ক্রিপশন চালু করা।
// আগের মেয়াদ বাকি থাকলে নতুনটা তার শেষ থেকে শুরু হয় (দিন নষ্ট হয় না)।
// status বদলানোই activation-এর একমাত্র claim: একই pending/failed/cancelled
// রেকর্ডের দ্বিতীয় caller কখনো side effect (notice/receipt) চালাতে পারবে না।
const activateSubscription = async (sub, { reviewedBy } = {}) => {
  const claimable = ['pending', 'failed', 'cancelled'];
  if (!sub || !claimable.includes(sub.status)) return null;

  const now = new Date();
  const last = await Subscription.findOne({
    teacher: sub.teacher,
    status: 'active',
    expiresAt: { $gt: now },
    _id: { $ne: sub._id },
    // Full activations cancel an active trial below, so do not queue the
    // paid/granted plan behind the very trial that is about to be cancelled.
    ...(sub.isTrial ? {} : { isTrial: { $ne: true } }),
  }).sort({ expiresAt: -1 });
  const startsAt = last ? last.expiresAt : now;
  const expiresAt = new Date(startsAt.getTime() + sub.durationDays * DAY);
  const set = { status: 'active', startsAt, expiresAt };
  if (sub.gatewayValId) set.gatewayValId = sub.gatewayValId;
  if (sub.trxId) set.trxId = sub.trxId;
  if (reviewedBy) {
    set.reviewedBy = reviewedBy;
    set.reviewedAt = now;
  }

  // Atomic compare-and-set claim. A concurrent admin approval/IPN gets null.
  const claimed = await Subscription.findOneAndUpdate(
    { _id: sub._id, status: { $in: claimable } },
    { $set: set },
    { new: true }
  );
  if (!claimed) return null;

  // Claim must happen before this activation side effect.
  if (!claimed.isTrial) {
    await Subscription.updateMany(
      { teacher: claimed.teacher, isTrial: true, status: 'active', _id: { $ne: claimed._id } },
      { status: 'cancelled', note: 'পূর্ণ প্ল্যান চালু হওয়ায় ফ্রি ট্রায়াল শেষ হয়েছে' }
    );
  }

  // Paid activations get the payment notice and invoice. Grants/promotions do not.
  try {
    const User = require('../models/User'); const messaging = require('./messaging');
    const user = await User.findById(claimed.teacher).select('name email phone').lean();
    if (user) {
      const amount = Number(claimed.amount || 0);
      const paid = amount > 0;
      let attachments = [];
      if (paid && user.email && isReceiptEligible(claimed)) {
        try {
          let logo = null;
          const site = await SiteSettings.findOne({ key: 'main' }).select('+logo.data logo.contentType').lean();
          if (site?.logo?.data && /^image\/(png|jpeg)$/.test(site.logo.contentType || '')) logo = Buffer.isBuffer(site.logo.data) ? site.logo.data : Buffer.from(site.logo.data.buffer || site.logo.data);
          const pdf = await buildReceiptBuffer({ sub: claimed, teacher: user, logo });
          attachments = [{ filename: `${receiptNumber(claimed)}.pdf`, content: pdf, contentType: 'application/pdf' }];
        } catch (e) { console.error('invoice PDF generation failed:', e.message); }
      }
      const subject = claimed.method === 'admin'
        ? 'Subscription granted / সাবস্ক্রিপশন প্রদান'
        : paid ? 'Payment successful / পেমেন্ট সফল' : 'Subscription activated / সাবস্ক্রিপশন চালু হয়েছে';
      const paymentText = paid ? ` Payment: ${amount}.${attachments.length ? ' Your PDF invoice is attached.' : ''}` : '';
      messaging.notifyUser(user, subject, `Hello ${user.name || ''}, your ${claimed.planName || 'subscription'} is active until ${new Date(claimed.expiresAt).toLocaleDateString('en-GB')}.${paymentText}`, attachments).catch(e => console.error('subscription notification error:', e.message));
    }
  } catch (e) { console.error('subscription notification error:', e.message); }
  return claimed;
};

// টিচার এখন পর্যন্ত কতগুলো পরীক্ষা তৈরি করেছে vs তার প্ল্যানের সীমা কত (Unlimit হলে limit=null)
const getExamUsage = async (teacherId, status) => {
  const Exam = require('../models/Exam'); // চক্রাকার require এড়াতে এখানে লোড করা হলো
  const used = await Exam.countDocuments({ teacher: teacherId, pending: { $ne: true } });
  const unlimited = !status?.isActive || status.examLimitType !== 'limited';
  return { used, limit: unlimited ? null : status.examLimit, unlimited };
};

module.exports = { DAY, getActiveTeacherIds, getTeacherStatus, activateSubscription, getExamUsage };
