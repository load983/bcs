// ================== controllers/attemptController.js ==================
const fs = require('fs');
const path = require('path');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const { getTeacherStatus } = require('../utils/subscription');
const { registerFonts, writeText } = require('../utils/pdfFonts');
const messaging = require('../utils/messaging');
const { validateAnswerAnnotations } = require('../utils/answerAnnotations');

const MAX_ANSWER_FILE_DATA_CHARS = 2_000_000;
const MAX_ATTEMPT_ANSWER_DATA_CHARS = 5_000_000;
const ANSWER_FILE_RE = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/;

const DIAGRAM_RE = /^\/uploads\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i;
const DIAGRAM_DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function imageSource(value) {
  if (typeof value !== 'string') return null;
  const source = value.trim();
  if (DIAGRAM_DATA_RE.test(source) && source.length <= 1_500_000) return Buffer.from(source.split(',')[1], 'base64');
  if (DIAGRAM_RE.test(source)) {
    const file = path.join(__dirname, '..', source);
    return fs.existsSync(file) ? file : null;
  }
  return null;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- ১. Exam জয়েন করা ----------
exports.joinExam = async (req, res) => {
  try {
    // 🔒 লগইন বাধ্যতামূলক: স্টুডেন্টের পরিচয় টোকেন থেকে আসে (বডির studentId/নাম/রোল আর বিশ্বাস করা হয় না)
    const { examCode, accessCode } = req.body;
    const studentId = req.user.id;

    const account = await User.findById(studentId).select(
      'role name roll phone connectedTeachers connectedClasses bannedByTeachers'
    );
    if (!account || account.role !== 'student') {
      return res.status(403).json({ message: 'পরীক্ষা দিতে স্টুডেন্ট একাউন্টে লগইন করতে হবে' });
    }
    const studentName = account.name;
    const studentRoll = account.roll || '-';
    const studentPhone = account.phone || '';

    const exam = await Exam.findOne({ examCode });
    if (!exam || exam.status !== 'published')
      return res.status(400).json({ message: 'পরীক্ষাটি খুঁজে পাওয়া যায়নি বা চালু নেই' });

    if (exam.accessCode && exam.accessCode.trim() !== String(accessCode || '').trim())
      return res.status(401).json({
        message: accessCode ? 'ভুল Access Code' : 'এই পরীক্ষার জন্য Access Code দিতে হবে',
      });

    // 🚫 শিক্ষক ব্যান করলে এই শিক্ষকের কোনো পরীক্ষা দেওয়া যাবে না
    if ((account.bannedByTeachers || []).some((id) => id.toString() === exam.teacher.toString())) {
      return res.status(403).json({ message: 'শিক্ষক তোমাকে ব্যান করেছেন, তাই এই পরীক্ষা দিতে পারবে না' });
    }

    // 💳 শিক্ষকের সাবস্ক্রিপশনের মেয়াদ শেষ/স্থগিত হলে স্টুডেন্ট নতুন করে পরীক্ষা শুরু করতে পারবে না
    const teacherSub = await getTeacherStatus(exam.teacher);
    if (!teacherSub.isActive) {
      return res.status(403).json({
        code: 'TEACHER_SUBSCRIPTION_INACTIVE',
        message: 'এই শিক্ষকের সাবস্ক্রিপশনের মেয়াদ শেষ, তাই এখন পরীক্ষা দেওয়া যাচ্ছে না। শিক্ষকের সাথে যোগাযোগ করো',
      });
    }

    // 🎓 শ্রেণী-ভিত্তিক পরীক্ষায় ওই শ্রেণীর এক্সেস কোড যোগ করা আবশ্যক; শ্রেণীবিহীন পুরনো পরীক্ষায় শিক্ষকের পুরনো কোড
    const examClassIds = (exam.classRefs || []).map((id) => id.toString());
    const isConnected = examClassIds.length > 0
      ? (account.connectedClasses || []).some((id) => examClassIds.includes(id.toString()))
      : (account.connectedTeachers || []).some((id) => id.toString() === exam.teacher.toString());
    if (!isConnected) {
      return res.status(403).json({
        message: 'এই পরীক্ষা দিতে হলে আগে এই শ্রেণীর এক্সেস কোড যোগ করো (ড্যাশবোর্ডে "এক্সেস কোড যোগ করো" অপশনে)',
      });
    }

    const allowRepetition = exam.settings?.allowRepetition;
    const schedule = exam.settings?.schedule;
    if (schedule?.enabled && schedule.endAt && new Date() > new Date(schedule.endAt)) {
      return res.status(400).json({ message: 'পরীক্ষার সময় শেষ হয়ে গেছে' });
    }

    const studentQuery = { exam: exam._id, studentId };

    if (!allowRepetition) {
      const existing = await Attempt.findOne(studentQuery);
      if (existing && existing.status === 'submitted') {
        return res.status(400).json({ message: 'তুমি ইতিমধ্যে এই পরীক্ষা জমা দিয়েছো' });
      }
      if (existing && existing.status === 'in-progress') {
        const questions = await Question.find({ _id: { $in: existing.questionOrder } });
        return res.json(buildStudentExamPayload(exam, existing, questions));
      }
    } else {
      const existingInProgress = await Attempt.findOne({ ...studentQuery, status: 'in-progress' });
      if (existingInProgress) {
        const questions = await Question.find({ _id: { $in: existingInProgress.questionOrder } });
        return res.json(buildStudentExamPayload(exam, existingInProgress, questions));
      }
    }

    // 🗓️ শিডিউল চালু থাকলে নির্ধারিত সময়ের বাইরে নতুন করে পরীক্ষা শুরু করা যাবে না
    if (schedule?.enabled) {
      const now = new Date();
      if (schedule.startAt && now < new Date(schedule.startAt)) {
        return res.status(400).json({ message: 'পরীক্ষা এখনো শুরু হয়নি' });
      }
      if (schedule.endAt && now > new Date(schedule.endAt)) {
        return res.status(400).json({ message: 'পরীক্ষার সময় শেষ হয়ে গেছে' });
      }
    }

    let questions = await Question.find({ exam: exam._id }).sort({ order: 1 });

    const limit = exam.settings?.totalQuestionsToUse;
    if (limit && limit > 0 && limit < questions.length) {
      questions = shuffleArray(questions).slice(0, limit);
    }
    if (exam.settings?.shuffleQuestions) {
      questions = shuffleArray(questions);
    }

    const optionOrderMap = {};
    if (exam.settings?.shuffleOptions) {
      questions.forEach((q) => {
        if (q.type === 'short' || !Array.isArray(q.options) || q.options.length < 2) return;
        const indices = shuffleArray(q.options.map((_, i) => i));
        optionOrderMap[q._id.toString()] = indices;
      });
    }

    const attempt = await Attempt.create({
      exam: exam._id,
      studentId,
      studentName,
      studentRoll,
      studentPhone,
      ipAddress: req.ip,
      questionOrder: questions.map((q) => q._id),
      optionOrderMap,
      startedAt: new Date(),
      status: 'in-progress',
    });

    res.status(201).json(buildStudentExamPayload(exam, attempt, questions));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'তুমি ইতিমধ্যে এই পরীক্ষায় জয়েন করেছো' });
    }
    res.status(500).json({ message: err.message });
  }
};

// নিরাপদ সময় রিটার্ন করার ফাংশন
// কেমিস্ট্রি ডায়াগ্রাম: শিক্ষার্থীকে শুধু ছবির URL (ও আবার আঁকার SMILES) পাঠানো হয় — নাম/সমীকরণ নয়, যাতে উত্তরের ইঙ্গিত ফাঁস না হয়
const studentDiagrams = (q) => (q.diagrams && q.diagrams.length ? q.diagrams.map((d) => ({ svg: d.svg, smiles: d.smiles || undefined, conditions: d.conditions || undefined })) : undefined);
const resultsEnabled = (exam) => exam?.settings?.showResultInstantly !== false;
const isShortQuestion = (question, exam) => question?.type === 'short'
  || (exam?.settings?.questionType === 'short' && (!Array.isArray(question?.options) || question.options.length === 0));

async function hasPendingShortReview(attempt, exam) {
  const questionIds = [...new Set([
    ...(attempt?.questionOrder || []).map(String),
    ...(attempt?.answers || []).map((answer) => String(answer.question || '')).filter(Boolean),
  ])];
  const questions = await Question.find({ _id: { $in: questionIds } }).select('_id type options').lean();
  const shortIds = new Set(questions.filter((question) => isShortQuestion(question, exam)).map((question) => String(question._id)));
  return (attempt?.answers || []).some((answer) => {
    if (!shortIds.has(String(answer.question))) return false;
    const hasResponse = String(answer.answerText || '').trim().length > 0 || (answer.answerFiles || []).length > 0;
    return hasResponse && answer.reviewed !== true;
  });
}
// Keep written-answer scores private until every non-empty short answer on this
// attempt has been reviewed. Original exam-file access uses a separate endpoint.
async function resultsVisibleForAttempt(attempt, exam) {
  if (!resultsEnabled(exam)) return false;
  return !(await hasPendingShortReview(attempt, exam));
}
const attemptExpired = (attempt, exam, now = Date.now()) => {
  if (!exam || !attempt?.startedAt) return true;
  const startedAt = new Date(attempt.startedAt).getTime();
  if (!Number.isFinite(startedAt)) return true;
  const configuredMinutes = Number(exam.settings?.totalTimeMinutes);
  const minutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 10;
  if (now - startedAt > minutes * 60 * 1000 + 15000) return true;
  const schedule = exam.settings?.schedule;
  const scheduleEnd = schedule?.enabled && schedule.endAt ? new Date(schedule.endAt).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(scheduleEnd) && now > scheduleEnd;
};

function buildStudentExamPayload(exam, attempt, questions) {
  const optionOrderMap = attempt.optionOrderMap || {};
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const orderedQuestions = (attempt.questionOrder || []).map((id) => byId.get(String(id))).filter(Boolean);
  const safeQuestions = orderedQuestions.map((q) => {
    const order = optionOrderMap[q._id.toString()];
    const options = order ? order.map((i) => q.options[i]) : (q.options || []);
    const imgs = q.optionImages && q.optionImages.length ? (order ? order.map((i) => q.optionImages[i] || '') : q.optionImages) : undefined;
    const short = isShortQuestion(q, exam);
    return { _id: q._id, type: short ? 'short' : (q.type || 'mcq'), maxMarks: Number(exam.settings?.marksPerQuestion) || 1, questionText: q.questionText, questionAudio: q.questionAudio || undefined, diagram: q.diagram || undefined, diagrams: studentDiagrams(q), options, optionImages: imgs };
  });

  // সময় ০ বা undefined হলে ডিফল্ট ১০ মিনিট দেখাবে
  const configuredMinutes = Number(exam.settings?.totalTimeMinutes);
  const timeLimit = Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 10;
  const parsedStart = new Date(attempt.startedAt).getTime();
  const safeStart = Number.isFinite(parsedStart) ? parsedStart : Date.now();
  const durationDeadline = safeStart + timeLimit * 60 * 1000;
  const parsedScheduleEnd = exam.settings?.schedule?.enabled && exam.settings.schedule.endAt
    ? new Date(exam.settings.schedule.endAt).getTime()
    : Number.POSITIVE_INFINITY;
  const scheduledDeadline = Number.isFinite(parsedScheduleEnd) ? parsedScheduleEnd : Number.POSITIVE_INFINITY;
  const deadlineAt = Math.min(durationDeadline, scheduledDeadline);

  // রিফ্রেশ/পুনরায় জয়েন করলেও আগের দেওয়া উত্তর ফেরত যাবে (লক থাকার জন্য)
  const answers = {};
  const shortAnswers = {};
  (attempt.answers || []).forEach((a) => {
    const qid = a.question.toString();
    if (String(a.answerText || '').trim() || (a.answerFiles || []).length) {
      shortAnswers[qid] = { answerText: a.answerText || '', answerFiles: a.answerFiles || [] };
    }
    if (a.selectedOptionIndex === null || a.selectedOptionIndex === undefined) return;
    const order = optionOrderMap[qid];
    answers[qid] = order ? order.indexOf(a.selectedOptionIndex) : a.selectedOptionIndex;
  });

  return {
    attemptId: attempt._id,
    examTitle: exam.title,
    totalTimeMinutes: timeLimit,
    startedAt: Number.isFinite(parsedStart) ? attempt.startedAt : new Date(safeStart),
    deadlineAt: new Date(deadlineAt).toISOString(),
    serverNow: new Date().toISOString(),
    questions: safeQuestions,
    answers,
    shortAnswers,
  };
}

exports.resumeAttempt = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'in-progress' || attempt.submittedAt) {
      return res.status(409).json({ message: 'এই পরীক্ষা এখন আর চালু নেই' });
    }
    const exam = await Exam.findById(attempt.exam);
    if (!exam) return res.status(404).json({ message: 'পরীক্ষাটি পাওয়া যায়নি' });
    const questions = await Question.find({ _id: { $in: attempt.questionOrder } });
    return res.json(buildStudentExamPayload(exam, attempt, questions));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'পরীক্ষার উত্তর ফেরত আনতে সমস্যা হয়েছে' });
  }
};

// ---------- 🔒 মালিকানা চেক: attempt-টি লগইন করা স্টুডেন্টের নিজের কিনা ----------
const mongooseIsValidId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));
async function loadOwnAttempt(req, res) {
  const { attemptId } = req.params;
  if (!mongooseIsValidId(attemptId)) {
    res.status(404).json({ message: 'Attempt পাওয়া যায়নি' });
    return null;
  }
  const attempt = await Attempt.findById(attemptId);
  // অন্যের attempt হলে "নেই" বলা হয়, যাতে আইডি আছে কিনা বোঝা না যায়
  if (!attempt || !attempt.studentId || String(attempt.studentId) !== String(req.user.id)) {
    res.status(404).json({ message: 'Attempt পাওয়া যায়নি' });
    return null;
  }
  return attempt;
}

// ---------- ২. উত্তর সেভ করা ----------
exports.saveAnswer = async (req, res) => {
  try {
    let attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    const { questionId, selectedOptionIndex, answerText, answerFiles } = req.body || {};

    if (attempt.status === 'submitted')
      return res.status(400).json({ message: 'পরীক্ষা ইতিমধ্যে জমা হয়ে গেছে' });

    // ⏱ সার্ভারে সময় যাচাই (টাইমার শুধু ব্রাউজারে চললে বাইপাস করা যায়) — নেটওয়ার্ক দেরির জন্য ১৫ সেকেন্ড ছাড়
    const exam = await Exam.findById(attempt.exam).select('settings');
    if (attemptExpired(attempt, exam)) {
      return res.status(403).json({ message: 'পরীক্ষার সময় শেষ, আর উত্তর দেওয়া যাবে না' });
    }

    // প্রশ্নটি অবশ্যই এই attempt-এর প্রশ্নতালিকায় থাকতে হবে
    const qid = String(questionId || '');
    if (!attempt.questionOrder.some((q) => String(q) === qid)) {
      return res.status(400).json({ message: 'এই প্রশ্নটি এই পরীক্ষার অংশ নয়' });
    }

    // অপশন ইনডেক্স: null (স্কিপ) অথবা প্রশ্নের অপশন-সংখ্যার মধ্যে একটি পূর্ণসংখ্যা
    const question = await Question.findById(qid).select('type options');
    const isShort = isShortQuestion(question, exam);
    if (isShort) {
      if (typeof answerText === 'string' && answerText.length > 20000) {
        return res.status(400).json({ message: 'লিখিত উত্তরের সীমা ২০,০০০ অক্ষর; সংক্ষিপ্ত করে আবার চেষ্টা করুন' });
      }
      const text = typeof answerText === 'string' ? answerText : '';
      if (Array.isArray(answerFiles) && answerFiles.length > 5) return res.status(400).json({ message: 'সর্বোচ্চ ৫টি ছবি/PDF সংযুক্ত করা যাবে' });
      const files = [];
      for (const file of Array.isArray(answerFiles) ? answerFiles : []) {
        const mime = String(file?.mime || '').toLowerCase();
        const data = String(file?.data || '');
        const match = data.match(ANSWER_FILE_RE);
        if (!match || match[1] !== mime || data.length > MAX_ANSWER_FILE_DATA_CHARS) {
          return res.status(400).json({ message: 'প্রতিটি ছবি/PDF সঠিক format-এ এবং সর্বোচ্চ ১.৪ MB হতে হবে' });
        }
        files.push({ name: String(file.name || 'answer').slice(0, 120), mime, data });
      }

      // A blank draft is valid when clearing an existing response; it is not
      // stored when the student has not answered this question yet.
      if (!text.trim() && !files.length && !attempt.answers.some((a) => String(a.question) === qid)) {
        return res.json({ message: 'সেভ হয়েছে', hasResponse: false });
      }
      for (let retry = 0; retry < 5; retry += 1) {
        if (retry) attempt = await Attempt.findById(attempt._id);
        if (!attempt || attempt.status !== 'in-progress' || attempt.submittedAt) {
          return res.status(409).json({ message: 'পরীক্ষা জমা হয়েছে; আর উত্তর পরিবর্তন করা যাবে না' });
        }
        const existing = attempt.answers.find((a) => String(a.question) === qid);
        const aggregateChars = attempt.answers.reduce((sum, answer) => sum + (String(answer.question) === qid ? 0 : (answer.answerFiles || []).reduce((n, item) => n + String(item.data || '').length, 0)), 0)
          + files.reduce((sum, file) => sum + file.data.length, 0);
        if (aggregateChars > MAX_ATTEMPT_ANSWER_DATA_CHARS) {
          return res.status(413).json({ message: 'সব উত্তরের সংযুক্ত ফাইলের মোট আকার বেশি। ফাইল ছোট করুন বা কম ফাইল দিন।' });
        }
        if (existing) {
          existing.answerText = text;
          existing.answerFiles = files;
        } else {
          attempt.answers.push({ question: qid, answerText: text, answerFiles: files, selectedOptionIndex: null });
        }
        const saved = await Attempt.findOneAndUpdate(
          { _id: attempt._id, status: 'in-progress', submittedAt: { $exists: false }, __v: attempt.__v },
          { $set: { answers: attempt.answers }, $inc: { __v: 1 } },
          { new: true }
        );
        if (saved) return res.json({ message: 'সেভ হয়েছে', hasResponse: !!(text.trim() || files.length) });
      }
      return res.status(409).json({ message: 'একসাথে অনেক উত্তর সেভ হচ্ছে; আবার চেষ্টা করুন' });
    }
    const optCount = question?.options?.length || 0;
    const isNull = selectedOptionIndex === null || selectedOptionIndex === undefined;
    if (!isNull && !(Number.isInteger(selectedOptionIndex) && selectedOptionIndex >= 0 && selectedOptionIndex < optCount)) {
      return res.status(400).json({ message: 'অপশন সঠিক নয়' });
    }

    const orderMap = attempt.optionOrderMap?.[qid];
    const originalIndex = isNull ? null : orderMap ? orderMap[selectedOptionIndex] : selectedOptionIndex;
    if (!isNull && (originalIndex === undefined || originalIndex === null)) {
      return res.status(400).json({ message: 'অপশন সঠিক নয়' });
    }

    for (let retry = 0; retry < 5; retry += 1) {
      if (retry) attempt = await Attempt.findById(attempt._id);
      if (!attempt || attempt.status !== 'in-progress' || attempt.submittedAt) {
        return res.status(409).json({ message: 'পরীক্ষা জমা হয়েছে; আর উত্তর দেওয়া যাবে না' });
      }
      const existingAnswer = attempt.answers.find((a) => String(a.question) === qid);
      if (existingAnswer?.selectedOptionIndex !== null && existingAnswer?.selectedOptionIndex !== undefined) {
        return res.status(409).json({ message: 'এই প্রশ্নের উত্তর ইতিমধ্যে দেওয়া হয়েছে, আর পরিবর্তন করা যাবে না' });
      }
      if (existingAnswer) existingAnswer.selectedOptionIndex = originalIndex;
      else attempt.answers.push({ question: qid, selectedOptionIndex: originalIndex });
      const saved = await Attempt.findOneAndUpdate(
        { _id: attempt._id, status: 'in-progress', submittedAt: { $exists: false }, __v: attempt.__v },
        { $set: { answers: attempt.answers }, $inc: { __v: 1 } },
        { new: true }
      );
      if (saved) return res.json({ message: 'সেভ হয়েছে' });
    }
    return res.status(409).json({ message: 'একসাথে অনেক উত্তর সেভ হচ্ছে; আবার চেষ্টা করুন' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৩. Submit করা ----------
exports.submitAttempt = async (req, res) => {
  try {
    let attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;

    const exam = await Exam.findById(attempt.exam);
    if (!exam) return res.status(410).json({ message: 'এই পরীক্ষাটি আর পাওয়া যাচ্ছে না' });

    if (attempt.status === 'submitted')
      return res.json(await buildResultPayload(attempt, exam, await resultsVisibleForAttempt(attempt, exam)));

    // Claim the attempt before grading. Answer saves require submittedAt to be absent,
    // so any save racing this transition either commits first or is rejected.
    if (!attempt.submittedAt) {
      const claimed = await Attempt.findOneAndUpdate(
        { _id: attempt._id, status: 'in-progress', submittedAt: { $exists: false } },
        { $set: { submittedAt: new Date(), autoSubmitted: attemptExpired(attempt, exam) } },
        { new: true }
      );
      if (claimed) attempt = claimed;
      else {
        attempt = await Attempt.findById(attempt._id);
        if (!attempt) return res.status(404).json({ message: 'Attempt পাওয়া যায়নি' });
        if (attempt.status === 'submitted') return res.json(await buildResultPayload(attempt, exam, await resultsVisibleForAttempt(attempt, exam)));
        if (!attempt.submittedAt) return res.status(409).json({ message: 'পরীক্ষা জমা দেওয়ার সময় দ্বন্দ্ব হয়েছে, আবার চেষ্টা করুন' });
      }
    }
    const expired = !!attempt.autoSubmitted;
    const questions = await Question.find({ _id: { $in: attempt.questionOrder } });
    const qMap = {};
    questions.forEach((q) => (qMap[q._id.toString()] = q));

    let correct = 0, wrong = 0, skipped = 0, shortMarks = 0;
    const marksPerQ = exam.settings?.marksPerQuestion || 1;
    const negEnabled = exam.settings?.negativeMarking?.enabled || false;
    const negMarks = exam.settings?.negativeMarking?.marksPerWrong || 0;

    attempt.questionOrder.forEach((qId) => {
      const q = qMap[qId.toString()];
      const ans = attempt.answers.find((a) => a.question.toString() === qId.toString());
      const isShortQuestion = q?.type === 'short'
        || (exam.settings?.questionType === 'short' && (!Array.isArray(q?.options) || q.options.length === 0));
      if (isShortQuestion) {
        if (!ans || (!String(ans.answerText || '').trim() && !ans.answerFiles?.length)) {
          skipped += 1;
          return;
        }
        if (Number.isFinite(Number(ans.marksAwarded))) shortMarks += Math.max(0, Number(ans.marksAwarded));
        return;
      }
      if (!ans || ans.selectedOptionIndex === null || ans.selectedOptionIndex === undefined) { skipped += 1; return; }
      // A question may have been deleted after this attempt started. It is no
      // longer gradable and must not accidentally count as a correct answer.
      if (!q) {
        ans.isCorrect = false;
        skipped += 1;
        return;
      }

      const isCorrect = ans.selectedOptionIndex === q.correctOptionIndex;
      ans.isCorrect = isCorrect;
      if (isCorrect) correct += 1;
      else wrong += 1;
    });

    const totalQ = attempt.questionOrder.length;
    const obtainedMarks = correct * marksPerQ + shortMarks - (negEnabled ? wrong * negMarks : 0);

    attempt.totalCorrect = correct;
    attempt.totalWrong = wrong;
    attempt.totalSkipped = skipped;
    attempt.obtainedMarks = Math.round(obtainedMarks * 100) / 100;
    // Finalization is idempotent; concurrent submitters share the server claim and score.
    const finalized = await Attempt.findOneAndUpdate(
      { _id: attempt._id, status: 'in-progress', submittedAt: attempt.submittedAt },
      { $set: { totalCorrect: correct, totalWrong: wrong, totalSkipped: skipped, obtainedMarks: Math.round(obtainedMarks * 100) / 100, autoSubmitted: expired, status: 'submitted', answers: attempt.answers } },
      { new: true }
    );
    const resultAttempt = finalized || await Attempt.findById(attempt._id);
    if (!resultAttempt || resultAttempt.status !== 'submitted') return res.status(409).json({ message: 'পরীক্ষার ফল জমা দেওয়া যায়নি, আবার চেষ্টা করুন' });
    if (finalized && await resultsVisibleForAttempt(resultAttempt, exam)) {
      User.findById(resultAttempt.studentId).select('phone parentPhone').lean().then(async (student) => {
        const config = await messaging.config();
        if (config.smsResultEnabled === false) return;
        await messaging.sendSmsToUsers([student || { phone: resultAttempt.studentPhone }], `ফলাফল: ${exam.title}। প্রাপ্ত নম্বর ${resultAttempt.obtainedMarks}, সঠিক ${resultAttempt.totalCorrect}, ভুল ${resultAttempt.totalWrong}।`);
      }).catch((error) => console.error('result SMS notification failed:', error.message));
    }
    res.json(await buildResultPayload(resultAttempt, exam, await resultsVisibleForAttempt(resultAttempt, exam)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function buildResultPayload(attempt, exam, showInstantly = true) {
  const resource =
    exam?.resource?.kind === 'link'
      ? { kind: 'link', link: exam.resource.link }
      : exam?.resource?.kind === 'pdf'
      ? { kind: 'pdf', pdfName: exam.resource.pdfOriginalName }
      : null;

  const payload = {
    attemptId: attempt._id,
    showInstantly,
    examId: exam?._id,
    examTitle: exam?.title || '',
    isShortExam: exam?.settings?.questionType === 'short' || exam?.questionType === 'short',
    hasOriginalSource: !!(exam?.sourcePdfPath && fs.existsSync(exam.sourcePdfPath)),
    showLeaderboard: !!exam?.settings?.showLeaderboard,
    submittedAt: attempt.submittedAt,
    resource,
    reviewPending: !showInstantly && resultsEnabled(exam) ? await hasPendingShortReview(attempt, exam) : false,
  };

  // Keep the submit response useful while withholding all scored result
  // details until the teacher enables instant result visibility.
  if (showInstantly) {
    payload.totalCorrect = attempt.totalCorrect;
    payload.totalWrong = attempt.totalWrong;
    payload.totalSkipped = attempt.totalSkipped;
    payload.obtainedMarks = attempt.obtainedMarks;
    payload.totalMarks = (attempt.questionOrder?.length || 0) * (Number(exam?.settings?.marksPerQuestion) || 1);
  }
  return payload;
}

exports.getAttemptResult = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'submitted') return res.status(400).json({ message: 'পরীক্ষা এখনো জমা হয়নি' });
    const exam = await Exam.findById(attempt.exam);
    if (!exam) return res.status(404).json({ message: 'পরীক্ষাটি পাওয়া যায়নি' });
    return res.json(await buildResultPayload(attempt, exam, await resultsVisibleForAttempt(attempt, exam)));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'ফলাফল আনতে সমস্যা হয়েছে' });
  }
};

// ---------- ৪. Result PDF ডাউনলোড ----------
exports.downloadResultPdf = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'submitted')
      return res.status(400).json({ message: 'পরীক্ষা এখনো জমা হয়নি' });

    const exam = await Exam.findById(attempt.exam);
    if (!(await resultsVisibleForAttempt(attempt, exam))) {
      return res.status(403).json({ message: 'ফলাফল এখনো প্রকাশ করা হয়নি' });
    }
    const questions = await Question.find({ _id: { $in: attempt.questionOrder } });
    const qMap = {};
    questions.forEach((q) => (qMap[q._id.toString()] = q));

    res.setHeader('Content-Type', 'application/pdf');
    const preview = ['1', 'true', 'yes'].includes(String(req.query.preview || '').toLowerCase());
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename=result-${attempt.studentRoll}.pdf`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    // বাংলা + ইংরেজি + সূত্র (H₂O, x², √, π ...) সবই যেন ঠিকভাবে আসে: মিশ্র-ফন্ট লেখা
    const fonts = registerFonts(doc);
    const W = (text, size, opts) => { doc.fontSize(size); writeText(doc, fonts, text, opts); };

    W(exam.title, 18, { align: 'center' });
    doc.moveDown();
    W(`নাম: ${attempt.studentName}    রোল: ${attempt.studentRoll}`, 12);
    W(
      `প্রাপ্ত নম্বর: ${attempt.obtainedMarks} | সঠিক: ${attempt.totalCorrect} | ভুল: ${attempt.totalWrong} | স্কিপ: ${attempt.totalSkipped}`,
      12
    );
    doc.moveDown();

    attempt.questionOrder.forEach((qId, idx) => {
      const q = qMap[qId.toString()];
      const ans = attempt.answers.find((a) => a.question.toString() === qId.toString());
      if (!q) {
        doc.moveDown(0.5);
        W(`${idx + 1}. প্রশ্নটি আর পাওয়া যাচ্ছে না`, 11);
        return;
      }
      const short = isShortQuestion(q, exam);
      const hasResponse = !!(String(ans?.answerText || '').trim() || ans?.answerFiles?.length);

      doc.moveDown(0.5);
      W(`${idx + 1}. ${q.questionText}`, 11);
      const questionImage = imageSource(q.diagram);
      if (questionImage) {
        try {
          if (doc.y + 150 > doc.page.height - doc.page.margins.bottom) doc.addPage();
          const imageY = doc.y;
          doc.image(questionImage, doc.page.margins.left + 12, imageY, { fit: [240, 140] });
          doc.y = imageY + 146;
          doc.x = doc.page.margins.left;
        } catch { /* ছবি না বসলে লেখা PDF চলবে */ }
      }
      (short ? [] : (Array.isArray(q.options) ? q.options : [])).forEach((opt, i) => {
        W(`   ${String.fromCharCode(65 + i)}. ${opt}`, 10);
        const optionImage = imageSource(q.optionImages?.[i]);
        if (optionImage) {
          try {
            if (doc.y + 90 > doc.page.height - doc.page.margins.bottom) doc.addPage();
            const imageY = doc.y;
            doc.image(optionImage, doc.page.margins.left + 28, imageY, { fit: [150, 85] });
            doc.y = imageY + 90;
            doc.x = doc.page.margins.left;
          } catch { /* ছবি না বসলে লেখা PDF চলবে */ }
        }
      });
      if (short) {
        doc.fillColor('black');
        W(`   তোমার উত্তর: ${hasResponse ? (ans.answerText || 'ফাইল সংযুক্ত') : 'স্কিপ'}`, 10);
        if (ans?.marksAwarded !== null && ans?.marksAwarded !== undefined) W(`   প্রাপ্ত নম্বর: ${ans.marksAwarded}`, 10);
        (ans?.answerFiles || []).forEach((file) => {
          W(`   সংযুক্ত উত্তর: ${file.name || 'ফাইল'}`, 9);
          if (String(file.mime || '').startsWith('image/')) {
            const match = String(file.data || '').match(ANSWER_FILE_RE);
            if (match) {
              try {
                if (doc.y + 180 > doc.page.height - doc.page.margins.bottom) doc.addPage();
                const y = doc.y;
                doc.image(Buffer.from(match[3], 'base64'), doc.page.margins.left + 12, y, { fit: [300, 170] });
                doc.y = y + 176;
                doc.x = doc.page.margins.left;
              } catch { /* invalid image bytes do not break the result PDF */ }
            }
          }
        });
      } else {
        const correctLetter = Number.isInteger(q.correctOptionIndex) ? String.fromCharCode(65 + q.correctOptionIndex) : '—';
        const studentLetter = ans && ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== undefined
          ? String.fromCharCode(65 + ans.selectedOptionIndex) : 'স্কিপ';
        doc.fillColor(ans?.isCorrect ? 'green' : 'red');
        W(`   তোমার উত্তর: ${studentLetter}  |  সঠিক উত্তর: ${correctLetter}`, 10);
        doc.fillColor('black');
      }
      if (q.explanation) {
        W(`   ব্যাখ্যা: ${q.explanation}`, 9.5);
      }
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৫. অতিরিক্ত Resource PDF ডাউনলোড ----------
exports.downloadResourcePdf = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'submitted')
      return res.status(400).json({ message: 'পরীক্ষা এখনো জমা হয়নি' });

    const exam = await Exam.findById(attempt.exam);
    if (!exam?.resource || exam.resource.kind !== 'pdf' || !exam.resource.pdfPath) {
      return res.status(404).json({ message: 'কোনো PDF পাওয়া যায়নি' });
    }
    if (!fs.existsSync(exam.resource.pdfPath)) {
      return res.status(404).json({ message: 'PDF ফাইলটি সার্ভারে খুঁজে পাওয়া যায়নি' });
    }

    res.download(exam.resource.pdfPath, exam.resource.pdfOriginalName || 'resource.pdf');
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৫.৫ পরীক্ষা জমা দেওয়ার পর মূল আপলোড ফাইল ডাউনলোড ----------
exports.downloadOriginalSourcePdf = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'submitted') {
      return res.status(400).json({ message: 'পরীক্ষা এখনো জমা হয়নি' });
    }

    const exam = await Exam.findById(attempt.exam).select('title sourcePdfPath');
    if (!exam?.sourcePdfPath) {
      return res.status(404).json({ message: 'মূল আপলোড PDF পাওয়া যায়নি' });
    }
    if (!fs.existsSync(exam.sourcePdfPath)) {
      return res.status(404).json({ message: 'মূল আপলোড PDF ফাইলটি সার্ভারে খুঁজে পাওয়া যায়নি' });
    }

    const extension = path.extname(exam.sourcePdfPath).toLowerCase() || '.pdf';
    const safeTitle = String(exam.title || 'exam')
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'exam';
    return res.download(exam.sourcePdfPath, `${safeTitle}-original${extension}`);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'মূল আপলোড PDF ডাউনলোড করা যায়নি' });
  }
};

// ---------- ৬. Review ডাটা ফেচ করা ----------
exports.getAttemptReview = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req, res);
    if (!attempt) return;
    if (attempt.status !== 'submitted')
      return res.status(400).json({ message: 'পরীক্ষা এখনো জমা হয়নি' });

    const exam = await Exam.findById(attempt.exam);
    if (!(await resultsVisibleForAttempt(attempt, exam))) {
      return res.status(403).json({ message: 'ফলাফল এখনো প্রকাশ করা হয়নি' });
    }
    const questions = await Question.find({ _id: { $in: attempt.questionOrder } });
    const qMap = {};
    questions.forEach((q) => (qMap[q._id.toString()] = q));

    const items = attempt.questionOrder.map((qId, idx) => {
      const q = qMap[qId.toString()];
      const ans = attempt.answers.find((a) => a.question.toString() === qId.toString());
      if (!q) {
        return {
          serial: idx + 1,
          questionText: 'প্রশ্নটি আর পাওয়া যাচ্ছে না',
          options: [],
          correctOptionIndex: null,
          selectedOptionIndex: null,
          status: 'unavailable',
          explanation: null,
        };
      }
      const selectedOptionIndex =
        ans && ans.selectedOptionIndex !== null && ans.selectedOptionIndex !== undefined
          ? ans.selectedOptionIndex
          : null;

      const short = isShortQuestion(q, exam);
      const hasResponse = !!(String(ans?.answerText || '').trim() || ans?.answerFiles?.length);
      return {
        serial: idx + 1,
        questionText: q.questionText,
        questionAudio: q.questionAudio || undefined,
        explanationAudio: q.explanationAudio || undefined,
        diagram: q.diagram || undefined,
        diagrams: studentDiagrams(q),
        options: q.options,
        optionImages: q.optionImages && q.optionImages.length ? q.optionImages : undefined,
        correctOptionIndex: q.correctOptionIndex,
        selectedOptionIndex,
        answerText: ans?.answerText || '',
        answerFiles: ans?.answerFiles || [],
        annotations: ans?.annotations || {},
        marksAwarded: ans?.marksAwarded !== null && ans?.marksAwarded !== undefined && Number.isFinite(Number(ans.marksAwarded)) ? Number(ans.marksAwarded) : null,
        status: short ? (hasResponse ? 'answered' : 'skipped') : selectedOptionIndex === null ? 'skipped' : ans.isCorrect ? 'correct' : 'wrong',
        explanation: q.explanation || null,
        explanationMedia: q.explanationMedia || [],
      };
    });

    res.json({ examTitle: exam.title, teacherFeedback: attempt.teacherFeedback || '', teacherFeedbackMedia: attempt.teacherFeedbackMedia || [], items });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৭.৫ লগইন করা স্টুডেন্টের নিজের অতীত পরীক্ষার তালিকা (Past Exam) ----------
// ✅ শুধু জমা দেওয়া (submitted) পরীক্ষাগুলোই দেখাবে, বিস্তারিত রেজাল্টসহ।
// ✅ শিক্ষক allowRepetition অন রাখলে ফ্রন্টএন্ডে "আবার পরীক্ষা দাও" বাটন দেখানোর জন্য examCode ও allowRepetition ফ্ল্যাগ পাঠানো হচ্ছে।
exports.getMyAttempts = async (req, res) => {
  try {
    const attempts = await Attempt.find({ studentId: req.user.id, status: 'submitted' })
      .select('-teacherFeedbackMedia')
      .sort({ submittedAt: -1 })
      .lean();

    const examIds = [...new Set(attempts.map((a) => a.exam.toString()))];
    const exams = await Exam.find({ _id: { $in: examIds } })
      .select('title examCode status questionType sourcePdfPath settings.questionType settings.allowRepetition settings.showResultInstantly settings.showLeaderboard')
      .lean();

    const examMap = {};
    exams.forEach((e) => (examMap[e._id.toString()] = e));

    const result = await Promise.all(attempts.map(async (a) => {
      const exam = examMap[a.exam.toString()] || {};
      const reviewPending = resultsEnabled(exam) ? await hasPendingShortReview(a, exam) : false;
      const payload = {
        attemptId: a._id,
        examId: a.exam,
        examTitle: exam.title || '',
        examCode: exam.examCode || '',
        examStatus: exam.status || null,
        isShortExam: exam.settings?.questionType === 'short' || exam.questionType === 'short',
        hasOriginalSource: !!(exam.sourcePdfPath && fs.existsSync(exam.sourcePdfPath)),
        allowRepetition: !!exam.settings?.allowRepetition,
        showResultInstantly: resultsEnabled(exam) && !reviewPending,
        reviewPending,
        showLeaderboard: !!exam.settings?.showLeaderboard,
        totalQuestions: a.questionOrder?.length || 0,
        submittedAt: a.submittedAt,
      };
      // This historical-results endpoint must obey the same server-side
      // visibility setting as submit, review, and PDF endpoints.
      if (payload.showResultInstantly) {
        payload.totalCorrect = a.totalCorrect;
        payload.totalWrong = a.totalWrong;
        payload.totalSkipped = a.totalSkipped;
        payload.obtainedMarks = a.obtainedMarks;
      }
      return payload;
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message || 'অতীত পরীক্ষার তালিকা আনতে সমস্যা হয়েছে' });
  }
};

// ---------- ৭. টিচারের জন্য রেজাল্ট লিস্ট ----------
exports.getTeacherExamDashboardResults = async (req, res) => {
  try {
    const { examId } = req.params;

    const attempts = await Attempt.find({ exam: examId, status: 'submitted' })
      .populate('studentId', 'name email rollNumber')
      .sort({ obtainedMarks: -1, submittedAt: 1 });

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৮. লিডারবোর্ড (শিক্ষার্থীদের জন্য) ----------
// ✅ শিক্ষক লিডারবোর্ড অন করলেই কেবল দেখা যাবে; অফ থাকলে 403।
// ✅ যে শিক্ষার্থী ওই পরীক্ষা জমা দিয়েছে শুধু সে-ই দেখতে পারবে।
// ✅ Repetition অন থাকলে একই শিক্ষার্থীর সবচেয়ে ভালো নম্বরের attempt-টাই গণনা হয় (একজন একবারই আসবে)।
// ✅ ক্রম: বেশি নম্বর আগে; নম্বর সমান হলে যে কম সময়ে শেষ করেছে সে আগে।
exports.getLeaderboard = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId).select('title settings.showLeaderboard settings.showResultInstantly settings.questionType');
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });

    if (!exam.settings?.showLeaderboard) {
      return res.status(403).json({ message: 'এই পরীক্ষার লিডারবোর্ড বন্ধ আছে', disabled: true });
    }
    if (exam.settings?.showResultInstantly === false) {
      return res.status(403).json({ message: 'ফলাফল প্রকাশ না হওয়া পর্যন্ত লিডারবোর্ড দেখা যাবে না', disabled: true });
    }

    const attempts = await Attempt.find({ exam: exam._id, status: 'submitted' })
      .select('studentId studentName studentRoll obtainedMarks startedAt submittedAt questionOrder answers')
      .lean();

    const pendingReviews = await Promise.all(attempts.map((attempt) => hasPendingShortReview(attempt, exam)));
    if (pendingReviews.some(Boolean)) {
      return res.status(403).json({ message: 'সব short question-এর নম্বর দেওয়ার পর লিডারবোর্ড প্রকাশিত হবে', disabled: true });
    }

    const myId = String(req.user.id);
    const iParticipated = attempts.some((a) => a.studentId && String(a.studentId) === myId);
    if (!iParticipated) {
      return res.status(403).json({ message: 'লিডারবোর্ড দেখতে আগে পরীক্ষাটি দিতে হবে' });
    }

    const duration = (a) =>
      a.submittedAt && a.startedAt ? new Date(a.submittedAt) - new Date(a.startedAt) : Number.MAX_SAFE_INTEGER;
    const isBetter = (a, b) =>
      a.obtainedMarks > b.obtainedMarks || (a.obtainedMarks === b.obtainedMarks && duration(a) < duration(b));

    // প্রতিজন শিক্ষার্থীর সেরা attempt
    const best = new Map();
    attempts.forEach((a) => {
      const key = a.studentId ? String(a.studentId) : `roll:${a.studentRoll}`;
      const cur = best.get(key);
      if (!cur || isBetter(a, cur)) best.set(key, a);
    });

    const sorted = [...best.values()].sort((a, b) =>
      b.obtainedMarks !== a.obtainedMarks ? b.obtainedMarks - a.obtainedMarks : duration(a) - duration(b)
    );

    const entries = sorted.map((a, i) => ({
      rank: i + 1,
      name: a.studentName,
      roll: a.studentRoll,
      isMe: !!a.studentId && String(a.studentId) === myId,
    }));

    const me = entries.find((e) => e.isMe);
    res.json({
      examTitle: exam.title,
      total: entries.length,
      myRank: me ? me.rank : null,
      entries,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
