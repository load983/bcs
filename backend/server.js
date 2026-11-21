// ================== server.js ==================
// এটাই ব্যাকএন্ডের মূল এন্ট্রি পয়েন্ট। এখানে Express app সেটআপ, DB কানেকশন
// এবং সব রাউট মাউন্ট করা হয়েছে।

require('dotenv').config();

// 🔒 JWT_SECRET না থাকলে সার্ভার চালুই হবে না (নইলে টোকেন সাইন হয় কিন্তু যাচাই সবসময় ব্যর্থ হয়)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('❌ JWT_SECRET সেট করা নেই বা খুব ছোট (কমপক্ষে ১৬ অক্ষর দিন)। .env ফাইল দেখুন।');
  process.exit(1);
}
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const examRoutes = require('./routes/examRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const classRoutes = require('./routes/classRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const siteRoutes = require('./routes/siteRoutes');
const messageRoutes = require('./routes/messageRoutes');
const teacherBackupRoutes = require('./routes/teacherBackupRoutes');
const aiRoutes = require('./routes/aiRoutes');
const teacherNotificationRoutes = require('./routes/teacherNotificationRoutes');
const { startExpiryReminderJob } = require('./utils/expiryReminders');
const { startAuditPurge } = require('./utils/auditLog');
const { ensureAdmin } = require('./utils/ensureAdmin');

const app = express();
// Set standard browser-facing security headers. CSP is configured by the
// frontend deployment, so avoid imposing a policy that could break the SPA.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// 🔒 Render/Vercel/Cloudflare-এর পেছনে চললে আসল ক্লায়েন্ট IP পেতে (নইলে সবার IP এক দেখায়: অ্যাডমিন লগইন লক সবার জন্য হয়ে যায়, AI লিমিট ফাঁকি দেওয়া যায়)
// প্রক্সির ধাপ বেশি হলে (যেমন Cloudflare + Render) .env-এ TRUST_PROXY=2 দিন
app.set('trust proxy', process.env.TRUST_PROXY !== undefined && process.env.TRUST_PROXY !== '' ? Number(process.env.TRUST_PROXY) || 0 : 1);

// আপলোড ফোল্ডার না থাকলে বানিয়ে নাও
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ডাটাবেসের সাথে কানেক্ট হও
connectDB();

// একবারের মাইগ্রেশন: আগের একক classRef থাকলে সেটা classRefs অ্যারেতে নিয়ে যাওয়া (নিরাপদ — বারবার চললেও সমস্যা নেই)
mongoose.connection.once('open', async () => {
  try {
    await mongoose.connection.collection('exams').updateMany(
      { classRef: { $exists: true, $ne: null }, $or: [{ classRefs: { $exists: false } }, { classRefs: { $size: 0 } }] },
      [{ $set: { classRefs: ['$classRef'] } }, { $unset: 'classRef' }]
    );
  } catch (err) {
    console.error('classRef migration skipped:', err.message);
  }
});

// .env-এর ইমেইল/পাসওয়ার্ড দিয়ে একমাত্র অ্যাডমিন একাউন্ট নিজে থেকে তৈরি/সিঙ্ক হয়
mongoose.connection.once('open', ensureAdmin);

// ⏰ সাবস্ক্রিপশনের মেয়াদ শেষের ৭/৩/১ দিন আগে শিক্ষককে নোটিফিকেশন + পুশ (EXPIRY_REMINDERS=off দিলে বন্ধ)
mongoose.connection.once('open', startExpiryReminderJob);

// 🧾 অ্যাডমিন অ্যাক্টিভিটি লগ: AUDIT_LOG_DAYS=365 দিলে পুরনো লগ নিজে মুছে যায় (না দিলে সব থাকে)
mongoose.connection.once('open', startAuditPurge);

// CORS কনফিগারেশন (credentials: true থাকলে specific origin প্রয়োজন)
const norm = (u) => String(u || '').trim().replace(/\/+$/, '');
const allowedOrigins = [
  process.env.CLIENT_URL,
  // একাধিক ফ্রন্টএন্ড ডোমেইন থাকলে কমা দিয়ে: EXTRA_ORIGINS=https://a.example.com,https://b.example.com
  ...String(process.env.EXTRA_ORIGINS || '').split(','),
  'https://upmcq-exam-platform.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
].map(norm).filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Postman বা Server-to-Server রিকোয়েস্টে origin না থাকলে allow করবে
    if (!origin || allowedOrigins.includes(norm(origin))) {
      callback(null, true);
    } else {
      const e = new Error('CORS Not Allowed');
      e.status = 403;
      callback(e);
    }
  },
  credentials: true
}));

app.use('/api/ai', express.json({ limit: '64kb' })); // AI চ্যাট খোলা (গেস্টও পারে) — বড় বডি পাঠিয়ে সার্ভার ভারী করা ঠেকাতে ছোট লিমিট
app.use(express.json({ limit: '30mb' })); // JSON বডি পার্স করার জন্য
app.use(express.urlencoded({ extended: true }));

// আপলোড করা ফাইল (PDF) স্ট্যাটিকভাবে সার্ভ করার জন্য
// কেমিস্ট্রি ডায়াগ্রামের SVG: সবসময় image/svg+xml, স্ক্রিপ্ট চালানো নিষিদ্ধ (CSP sandbox) — সরাসরি লিংক খুললেও নিরাপদ
app.use('/uploads/diagrams', express.static(path.join(uploadDir, 'diagrams'), {
  index: false,
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.use('/uploads', express.static(uploadDir));

// রাউট গুলো মাউন্ট করা হলো
app.use('/api/auth', authRoutes);       // লগইন/রেজিস্ট্রেশন (Teacher & Student)
app.use('/api/exams', examRoutes);      // পরীক্ষা তৈরি, PDF আপলোড, সেটিংস, রেজাল্ট
app.use('/api/classes', classRoutes);     // শিক্ষকের শ্রেণী ও প্রতি শ্রেণীর এক্সেস কোড
app.use('/api/subscription', subscriptionRoutes); // শিক্ষকের সাবস্ক্রিপশন, পেমেন্ট ও গেটওয়ে কলব্যাক
app.use('/api/admin', adminRoutes);      // অ্যাডমিন প্যানেল
app.use('/api/support', supportRoutes);  // হেল্পলাইন: যোগাযোগ তথ্য ও অ্যাডমিন চ্যাট
app.use('/api/site', siteRoutes);        // ওয়েবসাইট কাস্টমাইজ (লোগো, লেখা, ফুটার পেজ) — পাবলিক
app.use('/api/ai', aiRoutes);            // AI সহকারী (বাংলা + English চ্যাট)
app.use('/api/teacher-notifications', teacherNotificationRoutes); // শিক্ষকের 🔔 নোটিফিকেশন (মেয়াদ শেষের রিমাইন্ডার) ও তার ডিভাইস পুশ
app.use('/api/messages', messageRoutes); // শিক্ষকের মেসেজ/নোটিফিকেশন ও স্টুডেন্টের ডিভাইস পুশ
app.use('/api/attempts', attemptRoutes); // স্টুডেন্টের এক্সাম দেয়া, সাবমিট, রেজাল্ট
app.use('/api/teacher-backup', teacherBackupRoutes); // শিক্ষক ZIP backup export/restore

// Production container-এ একই origin থেকে React SPA serve করি। API/asset route
// আগে মাউন্ট করা আছে, তাই এগুলো SPA fallback দিয়ে ঢেকে যাবে না।
const clientDist = path.join(__dirname, 'client-dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: 'index.html', dotfiles: 'deny' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// হেলথ চেক
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// গ্লোবাল এরর হ্যান্ডলার
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'সার্ভারে একটি সমস্যা হয়েছে',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server চলছে পোর্ট ${PORT} এ`));
