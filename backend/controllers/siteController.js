// ================== controllers/siteController.js ==================
// ওয়েবসাইট কাস্টমাইজ: লোগো, সাইটের নাম, যেকোনো লেখা বদল, ফুটারের "Important Links" পেজ।
// পাবলিক অংশ (config/logo/page) লগইন ছাড়াই; অ্যাডমিন অংশ adminRoutes-এর গার্ডের ভেতরে।
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const SiteSettings = require('../models/SiteSettings');
const { getSettings } = require('../utils/siteSettings');

const MAX_OVERRIDES = 1500;
const MAX_TEXT_LEN = 2000;
const MAX_LINKS = 10;
const MAX_CONTENT_LEN = 20000;
const KEY_RE = /^[\w.\-]{1,100}$/;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const SLOT_RE = /^[a-z0-9-]{1,30}$/;
const MEDIA_ID_RE = /^[a-f0-9]{24}$/i;
const siteDir = path.join(__dirname, '..', 'uploads', 'site');
if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });

// ---------- হেল্পার ----------
const cleanHttpUrl = (v) => {
  const s = String(v || '').trim().slice(0, 300);
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null; // javascript: ইত্যাদি বাতিল
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
};

const logoUrlOf = (s) => (s.logo?.contentType && s.logo?.updatedAt ? `/api/site/logo?v=${new Date(s.logo.updatedAt).getTime()}` : '');

const publicLink = (l) => ({
  slug: l.slug,
  titleBn: l.titleBn,
  titleEn: l.titleEn,
  externalUrl: l.externalUrl || '',
});
const publicImages = (s) => Object.fromEntries((s.images || []).map((i) => [i.slot, { url: i.path, alt: i.alt || '' }]));
const publicMedia = (s) => (s.media || []).map((m) => ({ id: String(m._id), kind: m.kind, url: m.path, contentType: m.contentType || '', title: m.title || '', alt: m.alt || '' }));

// ---------- পাবলিক ----------
exports.getPublicConfig = async (req, res) => {
  try {
    const s = await getSettings();
    res.json({
      logoUrl: logoUrlOf(s),
      textOverrides: (s.textOverrides || []).filter((o) => o.bn || o.en).map((o) => ({ key: o.key, bn: o.bn, en: o.en })),
      footerLinks: (s.footerLinks || []).filter((l) => l.enabled && (l.titleBn || l.titleEn)).map(publicLink),
      images: publicImages(s),
      media: publicMedia(s),
    });
  } catch (err) {
    res.status(500).json({ message: 'তথ্য লোড করা যায়নি' });
  }
};

exports.getLogo = async (req, res) => {
  try {
    const s = await SiteSettings.findOne({ key: 'main' }).select('+logo.data logo.contentType logo.updatedAt');
    if (!s?.logo?.data || !s.logo.contentType) return res.status(404).end();
    res.set({
      'Content-Type': s.logo.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable', // URL-এ ?v= থাকায় বদলালে নতুন ক্যাশ
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(s.logo.data);
  } catch (err) {
    res.status(500).end();
  }
};

exports.getPublicPage = async (req, res) => {
  try {
    const s = await getSettings();
    const l = (s.footerLinks || []).find((x) => x.slug === req.params.slug && x.enabled);
    if (!l || l.externalUrl) return res.status(404).json({ message: 'পেজটি পাওয়া যায়নি' });
    res.json({ slug: l.slug, titleBn: l.titleBn, titleEn: l.titleEn, contentBn: l.contentBn, contentEn: l.contentEn });
  } catch (err) {
    res.status(500).json({ message: 'পেজ লোড করা যায়নি' });
  }
};

// ---------- অ্যাডমিন ----------
exports.adminGet = async (req, res) => {
  try {
    const s = await getSettings();
    res.json({
      logoUrl: logoUrlOf(s),
      textOverrides: (s.textOverrides || []).map((o) => ({ key: o.key, bn: o.bn, en: o.en })),
      footerLinks: (s.footerLinks || []).map((l) => ({
        slug: l.slug, titleBn: l.titleBn, titleEn: l.titleEn, contentBn: l.contentBn, contentEn: l.contentEn,
        externalUrl: l.externalUrl || '', enabled: l.enabled !== false,
      })),
      images: publicImages(s),
      media: publicMedia(s),
    });
  } catch (err) {
    res.status(500).json({ message: 'সেটিংস লোড করা যায়নি' });
  }
};

// লোগো আপলোড: মেমরিতে নিয়ে সরাসরি ডাটাবেসে (PNG/JPG/WEBP/GIF, সর্বোচ্চ ১ MB; SVG নয় — স্ক্রিপ্ট ঝুঁকি)
exports.logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('শুধুমাত্র ছবি (PNG, JPG, WEBP, GIF) আপলোড করা যাবে'), false);
  },
}).single('logo');

exports.adminUploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'লোগো ফাইল বাছাই করুন' });
    const s = await getSettings();
    s.logo = { data: req.file.buffer, contentType: req.file.mimetype, updatedAt: new Date() };
    await s.save();
    res.json({ message: 'লোগো আপডেট হয়েছে', logoUrl: logoUrlOf(s) });
  } catch (err) {
    res.status(500).json({ message: 'লোগো সেভ করা যায়নি' });
  }
};

exports.adminDeleteLogo = async (req, res) => {
  try {
    await SiteSettings.updateOne({ key: 'main' }, { $unset: { logo: '' } });
    res.json({ message: 'লোগো মুছে ডিফল্ট করা হয়েছে', logoUrl: '' });
  } catch (err) {
    res.status(500).json({ message: 'লোগো মোছা যায়নি' });
  }
};

// Admin visual slots: homepage hero/promo/feature image বদলানো যায়।
exports.imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, siteDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('শুধুমাত্র PNG, JPG, WEBP বা GIF ছবি আপলোড করা যাবে'))),
}).single('image');

exports.adminUploadImage = async (req, res) => {
  try {
    const slot = String(req.body.slot || '').trim().toLowerCase();
    if (!SLOT_RE.test(slot) || !req.file) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'সঠিক image slot ও ছবি দিন' });
    }
    const s = await getSettings();
    const old = (s.images || []).find((i) => i.slot === slot);
    s.images = (s.images || []).filter((i) => i.slot !== slot);
    s.images.push({ slot, path: `/uploads/site/${req.file.filename}`, contentType: req.file.mimetype, alt: String(req.body.alt || '').trim().slice(0, 160), updatedAt: new Date() });
    await s.save();
    if (old?.path) fs.unlink(path.join(__dirname, '..', old.path.replace(/^\/uploads\//, 'uploads/')), () => {});
    res.json({ message: 'সাইটের ছবি আপডেট হয়েছে', images: publicImages(s) });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ message: err.message || 'ছবি সেভ করা যায়নি' });
  }
};

exports.adminDeleteImage = async (req, res) => {
  try {
    const slot = String(req.params.slot || '').trim().toLowerCase();
    const s = await getSettings();
    const old = (s.images || []).find((i) => i.slot === slot);
    s.images = (s.images || []).filter((i) => i.slot !== slot);
    await s.save();
    if (old?.path) fs.unlink(path.join(__dirname, '..', old.path.replace(/^\/uploads\//, 'uploads/')), () => {});
    res.json({ message: 'সাইটের ছবি সরানো হয়েছে', images: publicImages(s) });
  } catch (err) { res.status(500).json({ message: 'ছবি সরানো যায়নি' }); }
};

exports.adminSaveTexts = async (req, res) => {
  try {
    const list = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    if (list.length > MAX_OVERRIDES) return res.status(400).json({ message: 'অনেক বেশি লেখা বদলানো হয়েছে' });
    const seen = new Set();
    const clean = [];
    for (const o of list) {
      const key = String(o?.key || '');
      if (!KEY_RE.test(key) || seen.has(key)) continue;
      const bn = String(o?.bn || '').trim().slice(0, MAX_TEXT_LEN);
      const en = String(o?.en || '').trim().slice(0, MAX_TEXT_LEN);
      if (!bn && !en) continue; // দুটোই ফাঁকা = ডিফল্টে ফেরত
      seen.add(key);
      clean.push({ key, bn, en });
    }
    const s = await getSettings();
    s.textOverrides = clean;
    await s.save();
    res.json({ message: 'লেখা সেভ হয়েছে', textOverrides: clean });
  } catch (err) {
    res.status(500).json({ message: 'সেভ করা যায়নি' });
  }
};

exports.adminSaveFooter = async (req, res) => {
  try {
    const list = Array.isArray(req.body?.footerLinks) ? req.body.footerLinks.slice(0, MAX_LINKS) : [];
    const seen = new Set();
    const clean = [];
    for (const l of list) {
      const slug = String(l?.slug || '').trim().toLowerCase();
      if (!SLUG_RE.test(slug)) return res.status(400).json({ message: 'পেজের স্লাগে শুধু ইংরেজি ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন (-) দেওয়া যাবে' });
      if (seen.has(slug)) return res.status(400).json({ message: `স্লাগ "${slug}" একাধিকবার ব্যবহার হয়েছে` });
      seen.add(slug);
      const externalUrl = cleanHttpUrl(l?.externalUrl);
      if (externalUrl === null) return res.status(400).json({ message: 'বাইরের লিংক শুধু http/https হতে হবে' });
      clean.push({
        slug,
        titleBn: String(l?.titleBn || '').trim().slice(0, 80),
        titleEn: String(l?.titleEn || '').trim().slice(0, 80),
        contentBn: String(l?.contentBn || '').slice(0, MAX_CONTENT_LEN),
        contentEn: String(l?.contentEn || '').slice(0, MAX_CONTENT_LEN),
        externalUrl,
        enabled: l?.enabled !== false,
      });
    }
    const s = await getSettings();
    s.footerLinks = clean;
    await s.save();
    res.json({ message: 'ফুটার লিংক সেভ হয়েছে', footerLinks: clean });
  } catch (err) {
    res.status(500).json({ message: 'সেভ করা যায়নি' });
  }
};
// Unlimited homepage image/video gallery (per-file max 50 MB)
exports.mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, siteDir),
    filename: (req, file, cb) => cb(null, `media-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|ogg))$/.test(file.mimetype) ? cb(null, true) : cb(new Error('PNG/JPG/WEBP/GIF অথবা MP4/WEBM/OGG ফাইল দিন'))),
}).single('media');

exports.adminUploadMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'ছবি বা ভিডিও ফাইল বাছাই করুন' });
    const s = await getSettings(); const kind = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    s.media = [...(s.media || []), { kind, path: `/uploads/site/${req.file.filename}`, contentType: req.file.mimetype, title: String(req.body.title || '').trim().slice(0, 160), alt: String(req.body.alt || '').trim().slice(0, 160), updatedAt: new Date() }];
    await s.save(); res.json({ message: 'Homepage media যোগ হয়েছে', media: publicMedia(s) });
  } catch (err) { if (req.file) fs.unlink(req.file.path, () => {}); res.status(500).json({ message: err.message || 'Media সেভ করা যায়নি' }); }
};

exports.adminDeleteMedia = async (req, res) => {
  try {
    const id = String(req.params.id || ''); if (!MEDIA_ID_RE.test(id)) return res.status(400).json({ message: 'সঠিক media id দিন' });
    const s = await getSettings(); const old = (s.media || []).find((m) => String(m._id) === id);
    s.media = (s.media || []).filter((m) => String(m._id) !== id); await s.save();
    if (old?.path) fs.unlink(path.join(__dirname, '..', old.path.replace(/^\/uploads\//, 'uploads/')), () => {});
    res.json({ message: 'Homepage media সরানো হয়েছে', media: publicMedia(s) });
  } catch (err) { res.status(500).json({ message: 'Media সরানো যায়নি' }); }
};
