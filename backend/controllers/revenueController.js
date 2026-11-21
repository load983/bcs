// ================== controllers/revenueController.js ==================
// অ্যাডমিন > আয়ের ড্যাশবোর্ড: মাসিক আয়, প্ল্যান অনুযায়ী বিক্রি, পেমেন্ট মাধ্যম (গেটওয়ে) অনুযায়ী আয়
const { getRevenueReport } = require('../utils/revenue');

exports.getRevenue = async (req, res) => {
  try {
    res.json(await getRevenueReport(req.query.months));
  } catch (err) {
    console.error('revenue report error:', err.message);
    res.status(500).json({ message: 'আয়ের তথ্য আনতে সমস্যা হয়েছে' });
  }
};
