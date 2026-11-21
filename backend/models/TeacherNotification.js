// ================== models/TeacherNotification.js ==================
// শিক্ষকের নিজের নোটিফিকেশন (🔔 বেলে দেখায়) — এখন শুধু সাবস্ক্রিপশনের মেয়াদ শেষের রিমাইন্ডার (৭/৩/১ দিন আগে)।
// লেখা ডাটাবেসে রাখা হয় না, শুধু তথ্য রাখা হয় — ফ্রন্টএন্ড নিজের ভাষায় (বাংলা/English) লেখা বানায়।
const mongoose = require('mongoose');

const teacherNotificationSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['expiry'], default: 'expiry' },

    // expiry রিমাইন্ডারের তথ্য
    daysBefore: { type: Number }, // 7 | 3 | 1  (মেয়াদ শেষের কত দিনের মধ্যে)
    expiresAt: { type: Date }, // তখনকার মেয়াদ শেষের সময় — রিনিউ করলে মেয়াদ সরে যায়, তখন পুরনো রিমাইন্ডার আর দেখানো হয় না
    planName: { type: String, default: '' },
    isTrial: { type: Boolean, default: false },

    // একই মেয়াদের একই ধাপের রিমাইন্ডার দু'বার যেন না যায় (একাধিক সার্ভার চললেও নিরাপদ)
    dedupeKey: { type: String, required: true },

    readAt: { type: Date }, // শিক্ষক দেখলে সেট হয়
    pushedAt: { type: Date }, // ডিভাইস পুশ পাঠানোর (বা ইচ্ছা করে বাদ দেওয়ার) সময়
  },
  { timestamps: true }
);

teacherNotificationSchema.index({ teacher: 1, dedupeKey: 1 }, { unique: true });
teacherNotificationSchema.index({ teacher: 1, createdAt: -1 });
// ৯০ দিন পর নিজে থেকে মুছে যাবে
teacherNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('TeacherNotification', teacherNotificationSchema);
