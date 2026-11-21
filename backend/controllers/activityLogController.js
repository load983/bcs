// ================== controllers/activityLogController.js ==================
// অ্যাডমিন > অ্যাক্টিভিটি লগ: তালিকা (পেজিনেশন + ফিল্টার)। শুধু পড়া যায় — এডিট/ডিলিট করার কোনো রুট নেই।
const AuditLog = require('../models/AuditLog');

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CATEGORIES = ['payment', 'teacher', 'user', 'plan', 'promo', 'settings', 'site', 'support', 'export', 'other'];

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 30));
    const filter = {};

    if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.actor === 'system' || req.query.actor === 'admin') filter.actor = req.query.actor;

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (to && !isNaN(to)) to.setHours(23, 59, 59, 999); // শেষ দিনটাও ধরা
    if ((from && !isNaN(from)) || (to && !isNaN(to))) {
      filter.createdAt = {};
      if (from && !isNaN(from)) filter.createdAt.$gte = from;
      if (to && !isNaN(to)) filter.createdAt.$lte = to;
    }

    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
      const re = new RegExp(esc(q), 'i');
      filter.$or = [{ adminEmail: re }, { adminName: re }, { 'target.name': re }, { action: re }, { ip: re }];
    }

    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    res.status(500).json({ message: 'অ্যাক্টিভিটি লগ আনতে সমস্যা হয়েছে' });
  }
};
