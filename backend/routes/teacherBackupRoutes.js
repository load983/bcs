const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const controller = require('../controllers/teacherBackupController');

router.use(protect, authorize('teacher'));
router.get('/export', controller.exportBackup);
router.post('/restore', upload.teacherBackup.single('backup'), controller.restoreBackup);

module.exports = router;
