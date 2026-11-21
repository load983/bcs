// ================== models/AuditLog.js ==================
// অ্যাডমিন অ্যাক্টিভিটি লগ: কে (অ্যাডমিন/সিস্টেম), কখন, কী করল (পেমেন্ট approve/reject, সেটিং বদল, প্ল্যান/প্রোমো ইত্যাদি)।
// পাসওয়ার্ড/API key/সিক্রেট কখনো এখানে জমা হয় না (utils/auditLog.js-এ মুছে ফেলা হয়)।
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: String, enum: ['admin', 'system'], default: 'admin' }, // system = গেটওয়ে নিজে থেকে পেমেন্ট চালু করেছে
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminName: { type: String, default: '' },
    adminEmail: { type: String, default: '' },

    action: { type: String, required: true, index: true }, // যেমন payment.approve, settings.gateway
    category: { type: String, default: 'other', index: true }, // payment | teacher | user | plan | promo | settings | site | support | export | other

    target: {
      type: { type: String, default: '' }, // payment | teacher | student | plan | promo | ...
      id: { type: String, default: '' },
      name: { type: String, default: '' },
    },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }, // কী কী পাঠানো হয়েছিল (সিক্রেট বাদে, ছোট করা)

    ip: { type: String, default: '' },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
