const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const JSZip = require('jszip');
const User = require('../models/User');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const Announcement = require('../models/Announcement');
const ExamFeedback = require('../models/ExamFeedback');
const Diagram = require('../models/Diagram');

const BACKUP_FORMAT = 'fu-teacher-classroom-backup';
const BACKUP_VERSION = 1;
const FILE_TAG = '__FU_BACKUP_FILE__:';
const BACKEND_DIR = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.resolve(BACKEND_DIR, 'uploads');
const MAX_ARCHIVE_BYTES = Number(process.env.TEACHER_BACKUP_MAX_BYTES || 1024 * 1024 * 1024);
const MAX_UNCOMPRESSED_BYTES = Number(process.env.TEACHER_BACKUP_MAX_UNCOMPRESSED_BYTES || 3 * 1024 * 1024 * 1024);
const MAX_ARCHIVE_ENTRIES = 20000;
const MAX_RECORDS = 200000;

const asJson = (value) => JSON.parse(JSON.stringify(value));
const idString = (value) => value == null ? '' : String(value);
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value).toLowerCase();
const fileIsInsideUploads = (candidate) => candidate === UPLOADS_DIR || candidate.startsWith(`${UPLOADS_DIR}${path.sep}`);

function resolveUploadPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) return null;
  let candidate;
  if (path.isAbsolute(value)) candidate = path.resolve(value);
  else if (value.startsWith('/uploads/')) candidate = path.resolve(BACKEND_DIR, value.slice(1));
  else if (value.startsWith('uploads/')) candidate = path.resolve(BACKEND_DIR, value);
  else return null;
  return fileIsInsideUploads(candidate) ? candidate : null;
}

function portableize(value, zip, includedFiles, missingFiles) {
  if (typeof value === 'string') {
    const resolved = resolveUploadPath(value);
    if (!resolved) return value;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      missingFiles.add(value);
      return null;
    }
    const bytes = fs.readFileSync(resolved);
    const ext = path.extname(resolved).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
    const entry = `files/${crypto.createHash('sha256').update(bytes).digest('hex')}${ext}`;
    if (!includedFiles.has(entry)) {
      zip.file(entry, bytes);
      includedFiles.add(entry);
    }
    return `${FILE_TAG}${entry}`;
  }
  if (Array.isArray(value)) return value.map((item) => portableize(item, zip, includedFiles, missingFiles));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) value[key] = portableize(item, zip, includedFiles, missingFiles);
  }
  return value;
}

function countData(data) {
  return Object.fromEntries(['classes', 'exams', 'questions', 'attempts', 'students', 'announcements', 'feedback', 'diagrams'].map((key) => [key, data[key].length]));
}

async function generateUniqueClassCode(used) {
  for (;;) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    if (used.has(code)) continue;
    const exists = (await Class.exists({ accessCode: code })) || (await User.exists({ accessCode: code }));
    if (!exists) { used.add(code); return code; }
  }
}

async function generateUniqueExamCode(used) {
  for (;;) {
    const code = crypto.randomBytes(4).toString('hex');
    if (used.has(code) || await Exam.exists({ examCode: code })) continue;
    used.add(code);
    return code;
  }
}

function validateRecords(data) {
  const assertSafeKeys = (value) => {
    if (Array.isArray(value)) return value.forEach(assertSafeKeys);
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Backup JSON-এ অনিরাপদ property key আছে');
        assertSafeKeys(child);
      }
    }
  };
  assertSafeKeys(data);
  const arrays = ['classes', 'exams', 'questions', 'attempts', 'students', 'announcements', 'feedback', 'diagrams'];
  if (!data || typeof data !== 'object' || arrays.some((key) => !Array.isArray(data[key]))) {
    throw new Error('ZIP backup-এর data format সঠিক নয়');
  }
  const total = arrays.reduce((sum, key) => sum + data[key].length, 0);
  if (total > MAX_RECORDS) throw new Error('Backup-এ অনুমোদিত সীমার বেশি record আছে');
  for (const key of arrays) {
    const seen = new Set();
    for (const record of data[key]) {
      if (!record || !isObjectId(record._id)) throw new Error(`Backup-এর ${key} record ID সঠিক নয়`);
      const id = String(record._id);
      if (seen.has(id)) throw new Error(`Backup-এ duplicate ${key} ID আছে`);
      seen.add(id);
    }
  }
  const classIds = new Set(data.classes.map((item) => String(item._id)));
  const examIds = new Set(data.exams.map((item) => String(item._id)));
  const questionIds = new Set(data.questions.map((item) => String(item._id)));
  const attemptIds = new Set(data.attempts.map((item) => String(item._id)));
  for (const exam of data.exams) {
    if ((exam.classRefs || []).some((id) => !classIds.has(String(id)))) throw new Error('Exam-এ backup-এর বাইরের class reference আছে');
  }
  for (const q of data.questions) if (!examIds.has(String(q.exam))) throw new Error('Question-এর exam reference backup-এ নেই');
  for (const attempt of data.attempts) {
    if (!examIds.has(String(attempt.exam))) throw new Error('Attempt-এর exam reference backup-এ নেই');
    if ((attempt.questionOrder || []).some((id) => !questionIds.has(String(id)))) throw new Error('Attempt-এ backup-এর বাইরের question reference আছে');
  }
  for (const item of data.announcements) {
    if ((item.classRefs || []).some((id) => !classIds.has(String(id)))) throw new Error('Message-এ backup-এর বাইরের class reference আছে');
    if (item.exam && !examIds.has(String(item.exam))) throw new Error('Message-এ backup-এর বাইরের exam reference আছে');
  }
  for (const item of data.feedback) {
    if (!examIds.has(String(item.exam)) || !attemptIds.has(String(item.attempt))) throw new Error('Feedback reference backup-এ নেই');
  }
}

function remapFiles(value, filePaths) {
  if (typeof value === 'string' && value.startsWith(FILE_TAG)) {
    const entry = value.slice(FILE_TAG.length);
    if (!filePaths.has(entry)) throw new Error('Backup-এ কোনো referenced media file নেই');
    return filePaths.get(entry);
  }
  if (Array.isArray(value)) return value.map((item) => remapFiles(item, filePaths));
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) value[key] = remapFiles(item, filePaths);
  }
  return value;
}

exports.exportBackup = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const [classes, exams, diagrams] = await Promise.all([
      Class.find({ teacher: teacherId }).lean(),
      Exam.find({ teacher: teacherId }).lean(),
      Diagram.find({ teacher: teacherId }).lean(),
    ]);
    const classIds = classes.map((item) => item._id);
    const examIds = exams.map((item) => item._id);
    const [questions, attempts, announcements, feedback] = await Promise.all([
      Question.find({ exam: { $in: examIds } }).lean(),
      Attempt.find({ exam: { $in: examIds } }).lean(),
      Announcement.find({ teacher: teacherId }).lean(),
      ExamFeedback.find({ exam: { $in: examIds } }).lean(),
    ]);
    const attemptStudentIds = attempts.map((item) => item.studentId).filter(Boolean);
    const feedbackStudentIds = feedback.map((item) => item.studentId).filter(Boolean);
    const referencedStudentIds = [...attemptStudentIds, ...feedbackStudentIds];
    const studentOr = [{ connectedTeachers: teacherId }, { _id: { $in: referencedStudentIds } }];
    if (classIds.length) studentOr.push({ connectedClasses: { $in: classIds } });
    const students = await User.find({ role: 'student', $or: studentOr })
      .select('_id name phone roll connectedTeachers connectedClasses bannedByTeachers createdAt updatedAt')
      .lean();

    const cleanClasses = asJson(classes).map((item) => { delete item.accessCode; return item; });
    const cleanExams = asJson(exams).map((item) => { delete item.examCode; delete item.accessCode; return item; });
    const cleanAttempts = asJson(attempts).map((item) => { delete item.ipAddress; return item; });
    const ownClasses = new Set(classIds.map(String));
    const cleanStudents = students.map((student) => ({
      _id: String(student._id),
      name: student.name,
      phone: student.phone || '',
      roll: student.roll || '',
      classIds: (student.connectedClasses || []).map(String).filter((id) => ownClasses.has(id)),
      legacyConnected: (student.connectedTeachers || []).some((id) => String(id) === String(teacherId)),
      bannedByTeacher: (student.bannedByTeachers || []).some((id) => String(id) === String(teacherId)),
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    }));
    const data = {
      classes: cleanClasses,
      exams: cleanExams,
      questions: asJson(questions),
      attempts: cleanAttempts,
      students: asJson(cleanStudents),
      announcements: asJson(announcements),
      feedback: asJson(feedback),
      diagrams: asJson(diagrams),
    };
    const zip = new JSZip();
    const includedFiles = new Set();
    const missingFiles = new Set();
    portableize(data, zip, includedFiles, missingFiles);
    const manifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      teacherId: String(teacherId),
      createdAt: new Date().toISOString(),
      records: countData(data),
      mediaFiles: includedFiles.size,
      missingMediaReferences: [...missingFiles],
      passwordsAndShareCodesIncluded: false,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('data.json', JSON.stringify(data));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `teacher-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buffer);
  } catch (err) {
    console.error('Teacher backup export failed:', err.message);
    res.status(500).json({ message: 'শিক্ষক backup ZIP তৈরি করা যায়নি' });
  }
};

exports.restoreBackup = async (req, res) => {
  const archivePath = req.file?.path;
  const createdFiles = [];
  let session;
  try {
    if (!req.file) return res.status(400).json({ message: 'একটি ZIP backup file বেছে নিন' });
    const stat = fs.statSync(archivePath);
    if (stat.size > MAX_ARCHIVE_BYTES) return res.status(413).json({ message: 'ZIP backup hosting/server-এর অনুমোদিত আকারের চেয়ে বড়' });
    const archiveBytes = fs.readFileSync(archivePath);
    const zip = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
    const entries = Object.values(zip.files).filter((file) => !file.dir);
    if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('ZIP-এ অনুমোদিত সীমার বেশি file আছে');
    let expandedBytes = 0;
    for (const entry of entries) {
      if (entry.name !== 'manifest.json' && entry.name !== 'data.json' && !/^files\/[a-f0-9]{64}(?:\.[a-z0-9]{1,12})?$/.test(entry.name)) {
        throw new Error('ZIP-এ অচেনা বা নিরাপদ নয় এমন file path আছে');
      }
      expandedBytes += entry._data?.uncompressedSize || 0;
      if (expandedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP extract size সার্ভারের নিরাপদ সীমা ছাড়িয়েছে');
    }
    const manifestFile = zip.file('manifest.json');
    const dataFile = zip.file('data.json');
    if (!manifestFile || !dataFile) throw new Error('ZIP-এ manifest.json অথবা data.json নেই');
    const manifest = JSON.parse(await manifestFile.async('string'));
    const data = JSON.parse(await dataFile.async('string'));
    if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) throw new Error('এই ZIP backup format/version সমর্থিত নয়');
    if (String(manifest.teacherId) !== String(req.user.id)) throw new Error('এই backup অন্য শিক্ষক account-এর; শুধু যিনি এটি export করেছেন তিনিই restore করতে পারবেন');
    validateRecords(data);

    const restoreId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const mediaDir = path.join(UPLOADS_DIR, 'teacher-backups', String(req.user.id), restoreId);
    const filePaths = new Map();
    for (const entry of entries) {
      if (!entry.name.startsWith('files/')) continue;
      const bytes = await zip.file(entry.name).async('nodebuffer');
      const ext = path.extname(entry.name).slice(0, 12).replace(/[^.a-z0-9]/gi, '');
      const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
      const destination = path.join(mediaDir, filename);
      fs.mkdirSync(mediaDir, { recursive: true });
      fs.writeFileSync(destination, bytes, { flag: 'wx' });
      createdFiles.push(destination);
      filePaths.set(entry.name, `/uploads/teacher-backups/${req.user.id}/${restoreId}/${filename}`);
    }
    remapFiles(data, filePaths);

    session = await mongoose.startSession();
    let stats = {};
    await session.withTransaction(async () => {
      stats = { classes: 0, exams: 0, questions: 0, attempts: 0, students: 0, announcements: 0, feedback: 0, diagrams: 0, skippedExisting: 0 };
      const classMap = new Map();
      const examMap = new Map();
      const questionMap = new Map();
      const attemptMap = new Map();
      const studentMap = new Map();
      const usedClassCodes = new Set();
      const usedExamCodes = new Set();

      for (const item of data.classes) {
        const sourceId = String(item._id);
        const existingId = await Class.findById(sourceId).session(session);
        if (existingId) {
          if (String(existingId.teacher) !== String(req.user.id)) throw new Error('Backup class ID অন্য account-এর data-এর সঙ্গে মিলে গেছে');
          classMap.set(sourceId, existingId._id);
          stats.skippedExisting++;
          continue;
        }
        let name = String(item.name || '').trim().slice(0, 100) || 'Restored class';
        let suffix = 1;
        while (await Class.exists({ teacher: req.user.id, name }).session(session)) {
          suffix++;
          name = `${String(item.name || 'Restored class').trim().slice(0, 80)} (restored ${suffix})`;
        }
        const payload = { ...item, _id: sourceId, teacher: req.user.id, name, accessCode: await generateUniqueClassCode(usedClassCodes) };
        delete payload.__v;
        await Class.create([payload], { session });
        classMap.set(sourceId, new mongoose.Types.ObjectId(sourceId));
        stats.classes++;
      }

      for (const item of data.exams) {
        const sourceId = String(item._id);
        const existing = await Exam.findById(sourceId).session(session);
        if (existing) {
          if (String(existing.teacher) !== String(req.user.id)) throw new Error('Backup exam ID অন্য account-এর data-এর সঙ্গে মিলে গেছে');
          examMap.set(sourceId, existing._id);
          stats.skippedExisting++;
          continue;
        }
        const payload = { ...item, _id: sourceId, teacher: req.user.id, classRefs: (item.classRefs || []).map((id) => classMap.get(String(id))) };
        payload.examCode = await generateUniqueExamCode(usedExamCodes);
        payload.accessCode = item.accessCode ? crypto.randomBytes(3).toString('hex').toUpperCase() : undefined;
        delete payload.__v;
        await Exam.create([payload], { session });
        examMap.set(sourceId, new mongoose.Types.ObjectId(sourceId));
        stats.exams++;
      }

      for (const item of data.questions) {
        const sourceId = String(item._id);
        const existing = await Question.findById(sourceId).session(session);
        if (existing) {
          if (String(existing.exam) !== String(examMap.get(String(item.exam)))) throw new Error('Backup question ID অন্য exam-এর data-এর সঙ্গে মিলে গেছে');
          questionMap.set(sourceId, existing._id);
          stats.skippedExisting++;
          continue;
        }
        const payload = { ...item, _id: sourceId, exam: examMap.get(String(item.exam)) };
        delete payload.__v;
        await Question.create([payload], { session });
        questionMap.set(sourceId, new mongoose.Types.ObjectId(sourceId));
        stats.questions++;
      }

      for (const item of data.students) {
        const sourceId = String(item._id);
        let student = await User.findById(sourceId).session(session);
        if (student && student.role !== 'student') student = null;
        if (!student && item.phone) student = await User.findOne({ role: 'student', phone: item.phone }).session(session);
        let studentId;
        if (student) {
          studentId = student._id;
        } else {
          const idCollision = await User.findById(sourceId).session(session);
          studentId = idCollision ? new mongoose.Types.ObjectId() : new mongoose.Types.ObjectId(sourceId);
          const phoneTaken = item.phone ? await User.exists({ phone: item.phone }).session(session) : false;
          const payload = {
            _id: studentId,
            role: 'student',
            name: String(item.name || 'Restored student').slice(0, 120),
            roll: String(item.roll || '').slice(0, 80),
            connectedTeachers: item.legacyConnected ? [req.user.id] : [],
            connectedClasses: [],
          };
          if (item.phone && !phoneTaken) payload.phone = item.phone;
          await User.create([payload], { session });
          stats.students++;
        }
        const mappedClasses = (item.classIds || []).map((id) => classMap.get(String(id))).filter(Boolean);
        const update = { $addToSet: { connectedTeachers: req.user.id, connectedClasses: { $each: mappedClasses } } };
        if (item.bannedByTeacher) update.$addToSet.bannedByTeachers = req.user.id;
        else update.$pull = { bannedByTeachers: req.user.id };
        await User.updateOne({ _id: studentId, role: 'student' }, update, { session });
        studentMap.set(sourceId, studentId);
      }

      for (const item of data.attempts) {
        const sourceId = String(item._id);
        const existing = await Attempt.findById(sourceId).session(session);
        if (existing) {
          if (String(existing.exam) !== String(examMap.get(String(item.exam)))) throw new Error('Backup attempt ID অন্য exam-এর data-এর সঙ্গে মিলে গেছে');
          attemptMap.set(sourceId, existing._id);
          stats.skippedExisting++;
          continue;
        }
        const optionOrderMap = {};
        for (const [questionId, order] of Object.entries(item.optionOrderMap || {})) {
          const mappedQuestionId = questionMap.get(String(questionId));
          if (mappedQuestionId) optionOrderMap[String(mappedQuestionId)] = order;
        }
        const payload = {
          ...item,
          _id: sourceId,
          exam: examMap.get(String(item.exam)),
          studentId: item.studentId ? (studentMap.get(String(item.studentId)) || null) : null,
          questionOrder: (item.questionOrder || []).map((id) => questionMap.get(String(id)) || id),
          answers: (item.answers || []).map((answer) => ({ ...answer, question: questionMap.get(String(answer.question)) || answer.question })),
          optionOrderMap,
        };
        delete payload.ipAddress;
        delete payload.__v;
        await Attempt.create([payload], { session });
        attemptMap.set(sourceId, new mongoose.Types.ObjectId(sourceId));
        stats.attempts++;
      }

      for (const item of data.feedback) {
        const existing = await ExamFeedback.findById(item._id).session(session);
        if (existing) { stats.skippedExisting++; continue; }
        const duplicateAttempt = await ExamFeedback.findOne({ attempt: attemptMap.get(String(item.attempt)) }).session(session);
        if (duplicateAttempt) { stats.skippedExisting++; continue; }
        const payload = { ...item, exam: examMap.get(String(item.exam)), attempt: attemptMap.get(String(item.attempt)), studentId: studentMap.get(String(item.studentId)) || item.studentId };
        delete payload.__v;
        await ExamFeedback.create([payload], { session });
        stats.feedback++;
      }

      for (const item of data.announcements) {
        const existing = await Announcement.findById(item._id).session(session);
        if (existing) {
          if (String(existing.teacher) !== String(req.user.id)) throw new Error('Backup message ID অন্য account-এর data-এর সঙ্গে মিলে গেছে');
          stats.skippedExisting++;
          continue;
        }
        const payload = { ...item, teacher: req.user.id, classRefs: (item.classRefs || []).map((id) => classMap.get(String(id))).filter(Boolean) };
        if (item.exam) payload.exam = examMap.get(String(item.exam));
        delete payload.__v;
        await Announcement.create([payload], { session });
        stats.announcements++;
      }

      for (const item of data.diagrams) {
        const existing = await Diagram.findById(item._id).session(session);
        if (existing) {
          if (String(existing.teacher) !== String(req.user.id)) throw new Error('Backup diagram ID অন্য account-এর data-এর সঙ্গে মিলে গেছে');
          stats.skippedExisting++;
          continue;
        }
        await Diagram.create([{ ...item, teacher: req.user.id, __v: undefined }], { session });
        stats.diagrams++;
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

    res.json({
      message: 'Backup restore সম্পন্ন হয়েছে। আগে থেকেই থাকা record overwrite বা delete করা হয়নি।',
      restored: stats,
      credentialsRestored: false,
    });
  } catch (err) {
    for (const createdPath of createdFiles) { try { fs.unlinkSync(createdPath); } catch (_) {} }
    console.error('Teacher backup restore failed:', err.message);
    const transactionUnsupported = /Transaction numbers are only allowed|replica set|does not support transactions/i.test(err.message || '');
    const status = transactionUnsupported ? 503 : (/অন্য account|format\/version|অচেনা|সঠিক নয়|নেই|duplicate|সীমা|অন্য exam|referenced media|অনিরাপদ property/i.test(err.message) ? 400 : 500);
    res.status(status).json({ message: transactionUnsupported ? 'এই সার্ভারের MongoDB deployment transaction সমর্থন করে না; restore করা যায়নি। Replica set বা transaction-enabled MongoDB ব্যবহার করুন।' : (err.message || 'Backup restore করা যায়নি') });
  } finally {
    if (session) await session.endSession().catch(() => {});
    if (archivePath) { try { fs.unlinkSync(archivePath); } catch (_) {} }
  }
};
