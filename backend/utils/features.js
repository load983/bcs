// ================== utils/features.js ==================
// শিক্ষকের যেসব ফিচার অ্যাডমিন "Test Web" (ফ্রি ট্রায়াল)-এ আলাদা করে চালু/বন্ধ করতে পারে।
// এক্সাম প্রকাশ/মুছা এখন manageExams-এর অধীনে; স্টুডেন্টের পরীক্ষা দেওয়া সবসময় চালু থাকে।
const FEATURE_CATALOG_VERSION = 3;
// Version-1 trial snapshots predate these keys. They retain their historical full access
// until expiry instead of being locked merely because the catalog grew.
const FEATURE_INTRODUCED_IN = { manageExams: 2, aiAssistant: 2, examFeedback: 3 };
const TEACHER_FEATURES = [
  { key: 'createExam', label: 'অনলাইনে MCQ পরীক্ষা তৈরি', desc: 'নিজে প্রশ্ন লিখে পরীক্ষা বানানো ও খসড়া সেভ' },
  { key: 'uploadExam', label: 'PDF/Word আপলোড করে পরীক্ষা', desc: 'ফাইল থেকে অটোমেটিক প্রশ্ন তৈরি' },
  { key: 'downloadExamPdf', label: 'পরীক্ষার PDF ডাউনলোড', desc: 'তৈরি করা পরীক্ষার প্রশ্নপত্র / উত্তরসহ PDF নামানো' },
  { key: 'results', label: 'রেজাল্ট দেখা', desc: 'স্টুডেন্টদের রেজাল্ট ও উত্তরপত্র দেখা' },
  { key: 'exportResults', label: 'রেজাল্ট Excel ডাউনলোড', desc: 'পরীক্ষার রেজাল্ট এক্সেলে নামানো' },
  { key: 'classes', label: 'শ্রেণী ও এক্সেস কোড তৈরি', desc: 'নতুন শ্রেণী খোলা/মুছা ও এক্সেস কোড' },
  { key: 'students', label: 'স্টুডেন্ট তালিকা ও ব্যান', desc: 'যুক্ত স্টুডেন্ট দেখা, ব্যান/আনব্যান' },
  { key: 'exportStudents', label: 'স্টুডেন্ট তালিকা Excel ডাউনলোড', desc: 'স্টুডেন্টদের তালিকা এক্সেলে নামানো' },
  { key: 'resource', label: 'পরীক্ষার রিসোর্স (লিংক/PDF)', desc: 'পরীক্ষার সাথে স্টাডি ম্যাটেরিয়াল যুক্ত করা' },
  { key: 'diagrams', label: 'ডায়াগ্রাম স্টুডিও ও লাইব্রেরি', desc: 'প্রশ্নে ডায়াগ্রাম আঁকা/আপলোড করা ও নিজের ডায়াগ্রাম লাইব্রেরি' },
  { key: 'editQuestions', label: 'প্রশ্ন যোগ/এডিট/সাজানো', desc: 'তৈরি পরীক্ষায় প্রশ্ন যোগ, সম্পাদনা, মোছা ও ক্রম বদলানো' },
  { key: 'examSettings', label: 'পরীক্ষার সেটিংস', desc: 'পরীক্ষার সময়, শিডিউল ও অন্যান্য সেটিংস বদলানো' },
  { key: 'messages', label: 'স্টুডেন্টদের মেসেজ/নোটিফিকেশন', desc: 'ক্লাসের স্টুডেন্টদের মেসেজ ও ছবি পাঠানো, এডিট/ডিলিট' },
  { key: 'manageExams', label: 'শিক্ষকের পরীক্ষা ম্যানেজমেন্ট', desc: 'নিজের পরীক্ষার তালিকা/বিস্তারিত দেখা, পাবলিশ ও মুছে ফেলা' },
  { key: 'aiAssistant', label: 'AI সহকারী (শুধু শিক্ষক)', desc: 'লগইন করা শিক্ষক হিসেবে AI সহকারী ব্যবহার' },
  { key: 'examFeedback', label: 'পরীক্ষার কমেন্ট ও বিশ্লেষণ', desc: 'শিক্ষার্থীদের মন্তব্য দেখা, sentiment ও বিষয়ভিত্তিক সারাংশ' },
];

const FEATURE_KEYS = TEACHER_FEATURES.map((f) => f.key);
const featureLabel = (key) => TEACHER_FEATURES.find((f) => f.key === key)?.label || key;
const isFeatureEnabled = (subscription, key) => {
  if (!subscription || !subscription.featureLimited) return true;
  const version = Number(subscription.catalogVersion) || 1;
  if (version < (FEATURE_INTRODUCED_IN[key] || 1)) return true;
  return (subscription.features || []).includes(key);
};

module.exports = { TEACHER_FEATURES, FEATURE_KEYS, FEATURE_CATALOG_VERSION, FEATURE_INTRODUCED_IN, featureLabel, isFeatureEnabled };
