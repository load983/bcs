// ================== utils/expiryReminders.js ==================
// সাবস্ক্রিপশনের মেয়াদ শেষের রিমাইন্ডার: ৭ / ৩ / ১ দিন আগে শিক্ষককে 🔔 নোটিফিকেশন + ডিভাইস পুশ।
//
// কীভাবে কাজ করে:
//  • প্রতি ঘণ্টায় (ও সার্ভার চালুর ৩০ সেকেন্ড পরে) চলে। শিক্ষকের "আসল মেয়াদ" = তার সবচেয়ে শেষের active সাবস্ক্রিপশনের expiresAt
//    (পরপর কেনা থাকলে শেষেরটা) — তাই পরের প্ল্যান কেনা থাকলে ভুল রিমাইন্ডার যায় না।
//  • ধাপ: মেয়াদ শেষ হতে ≤১ দিন → "১", ≤৩ দিন → "৩", ≤৭ দিন → "৭"। শুধু বর্তমান ধাপটাই যায় (সার্ভার বন্ধ ছিল বলে একসাথে তিনটা নয়)।
//  • প্ল্যানের মোট মেয়াদ যে ধাপের সমান বা ছোট, সেই ধাপ বাদ (৭ দিনের প্ল্যান কিনেই "৭ দিন বাকি" শুনবে না)।
//  • ডিভাইস পুশ শুধু ঢাকার সময় সকাল ৮টা–রাত ৯টার মধ্যে যায় (মাঝরাতে পুশ গেলে শিক্ষক নোটিফিকেশনই বন্ধ করে দেয়)।
//    🔔 বেলে নোটিফিকেশন সঙ্গে সঙ্গেই তৈরি হয়।
//  • বন্ধ রাখতে .env-এ: EXPIRY_REMINDERS=off     ব্যবধান বদলাতে: EXPIRY_REMINDER_INTERVAL_MIN=60
const Subscription = require('../models/Subscription');
const TeacherNotification = require('../models/TeacherNotification');
const { DAY, getTeacherStatus } = require('./subscription');
const push = require('./push');

const STAGES = [1, 3, 7];
const PUSH_FROM_HOUR = 8; // ঢাকার সময় (UTC+6)
const PUSH_TO_HOUR = 21;

// বাকি দিন → কোন ধাপ (১/৩/৭), না হলে null
const stageFor = (expiresAt, now = new Date()) => {
  const left = expiresAt.getTime() - now.getTime();
  if (left <= 0) return null;
  const daysLeft = Math.ceil(left / DAY);
  return STAGES.find((s) => daysLeft <= s) || null;
};

const dhakaHour = (now = new Date()) => (now.getUTCHours() + 6) % 24;
const inPushWindow = (now = new Date()) => {
  const h = dhakaHour(now);
  return h >= PUSH_FROM_HOUR && h < PUSH_TO_HOUR;
};

const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return new Date(d).toISOString().slice(0, 10);
  }
};

const pushPayload = (n) => {
  const within = n.daysBefore === 1 ? 'আগামী ২৪ ঘণ্টার মধ্যে' : `আর ${n.daysBefore} দিনের মধ্যে`;
  const date = fmtDate(n.expiresAt);
  return n.isTrial
    ? {
        title: `⏰ ফ্রি ট্রায়াল ${within} শেষ হবে`,
        body: `ট্রায়াল শেষ: ${date}। প্ল্যান না নিলে তোমার ছাত্ররা পরীক্ষা দিতে পারবে না।`,
        url: '/teacher/subscribe',
        tag: `expiry-${n.daysBefore}`,
      }
    : {
        title: `⏰ সাবস্ক্রিপশনের মেয়াদ ${within} শেষ হবে`,
        body: `মেয়াদ শেষ: ${date}। রিনিউ না করলে তোমার ছাত্ররা পরীক্ষা দিতে পারবে না।`,
        url: '/teacher/subscribe',
        tag: `expiry-${n.daysBefore}`,
      };
};

// ধাপ ১: যাদের মেয়াদ ৭ দিনের মধ্যে শেষ হচ্ছে তাদের নোটিফিকেশন তৈরি (ডুপ্লিকেট হবে না)
const createDueNotifications = async (now = new Date()) => {
  const rows = await Subscription.aggregate([
    { $match: { status: 'active', expiresAt: { $gt: now } } },
    { $sort: { expiresAt: -1 } },
    {
      $group: {
        _id: '$teacher',
        expiresAt: { $first: '$expiresAt' },
        startsAt: { $first: '$startsAt' },
        planName: { $first: '$planName' },
        isTrial: { $first: '$isTrial' },
        durationDays: { $first: '$durationDays' },
      },
    },
    { $match: { expiresAt: { $lte: new Date(now.getTime() + 7 * DAY) } } },
  ]);

  let created = 0;
  for (const r of rows) {
    const stage = stageFor(r.expiresAt, now);
    if (!stage) continue;
    // এখনকার (শুরু হয়ে যাওয়া) প্ল্যানের মোট মেয়াদ এই ধাপের সমান/ছোট হলে বাদ
    if (r.startsAt && r.startsAt <= now && stage >= (r.durationDays || 0)) continue;
    try {
      await TeacherNotification.create({
        teacher: r._id,
        kind: 'expiry',
        daysBefore: stage,
        expiresAt: r.expiresAt,
        planName: r.planName || '',
        isTrial: !!r.isTrial,
        dedupeKey: `expiry:${r.expiresAt.getTime()}:${stage}`,
      });
      created += 1;
      try { const User = require('../models/User'); const messaging = require('./messaging'); const user = await User.findById(r._id).select('name email phone').lean(); if (user) { const text = `সাবস্ক্রিপশনের মেয়াদ ${stage} দিনের মধ্যে শেষ হবে (${fmtDate(r.expiresAt)}). অনুগ্রহ করে সময়মতো নবায়ন করুন।`; await messaging.notifyUser(user, 'Subscription expiry reminder / মেয়াদ শেষের রিমাইন্ডার', text); } } catch (e) { console.error('expiry message error:', e.message); }
    } catch (e) {
      if (e && e.code === 11000) continue; // আগেই গেছে
      console.error('expiry reminder create failed:', e.message);
    }
  }
  return created;
};

// ধাপ ২: পুশ বাকি থাকা নোটিফিকেশনগুলো ডিভাইসে পাঠানো (শুধু অনুমোদিত সময়ে)
const flushPushes = async (now = new Date()) => {
  if (!inPushWindow(now)) return 0;
  const pending = await TeacherNotification.find({
    kind: 'expiry',
    pushedAt: null,
    createdAt: { $gt: new Date(now.getTime() - 36 * 60 * 60 * 1000) },
  })
    .limit(500)
    .lean();

  let sent = 0;
  for (const n of pending) {
    // দাবি করে নাও — একাধিক সার্ভারে একই পুশ দু'বার যাবে না
    const claimed = await TeacherNotification.findOneAndUpdate({ _id: n._id, pushedAt: null }, { pushedAt: new Date() });
    if (!claimed) continue;
    if (n.readAt || !push.enabled) continue; // বেলে ইতিমধ্যে দেখে ফেলেছে / পুশ সার্ভারে বন্ধ

    // অপেক্ষার মধ্যে রিনিউ করে ফেললে আর পুশ নয়
    const st = await getTeacherStatus(n.teacher).catch(() => null);
    if (st && st.isActive && st.expiresAt && new Date(st.expiresAt) > new Date(n.expiresAt)) continue;

    const r = await push.sendToUsers([n.teacher], pushPayload(n));
    sent += r.sent || 0;
  }
  return sent;
};

const sendExpiredMessages = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - 2 * DAY);
  const rows = await Subscription.aggregate([
    { $match: { status: 'active' } }, { $sort: { expiresAt: -1, _id: -1 } },
    { $group: { _id: '$teacher', subId: { $first: '$_id' }, expiresAt: { $first: '$expiresAt' }, planName: { $first: '$planName' }, expirationMessageSentAt: { $first: '$expirationMessageSentAt' } } },
    { $match: { expirationMessageSentAt: null, expiresAt: { $gt: cutoff, $lte: now } } },
    { $sort: { expiresAt: 1, _id: 1 } }, { $limit: 500 },
  ]);
  let sent = 0;
  for (const row of rows) {
    const claim = await Subscription.findOneAndUpdate({ _id: row.subId, expirationMessageSentAt: null }, { $set: { expirationMessageSentAt: now } });
    if (!claim) continue;
    try {
      const User = require('../models/User'); const messaging = require('./messaging');
      const user = await User.findById(row._id).select('name email phone').lean();
      if (user) {
        const result = await messaging.notifyUser(user, 'Subscription expired / সাবস্ক্রিপশনের মেয়াদ শেষ', `আপনার ${row.planName || 'সাবস্ক্রিপশন'}-এর মেয়াদ শেষ হয়েছে। আবার চালু করতে renew করুন।`);
        if (result.email || result.sms) sent += 1;
        else await Subscription.updateOne({ _id: row.subId, expirationMessageSentAt: now }, { $unset: { expirationMessageSentAt: 1 } });
      }
    } catch (e) { console.error('expired message error:', e.message); }
  }
  return sent;
};
const runExpiryReminders = async (now = new Date()) => {
  const expiredMessages = await sendExpiredMessages(now);
  const created = await createDueNotifications(now);
  const pushed = await flushPushes(now);
  if (created || pushed || expiredMessages) console.log(`⏰ মেয়াদ রিমাইন্ডার: নতুন ${created}টি, পুশ ${pushed}টি, expiry message ${expiredMessages}টি`);
  return { created, pushed, expiredMessages };
};

const startExpiryReminderJob = () => {
  if (String(process.env.EXPIRY_REMINDERS || '').toLowerCase() === 'off') {
    console.log('⏰ মেয়াদ রিমাইন্ডার বন্ধ (EXPIRY_REMINDERS=off)');
    return;
  }
  const mins = Math.max(5, Number(process.env.EXPIRY_REMINDER_INTERVAL_MIN) || 60);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runExpiryReminders();
    } catch (e) {
      console.error('expiry reminder job failed:', e.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 30 * 1000);
  const loop = setInterval(tick, mins * 60 * 1000);
  if (first.unref) first.unref();
  if (loop.unref) loop.unref();
  console.log(`⏰ মেয়াদ রিমাইন্ডার চালু (প্রতি ${mins} মিনিটে)`);
};

module.exports = { startExpiryReminderJob, runExpiryReminders, stageFor, inPushWindow, sendExpiredMessages };
