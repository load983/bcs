// ================== utils/revenue.js ==================
// আয়ের হিসাবের একটাই নিয়ম — অ্যাডমিন ওভারভিউ ও আয়ের ড্যাশবোর্ড দুই জায়গাতেই এটা ব্যবহার হয়, তাই সংখ্যা সবসময় মেলে।
//
// "আয়" গণনা হয় শুধু সেই সাবস্ক্রিপশন, যার জন্য সত্যিই টাকা এসেছে:
//   • অ্যাডমিনের নিজে দেওয়া (method: admin), ফ্রি ট্রায়াল ও ১০০% প্রোমো (amount: 0) বাদ
//   • চালু হয়েছিল (startsAt আছে) — অর্থাৎ ম্যানুয়াল approve বা গেটওয়ে যাচাই হয়েছে
//   • এখন active/suspended, অথবা পরে অ্যাডমিন বাতিল (cancelled) করলেও টাকা তো এসেছিল, তাই ধরা হয়
//   • গেটওয়ে পেজে ইউজার বাতিল করলে (pending → cancelled, startsAt নেই) আয়ে ধরা হয় না
// পেমেন্টের তারিখ: ম্যানুয়ালে approve-এর তারিখ (reviewedAt), গেটওয়েতে অর্ডারের তারিখ (createdAt)।
// মাস ধরা হয় ঢাকার সময় (UTC+6) অনুযায়ী।
const Subscription = require('../models/Subscription');

const TZ = 'Asia/Dhaka';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

const paidMatch = {
  method: { $ne: 'admin' },
  isTrial: { $ne: true },
  amount: { $gt: 0 },
  startsAt: { $exists: true, $ne: null },
  status: { $in: ['active', 'suspended', 'cancelled'] },
};
const payDateExpr = { $ifNull: ['$reviewedAt', '$createdAt'] };

// ঢাকার হিসাবে "এই মাস" থেকে n মাস আগের মাসের শুরু (UTC Date) ও 'YYYY-MM' তালিকা
function monthWindow(months) {
  const dhakaNow = new Date(Date.now() + DHAKA_OFFSET_MS);
  const y = dhakaNow.getUTCFullYear();
  const m = dhakaNow.getUTCMonth();
  const keys = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const start = new Date(Date.UTC(y, m - (months - 1), 1) - DHAKA_OFFSET_MS);
  return { keys, start, thisKey: keys[keys.length - 1], lastKey: keys[keys.length - 2] };
}

async function getRevenueReport(rawMonths) {
  const months = [6, 12, 24].includes(Number(rawMonths)) ? Number(rawMonths) : 12;
  const { keys, start, thisKey, lastKey } = monthWindow(months);
  const inRange = { $match: { payDate: { $gte: start } } };

  const [r] = await Subscription.aggregate([
    { $match: paidMatch },
    { $addFields: { payDate: payDateExpr } },
    {
      $facet: {
        all: [{ $group: { _id: null, revenue: { $sum: '$amount' }, orders: { $sum: 1 } } }],
        monthly: [
          inRange,
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$payDate', timezone: TZ } },
              revenue: { $sum: '$amount' },
              orders: { $sum: 1 },
            },
          },
        ],
        byPlan: [
          inRange,
          { $group: { _id: '$planName', revenue: { $sum: '$amount' }, orders: { $sum: 1 } } },
          { $sort: { orders: -1, revenue: -1 } },
        ],
        byProvider: [
          inRange,
          { $group: { _id: '$provider', revenue: { $sum: '$amount' }, orders: { $sum: 1 } } },
          { $sort: { revenue: -1 } },
        ],
      },
    },
  ]);

  const byKey = new Map((r.monthly || []).map((x) => [x._id, x]));
  const monthly = keys.map((k) => ({ month: k, revenue: byKey.get(k)?.revenue || 0, orders: byKey.get(k)?.orders || 0 }));

  const rangeRevenue = monthly.reduce((s, x) => s + x.revenue, 0);
  const rangeOrders = monthly.reduce((s, x) => s + x.orders, 0);
  const thisMonth = byKey.get(thisKey)?.revenue || 0;
  const lastMonth = lastKey ? byKey.get(lastKey)?.revenue || 0 : 0;

  return {
    months,
    summary: {
      totalRevenue: r.all[0]?.revenue || 0,
      totalOrders: r.all[0]?.orders || 0,
      thisMonth,
      lastMonth,
      // গত মাসে আয় ০ হলে শতাংশ হিসাব করা যায় না → null
      growthPercent: lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10 : null,
      rangeRevenue,
      rangeOrders,
      avgOrder: rangeOrders ? Math.round(rangeRevenue / rangeOrders) : 0,
    },
    monthly,
    byPlan: (r.byPlan || []).map((x) => ({ name: x._id || '-', orders: x.orders, revenue: x.revenue })),
    byProvider: (r.byProvider || []).map((x) => ({ provider: x._id || 'unknown', orders: x.orders, revenue: x.revenue })),
  };
}

// ঢাকার হিসাবে চলতি মাসের শুরু (সার্ভার যে টাইমজোনেই চলুক)
const dhakaMonthStart = () => monthWindow(1).start;

module.exports = { paidMatch, payDateExpr, getRevenueReport, dhakaMonthStart };
