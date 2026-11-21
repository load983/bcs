// ================== routes/attemptRoutes.js ==================
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/attemptController');
const feedbackCtrl = require('../controllers/examFeedbackController');
const { protect, authorize } = require('../middleware/auth');

// এই রুটগুলো পাবলিক (Student এর জন্য) — শুধু examCode/accessCode দিয়ে সুরক্ষিত
// 🔒 পরীক্ষায় জয়েন করতে স্টুডেন্ট একাউন্টে লগইন বাধ্যতামূলক
router.post('/join', protect, authorize('student'), ctrl.joinExam);

// লগইন করা স্টুডেন্টের নিজের অতীত পরীক্ষার তালিকা (ড্যাশবোর্ডের "Past exam" অপশন)
router.get('/my', protect, authorize('student'), ctrl.getMyAttempts);
// 🏆 লিডারবোর্ড — শিক্ষক অন করলে শিক্ষার্থীরা নাম, রোল ও তম দেখতে পারবে
router.get('/leaderboard/:examId', protect, authorize('student'), ctrl.getLeaderboard);
// 🔒 নিচের সবগুলোতে স্টুডেন্ট লগইন লাগবে এবং attempt-টি অবশ্যই তার নিজের হতে হবে (কন্ট্রোলারে মালিকানা চেক হয়)
const own = [protect, authorize('student')];
router.put('/:attemptId/answer', ...own, ctrl.saveAnswer);
router.post('/:attemptId/submit', ...own, ctrl.submitAttempt);
router.get('/:attemptId/download-pdf', ...own, ctrl.downloadResultPdf);
router.get('/:attemptId/resource-pdf', ...own, ctrl.downloadResourcePdf);
router.get('/:attemptId/source-pdf', ...own, ctrl.downloadOriginalSourcePdf);
router.get('/:attemptId/review', ...own, ctrl.getAttemptReview);
router.get('/:attemptId/feedback', ...own, feedbackCtrl.getMyFeedback);
router.put('/:attemptId/feedback', ...own, feedbackCtrl.saveMyFeedback);

module.exports = router;
