const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const controller = require('../controllers/roleBackupController');
const User = require('../models/User');

const onlyOwnerAdmin = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user.id).select('email role');
    const configured = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!admin || admin.role !== 'admin' || !configured || String(admin.email || '').toLowerCase() !== configured) return res.status(403).json({ message: 'এই কাজের জন্য অনুমতি নেই' });
    next();
  } catch (_) { res.status(500).json({ message: 'Admin যাচাই করতে সমস্যা হয়েছে' }); }
};

router.get('/admin/export', protect, authorize('admin'), onlyOwnerAdmin, controller.exportAdmin);
router.post('/admin/restore', protect, authorize('admin'), onlyOwnerAdmin, upload.roleBackup.single('backup'), controller.restoreAdmin);
router.get('/student/export', protect, authorize('student'), controller.exportStudent);
router.post('/student/restore', protect, authorize('student'), upload.roleBackup.single('backup'), controller.restoreStudent);
module.exports = router;
