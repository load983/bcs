// ================== controllers/examController.js ==================
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto'); // nanoid-এর ESM কনফ্লিক্ট এড়াতে Node.js বিল্ট-ইন crypto
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const User = require('../models/User');
const Class = require('../models/Class');
const { extractQuestionsFromFile } = require('../utils/pdfParser');
const { generateResultExcel } = require('../utils/excelExport');
const PDFDocument = require('pdfkit');
const { registerFonts, writeText } = require('../utils/pdfFonts');
const { getTeacherStatus, getActiveTeacherIds } = require('../utils/subscription');
const { isFeatureEnabled } = require('../utils/features');
const { announceExamPublished } = require('./messageController');
const Announcement = require('../models/Announcement');

// 8 অক্ষরের ইউনিক এক্সাম কোড তৈরি করার হেলপার ফাংশন
const generateExamCode = () => crypto.randomBytes(4).toString('hex');

// হেলপার ফাংশন: সেফলি ফাইল ডিলিট করার জন্য
const safeDeleteFile = (filePath) => {
  if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error(`File deletion error (${filePath}):`, err.message);
    });
  }
};

// হেলপার: classIds (অ্যারে / JSON স্ট্রিং / কমা-সেপারেটেড স্ট্রিং) থেকে আইডির তালিকা বের করা
const parseClassIds = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      /* কমা দিয়ে আলাদা করা স্ট্রিং */
    }
    return raw.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
};

// হেলপার: নির্বাচিত সব শ্রেণী এই শিক্ষকের কিনা যাচাই করা (কমপক্ষে একটি আবশ্যক)
const validateClassesForTeacher = async (teacherId, rawIds) => {
  const ids = [...new Set(parseClassIds(rawIds).map(String))];
  if (ids.length === 0 || ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { error: 'পরীক্ষার জন্য কমপক্ষে একটি শ্রেণী নির্বাচন করা আবশ্যক' };
  }
  const classes = await Class.find({ _id: { $in: ids }, teacher: teacherId }).select('_id');
  if (classes.length !== ids.length) {
    return { error: 'নির্বাচিত কোনো শ্রেণী পাওয়া যায়নি' };
  }
  return { ids: classes.map((c) => c._id) };
};

const isSafeResourceLink = (value) => {
  if (typeof value !== 'string' || value.trim().length > 2048) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// ---------- ১. PDF আপলোড করে নতুন Exam তৈরি করা ----------
exports.uploadExamPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'PDF অথবা Word ফাইল আবশ্যক' });
    }

    // 🎓 শ্রেণী নির্বাচন আবশ্যক
    const classCheck = await validateClassesForTeacher(req.user.id, req.body.classIds);
    if (classCheck.error) {
      if (req.file.path) safeDeleteFile(req.file.path);
      return res.status(400).json({ message: classCheck.error });
    }

    const questionType = req.body.questionType || 'mcq';
    if (!['mcq', 'short'].includes(questionType)) {
      if (req.file.path) safeDeleteFile(req.file.path);
      return res.status(400).json({ message: 'প্রশ্নের ধরন সঠিক নয়' });
    }

    const title = req.body.title || req.file.originalname.replace(/\.(pdf|docx?)$/i, '');
    
    // PDF / Word থেকে প্রশ্ন পার্স করা (ফাইলের এক্সটেনশন দেখে পার্সার বাছাই হয়)
    const parsedQuestions = await extractQuestionsFromFile(req.file.path || req.file.buffer, req.file.originalname, questionType);

    if (!parsedQuestions || parsedQuestions.length === 0) {
      if (req.file.path) safeDeleteFile(req.file.path);
      return res.status(400).json({
        message: questionType === 'short'
          ? 'ফাইল থেকে কোনো short question পার্স করা যায়নি। প্রতিটি প্রশ্ন নতুন লাইনে 1. প্রশ্ন বা ১। প্রশ্ন ফরম্যাটে লিখুন।'
          : 'ফাইল থেকে কোনো MCQ পার্স করা যায়নি। ফরম্যাট চেক করো: "1. প্রশ্ন? A. ... B. ... C. ... D. ... Answer: C"',
      });
    }

    const examCode = generateExamCode();

    const exam = await Exam.create({
      teacher: req.user.id,
      title,
      classRefs: classCheck.ids,
      sourcePdfPath: req.file.path || null,
      examCode,
      status: 'draft',
      settings: {
        questionType,
        totalTimeMinutes: 10, // ডিফল্ট সময় ১০ মিনিট দেওয়া হলো
      }
    });

    const questionDocs = parsedQuestions.map((q, index) => ({
      ...q,
      exam: exam._id,
      type: q.type || 'mcq',
      order: q.order !== undefined ? q.order : index,
    }));

    await Question.insertMany(questionDocs);

    res.status(201).json({ exam, questionCount: questionDocs.length });
  } catch (err) {
    if (req.file?.path) safeDeleteFile(req.file.path);
    res.status(500).json({ message: err.message || 'PDF আপলোড করতে সমস্যা হয়েছে' });
  }
};

// প্রশ্নের ডায়াগ্রাম: শুধু আমাদের আপলোড-করা ছবির পাথ গ্রহণযোগ্য (অন্য কোনো লিংক/স্ক্রিপ্ট নয়)
const DIAGRAM_RE = /^\/uploads\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i; // পুরনো পাথ-ভিত্তিক ছবি
const DIAGRAM_DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/; // ছবি সরাসরি প্রশ্নের সাথেই সংরক্ষিত
const cleanDiagram = (v) => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (DIAGRAM_RE.test(s)) return s;
  if (s.length <= 1_500_000 && DIAGRAM_DATA_RE.test(s)) return s;
  return undefined;
};

// অপশনের ছবি: options-এর সাথে একই দৈর্ঘ্যের তালিকা; প্রতিটি ছোট data URL (বা ফাঁকা)। একটাও না থাকলে undefined
const OPT_IMG_MAX = 400_000;
const cleanOptionImages = (arr, len) => {
  if (!Array.isArray(arr)) return undefined;
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const v = typeof arr[i] === 'string' ? arr[i].trim() : '';
    out.push(v && v.length <= OPT_IMG_MAX && DIAGRAM_DATA_RE.test(v) ? v : '');
  }
  return out.some(Boolean) ? out : undefined;
};
// অপশন "ভরা" ধরা হবে যদি লেখা বা ছবি থাকে
const optFilled = (q, i) => !!String(q.options?.[i] || '').trim() || !!(q.optionImages && q.optionImages[i]);

// Question ডকুমেন্টে ফাঁকা slot রাখা যাবে না। মূল index ধরে আগে validation করে,
// তারপর শুধু ভরা option/image compact করা হয় এবং সঠিক উত্তরটির নতুন index বের করা হয়।
const normalizeQuestionOptions = (rawOptions, rawOptionImages, rawCorrectOptionIndex) => {
  if (!Array.isArray(rawOptions) || !Number.isInteger(rawCorrectOptionIndex)) return null;

  const optionImages = cleanOptionImages(rawOptionImages, rawOptions.length) || [];
  if (rawCorrectOptionIndex < 0 || rawCorrectOptionIndex >= rawOptions.length) return null;
  if (!optFilled({ options: rawOptions, optionImages }, rawCorrectOptionIndex)) return null;

  const options = [];
  const images = [];
  let correctOptionIndex = -1;
  rawOptions.forEach((rawOption, index) => {
    const option = String(rawOption ?? '').trim();
    const image = optionImages[index] || '';
    if (!option && !image) return;
    if (index === rawCorrectOptionIndex) correctOptionIndex = options.length;
    options.push(option);
    images.push(image);
  });

  if (options.length < 2 || correctOptionIndex < 0) return null;
  return {
    options,
    optionImages: images.some(Boolean) ? images : undefined,
    correctOptionIndex,
  };
};

const normalizeAuthoringQuestion = (q) => {
  if (!q || typeof q.questionText !== 'string' || !q.questionText.trim()) return null;
  if (q.type === 'short') {
    return { ...q, type: 'short', questionText: q.questionText.trim(), options: undefined, optionImages: undefined, correctOptionIndex: undefined, explanation: q.explanation ? String(q.explanation).trim() : undefined };
  }
  const normalized = normalizeQuestionOptions(q.options, q.optionImages, q.correctOptionIndex);
  if (!normalized) return null;
  return {
    ...q,
    questionText: q.questionText.trim(),
    ...normalized,
    explanation: q.explanation ? String(q.explanation).trim() : undefined,
  };
};

// স্টুডিও প্রজেক্ট (সম্পাদনার জন্য): শুধু বৈধ JSON অ্যারে, সর্বোচ্চ ~৯০০ KB
const cleanDiagramSource = (v) => {
  if (typeof v !== 'string' || !v || v.length > 900_000) return undefined;
  try { return Array.isArray(JSON.parse(v)) ? v : undefined; } catch (e) { return undefined; }
};

// কেমিস্ট্রি ডায়াগ্রাম তালিকা: শুধু আমাদের /uploads/diagrams/<hash>.svg পাথ গ্রহণযোগ্য; সর্বোচ্চ ৮টি; ডুপ্লিকেট বাদ
const CHEM_SVG_RE = /^\/uploads\/diagrams\/[a-f0-9]{32}\.svg$/;
const cleanDiagrams = (arr) => {
  if (!Array.isArray(arr)) return undefined;
  const out = [];
  const seen = new Set();
  for (const d of arr.slice(0, 16)) {
    if (!d || typeof d !== 'object') continue;
    const svg = typeof d.svg === 'string' ? d.svg.trim() : '';
    if (!CHEM_SVG_RE.test(svg) || seen.has(svg)) continue;
    seen.add(svg);
    const cut = (v, n) => String(v ?? '').slice(0, n);
    out.push({ id: cut(d.id, 80), name: cut(d.name, 160), svg, smiles: cut(d.smiles, 800), conditions: cut(d.conditions, 300), equation: cut(d.equation, 500) });
    if (out.length >= 8) break;
  }
  return out.length ? out : undefined;
};

// Diagram-bearing fields can arrive as uploaded paths, data URLs, chemistry SVG
// references, option images, or a studio source. Compare normalized content so
// text-only edits can preserve an existing diagram on a locked trial.
const diagramSignature = (q = {}) => JSON.stringify({
  diagram: cleanDiagram(q.diagram) || '',
  diagramSource: cleanDiagramSource(q.diagramSource) || '',
  diagrams: cleanDiagrams(q.diagrams) || [],
  optionImages: cleanOptionImages(q.optionImages, Array.isArray(q.options) ? q.options.length : (Array.isArray(q.optionImages) ? q.optionImages.length : 0)) || [],
});
const hasDiagramContent = (q = {}) => diagramSignature(q) !== JSON.stringify({ diagram: '', diagramSource: '', diagrams: [], optionImages: [] });
const diagramsChangedWhileLocked = (req, incoming, previous = []) => {
  if (isFeatureEnabled(req.subscription, 'diagrams')) return false;
  const next = Array.isArray(incoming) ? incoming : [incoming];
  return next.some((q, i) => diagramSignature(q) !== diagramSignature(previous[i] || {}) && hasDiagramContent(q));
};
const diagramLocked = (res) => res.status(403).json({
  code: 'FEATURE_LOCKED',
  feature: 'diagrams',
  message: 'ফ্রি ট্রায়ালে "ডায়াগ্রাম স্টুডিও ও লাইব্রেরি" ফিচারটি চালু নেই। ব্যবহার করতে একটি সাবস্ক্রিপশন নিন।',
});

// ---------- ১.৫ সরাসরি অনলাইনে (ম্যানুয়ালি টাইপ করে) নতুন Exam তৈরি করা ----------
exports.createExam = async (req, res) => {
  try {
    const { title, questions } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'পরীক্ষার নাম আবশ্যক' });
    }

    const classCheck = await validateClassesForTeacher(req.user.id, req.body.classIds);
    if (classCheck.error) return res.status(400).json({ message: classCheck.error });

    // প্রশ্ন দেওয়া হলে exam তৈরির আগেই সব valid প্রশ্ন বের করতে হবে, নইলে
    // invalid-only request একটি orphan empty exam রেখে যেত।
    const hasSuppliedQuestions = Array.isArray(questions) && questions.length > 0;
    const validQuestions = hasSuppliedQuestions
      ? questions.map(normalizeAuthoringQuestion).filter(Boolean)
      : [];
    if (hasSuppliedQuestions && validQuestions.length === 0) {
      return res.status(400).json({ message: 'কমপক্ষে একটি সম্পূর্ণ প্রশ্ন (দুটি অপশন ও সঠিক উত্তরসহ) থাকতে হবে' });
    }
    if (diagramsChangedWhileLocked(req, validQuestions)) return diagramLocked(res);

    const examCode = generateExamCode();
    const exam = await Exam.create({
      teacher: req.user.id,
      title: String(title).trim(),
      classRefs: classCheck.ids,
      examCode,
      status: 'draft',
      settings: {
        totalTimeMinutes: 10, // ডিফল্ট সময় ১০ মিনিট
      },
    });

    let questionCount = 0;
    if (validQuestions.length > 0) {
      const questionDocs = validQuestions.map((q, index) => ({
        exam: exam._id,
        questionText: q.questionText,
        type: q.type || 'mcq',
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        explanation: q.explanation,
        diagram: cleanDiagram(q.diagram),
        diagramSource: cleanDiagram(q.diagram) ? cleanDiagramSource(q.diagramSource) : undefined,
        diagrams: cleanDiagrams(q.diagrams),
        optionImages: q.optionImages,
        order: index,
      }));
      await Question.insertMany(questionDocs);
      questionCount = questionDocs.length;
    }

    res.status(201).json({ exam, questionCount });
  } catch (err) {
    res.status(500).json({ message: err.message || 'পরীক্ষা তৈরি করতে সমস্যা হয়েছে' });
  }
};

// ---------- ⏳ পেন্ডিং (অসম্পূর্ণ) পরীক্ষা ----------
// তালিকায় পাঠানোর সময় ভারী draftData বাদ দিয়ে শুধু প্রশ্নসংখ্যা পাঠানো হয়
const summarizeExam = (exam) => {
  const o = typeof exam.toObject === 'function' ? exam.toObject() : { ...exam };
  if (o.pending) {
    o.pendingQuestionCount = Array.isArray(o.draftData?.questions) ? o.draftData.questions.length : 0;
  }
  delete o.draftData;
  return o;
};

const cutStr = (v, max) => String(v ?? '').slice(0, max);

// ফর্মের লেখা যেমন আছে তেমন রাখা হয় (ট্রিম/ফিল্টার ছাড়া), শুধু আকার ও ধরন নিরাপদ করা হয়
const sanitizeDraft = async (teacherId, body = {}) => {
  const rawIds = parseClassIds(body.classIds).map(String).filter((id) => mongoose.Types.ObjectId.isValid(id));
  let classIds = [];
  if (rawIds.length) {
    const found = await Class.find({ _id: { $in: rawIds }, teacher: teacherId }).select('_id');
    classIds = found.map((c) => String(c._id));
  }
  const questions = (Array.isArray(body.questions) ? body.questions : []).slice(0, 500).map((q) => {
    const type = q?.type === 'short' ? 'short' : 'mcq';
    const options = (Array.isArray(q?.options) ? q.options : ['', '']).slice(0, 12).map((o) => cutStr(o, 2000));
    while (options.length < 2) options.push('');
    let idx = Number(q?.correctOptionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) idx = 0;
    return {
      type,
      questionText: cutStr(q?.questionText, 5000),
      options: type === 'short' ? [] : options,
      correctOptionIndex: type === 'short' ? undefined : idx,
      explanation: cutStr(q?.explanation, 5000),
      optionImages: cleanOptionImages(q?.optionImages, options.length) || [],
      diagram: cleanDiagram(q?.diagram) || '',
      diagramSource: (cleanDiagram(q?.diagram) && cleanDiagramSource(q?.diagramSource)) || '',
      diagrams: cleanDiagrams(q?.diagrams) || [],
    };
  });
  return { title: cutStr(body.title, 300), classIds, questions };
};

const draftHasContent = (d) =>
  !!d.title.trim() ||
  d.questions.some((q) => q.questionText.trim() || q.explanation.trim() || q.diagram || (q.diagrams || []).length || q.options.some((o) => o.trim()) || (q.optionImages || []).some(Boolean));

// পেন্ডিং পরীক্ষা তৈরি/আপডেট (ফর্ম অসম্পূর্ণ থাকলেও চলবে; সীমা গণনায় ধরা হয় না)
exports.savePending = async (req, res) => {
  try {
    const draft = await sanitizeDraft(req.user.id, req.body);
    const id = req.body?.id;
    let exam = null;

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ code: 'PENDING_NOT_FOUND', message: 'পেন্ডিং পরীক্ষা পাওয়া যায়নি' });
      }
      exam = await Exam.findOne({ _id: id, teacher: req.user.id, pending: true });
      if (!exam) {
        return res.status(404).json({ code: 'PENDING_NOT_FOUND', message: 'পেন্ডিং পরীক্ষা পাওয়া যায়নি' });
      }
    } else {
      if (!draftHasContent(draft)) {
        return res.status(400).json({ message: 'সংরক্ষণ করার মতো কিছু লেখা হয়নি' });
      }
      exam = new Exam({
        teacher: req.user.id,
        examCode: generateExamCode(),
        status: 'draft',
        pending: true,
        settings: { totalTimeMinutes: 10 },
      });
    }

    if (diagramsChangedWhileLocked(req, draft.questions, exam?.draftData?.questions || [])) return diagramLocked(res);

    exam.title = draft.title.trim() || 'শিরোনামহীন পরীক্ষা';
    exam.draftData = draft;
    exam.markModified('draftData');
    await exam.save();

    res.json({ exam: summarizeExam(exam) });
  } catch (err) {
    res.status(500).json({ message: err.message || 'পেন্ডিং হিসেবে সংরক্ষণ করতে সমস্যা হয়েছে' });
  }
};

// একটি পেন্ডিং পরীক্ষার সংরক্ষিত ফর্ম ফেরত (এডিটের জন্য)
exports.getPending = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = mongoose.Types.ObjectId.isValid(id)
      ? await Exam.findOne({ _id: id, teacher: req.user.id, pending: true })
      : null;
    if (!exam) return res.status(404).json({ code: 'PENDING_NOT_FOUND', message: 'পেন্ডিং পরীক্ষা পাওয়া যায়নি' });
    res.json({
      exam: summarizeExam(exam),
      draft: exam.draftData || { title: '', classIds: [], questions: [] },
      updatedAt: exam.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// পেন্ডিং পরীক্ষা চূড়ান্ত করা: প্রশ্নগুলো আসল Question হয়ে যায়, পরীক্ষা সাধারণ (খসড়া) তালিকায় চলে যায়
exports.finalizePending = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = mongoose.Types.ObjectId.isValid(id)
      ? await Exam.findOne({ _id: id, teacher: req.user.id, pending: true })
      : null;
    if (!exam) return res.status(404).json({ code: 'PENDING_NOT_FOUND', message: 'পেন্ডিং পরীক্ষা পাওয়া যায়নি' });

    // ফর্ম থেকে সর্বশেষ লেখা এলে সেটাই, নইলে আগে সংরক্ষিত খসড়া
    const draft = await sanitizeDraft(req.user.id, Array.isArray(req.body?.questions) ? req.body : exam.draftData);
    if (diagramsChangedWhileLocked(req, draft.questions, exam.draftData?.questions || [])) return diagramLocked(res);

    if (!draft.title.trim()) return res.status(400).json({ message: 'পরীক্ষার নাম আবশ্যক' });
    const classCheck = await validateClassesForTeacher(req.user.id, draft.classIds);
    if (classCheck.error) return res.status(400).json({ message: classCheck.error });

    const valid = draft.questions.map(normalizeAuthoringQuestion).filter(Boolean);
    if (valid.length === 0) {
      return res.status(400).json({ message: 'কমপক্ষে একটি সম্পূর্ণ প্রশ্ন (দুটি অপশন ও সঠিক উত্তরসহ) থাকতে হবে' });
    }

    await Question.deleteMany({ exam: exam._id });
    await Question.insertMany(
      valid.map((q, index) => ({
        exam: exam._id,
        questionText: q.questionText,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        explanation: q.explanation,
        diagram: cleanDiagram(q.diagram),
        diagramSource: cleanDiagram(q.diagram) ? cleanDiagramSource(q.diagramSource) : undefined,
        diagrams: cleanDiagrams(q.diagrams),
        optionImages: q.optionImages,
        order: index,
      }))
    );

    try {
      exam.title = draft.title.trim();
      exam.classRefs = classCheck.ids;
      exam.pending = false;
      exam.status = 'draft';
      exam.draftData = undefined;
      await exam.save();
    } catch (saveErr) {
      await Question.deleteMany({ exam: exam._id }); // অর্ধেক কাজ পড়ে থাকতে দেওয়া হবে না
      throw saveErr;
    }

    res.status(201).json({ exam: summarizeExam(exam), questionCount: valid.length });
  } catch (err) {
    res.status(500).json({ message: err.message || 'পরীক্ষা তৈরি করতে সমস্যা হয়েছে' });
  }
};

// ---------- ২. Teacher এর সব Exam লিস্ট ----------
exports.getMyExams = async (req, res) => {
  try {
    const exams = await Exam.find({ teacher: req.user.id })
      .populate('classRefs', 'name accessCode')
      .sort({ createdAt: -1 });
    res.json(exams.map(summarizeExam));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৩. একটি Exam এর ডিটেইলস + প্রশ্ন ----------
exports.getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    const questions = await Question.find({ exam: exam._id }).sort({ order: 1, createdAt: 1, _id: 1 });
    res.json({ exam, questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// আমদানির মূল PDF/DOC ফাইলটি শিক্ষক দেখতে/ডাউনলোড করতে পারবেন—এতে original
// layout, সূত্র ও diagram যাচাই করা যায়; parser কখনো source ফাইলটি নষ্ট করে না।
exports.downloadSourceFile = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) return res.status(403).json({ message: 'অনুমতি নেই' });
    if (!exam.sourcePdfPath || !fs.existsSync(exam.sourcePdfPath)) {
      return res.status(404).json({ message: 'মূল আপলোড ফাইলটি পাওয়া যায়নি' });
    }
    return res.download(exam.sourcePdfPath, path.basename(exam.sourcePdfPath));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'মূল ফাইল ডাউনলোড করা যায়নি' });
  }
};

// ---------- ৪. Exam Settings আপডেট ----------
exports.updateExamSettings = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.trim().length > 200) {
        return res.status(400).json({ message: 'পরীক্ষার নাম ১ থেকে ২০০ অক্ষরের মধ্যে হতে হবে' });
      }
      exam.title = req.body.title.trim();
    }

    // শ্রেণী পরিবর্তন (ঐচ্ছিক, একাধিক)
    if (req.body.classIds !== undefined) {
      const classCheck = await validateClassesForTeacher(req.user.id, req.body.classIds);
      if (classCheck.error) return res.status(400).json({ message: classCheck.error });
      exam.classRefs = classCheck.ids;
    }
    
    // settings আপডেট নিশ্চিত করা এবং সময় ০ না রাখার সেফগারার্ড
    const incomingSettings = { ...(req.body.settings || {}) };

    // 🗓️ শিডিউল: তারিখ যাচাই ও স্বাভাবিকীকরণ (ফাঁকা হলে null, ভুল তারিখ/শেষ ≤ শুরু হলে ত্রুটি)
    if (incomingSettings.schedule !== undefined) {
      const sch = incomingSettings.schedule || {};
      const startAt = sch.startAt ? new Date(sch.startAt) : null;
      const endAt = sch.endAt ? new Date(sch.endAt) : null;
      if ((startAt && isNaN(startAt.getTime())) || (endAt && isNaN(endAt.getTime()))) {
        return res.status(400).json({ message: 'শিডিউলের তারিখ/সময় সঠিক নয়' });
      }
      if (sch.enabled && startAt && endAt && endAt <= startAt) {
        return res.status(400).json({ message: 'শেষের সময় অবশ্যই শুরুর সময়ের পরে হতে হবে' });
      }
      incomingSettings.schedule = { enabled: !!sch.enabled, startAt, endAt };
    }

    const updatedSettings = { ...exam.settings?.toObject(), ...incomingSettings };
    const duration = Number(updatedSettings.totalTimeMinutes);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) {
      updatedSettings.totalTimeMinutes = 10;
    } else {
      updatedSettings.totalTimeMinutes = duration;
    }
    const marks = Number(updatedSettings.marksPerQuestion ?? 1);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
      return res.status(400).json({ message: 'প্রতি প্রশ্নের নম্বর ০ থেকে ১০০-এর মধ্যে হতে হবে' });
    }
    updatedSettings.marksPerQuestion = marks;
    if (updatedSettings.negativeMarking?.enabled) {
      const negative = Number(updatedSettings.negativeMarking.marksPerWrong ?? 0);
      if (!Number.isFinite(negative) || negative < 0 || negative > 100) {
        return res.status(400).json({ message: 'ভুল উত্তরের কাটা নম্বর ০ থেকে ১০০-এর মধ্যে হতে হবে' });
      }
      updatedSettings.negativeMarking.marksPerWrong = negative;
    }
    
    exam.settings = updatedSettings;
    if (req.body.accessCode !== undefined) exam.accessCode = String(req.body.accessCode || '').trim();

    await exam.save();
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৫. Exam Publish করা ----------
exports.publishExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }
    if (exam.pending) {
      return res.status(400).json({ message: 'অসম্পূর্ণ (পেন্ডিং) পরীক্ষা চালু করা যাবে না। আগে পরীক্ষাটি সম্পূর্ণ করে তৈরি করো' });
    }

    // Older/imported records may have a missing or out-of-range answer index;
    // a MongoDB `$lt: 0` query does not catch those cases.
    const questions = await Question.find({ exam: exam._id })
      .select('questionText type options optionImages correctOptionIndex')
      .lean();
    if (questions.length === 0) {
      return res.status(400).json({ message: 'প্রকাশের আগে পরীক্ষায় কমপক্ষে একটি প্রশ্ন যোগ করুন।' });
    }
    const invalidQuestionCount = questions.filter((q) => {
      if (!String(q.questionText || '').trim()) return true;
      // Short questions are open-ended: they intentionally have no options or
      // correctOptionIndex. Their answers are reviewed and graded manually.
      const isShortQuestion = q.type === 'short'
        || (exam.settings?.questionType === 'short' && (!Array.isArray(q.options) || q.options.length === 0));
      if (isShortQuestion) return false;
      const options = Array.isArray(q.options) ? q.options : [];
      const answer = q.correctOptionIndex;
      return options.length < 2
        || !Number.isInteger(answer)
        || answer < 0
        || answer >= options.length
        || (!String(options[answer] || '').trim() && !String(q.optionImages?.[answer] || '').trim());
    }).length;
    if (invalidQuestionCount > 0) {
      return res.status(400).json({ message: `${invalidQuestionCount}টি প্রশ্ন অসম্পূর্ণ বা সঠিক উত্তরবিহীন। প্রকাশের আগে Edit করে ঠিক করুন।` });
    }

    const firstTimePublish = exam.status !== 'published';
    exam.status = 'published';
    await exam.save();

    // 🔔 প্রথমবার পাবলিশ হলে স্টুডেন্টদের নোটিফিকেশন (ব্যর্থ হলেও পাবলিশ আটকাবে না)
    if (firstTimePublish && isFeatureEnabled(req.subscription, 'messages')) {
      announceExamPublished(exam, req.user.id).catch((e) => console.error('exam announce failed:', e.message));
    }

    const baseUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ exam, shareLink: `${baseUrl}/join/${exam.examCode}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ৬. প্রশ্ন Edit / Delete / Add / Reorder ----------
exports.updateQuestion = async (req, res) => {
  try {
    const q = await Question.findById(req.params.questionId);
    if (!q) return res.status(404).json({ message: 'প্রশ্ন পাওয়া যায়নি' });

    const exam = await Exam.findById(q.exam);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    const body = {};
    ['questionText', 'explanation', 'order'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) body[field] = req.body[field];
    });
    if (body.questionText !== undefined) {
      if (typeof body.questionText !== 'string' || !body.questionText.trim()) {
        return res.status(400).json({ message: 'প্রশ্নের লেখা আবশ্যক' });
      }
      body.questionText = body.questionText.trim();
    }
    if (body.explanation !== undefined) body.explanation = String(body.explanation).trim();
    if (body.order !== undefined && (!Number.isInteger(body.order) || body.order < 0)) {
      return res.status(400).json({ message: 'প্রশ্নের ক্রম সঠিক নয়' });
    }
    ['type', 'options', 'optionImages', 'correctOptionIndex', 'diagram', 'diagramSource', 'diagrams'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) body[field] = req.body[field];
    });
    if (body.type !== undefined && !['mcq', 'short'].includes(body.type)) return res.status(400).json({ message: 'প্রশ্নের ধরন সঠিক নয়' });
    if ('diagram' in body) {
      body.diagram = cleanDiagram(body.diagram) || undefined;
      body.diagramSource = body.diagram ? cleanDiagramSource(body.diagramSource) : undefined;
    }
    if ('diagrams' in body) body.diagrams = cleanDiagrams(body.diagrams) || [];
    if ((body.type || q.type) === 'short') {
      body.type = 'short';
      body.options = undefined;
      body.optionImages = undefined;
      body.correctOptionIndex = undefined;
      if (diagramsChangedWhileLocked(req, { ...q.toObject(), ...body }, [q])) return diagramLocked(res);
      Object.assign(q, body);
      await q.save();
      return res.json(q);
    }
    body.type = 'mcq';
    const normalized = normalizeQuestionOptions(
      'options' in body ? body.options : q.options,
      'optionImages' in body ? body.optionImages : q.optionImages,
      'correctOptionIndex' in body ? body.correctOptionIndex : q.correctOptionIndex
    );
    if (!normalized) {
      return res.status(400).json({ message: 'সঠিক উত্তরটি পূর্ণ অপশনের বৈধ integer index হতে হবে এবং কমপক্ষে দুটি অপশন থাকতে হবে' });
    }
    body.options = normalized.options;
    body.optionImages = normalized.optionImages;
    body.correctOptionIndex = normalized.correctOptionIndex;
    if (diagramsChangedWhileLocked(req, { ...q.toObject(), ...body }, [q])) return diagramLocked(res);
    // Never copy arbitrary request keys: in particular, `exam`, `_id`, and
    // timestamps must not be writable through this endpoint.
    Object.assign(q, body);
    await q.save();
    res.json(q);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const q = await Question.findById(req.params.questionId);
    if (!q) return res.status(404).json({ message: 'প্রশ্ন পাওয়া যায়নি' });

    const exam = await Exam.findById(q.exam);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    await q.deleteOne();
    res.json({ message: 'প্রশ্ন ডিলিট হয়েছে' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addQuestion = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    const lastQuestion = await Question.findOne({ exam: exam._id }).sort({ order: -1, createdAt: -1, _id: -1 }).select('order').lean();
    const nextOrder = Number.isInteger(lastQuestion?.order) ? lastQuestion.order + 1 : 0;
    const normalized = normalizeAuthoringQuestion(req.body);
    if (!normalized) {
      return res.status(400).json({ message: 'সঠিক উত্তরটি পূর্ণ অপশনের বৈধ integer index হতে হবে এবং কমপক্ষে দুটি অপশন থাকতে হবে' });
    }
    if (diagramsChangedWhileLocked(req, normalized)) return diagramLocked(res);
    const q = await Question.create({
      questionText: normalized.questionText,
      type: normalized.type || 'mcq',
      options: normalized.options,
      correctOptionIndex: normalized.correctOptionIndex,
      explanation: normalized.explanation,
      optionImages: normalized.optionImages,
      diagram: cleanDiagram(normalized.diagram),
      diagramSource: cleanDiagram(normalized.diagram) ? cleanDiagramSource(normalized.diagramSource) : undefined,
      diagrams: cleanDiagrams(normalized.diagrams),
      exam: exam._id,
      order: nextOrder,
    });
    res.status(201).json(q);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reorderQuestions = async (req, res) => {
  try {
    const { orderList } = req.body;
    if (!Array.isArray(orderList) || orderList.length === 0) {
      return res.status(400).json({ message: 'orderList খালি নয় এমন অ্যারে হওয়া আবশ্যক' });
    }
    const exam = await Exam.findById(req.params.id).select('teacher');
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }
    const ids = orderList.map((item) => item?.questionId);
    if (
      ids.some((id) => !mongoose.Types.ObjectId.isValid(id)) ||
      new Set(ids.map(String)).size !== ids.length ||
      orderList.some((item) => !Number.isInteger(item?.order) || item.order < 0)
    ) {
      return res.status(400).json({ message: 'প্রশ্নের ID বা ক্রম সঠিক নয়' });
    }
    const ownedCount = await Question.countDocuments({ _id: { $in: ids }, exam: exam._id });
    if (ownedCount !== ids.length) {
      return res.status(400).json({ message: 'তালিকায় এই পরীক্ষার নয় এমন প্রশ্ন আছে' });
    }
    await Question.bulkWrite(orderList.map((item) => ({
      updateOne: {
        filter: { _id: item.questionId, exam: exam._id },
        update: { $set: { order: item.order } },
      },
    })));
    res.json({ message: 'ক্রম আপডেট হয়েছে' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// ---------- ৭. রেজাল্ট এবং Attempt ডিটেইলস ----------
exports.getExamResults = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    if (exam.settings?.allowRepetition) {
      return res.json({
        disabled: true,
        message: 'Repetition অন করা আছে বলে এই পরীক্ষার রেজাল্ট ড্যাশবোর্ডে দেখানো হচ্ছে না। প্রতিটা স্টুডেন্ট পরীক্ষা শেষে নিজের রেজাল্ট দেখতে পাবে।',
      });
    }

    const attempts = await Attempt.find({ exam: exam._id, status: 'submitted' }).sort({ obtainedMarks: -1 });
    res.json(attempts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAttemptDetails = async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId).populate('answers.question');
    if (!attempt) return res.status(404).json({ message: 'পাওয়া যায়নি' });

    const exam = await Exam.findById(attempt.exam);
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    res.json(attempt);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.gradeShortAnswers = async (req, res) => {
  try {
    const attempt = await Attempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt পাওয়া যায়নি' });
    const exam = await Exam.findById(attempt.exam);
    if (!exam || exam.teacher.toString() !== req.user.id) return res.status(403).json({ message: 'অনুমতি নেই' });
    const questions = await Question.find({ exam: exam._id }).select('type options _id');
    const shortIds = new Set(questions.filter((q) => q.type === 'short'
      || (exam.settings?.questionType === 'short' && (!Array.isArray(q.options) || q.options.length === 0)))
      .map((q) => String(q._id)));
    const marks = req.body?.marks && typeof req.body.marks === 'object' ? req.body.marks : {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'feedback')) {
      attempt.teacherFeedback = String(req.body.feedback || '').trim().slice(0, 5000);
    }
    const max = Number(exam.settings?.marksPerQuestion) || 1;
    attempt.answers.forEach((answer) => {
      const id = String(answer.question);
      if (!shortIds.has(id) || marks[id] === undefined) return;
      const value = Number(marks[id]);
      if (!Number.isFinite(value) || value < 0 || value > max) return;
      answer.marksAwarded = Math.round(value * 100) / 100;
      answer.reviewed = true;
    });
    const shortMarks = attempt.answers.reduce((sum, answer) => sum + (Number(answer.marksAwarded) || 0), 0);
    const mcqMarks = (Number(attempt.totalCorrect) || 0) * max;
    const negative = exam.settings?.negativeMarking?.enabled ? (Number(attempt.totalWrong) || 0) * (Number(exam.settings?.negativeMarking?.marksPerWrong) || 0) : 0;
    attempt.obtainedMarks = Math.round((mcqMarks + shortMarks - negative) * 100) / 100;
    await attempt.save();
    res.json({ message: 'Short question-এর নম্বর সংরক্ষিত হয়েছে', attempt });
  } catch (err) { res.status(500).json({ message: err.message }); }
};


// ---------- ৮. Excel এ Export ----------
exports.exportResultsExcel = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    const attempts = await Attempt.find({ exam: exam._id, status: 'submitted' });
    const workbook = await generateResultExcel(exam, attempts, req.query.lang);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exam.title)}-results.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /exams/:id/results/pdf — ফলাফলের সারাংশ, নম্বর-বণ্টন গ্রাফ ও শিক্ষার্থী তালিকা
exports.exportResultsPdf = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) return res.status(403).json({ message: 'অনুমতি নেই' });

    const match = { exam: exam._id, status: 'submitted' };
    const questionCount = await Question.countDocuments({ exam: exam._id });
    const marksPerQuestion = Number(exam.settings?.marksPerQuestion) || 1;
    const configuredQuestionCount = Number(exam.settings?.totalQuestionsToUse) || questionCount;
    let totalCount = 0;
    let marksSum = 0;
    let highestMarks = 0;
    let observedQuestionCount = 0;
    for await (const attempt of Attempt.find(match).select('totalCorrect totalWrong totalSkipped obtainedMarks').lean().cursor()) {
      totalCount += 1;
      const marks = Number(attempt.obtainedMarks) || 0;
      marksSum += marks;
      highestMarks = Math.max(highestMarks, marks);
      observedQuestionCount = Math.max(observedQuestionCount, (Number(attempt.totalCorrect) || 0) + (Number(attempt.totalWrong) || 0) + (Number(attempt.totalSkipped) || 0));
    }
    const questionsUsed = observedQuestionCount || Math.min(questionCount, configuredQuestionCount);
    const maxMarks = Math.max(questionsUsed * marksPerQuestion, highestMarks, 1);
    const bins = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${(i + 1) * 10}%`, count: 0 }));
    for await (const attempt of Attempt.find(match).select('obtainedMarks').lean().cursor()) {
      const percentage = Math.max(0, Math.min(99.99, ((Number(attempt.obtainedMarks) || 0) / maxMarks) * 100));
      bins[Math.floor(percentage / 10)].count += 1;
    }
    const average = totalCount ? marksSum / totalCount : 0;
    const en = String(req.query.lang || '').toLowerCase() === 'en';
    const filename = `${exam.title || 'exam'}-results.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="results.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `${exam.title} results` } });
    doc.on('error', (err) => { if (!res.headersSent) res.status(500).end(err.message); });
    doc.pipe(res);
    const fonts = registerFonts(doc);
    const writeAt = (text, x, y, options = {}) => {
      doc.x = x; doc.y = y;
      writeText(doc, fonts, String(text ?? ''), { lineBreak: false, ...options });
    };
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const summaryTitle = en ? 'Exam Results Report' : 'পরীক্ষার ফলাফল প্রতিবেদন';
    const avgLabel = en ? 'Average marks' : 'গড় নম্বর';
    const topLabel = en ? 'Highest marks' : 'সর্বোচ্চ নম্বর';
    const totalLabel = en ? 'Submitted students' : 'জমাদানকারী';
    const graphTitle = en ? 'Score distribution' : 'নম্বরের বণ্টন';
    writeAt(exam.title, left, 42, { width: pageWidth, align: 'center' });
    doc.y = 68;
    writeAt(summaryTitle, left, 68, { width: pageWidth, align: 'center' });
    doc.font(fonts.latin).fontSize(10).fillColor('#475569');
    doc.text(`${totalLabel}: ${totalCount}     ${avgLabel}: ${average.toFixed(1)}     ${topLabel}: ${highestMarks}`, left, 98, { width: pageWidth, align: 'center' });

    // Vector bar graph so it remains sharp in the downloaded PDF.
    writeAt(graphTitle, left, 132, { width: pageWidth, align: 'center' });
    const chartTop = 158;
    const chartHeight = 145;
    const baseline = chartTop + chartHeight;
    const gap = 8;
    const barWidth = (pageWidth - gap * 9) / 10;
    const maxCount = Math.max(1, ...bins.map((b) => b.count));
    doc.strokeColor('#94a3b8').lineWidth(0.7).moveTo(left, baseline).lineTo(left + pageWidth, baseline).stroke();
    bins.forEach((bin, i) => {
      const height = bin.count ? Math.max(3, (bin.count / maxCount) * (chartHeight - 25)) : 0;
      const x = left + i * (barWidth + gap);
      if (height) doc.save().fillColor('#2563eb').rect(x, baseline - height, barWidth, height).fill().restore();
      doc.font(fonts.latin).fontSize(8).fillColor('#334155').text(String(bin.count), x, baseline - height - 14, { width: barWidth, align: 'center', lineBreak: false });
      doc.font(fonts.latin).fontSize(7).fillColor('#475569').text(bin.label, x - 2, baseline + 5, { width: barWidth + 4, align: 'center', lineBreak: false });
    });

    const rowsTitle = en ? 'Student results' : 'শিক্ষার্থীদের ফলাফল';
    writeAt(rowsTitle, left, baseline + 32, { width: pageWidth });
    let y = baseline + 54;
    const columns = en ? ['Student', 'Roll', 'Correct', 'Wrong', 'Skipped', 'Marks'] : ['শিক্ষার্থী', 'রোল', 'সঠিক', 'ভুল', 'স্কিপ', 'নম্বর'];
    const widths = [180, 70, 65, 55, 55, pageWidth - 425];
    const drawTableHeader = () => {
      let x = left;
      doc.save().fillColor('#e2e8f0').rect(left, y - 3, pageWidth, 22).fill().restore();
      columns.forEach((label, i) => { writeAt(label, x + 3, y, { width: widths[i] - 6 }); x += widths[i]; });
      y += 24;
    };
    drawTableHeader();
    for await (const attempt of Attempt.find(match).select('studentName studentRoll totalCorrect totalWrong totalSkipped obtainedMarks').sort({ obtainedMarks: -1, _id: 1 }).lean().cursor()) {
      if (y > doc.page.height - 58) { doc.addPage(); y = 44; drawTableHeader(); }
      const values = [attempt.studentName || '-', attempt.studentRoll || '-', attempt.totalCorrect ?? 0, attempt.totalWrong ?? 0, attempt.totalSkipped ?? 0, attempt.obtainedMarks ?? 0];
      let x = left;
      values.forEach((value, i) => { writeAt(value, x + 3, y, { width: widths[i] - 6 }); x += widths[i]; });
      doc.strokeColor('#e2e8f0').lineWidth(0.4).moveTo(left, y + 17).lineTo(left + pageWidth, y + 17).stroke();
      y += 22;
    }
    if (!totalCount) writeAt(en ? 'No submitted results yet.' : 'এখনো কোনো জমা দেওয়া ফল নেই।', left, y + 4, { width: pageWidth });
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: err.message || 'PDF তৈরি করা যায়নি' });
  }
};

// ---------- ৮.৫ শিক্ষকের নিজের তৈরি পরীক্ষার PDF ডাউনলোড ----------
// GET /exams/:id/pdf?answers=1  → উত্তরসহ (সঠিক অপশন চিহ্নিত + ব্যাখ্যা), না দিলে শুধু প্রশ্নপত্র
exports.downloadExamPdf = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    const exam = await Exam.findById(req.params.id);
    if (!exam || exam.pending) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) return res.status(403).json({ message: 'অনুমতি নেই' });

    const withAnswers = ['1', 'true', 'yes'].includes(String(req.query.answers || '').toLowerCase());
    const questions = await Question.find({ exam: exam._id }).sort({ order: 1, createdAt: 1 });
    if (!questions.length) return res.status(400).json({ message: 'এই পরীক্ষায় এখনো কোনো প্রশ্ন নেই' });

    const st = exam.settings || {};
    const en = String(req.query.lang || '').toLowerCase() === 'en';
    const preview = ['1', 'true', 'yes'].includes(String(req.query.preview || '').toLowerCase());
    const fileBase = `${exam.title}${withAnswers ? (en ? '-with-answers' : '-উত্তরসহ') : (en ? '-question-paper' : '-প্রশ্নপত্র')}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename="exam.pdf"; filename*=UTF-8''${encodeURIComponent(fileBase)}.pdf`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    doc.pipe(res);
    const fonts = registerFonts(doc);
    const W = (text, size, opts) => { doc.fontSize(size); writeText(doc, fonts, text, opts); };
    // মিশ্র-ফন্টের মাঝ-সারিবদ্ধ লাইন আঁকলে pdfkit-এর y এগোয় না, তাই লাইনের উচ্চতা ধরে নিজেই নামাই
    const WC = (text, size) => {
      const y = doc.y;
      W(text, size, { align: 'center' });
      doc.x = doc.page.margins.left;
      doc.y = y + size * 1.4;
    };

    // ---- শিরোনাম ও তথ্য ----
    doc.fillColor('black');
    WC(exam.title, 18);
    doc.moveDown(0.3);
    const meta = [
      en ? `Total questions: ${questions.length}` : `মোট প্রশ্ন: ${questions.length}`,
      en ? `Time: ${st.totalTimeMinutes ?? '-'} min` : `সময়: ${st.totalTimeMinutes ?? '-'} মিনিট`,
      en ? `Marks per question: ${st.marksPerQuestion ?? '-'}` : `প্রতি প্রশ্নে নম্বর: ${st.marksPerQuestion ?? '-'}`,
      st.negativeMarking?.enabled ? (en ? `Negative marking: ${st.negativeMarking.marksPerWrong}` : `ভুল উত্তরে কাটা: ${st.negativeMarking.marksPerWrong}`) : null,
    ].filter(Boolean).join('   |   ');
    doc.fillColor('#444444');
    WC(meta, 10);
    if (withAnswers) { doc.fillColor('#047857'); WC(en ? '(With answers — teacher copy)' : '(উত্তরসহ — শিক্ষকের কপি)', 10); }
    doc.fillColor('black').moveDown(0.5);
    const lineY = doc.y;
    doc.moveTo(40, lineY).lineTo(doc.page.width - 40, lineY).strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);

    // ---- প্রশ্নসমূহ ----
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 110;
    questions.forEach((q, idx) => {
      if (doc.y > bottomLimit()) doc.addPage(); // প্রশ্ন যেন পাতার একদম নিচে ভেঙে না যায়
      doc.fillColor('black');
      W(`${idx + 1}. ${q.questionText}`, 11.5);
      doc.moveDown(0.15);
      // ডায়াগ্রাম থাকলে প্রশ্নের নিচে বসানো (ফাইল না পেলে চুপচাপ বাদ)
      if (q.diagram) {
        try {
          let imgSrc = null;
          if (DIAGRAM_DATA_RE.test(q.diagram)) imgSrc = Buffer.from(q.diagram.split(',')[1], 'base64');
          else if (DIAGRAM_RE.test(q.diagram)) {
            const p = path.join(__dirname, '..', q.diagram);
            if (fs.existsSync(p)) imgSrc = p;
          }
          if (imgSrc) {
            if (doc.y + 190 > doc.page.height - doc.page.margins.bottom) doc.addPage();
            const y0 = doc.y;
            doc.image(imgSrc, doc.page.margins.left + 18, y0, { fit: [260, 180] });
            doc.y = y0 + 186;
            doc.x = doc.page.margins.left;
          }
        } catch (e) { /* ছবি বসানো না গেলেও PDF তৈরি চলবে */ }
      }
      q.options.forEach((opt, i) => {
        const correct = withAnswers && i === q.correctOptionIndex;
        doc.fillColor(correct ? '#047857' : 'black');
        W(`      ${String.fromCharCode(65 + i)}. ${opt}${correct ? '  ✓' : ''}`, 10.5);
        const oi = q.optionImages && q.optionImages[i];
        if (oi && DIAGRAM_DATA_RE.test(oi)) {
          try {
            if (doc.y + 100 > doc.page.height - doc.page.margins.bottom) doc.addPage();
            const y1 = doc.y;
            doc.image(Buffer.from(oi.split(',')[1], 'base64'), doc.page.margins.left + 40, y1, { fit: [150, 90] });
            doc.y = y1 + 94;
            doc.x = doc.page.margins.left;
          } catch (e) { /* ছবি বসানো না গেলেও চলবে */ }
        }
      });
      if (withAnswers && q.explanation) {
        doc.fillColor('#555555');
        W(`      ${en ? 'Explanation' : 'ব্যাখ্যা'}: ${q.explanation}`, 9.5);
      }
      doc.fillColor('black').moveDown(0.7);
    });

    // ---- উত্তরমালা (শুধু উত্তরসহ কপিতে, এক নজরে) ----
    if (withAnswers) {
      if (doc.y > bottomLimit()) doc.addPage();
      doc.moveDown(0.5);
      W(en ? 'Answer key' : 'উত্তরমালা', 13, { align: 'left' });
      doc.moveDown(0.3);
      const key = questions.map((q, i) => `${i + 1}-${String.fromCharCode(65 + q.correctOptionIndex)}`).join('    ');
      doc.fillColor('#047857');
      W(key, 10.5);
      doc.fillColor('black');
    }

    // ---- পৃষ্ঠা নম্বর ----
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // নিচের মার্জিনে লিখতে গেলে যেন নতুন পাতা না খোলে
      doc.font(fonts.latin).fontSize(9).fillColor('#888888')
        .text(`${i + 1} / ${range.count}`, 0, doc.page.height - 28, { width: doc.page.width, align: 'center', lineBreak: false });
      doc.page.margins.bottom = prevBottom;
    }
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: err.message || 'PDF তৈরি করতে সমস্যা হয়েছে' });
    else res.end();
  }
};

// ---------- ৯. পাবলিক: এক্সাম কোড দিয়ে Exam এর তথ্য দেখা (Join পেজ) ----------
exports.getExamByCode = async (req, res) => {
  try {
    const exam = await Exam.findOne({ examCode: req.params.code }).populate('teacher', 'name');
    if (!exam) return res.status(404).json({ message: 'এই লিংকে কোনো পরীক্ষা পাওয়া যায়নি' });
    if (exam.status !== 'published') {
      return res.status(400).json({ message: 'পরীক্ষাটি এখনো চালু হয়নি অথবা বন্ধ হয়ে গেছে' });
    }

    const teacherSub = await getTeacherStatus(exam.teacher._id || exam.teacher);
    if (!teacherSub.isActive) {
      return res.status(403).json({ message: 'এই শিক্ষকের সাবস্ক্রিপশনের মেয়াদ শেষ, তাই পরীক্ষাটি এখন বন্ধ আছে' });
    }

    const schedule = exam.settings?.schedule;
    const isScheduleEnabled = schedule?.enabled !== undefined ? schedule.enabled : false;

    if (schedule && isScheduleEnabled) {
      const now = new Date();
      if (schedule.startAt && now < new Date(schedule.startAt)) {
        return res.status(400).json({ message: 'পরীক্ষা এখনো শুরু হয়নি' });
      }
      if (schedule.endAt && now > new Date(schedule.endAt)) {
        return res.status(400).json({ message: 'পরীক্ষার সময় শেষ হয়ে গেছে' });
      }
    }

    // ০ বা undefined যেন না যায় তার জন্য fallback সময়
    const rawTime = exam.settings?.totalTimeMinutes;
    const duration = rawTime && Number(rawTime) > 0 ? Number(rawTime) : 10;

    res.json({
      title: exam.title,
      examCode: exam.examCode,
      teacherName: exam.teacher?.name || '',
      requiresAccessCode: !!exam.accessCode,
      totalTimeMinutes: duration,
      settings: {
        ...exam.settings?.toObject(),
        totalTimeMinutes: duration,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ১০. পুরো Exam ডিলিট করা ----------
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    await Question.deleteMany({ exam: exam._id });
    await Attempt.deleteMany({ exam: exam._id });
    await Announcement.deleteMany({ exam: exam._id }); // পরীক্ষার নোটিফিকেশনও মুছে যাবে

    // ফাইল সেফলি ডিলিট
    if (exam.sourcePdfPath) safeDeleteFile(exam.sourcePdfPath);
    if (exam.resource?.pdfPath) safeDeleteFile(exam.resource.pdfPath);

    await exam.deleteOne();
    res.json({ message: 'পরীক্ষাটি সফলভাবে ডিলিট হয়েছে' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ১১. অতিরিক্ত রিসোর্স (Google Drive লিংক বা PDF) সেট করা ----------
exports.setResourceLink = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    const { link } = req.body;
    if (!isSafeResourceLink(link)) {
      return res.status(400).json({ message: 'শুধুমাত্র বৈধ http বা https resource link দেওয়া যাবে' });
    }

    if (exam.resource?.pdfPath) safeDeleteFile(exam.resource.pdfPath);

    exam.resource = { kind: 'link', link: link.trim(), pdfPath: undefined, pdfOriginalName: undefined };
    await exam.save();
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setResourcePdf = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }
    if (!req.file) return res.status(400).json({ message: 'PDF ফাইল আবশ্যক' });

    if (exam.resource?.pdfPath) safeDeleteFile(exam.resource.pdfPath);

    exam.resource = {
      kind: 'pdf',
      pdfPath: req.file.path,
      pdfOriginalName: req.file.originalname,
      link: undefined,
    };
    await exam.save();
    res.json(exam);
  } catch (err) {
    if (req.file?.path) safeDeleteFile(req.file.path);
    res.status(500).json({ message: err.message });
  }
};

exports.removeResource = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam পাওয়া যায়নি' });
    if (exam.teacher.toString() !== req.user.id) {
      return res.status(403).json({ message: 'অনুমতি নেই' });
    }

    if (exam.resource?.pdfPath) safeDeleteFile(exam.resource.pdfPath);

    exam.resource = { kind: null, link: undefined, pdfPath: undefined, pdfOriginalName: undefined };
    await exam.save();
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- ১২. পাবলিক: সব পাবলিশ হওয়া পরীক্ষার তালিকা (Student Portal-এর জন্য) ----------
// 🔒 স্টুডেন্ট লগইন করা থাকলে শুধু তার যুক্ত করা (এক্সেস কোড দেওয়া) শিক্ষকদের পরীক্ষাই দেখাবে।
// লগইন করা না থাকলে বা টোকেন স্টুডেন্টের না হলে খালি লিস্ট + needsLogin ফ্ল্যাগ ফেরত যাবে।
exports.getPublicExams = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.json({ needsLogin: true, exams: [] });
    }

    const student = await User.findById(req.user.id).select('connectedTeachers connectedClasses bannedByTeachers');
    if (!student) {
      return res.json({ needsLogin: true, exams: [] });
    }

    const hasClasses = (student.connectedClasses || []).length > 0;
    const hasLegacyTeachers = (student.connectedTeachers || []).length > 0;
    if (!hasClasses && !hasLegacyTeachers) {
      return res.json({ needsLogin: false, needsAccessCode: true, exams: [] });
    }

    const now = new Date();
    const activeTeacherIds = await getActiveTeacherIds(); // 💳 মেয়াদ শেষ শিক্ষকের পরীক্ষা তালিকায় আসবে না

    // ১. শুধু যুক্ত থাকা শিক্ষকদের published পরীক্ষা তুলে নিয়ে আসা
    // 🎓 শুধু যেসব শ্রেণীর এক্সেস কোড যোগ করা আছে সেই শ্রেণীর পরীক্ষা (+ পুরনো শ্রেণীবিহীন পরীক্ষা, পুরনো শিক্ষক-কোড থাকলে)
    const publishedExams = await Exam.find({
      status: 'published',
      teacher: { $nin: student.bannedByTeachers || [], $in: activeTeacherIds }, // 🚫 ব্যান করা এবং 💳 মেয়াদ-শেষ শিক্ষকের পরীক্ষা দেখাবে না
      $or: [
        { classRefs: { $in: student.connectedClasses || [] } },
        {
          // শ্রেণীবিহীন পুরনো পরীক্ষা: শুধু পুরনো শিক্ষক-কোড দিয়ে যুক্ত স্টুডেন্টরা
          $or: [{ classRefs: { $exists: false } }, { classRefs: { $size: 0 } }],
          teacher: { $in: student.connectedTeachers || [] },
        },
      ],
    })
      .select('title examCode createdAt teacher classRefs settings.totalTimeMinutes settings.schedule')
      .populate('teacher', 'name')
      .populate('classRefs', 'name')
      .lean()
      .sort({ createdAt: -1 });

    // ২. JS ফিল্টারের মাধ্যমে শডিউল অ্যাক্টিভ আছে কিনা যাচাই করে ফিল্টার করা
    const validExams = publishedExams.filter((exam) => {
      const schedule = exam.settings?.schedule;

      if (!schedule || schedule.enabled === false) {
        return true;
      }

      if (schedule.startAt && now < new Date(schedule.startAt)) {
        return false;
      }
      if (schedule.endAt && now > new Date(schedule.endAt)) {
        return false;
      }

      return true;
    });

    // ৩. প্রতিটি এক্সামের জন্য মোট Attempt এবং ডিফল্ট টাইম ফিক্স করা
    const examsWithAttempts = await Promise.all(
      validExams.map(async (exam) => {
        const attemptCount = await Attempt.countDocuments({ exam: exam._id });
        const time = exam.settings?.totalTimeMinutes > 0 ? exam.settings.totalTimeMinutes : 10;
        const { teacher, classRefs, ...examRest } = exam;
        return {
          ...examRest,
          classNames: (classRefs || []).map((c) => c.name),
          teacherName: teacher?.name || '',
          settings: {
            ...exam.settings,
            totalTimeMinutes: time
          },
          attemptCount,
        };
      })
    );

    res.json({ needsLogin: false, exams: examsWithAttempts });
  } catch (err) {
    res.status(500).json({ message: 'পরীক্ষার তালিকা আনতে সমস্যা হয়েছে', error: err.message });
  }
};


// ---------- ডায়াগ্রাম আপলোড: ছবি সেভ করে পাথ ফেরত দেয় (প্রশ্নের সাথে যুক্ত করার জন্য) ----------
exports.uploadDiagram = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'ছবি পাওয়া যায়নি' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
};
