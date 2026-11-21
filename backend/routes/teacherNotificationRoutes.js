// ================== routes/teacherNotificationRoutes.js ==================
// শিক্ষকের নোটিফিকেশন ও ডিভাইস পুশ। এখানে requireSubscription ইচ্ছা করেই নেই —
// মেয়াদ শেষ হয়ে গেলেও শিক্ষক যেন নোটিফিকেশন দেখতে ও পুশ চালু করতে পারে।
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/teacherNotificationController');
const msg = require('../controllers/messageController'); // পুশ সাবস্ক্রিপশনের হ্যান্ডলার ইউজার-আইডি দিয়েই কাজ করে, role লাগে না

router.use(protect, authorize('teacher'));

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/seen', ctrl.markSeen);

router.get('/push/key', msg.getPushKey);
router.post('/push/subscribe', msg.subscribePush);
router.post('/push/unsubscribe', msg.unsubscribePush);

module.exports = router;
