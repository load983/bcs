const { rateLimit } = require('express-rate-limit');

const limiter = (max, windowMs, message) => rateLimit({
  windowMs,
  limit: max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message },
});

module.exports = {
  login: limiter(10, 15 * 60 * 1000, 'অনেকবার চেষ্টা করা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন'),
  adminLogin: limiter(5, 15 * 60 * 1000, 'অনেকবার চেষ্টা করা হয়েছে, ১৫ মিনিট পরে আবার চেষ্টা করুন'),
  registration: limiter(20, 60 * 60 * 1000, 'অনেকবার অ্যাকাউন্ট তৈরির চেষ্টা হয়েছে, পরে আবার চেষ্টা করুন'),
  passwordReset: limiter(5, 15 * 60 * 1000, 'অনেকবার পাসওয়ার্ড রিসেট চাওয়া হয়েছে, পরে আবার চেষ্টা করুন'),
};
