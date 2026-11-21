// ================== middleware/auth.js ==================
// JWT verify করে req.user সেট করে দেয়। role-based এক্সেস কন্ট্রোলের জন্য authorize() ও আছে।
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// User is the single account model for students, teachers, and admins. The
// current schema does not define account-status fields, but these checks are
// deliberately defensive for deployments/data migrations that do provide
// them. A teacher's `bannedByTeachers` list is intentionally not checked: it
// is a relationship-specific exam restriction, not account revocation.
const BLOCKED_STATUSES = new Set(['banned', 'disabled', 'deleted', 'deactivated', 'inactive', 'suspended']);

const isRevokedAccount = (account) => {
  if (!account) return true;

  if (
    account.deleted === true ||
    account.isDeleted === true ||
    account.deletedAt ||
    account.banned === true ||
    account.isBanned === true ||
    account.disabled === true ||
    account.isDisabled === true ||
    account.active === false ||
    account.isActive === false ||
    account.enabled === false
  ) {
    return true;
  }

  return typeof account.status === 'string' && BLOCKED_STATUSES.has(account.status.toLowerCase());
};

const getAccount = (id) => User.findById(id)
  .select('role status active isActive enabled banned isBanned disabled isDisabled deleted isDeleted deletedAt')
  .lean();

const invalidTokenResponse = (res) => res.status(401).json({ message: 'টোকেনের মেয়াদ শেষ অথবা অবৈধ' });

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'লগইন করা আবশ্যক (টোকেন পাওয়া যায়নি)' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const account = await getAccount(decoded.id);
    if (isRevokedAccount(account)) return invalidTokenResponse(res);
    // Roles can change after login (for example, an admin demotion). Never
    // authorize using the stale role embedded in an otherwise valid JWT.
    req.user = { ...decoded, id: String(account._id), role: account.role };
    next();
  } catch (err) {
    return invalidTokenResponse(res);
  }
};

// শুধু নির্দিষ্ট role (যেমন 'teacher') এক্সেস দেয়ার জন্য
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'এই কাজের জন্য অনুমতি নেই' });
  }
  next();
};

// টোকেন থাকলে req.user সেট করে, না থাকলে বা অবৈধ হলেও রিকোয়েস্ট আটকায় না
// (পাবলিক রুটে ব্যবহার করা হয় যেখানে লগইন করা থাকলে extra তথ্য দেখানো হয়)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const account = await getAccount(decoded.id);
      if (!isRevokedAccount(account)) {
        req.user = { ...decoded, id: String(account._id), role: account.role };
      }
    } catch (err) {
      // অবৈধ/মেয়াদোত্তীর্ণ/রিভোকড টোকেন হলে req.user সেট না করেই এগিয়ে যাবে
    }
  }
  next();
};

module.exports = { protect, authorize, optionalAuth };
