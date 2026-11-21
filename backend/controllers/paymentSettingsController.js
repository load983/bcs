// ================== controllers/paymentSettingsController.js ==================
// অ্যাডমিন প্যানেল: বিকাশ / নগদ / রকেটের পেমেন্ট নাম্বার দেখা ও বদলানো
const { getSettings } = require('../utils/siteSettings');
const { getPaymentNumbers, PROVIDERS } = require('../utils/paymentNumbers');

exports.getPaymentNumbers = async (req, res) => {
  try {
    res.json({ numbers: await getPaymentNumbers() });
  } catch (err) {
    res.status(500).json({ message: 'পেমেন্ট নাম্বার লোড করা যায়নি' });
  }
};

exports.savePaymentNumbers = async (req, res) => {
  try {
    const b = req.body || {};
    const s = await getSettings();
    const next = { ...(s.payment?.toObject ? s.payment.toObject() : s.payment || {}) };
    for (const k of PROVIDERS) {
      if (b[k] === undefined) continue;
      const v = String(b[k] ?? '').replace(/[\s-]/g, '');
      if (v && !/^\+?\d{10,15}$/.test(v)) {
        return res.status(400).json({ message: 'নাম্বার সঠিক নয় — শুধু অঙ্ক দিন (যেমন 017XXXXXXXX)' });
      }
      next[k] = v;
    }
    s.payment = next;
    await s.save();
    res.json({ message: 'পেমেন্ট নাম্বার সেভ হয়েছে', numbers: await getPaymentNumbers() });
  } catch (err) {
    res.status(500).json({ message: 'সেভ করা যায়নি' });
  }
};
