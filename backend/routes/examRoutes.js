const express = require('express');
const router = express.Router();
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { enforceExamLimit } = require('../middleware/examLimit');
const { requireFeature } = require('../middleware/feature');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/examController');
const feedbackCtrl = require('../controllers/examFeedbackController');
const diagrams = require('../controllers/diagramController');
const chemDiagrams = require('../controllers/chemDiagramController');

// ==========================================
// ১. পাবলিক রুটস (No Auth Required)
// ==========================================
// নির্দিষ্ট কোড দিয়ে পরীক্ষার তথ্য দেখা (Join পেজ)
router.get('/public/:code', ctrl.getExamByCode);
router.get('/code/:code', ctrl.getExamByCode); // 👈 ফ্রন্টএন্ডের জন্য নতুন পাবলিক রাউট

// পাবলিক: সব পাবলিশড পরীক্ষার তালিকা (Student Portal-এর জন্য)
// optionalAuth দিয়ে টোকেন থাকলে req.user সেট হয়, যাতে শুধু যুক্ত শিক্ষকদের পরীক্ষাই ফিল্টার করে দেখানো যায়
router.get('/public-list', optionalAuth, ctrl.getPublicExams);

// ==========================================
// ২. অটেনটিকেশন ও অথরাইজেশন মিডলওয়্যার
// ==========================================
// CORS Preflight (OPTIONS) রিকোয়েস্ট যাতে Auth মিডলওয়্যারে আটকে না যায়
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// এর পরের সব রুট শুধু Teacher রোল থাকা ইউজারদের জন্য
router.use(protect, authorize('teacher'), requireSubscription);

// ==========================================
// ৩. স্পেসিফিক রুটসমূহ (Static & Specific Paths)
// ==========================================
router.post('/upload', requireFeature('uploadExam'), enforceExamLimit, upload.examSource.single('pdf'), ctrl.uploadExamPdf); // ফাইল আপলোডের আগেই সীমা চেক — সীমা শেষ হলে অযথা ফাইল সেভ হবে না
// 🖼 প্রশ্নের ডায়াগ্রাম আপলোড (আপলোড করা ছবি বা স্টুডিওতে আঁকা ডায়াগ্রাম — দুটোই এখানে আসে)
const diagramUpload = (req, res, next) =>
  upload.image.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'ছবি আপলোড ব্যর্থ' });
    next();
  });
router.post('/diagram', requireFeature('diagrams'), diagramUpload, ctrl.uploadDiagram);
// ⚗️ কেমিস্ট্রি ডায়াগ্রাম (smiles-drawer SVG) — ছেঁকে /uploads/diagrams/-এ রাখে, URL ফেরত দেয়
router.post('/chem-diagram', requireFeature('diagrams'), chemDiagrams.saveSvg);
// 📚 ডায়াগ্রাম লাইব্রেরি (শিক্ষকের নিজের সংরক্ষিত ডায়াগ্রাম) — '/:id' রুটের আগে থাকা জরুরি
router.get('/diagrams', requireFeature('diagrams'), diagrams.list);
router.post('/diagrams', requireFeature('diagrams'), diagrams.create);
router.get('/diagrams/:did', requireFeature('diagrams'), diagrams.getOne);
router.patch('/diagrams/:did', requireFeature('diagrams'), diagrams.rename);
router.delete('/diagrams/:did', requireFeature('diagrams'), diagrams.remove);
router.get('/', requireFeature('manageExams'), ctrl.getMyExams);
router.post('/', requireFeature('createExam'), enforceExamLimit, ctrl.createExam); // 👈 শিক্ষক নিজে অনলাইনে MCQ প্রশ্ন লিখে পরীক্ষা তৈরি করার রুট
router.get('/attempts/:attemptId', requireFeature('results'), ctrl.getAttemptDetails);
router.get('/attempts/:attemptId/short-answers/review.pdf', requireFeature('results'), ctrl.exportShortAnswerReviewPdf);
router.post('/attempts/:attemptId/short-answers/suggest', requireFeature('results'), ctrl.suggestShortAnswerMarks);
router.patch('/attempts/:attemptId/short-answers', requireFeature('results'), ctrl.gradeShortAnswers);
router.get('/:id/feedback', requireFeature('examFeedback'), feedbackCtrl.getExamFeedback);

// ⏳ পেন্ডিং (অসম্পূর্ণ) পরীক্ষা — অনলাইনে তৈরির খসড়া
router.post('/pending', requireFeature('createExam'), ctrl.savePending);
router.get('/pending/:id', requireFeature('manageExams'), ctrl.getPending);
router.post('/pending/:id/finalize', requireFeature('createExam'), enforceExamLimit, ctrl.finalizePending);

// নির্দিষ্ট প্রশ্ন ম্যানেজমেন্ট রুট
router.put('/questions/:questionId', requireFeature('editQuestions'), ctrl.updateQuestion);
router.delete('/questions/:questionId', requireFeature('editQuestions'), ctrl.deleteQuestion);

// ==========================================
// ৪. পরীক্ষাভিত্তিক ডাইনামিক রুটসমূহ (Dynamic `/:id` Routes)
// ==========================================
router.get('/:id/source', requireFeature('manageExams'), ctrl.downloadSourceFile);
router.get('/:id', requireFeature('manageExams'), ctrl.getExamById);
router.put('/:id/settings', requireFeature('examSettings'), ctrl.updateExamSettings);
router.post('/:id/publish', requireFeature('manageExams'), ctrl.publishExam);
router.delete('/:id', requireFeature('manageExams'), ctrl.deleteExam);

// রিসোর্স সম্পর্কিত রুট
router.put('/:id/resource-link', requireFeature('resource'), ctrl.setResourceLink);
router.post('/:id/resource-pdf', requireFeature('resource'), upload.single('pdf'), ctrl.setResourcePdf);
router.delete('/:id/resource', requireFeature('resource'), ctrl.removeResource);

// পরীক্ষার প্রশ্ন ও রেজাল্ট রুট
router.post('/:id/questions', requireFeature('editQuestions'), ctrl.addQuestion);
router.put('/:id/questions/reorder', requireFeature('editQuestions'), ctrl.reorderQuestions);
router.get('/:id/pdf', requireFeature('downloadExamPdf'), ctrl.downloadExamPdf);
router.get('/:id/results', requireFeature('results'), ctrl.getExamResults);
router.get('/:id/results/export', requireFeature('exportResults'), ctrl.exportResultsExcel);
router.get('/:id/results/pdf', requireFeature('exportResults'), ctrl.exportResultsPdf);

module.exports = router;
