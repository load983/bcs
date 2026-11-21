const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const upload = require('../middleware/upload');
const { requireFeature } = require('../middleware/feature');
const ctrl = require('../controllers/messageController');

// multer-এর এরর (ভুল ফাইল/বড় ছবি) সুন্দরভাবে JSON-এ ফেরত দেয়
const imageUpload = (req, res, next) =>
  upload.image.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'ছবি সর্বোচ্চ ৫ MB হতে পারবে' : err.message });
    next();
  });
const mediaUpload = (req, res, next) =>
  upload.notificationMedia.fields([{ name: 'files', maxCount: 8 }, { name: 'image', maxCount: 1 }])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'প্রতি ভিডিও/ছবি সর্বোচ্চ ৫০ MB হতে পারবে' : err.message });
    req.notificationFiles = [...(req.files?.files || []), ...(req.files?.image || [])];
    next();
  });

// ---------- স্টুডেন্ট ----------
router.get('/student/feed', protect, authorize('student'), ctrl.getFeed);
router.get('/student/unread-count', protect, authorize('student'), ctrl.getUnreadCount);
router.post('/student/seen', protect, authorize('student'), ctrl.markSeen);
router.get('/push/key', protect, authorize('student'), ctrl.getPushKey);
router.post('/push/subscribe', protect, authorize('student'), ctrl.subscribePush);
router.post('/push/unsubscribe', protect, authorize('student'), ctrl.unsubscribePush);

// ---------- শিক্ষক ----------
router.use(protect, authorize('teacher'), requireSubscription);
router.get('/', requireFeature('messages'), ctrl.getMyMessages);
router.post('/', requireFeature('messages'), mediaUpload, ctrl.createMessage);
router.put('/:id', requireFeature('messages'), mediaUpload, ctrl.updateMessage);
router.delete('/:id', requireFeature('messages'), ctrl.deleteMessage);

module.exports = router;
