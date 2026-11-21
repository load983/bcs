// ================== controllers/teacherNotificationController.js ==================
// শিক্ষকের 🔔 নোটিফিকেশন (মেয়াদ শেষের রিমাইন্ডার)। সাবস্ক্রিপশন না থাকলেও এখানে ঢোকা যায় — মেয়াদ-শেষ শিক্ষকই তো সবচেয়ে বেশি দরকার।
const TeacherNotification = require('../models/TeacherNotification');
const { getTeacherStatus } = require('../utils/subscription');

// রিনিউ করে ফেললে (মেয়াদ সরে গেলে) পুরনো মেয়াদের রিমাইন্ডার আর দেখানো হয় না
const visibleFilter = async (teacherId) => {
  const filter = { teacher: teacherId };
  const st = await getTeacherStatus(teacherId);
  if (st.isActive && st.expiresAt) {
    filter.$or = [{ kind: { $ne: 'expiry' } }, { expiresAt: { $gte: st.expiresAt } }];
  }
  return filter;
};

exports.list = async (req, res) => {
  try {
    const filter = await visibleFilter(req.user.id);
    const list = await TeacherNotification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({
      items: list.map((n) => ({
        _id: n._id,
        kind: n.kind,
        daysBefore: n.daysBefore,
        expiresAt: n.expiresAt,
        planName: n.planName,
        isTrial: !!n.isTrial,
        createdAt: n.createdAt,
        isNew: !n.readAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.unreadCount = async (req, res) => {
  try {
    const filter = await visibleFilter(req.user.id);
    const count = await TeacherNotification.countDocuments({ ...filter, readAt: null });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markSeen = async (req, res) => {
  try {
    await TeacherNotification.updateMany({ teacher: req.user.id, readAt: null }, { readAt: new Date() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
