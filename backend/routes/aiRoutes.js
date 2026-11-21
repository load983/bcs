// ================== routes/aiRoutes.js ==================
// AI সহকারী — লগইন ছাড়াও (গেস্ট) ব্যবহার করা যায়; লগইন থাকলে role অনুযায়ী উত্তর ও বেশি লিমিট
const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/aiController');

router.post('/chat', optionalAuth, ctrl.chat);

module.exports = router;
