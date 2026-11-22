const fs = require('fs');
const JSZip = require('jszip');
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const Subscription = require('../models/Subscription');
const Announcement = require('../models/Announcement');
const TeacherNotification = require('../models/TeacherNotification');
const Diagram = require('../models/Diagram');
const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const ExamFeedback = require('../models/ExamFeedback');
const Plan = require('../models/Plan');
const PromoCode = require('../models/PromoCode');
const SiteSettings = require('../models/SiteSettings');

const FORMAT = 'fu-role-backup';
const VERSION = 1;
const MAX_BYTES = Number(process.env.ROLE_BACKUP_MAX_BYTES || process.env.TEACHER_BACKUP_MAX_BYTES || 1024 * 1024 * 1024);
const MAX_UNCOMPRESSED = Number(process.env.ROLE_BACKUP_MAX_UNCOMPRESSED_BYTES || 3 * 1024 * 1024 * 1024);
const ADMIN_MODELS = { users: User, classes: Class, exams: Exam, questions: Question, attempts: Attempt, subscriptions: Subscription, announcements: Announcement, teacherNotifications: TeacherNotification, diagrams: Diagram, chatThreads: ChatThread, chatMessages: ChatMessage, feedback: ExamFeedback, plans: Plan, promoCodes: PromoCode, siteSettings: SiteSettings };
const STUDENT_KEYS = ['profile', 'classes', 'attempts', 'feedback', 'announcements', 'teachers', 'support'];
const json = (v) => JSON.parse(JSON.stringify(v));
const id = (v) => String(v || '');
const own = (doc, uid) => id(doc.teacher) === id(uid) || id(doc.owner) === id(uid) || id(doc.studentId) === id(uid) || id(doc.user) === id(uid);

function sendZip(res, name, payload) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: FORMAT, version: VERSION, role: payload.role, ownerId: payload.ownerId, createdAt: new Date().toISOString(), collections: Object.keys(payload.data) }, null, 2));
  zip.file('data.json', JSON.stringify(payload.data));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then((buffer) => {
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}.zip"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(buffer);
  });
}

exports.exportAdmin = async (req, res) => {
  try {
    const data = {};
    for (const [key, Model] of Object.entries(ADMIN_MODELS)) data[key] = await Model.find({}).lean();
    // Never put payment gateway/API secrets, reset tokens, push keys or audit logs in a backup.
    data.users = data.users.map((u) => { delete u.passwordResetTokenHash; delete u.passwordResetExpires; return u; });
    return sendZip(res, `admin-full-backup-${new Date().toISOString().slice(0, 10)}`, { role: 'admin', ownerId: req.user.id, data });
  } catch (e) { console.error('Admin backup export failed:', e.message); res.status(500).json({ message: 'Admin full backup তৈরি করা যায়নি' }); }
};

exports.exportStudent = async (req, res) => {
  try {
    const uid = req.user.id;
    const profile = await User.findById(uid).select('+initialPasswordEnc').lean();
    if (!profile || profile.role !== 'student') return res.status(404).json({ message: 'Student account পাওয়া যায়নি' });
    const classIds = profile.connectedClasses || [];
    const [classes, attempts, feedback, announcements, teachers, thread] = await Promise.all([
      Class.find({ _id: { $in: classIds } }).lean(), Attempt.find({ studentId: uid }).lean(), ExamFeedback.find({ studentId: uid }).lean(), Announcement.find({ classRefs: { $in: classIds } }).lean(), User.find({ _id: { $in: profile.connectedTeachers || [] }, role: 'teacher' }).select('name email phone role createdAt').lean(), ChatThread.findOne({ owner: uid }).select('_id').lean(),
    ]);
    const messages = thread ? await ChatMessage.find({ thread: thread._id }).lean() : [];
    return sendZip(res, `student-backup-${new Date().toISOString().slice(0, 10)}`, { role: 'student', ownerId: uid, data: { profile, classes, attempts, feedback, announcements, teachers, support: { thread, messages } } });
  } catch (e) { console.error('Student backup export failed:', e.message); res.status(500).json({ message: 'Student backup তৈরি করা যায়নি' }); }
};

async function readArchive(req) {
  if (!req.file) throw Object.assign(new Error('একটি ZIP backup file বেছে নিন'), { status: 400 });
  if (req.file.size > MAX_BYTES) throw Object.assign(new Error('ZIP backup অনুমোদিত আকারের চেয়ে বড়'), { status: 413 });
  const zip = await JSZip.loadAsync(fs.readFileSync(req.file.path), { checkCRC32: true });
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  let expanded = 0;
  for (const entry of entries) { if (!['manifest.json', 'data.json'].includes(entry.name)) throw Object.assign(new Error('ZIP-এ অচেনা file path আছে'), { status: 400 }); expanded += entry._data?.uncompressedSize || 0; if (expanded > MAX_UNCOMPRESSED) throw Object.assign(new Error('ZIP extract size সীমা ছাড়িয়েছে'), { status: 400 }); }
  const manifestFile = zip.file('manifest.json'); const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw Object.assign(new Error('ZIP-এ manifest.json অথবা data.json নেই'), { status: 400 });
  const manifest = JSON.parse(await manifestFile.async('string')); const data = JSON.parse(await dataFile.async('string'));
  if (manifest.format !== FORMAT || manifest.version !== VERSION) throw Object.assign(new Error('এই ZIP backup format/version সমর্থিত নয়'), { status: 400 });
  return { manifest, data };
}
function clean(doc) {
  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key === 'password' || key === 'initialPasswordEnc' || !/(?:passwordReset|token|secret|apiKey|smtpPass|twilioToken|storePassword|KeyEnc|PasswordEnc)/i.test(key)).map(([key, child]) => [key, scrub(child)]));
  };
  const value = scrub(json(doc)); delete value.__v; return value;
}

exports.restoreAdmin = async (req, res) => {
  const file = req.file?.path;
  try {
    const { manifest, data } = await readArchive(req);
    if (manifest.role !== 'admin') throw Object.assign(new Error('এটি Admin backup নয়'), { status: 400 });
    const stats = { restored: 0, skipped: 0 };
    for (const [key, Model] of Object.entries(ADMIN_MODELS)) {
      for (const doc of Array.isArray(data[key]) ? data[key] : []) {
        const payload = clean(doc);
        try { await Model.create(payload); stats.restored++; } catch (e) { if (e.code === 11000 || e.name === 'ValidationError') stats.skipped++; else throw e; }
      }
    }
    res.json({ message: 'Admin backup restore সম্পন্ন। Existing data overwrite/delete করা হয়নি।', stats, secretsRestored: false });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'Admin backup restore করা যায়নি' }); }
  finally { if (file) { try { fs.unlinkSync(file); } catch (_) {} } }
};

exports.restoreStudent = async (req, res) => {
  const file = req.file?.path;
  try {
    const { manifest, data } = await readArchive(req);
    const uid = req.user.id;
    if (manifest.role !== 'student' || id(manifest.ownerId) !== id(uid)) throw Object.assign(new Error('এই backup অন্য student account-এর'), { status: 400 });
    const me = await User.findById(uid); if (!me || me.role !== 'student') throw Object.assign(new Error('Student account পাওয়া যায়নি'), { status: 404 });
    const profile = data.profile || {};
    if (profile.name) me.name = String(profile.name).slice(0, 120);
    if (profile.roll) me.roll = String(profile.roll).slice(0, 80);
    // Preserve current password; restore only the exported hash when valid and no password exists.
    if (!me.password && /^\$2[aby]\$\d{2}\$/.test(String(profile.password || ''))) me.password = profile.password;
    const validClasses = await Class.find({ _id: { $in: Array.isArray(data.classes) ? data.classes.map((c) => c._id) : [] } }).select('_id').lean();
    me.connectedClasses = [...new Set([...(me.connectedClasses || []).map(id), ...validClasses.map((c) => id(c._id))])];
    await me.save();
    const stats = { profile: 1, attempts: 0, feedback: 0, skipped: 0 };
    for (const [key, Model] of [['attempts', Attempt], ['feedback', ExamFeedback]]) for (const doc of Array.isArray(data[key]) ? data[key] : []) {
      if (id(doc.studentId) !== id(uid)) { stats.skipped++; continue; }
      try { await Model.create(clean(doc)); stats[key]++; } catch (e) { if (e.code === 11000 || e.name === 'ValidationError') stats.skipped++; else throw e; }
    }
    res.json({ message: 'Student backup restore সম্পন্ন। Existing data overwrite/delete করা হয়নি।', stats });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'Student backup restore করা যায়নি' }); }
  finally { if (file) { try { fs.unlinkSync(file); } catch (_) {} } }
};
