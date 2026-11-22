// ================== routes/adminRoutes.js ==================
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');
const ctrl = require('../controllers/adminController');
const support = require('../controllers/supportController');
const trial = require('../controllers/trialController');
const users = require('../controllers/adminUserController');
const site = require('../controllers/siteController');
const payNums = require('../controllers/paymentSettingsController');
const aiSettings = require('../controllers/aiSettingsController');
const gateway = require('../controllers/gatewaySettingsController');
const plugins = require('../controllers/pluginsController');
const messaging = require('../controllers/messagingController');
const activityLog = require('../controllers/activityLogController');
const revenue = require('../controllers/revenueController');
const { auditAdmin } = require('../utils/auditLog');
const upload = require('../middleware/upload');
const accounts = require('../controllers/accountProvisionController');

// প্রতিটি রিকোয়েস্টে যাচাই: টোকেনের ইউজারই যেন .env-এর নির্ধারিত একমাত্র অ্যাডমিন হয়
const onlyOwnerAdmin = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user.id).select('email role name');
    const allowed = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!admin || admin.role !== 'admin' || !allowed || admin.email !== allowed) {
      return res.status(403).json({ message: 'এই কাজের জন্য অনুমতি নেই' });
    }
    req.adminInfo = { id: String(admin._id), name: admin.name || '', email: admin.email || '' }; // অ্যাক্টিভিটি লগের জন্য
    next();
  } catch (err) {
    res.status(500).json({ message: 'যাচাই করতে সমস্যা হয়েছে' });
  }
};

router.use(protect, authorize('admin'), onlyOwnerAdmin);
router.use(auditAdmin); // প্রতিটি সফল পরিবর্তন অ্যাক্টিভিটি লগে জমা হয়

// অ্যাক্টিভিটি লগ (শুধু পড়া)
router.get('/activity-log', activityLog.list);

router.get('/stats', ctrl.getStats);
router.get('/exam-analytics', ctrl.getExamAnalytics);
router.get('/revenue', revenue.getRevenue); // আয়ের ড্যাশবোর্ড (চার্টের ডেটা)
router.get('/teachers', ctrl.getTeachers);
router.get('/teachers/export', ctrl.exportTeachersExcel);
router.get('/payments', ctrl.getPayments);
router.get('/payments/export', ctrl.exportPaymentsExcel);
router.post('/payments/:id/approve', ctrl.approvePayment);
router.post('/payments/:id/reject', ctrl.rejectPayment);
router.post('/payments/:id/reverify', gateway.reverifyPayment); // অনলাইন পেমেন্ট গেটওয়েকে আবার জিজ্ঞেস করা

// প্লাগইন হাব: সব ইন্টিগ্রেশনের অবস্থা
router.get('/plugins', plugins.getPlugins);
router.get('/messaging/settings', messaging.get);
router.put('/messaging/settings', messaging.save);
router.post('/messaging/test', messaging.test);

// অটো পেমেন্ট গেটওয়ে সেটিং
router.get('/gateway/settings', gateway.getGatewaySettings);
router.put('/gateway/settings', gateway.saveGatewaySettings);
router.post('/gateway/test', gateway.testGateway);

router.post('/teachers/:id/grant', ctrl.grant);
router.post('/teachers/:id/extend', ctrl.extend);
router.post('/teachers/:id/suspend', ctrl.suspend);
router.post('/teachers/:id/resume', ctrl.resume);
router.post('/teachers/:id/revoke', ctrl.revoke);

// AI সহকারী সেটিং
router.get('/ai/settings', aiSettings.getAiSettings);
router.put('/ai/settings', aiSettings.saveAiSettings);
router.post('/ai/test', aiSettings.testAi);

// ইউজার্স ম্যানেজমেন্ট (শিক্ষক ও শিক্ষার্থী)
router.get('/users', users.listUsers);
router.post('/users/create', accounts.adminCreate);
router.post('/users/import', upload.dataImport.single('file'), accounts.adminImport);
router.get('/users/credentials/export', accounts.adminExcel);
router.get('/users/credentials/pdf', accounts.adminPdf);
router.get('/users/classes', users.allClasses);
router.get('/users/:id/students', users.teacherStudents);
router.put('/users/:id', users.updateUser);
router.post('/users/:id/password', users.setPassword);
router.post('/users/:id/classes', users.addToClass);
router.delete('/users/:id/classes/:classId', users.removeFromClass);
router.delete('/users/:id/teachers/:teacherId', users.removeLegacyTeacher);

router.get('/plans', ctrl.listPlans);
router.post('/plans', ctrl.createPlan);
router.put('/plans/:id', ctrl.updatePlan);
router.delete('/plans/:id', ctrl.deletePlan);

router.get('/promos', ctrl.listPromos);
router.post('/promos', ctrl.createPromo);
router.put('/promos/:id', ctrl.updatePromo);
router.delete('/promos/:id', ctrl.deletePromo);

// বিকাশ/নগদ/রকেটের পেমেন্ট নাম্বার
router.get('/payment-numbers', payNums.getPaymentNumbers);
router.put('/payment-numbers', payNums.savePaymentNumbers);

// Test Web: নতুন শিক্ষকের অটো ফ্রি ট্রায়াল (মেয়াদ + ফিচার)
router.get('/trial', trial.getTrialSettings);
router.put('/trial', trial.saveTrialSettings);

// হেল্পলাইন: যোগাযোগের তথ্য ও ইউজারদের চ্যাট ইনবক্স
router.get('/support/settings', support.adminGetSettings);
router.put('/support/settings', support.adminSaveSettings);
router.get('/support/unread', support.adminUnreadCount);
router.get('/support/threads', support.adminListThreads);
router.get('/support/threads/:id/messages', support.adminGetMessages);
router.post('/support/threads/:id/reply', support.adminReply);
router.delete('/support/threads/:id', support.adminDeleteThread);

// ওয়েবসাইট কাস্টমাইজ: লোগো, সাইটের নাম, যেকোনো লেখা, ফুটার লিংক ও পেজ
router.get('/site', site.adminGet);
router.post('/site/logo', (req, res, next) => site.logoUpload(req, res, (err) => (err ? res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'লোগো সর্বোচ্চ ১ MB হতে পারবে' : err.message }) : next())), site.adminUploadLogo);
router.delete('/site/logo', site.adminDeleteLogo);
router.post('/site/image', (req, res, next) => site.imageUpload(req, res, (err) => (err ? res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Homepage ছবি/ভিডিও সর্বোচ্চ ৫০ MB হতে পারবে' : err.message }) : next())), site.adminUploadImage);
router.delete('/site/image/:slot', site.adminDeleteImage);
router.post('/site/media', (req, res, next) => site.mediaUpload(req, res, (err) => (err ? res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Media ফাইল সর্বোচ্চ ৫০ MB হতে পারবে' : err.message }) : next())), site.adminUploadMedia);
router.delete('/site/media/:id', site.adminDeleteMedia);
router.put('/site/texts', site.adminSaveTexts);
router.put('/site/footer', site.adminSaveFooter);
router.put('/site/presentation', site.adminSavePresentation);
router.put('/site/footer-and-texts', site.adminSaveFooterAndTexts);

module.exports = router;
