const mongoose = require('mongoose');
const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const ExamFeedback = require('../models/ExamFeedback');

const getOwnSubmittedAttempt = async (req, res) => {
  const { attemptId } = req.params;
  if (!mongoose.isValidObjectId(attemptId)) {
    res.status(404).json({ message: 'পরীক্ষার রেকর্ড পাওয়া যায়নি' });
    return null;
  }
  const attempt = await Attempt.findOne({
    _id: attemptId,
    studentId: req.user.id,
    status: 'submitted',
  }).select('_id exam studentId studentName studentRoll status').lean();
  if (!attempt) {
    res.status(404).json({ message: 'জমা দেওয়া পরীক্ষার রেকর্ড পাওয়া যায়নি' });
    return null;
  }
  return attempt;
};

exports.getMyFeedback = async (req, res) => {
  try {
    const attempt = await getOwnSubmittedAttempt(req, res);
    if (!attempt) return;
    const feedback = await ExamFeedback.findOne({ attempt: attempt._id }).select('body createdAt updatedAt').lean();
    res.json({ feedback: feedback || null });
  } catch (err) {
    res.status(500).json({ message: 'মন্তব্য লোড করা যায়নি' });
  }
};

exports.saveMyFeedback = async (req, res) => {
  try {
    const attempt = await getOwnSubmittedAttempt(req, res);
    if (!attempt) return;
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ message: 'মন্তব্য লিখুন' });
    if (body.length > 1000) return res.status(400).json({ message: 'মন্তব্য সর্বোচ্চ ১০০০ অক্ষরের হতে পারে' });

    const feedback = await ExamFeedback.findOneAndUpdate(
      { attempt: attempt._id },
      {
        $set: {
          exam: attempt.exam,
          attempt: attempt._id,
          studentId: attempt.studentId,
          studentName: attempt.studentName,
          studentRoll: attempt.studentRoll,
          body,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).select('body createdAt updatedAt').lean();
    res.json({ feedback, message: 'মন্তব্য সেভ হয়েছে' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'মন্তব্য একসঙ্গে আপডেট হয়েছে; আবার চেষ্টা করুন' });
    res.status(500).json({ message: 'মন্তব্য সেভ করা যায়নি' });
  }
};

const POSITIVE = ['ভালো', 'ভাল', 'দারুণ', 'সহজ', 'চমৎকার', 'উপকারী', 'স্পষ্ট', 'great', 'good', 'easy', 'excellent', 'helpful', 'clear', 'interesting'];
const CRITICAL = ['কঠিন', 'সমস্যা', 'ভুল', 'কম সময়', 'সময় কম', 'সময় কম', 'অস্পষ্ট', 'খারাপ', 'কঠোর', 'hard', 'difficult', 'problem', 'wrong', 'confusing', 'unclear', 'bad', 'too long', 'not enough time'];
const TOPICS = [
  { key: 'difficulty', terms: ['কঠিন', 'সহজ', 'difficulty', 'hard', 'easy', 'difficult'] },
  { key: 'time', terms: ['সময়', 'সময়', 'time', 'minute', 'মিনিট', 'তাড়াতাড়ি'] },
  { key: 'questions', terms: ['প্রশ্ন', 'অপশন', 'উত্তর', 'question', 'option', 'answer', 'ভুল'] },
  { key: 'coverage', terms: ['সিলেবাস', 'অধ্যায়', 'অধ্যায়', 'chapter', 'syllabus', 'topic'] },
  { key: 'technical', terms: ['লোড', 'লগইন', 'ইন্টারনেট', 'load', 'login', 'internet', 'technical', 'সমস্যা'] },
];

const analyze = (comments) => {
  const sentiment = { positive: 0, neutral: 0, critical: 0, mixed: 0 };
  const topicCounts = Object.fromEntries(TOPICS.map(({ key }) => [key, 0]));
  for (const comment of comments) {
    const text = comment.body.toLowerCase();
    const positive = POSITIVE.some((term) => text.includes(term));
    const critical = CRITICAL.some((term) => text.includes(term));
    sentiment[positive && critical ? 'mixed' : positive ? 'positive' : critical ? 'critical' : 'neutral'] += 1;
    for (const topic of TOPICS) if (topic.terms.some((term) => text.includes(term))) topicCounts[topic.key] += 1;
  }
  const topics = Object.entries(topicCounts).map(([key, count]) => ({ key, count })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  return { total: comments.length, sentiment, topics, method: 'keyword-based' };
};

exports.getExamFeedback = async (req, res) => {
  try {
    const { examId } = req.params;
    if (!mongoose.isValidObjectId(examId)) return res.status(404).json({ message: 'পরীক্ষাটি পাওয়া যায়নি' });
    const exam = await Exam.findOne({ _id: examId, teacher: req.user.id }).select('_id').lean();
    if (!exam) return res.status(404).json({ message: 'পরীক্ষাটি পাওয়া যায়নি' });
    const [total, comments] = await Promise.all([
      ExamFeedback.countDocuments({ exam: exam._id }),
      ExamFeedback.find({ exam: exam._id })
        .select('studentName studentRoll body createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
    ]);
    const analysis = analyze(comments);
    analysis.total = total;
    analysis.sampleSize = comments.length;
    res.json({ comments, analysis });
  } catch (err) {
    res.status(500).json({ message: 'মন্তব্য বিশ্লেষণ করা যায়নি' });
  }
};
