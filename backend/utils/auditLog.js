// ================== utils/auditLog.js ==================
// অ্যাডমিন অ্যাক্টিভিটি লগের মূল অংশ।
// auditAdmin মিডলওয়্যার /api/admin-এর প্রতিটি পরিবর্তনকারী রিকোয়েস্ট (POST/PUT/DELETE) সফল হলে নিজে থেকে লগ করে —
// তাই নতুন অ্যাডমিন-কাজ যোগ করলে শুধু নিচের RULES-এ এক লাইন বসালেই চলে; কন্ট্রোলার ছুঁতে হয় না।
// লগ লেখা ব্যর্থ হলে মূল কাজ কখনো আটকায় না।
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Plan = require('../models/Plan');
const PromoCode = require('../models/PromoCode');
const Subscription = require('../models/Subscription');

// [method, path pattern, action, category, targetKind, options]
// targetKind: payment | user | plan | promo | null     options: { hideBody, pre }
const RULES = [
  ['POST', '/payments/:id/approve', 'payment.approve', 'payment', 'payment'],
  ['POST', '/payments/:id/reject', 'payment.reject', 'payment', 'payment'],
  ['POST', '/payments/:id/reverify', 'payment.reverify', 'payment', 'payment'],
  ['GET', '/payments/export', 'export.payments', 'export', null],
  ['GET', '/teachers/export', 'export.teachers', 'export', null],

  ['POST', '/teachers/:id/grant', 'teacher.grant', 'teacher', 'user'],
  ['POST', '/teachers/:id/extend', 'teacher.extend', 'teacher', 'user'],
  ['POST', '/teachers/:id/suspend', 'teacher.suspend', 'teacher', 'user'],
  ['POST', '/teachers/:id/resume', 'teacher.resume', 'teacher', 'user'],
  ['POST', '/teachers/:id/revoke', 'teacher.revoke', 'teacher', 'user'],

  ['PUT', '/users/:id', 'user.update', 'user', 'user'],
  ['POST', '/users/:id/password', 'user.password', 'user', 'user', { hideBody: true }],
  ['POST', '/users/:id/classes', 'user.classAdd', 'user', 'user'],
  ['DELETE', '/users/:id/classes/:classId', 'user.classRemove', 'user', 'user'],
  ['DELETE', '/users/:id/teachers/:teacherId', 'user.teacherRemove', 'user', 'user'],

  ['POST', '/plans', 'plan.create', 'plan', null],
  ['PUT', '/plans/:id', 'plan.update', 'plan', 'plan'],
  ['DELETE', '/plans/:id', 'plan.delete', 'plan', 'plan', { pre: true }],
  ['POST', '/promos', 'promo.create', 'promo', null],
  ['PUT', '/promos/:id', 'promo.update', 'promo', 'promo'],
  ['DELETE', '/promos/:id', 'promo.delete', 'promo', 'promo', { pre: true }],

  ['PUT', '/gateway/settings', 'settings.gateway', 'settings', null],
  ['POST', '/gateway/test', 'settings.gatewayTest', 'settings', null, { hideBody: true }],
  ['PUT', '/ai/settings', 'settings.ai', 'settings', null],
  ['POST', '/ai/test', 'settings.aiTest', 'settings', null, { hideBody: true }],
  ['PUT', '/payment-numbers', 'settings.paymentNumbers', 'settings', null],
  ['PUT', '/trial', 'settings.trial', 'settings', null],
  ['PUT', '/support/settings', 'settings.support', 'settings', null],

  ['POST', '/site/logo', 'site.logoUpload', 'site', null],
  ['DELETE', '/site/logo', 'site.logoDelete', 'site', null],
  ['PUT', '/site/texts', 'site.texts', 'site', null],
  ['PUT', '/site/footer', 'site.footer', 'site', null],

  ['DELETE', '/support/threads/:id', 'support.deleteThread', 'support', null],
  // চ্যাটের সাধারণ রিপ্লাই ইচ্ছা করেই লগে নেই (অতিরিক্ত ভিড় হয়)
];

const compiled = RULES.map(([method, pattern, action, category, targetKind, opts = {}]) => {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
  return { method, re, names, action, category, targetKind, opts };
});

const match = (method, path) => {
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) {
      const params = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { rule: r, params };
    }
  }
  return null;
};

// ---------- সিক্রেট মুছে বডির ছোট সারাংশ ----------
const SECRET = /pass|secret|key|token|pwd|auth|credential/i;
const short = (v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v);

const summarize = (val, depth = 0) => {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return `[${val.length}]`;
  if (typeof val === 'object') {
    if (depth >= 1) return '{…}';
    const out = {};
    Object.keys(val).slice(0, 25).forEach((k) => {
      out[k] = SECRET.test(k) ? (val[k] ? '***' : '') : summarize(val[k], depth + 1);
    });
    return out;
  }
  return short(val);
};

const sanitizeBody = (body, hide) => {
  if (hide || !body || typeof body !== 'object' || Array.isArray(body)) return {};
  return summarize(body) || {};
};

// ---------- লক্ষ্য (কার উপর কাজ) বের করা ----------
const mongoose = require('mongoose');
const ok = (id) => mongoose.isValidObjectId(id);

async function resolveTarget(kind, id, pre) {
  if (!kind || !ok(id)) return { target: null, extra: {} };
  if (kind === 'payment') {
    const s = await Subscription.findById(id).select('teacher planName amount provider trxId tranId').populate('teacher', 'name email').lean();
    if (!s) return { target: { type: 'payment', id, name: '' }, extra: {} };
    return {
      target: { type: 'payment', id, name: `${s.teacher?.name || '?'} — ${s.planName}` },
      extra: { amount: s.amount, provider: s.provider, txn: s.trxId || s.tranId || '' },
    };
  }
  if (kind === 'user') {
    const u = await User.findById(id).select('name email role').lean();
    if (!u) return { target: { type: 'user', id, name: '' }, extra: {} };
    return { target: { type: u.role, id, name: u.email ? `${u.name} (${u.email})` : u.name }, extra: {} };
  }
  if (kind === 'plan') {
    const p = pre || (await Plan.findById(id).select('name').lean());
    return { target: { type: 'plan', id, name: p?.name || '' }, extra: {} };
  }
  if (kind === 'promo') {
    const p = pre || (await PromoCode.findById(id).select('code').lean());
    return { target: { type: 'promo', id, name: p?.code || '' }, extra: {} };
  }
  return { target: null, extra: {} };
}

async function prefetch(kind, id) {
  if (!ok(id)) return null;
  if (kind === 'plan') return Plan.findById(id).select('name').lean();
  if (kind === 'promo') return PromoCode.findById(id).select('code').lean();
  return null;
}

// ---------- মিডলওয়্যার ----------
const auditAdmin = (req, res, next) => {
  const hit = match(req.method, req.path);
  if (!hit) return next();
  const { rule, params } = hit;
  let pre = null;

  res.on('finish', () => {
    if (res.statusCode >= 400) return; // ব্যর্থ কাজ লগ হয় না
    (async () => {
      const id = params.id;
      const { target, extra } = await resolveTarget(rule.targetKind, id, pre).catch(() => ({ target: null, extra: {} }));
      const details = { ...sanitizeBody(req.body, rule.opts.hideBody), ...extra };
      if (req.file) details.file = { name: short(req.file.originalname), size: req.file.size };
      // অন্য প্যারামিটার (classId/teacherId) আইডি হিসেবে থাকুক
      Object.keys(params).forEach((k) => { if (k !== 'id') details[k] = params[k]; });
      await AuditLog.create({
        actor: 'admin',
        admin: req.adminInfo?.id || req.user?.id,
        adminName: req.adminInfo?.name || '',
        adminEmail: req.adminInfo?.email || '',
        action: rule.action,
        category: rule.category,
        target: target || { type: '', id: '', name: '' },
        details,
        ip: req.ip || '',
        method: req.method,
        path: `/api/admin${req.path}`,
      });
    })().catch((e) => console.error('audit log error:', e.message));
  });

  // মোছার আগে নামটা ধরে রাখা (পরে আর পাওয়া যাবে না)
  if (rule.opts.pre) {
    prefetch(rule.targetKind, params.id).then((v) => { pre = v; next(); }, () => next());
  } else {
    next();
  }
};

// ---------- সিস্টেমের নিজের কাজ (গেটওয়ে পেমেন্ট নিজে থেকে চালু করলে) ----------
async function logSystemPayment(sub) {
  try {
    const teacher = await User.findById(sub.teacher).select('name email').lean();
    await AuditLog.create({
      actor: 'system',
      action: 'payment.auto',
      category: 'payment',
      target: { type: 'payment', id: String(sub._id), name: `${teacher?.name || '?'} — ${sub.planName}` },
      details: { amount: sub.amount, provider: sub.provider, txn: sub.tranId || sub.trxId || '' },
    });
  } catch (e) {
    console.error('audit log (system) error:', e.message);
  }
}

// AUDIT_LOG_DAYS=365 দিলে এর চেয়ে পুরনো লগ প্রতিদিন মুছে যায় (না দিলে সব রাখা হয়)
function startAuditPurge() {
  const days = Number(process.env.AUDIT_LOG_DAYS || 0);
  if (!(days > 0)) return;
  const run = () => AuditLog.deleteMany({ createdAt: { $lt: new Date(Date.now() - days * 86400000) } }).catch(() => {});
  run();
  setInterval(run, 24 * 3600 * 1000).unref();
}

module.exports = { auditAdmin, logSystemPayment, startAuditPurge };
