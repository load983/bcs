// ================== routes/authRoutes.js ==================
const express = require('express');
const router = express.Router();
const { 
  registerTeacher, 
  loginTeacher, 
  loginAdmin,
  registerStudent, 
  loginStudent, 
  getAllStudents, 
  exportStudentsExcel,
  connectTeacher,
  setStudentBan,
  updateStudentRoll,
  getStudentProfile,
  getMyClasses,
  disconnectClass,
  requestPasswordReset,
  resetPassword,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { requireFeature } = require('../middleware/feature');
const dataExport = require('../controllers/dataExportController');
const upload = require('../middleware/upload');
const accounts = require('../controllers/accountProvisionController');
const limits = require('../middleware/rateLimits');

// Teacher Auth Routes
router.post('/teacher/register', limits.registration, registerTeacher);
router.post('/teacher/login', limits.login, loginTeacher);
router.post('/teacher/forgot-password', limits.passwordReset, requestPasswordReset);
router.post('/teacher/reset-password', limits.passwordReset, resetPassword);

// Admin Auth Route
router.post('/admin/login', limits.adminLogin, loginAdmin);

// Student Auth Routes
router.post('/student/register', limits.registration, registerStudent);
router.post('/student/login', limits.login, loginStudent);
router.get('/my-data/export', protect, authorize('teacher', 'student'), dataExport.exportMyData);
// (গেস্ট কুইক-লগইন বন্ধ: পরীক্ষা দিতে রেজিস্টার্ড একাউন্টে লগইন বাধ্যতামূলক)

// Student: শিক্ষকের এক্সেস কোড যোগ/বাতিল ও যুক্ত শিক্ষকদের তালিকা
router.post('/student/connect-teacher', protect, authorize('student'), limits.registration, connectTeacher);
router.get('/student/my-classes', protect, authorize('student'), getMyClasses);
router.get('/student/profile', protect, authorize('student'), getStudentProfile);
router.delete('/student/classes/:classId', protect, authorize('student'), disconnectClass);

// Teacher Dashboard Student Management Routes (শুধু নিজের সাথে যুক্ত স্টুডেন্ট)
router.get('/students', protect, authorize('teacher'), requireSubscription, requireFeature('students'), getAllStudents);
router.post('/students/create', protect, authorize('teacher'), requireSubscription, requireFeature('students'), accounts.teacherCreateStudent);
router.post('/students/bulk-create', protect, authorize('teacher'), requireSubscription, requireFeature('students'), accounts.teacherBulkCreate);
router.post('/students/import', protect, authorize('teacher'), requireSubscription, requireFeature('students'), upload.dataImport.single('file'), accounts.teacherImport);
router.get('/students/import-template', protect, authorize('teacher'), requireSubscription, requireFeature('students'), accounts.studentImportTemplate);
router.get('/students/export', protect, authorize('teacher'), requireSubscription, requireFeature('exportStudents'), exportStudentsExcel);
router.get('/students/credentials/export', protect, authorize('teacher'), requireSubscription, requireFeature('exportStudents'), accounts.teacherExcel);
router.get('/students/credentials/pdf', protect, authorize('teacher'), requireSubscription, requireFeature('exportStudents'), accounts.teacherPdf);
router.patch('/students/:id/ban', protect, authorize('teacher'), requireSubscription, requireFeature('students'), setStudentBan);
router.patch('/students/:id/roll', protect, authorize('teacher'), requireSubscription, requireFeature('students'), updateStudentRoll);

module.exports = router;
