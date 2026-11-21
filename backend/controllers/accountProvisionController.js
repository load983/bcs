const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Class = require('../models/Class');
const Sequence = require('../models/Sequence');
const { grantTrialIfEnabled } = require('../utils/trial');
const {
  encryptCredential, generatePassword, generateRoll, normalizeRow, parseFile,
  credentialsFromUser, generateCredentialsExcel, generateCredentialsPdf,
  generateStudentImportTemplate,
} = require('../utils/accountProvision');
const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const normPhone = (v) => {
  let p = String(v || '').trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/[\s()-]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  else if (p.startsWith('880')) p = `+${p}`;
  else if (/^01\d{9}$/.test(p)) p = `+880${p.slice(1)}`;
  return p;
};
const normRoll = (v) => String(v || '').trim().replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\s+/g, '');
const validId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));
const uniqueAccessCode = async () => {
  let code;
  do { code = require('crypto').randomBytes(3).toString('hex').toUpperCase(); } while (await User.exists({ accessCode: code }));
  return code;
};
const uniqueRoll = async () => {
  // findOneAndUpdate + $inc makes concurrent manual/import requests receive
  // different values. Start at 100001, then skip any legacy numeric rolls.
  let roll;
  do {
    const sequence = await Sequence.findOneAndUpdate(
      { _id: 'user-roll' },
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    roll = generateRoll(sequence.value);
  } while (await User.exists({ roll }));
  return roll;
};
const classesFor = async (classIds, ownerId, isAdmin = false) => {
  const ids = Array.isArray(classIds) ? classIds.filter(validId) : (classIds ? [classIds].filter(validId) : []);
  if (!ids.length) return [];
  const q = { _id: { $in: ids } };
  if (!isAdmin) q.teacher = ownerId;
  return Class.find(q).select('_id name accessCode teacher').lean();
};
const createAccount = async ({ body, ownerId, isAdmin = false }) => {
  const role = String(body.role || 'student').toLowerCase() === 'teacher' ? 'teacher' : 'student';
  const name = String(body.name || '').trim();
  if (name.length < 2) throw Object.assign(new Error('নাম লিখুন'), { status: 400 });
  let email = String(body.email || '').trim().toLowerCase();
  let phone = normPhone(body.phone);
  if (role === 'teacher') {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('শিক্ষকের সঠিক ইমেইল দিন'), { status: 400 });
    if (await User.exists({ email })) throw Object.assign(new Error('এই ইমেইল আগে থেকেই ব্যবহৃত হচ্ছে'), { status: 400 });
  } else {
    if (!phone || !PHONE_RE.test(phone)) throw Object.assign(new Error('স্টুডেন্টের সঠিক মোবাইল নম্বর দিন'), { status: 400 });
    if (await User.exists({ phone })) throw Object.assign(new Error('এই মোবাইল নম্বর আগে থেকেই ব্যবহৃত হচ্ছে'), { status: 400 });
  }
  if (phone && await User.exists({ phone })) throw Object.assign(new Error('এই মোবাইল নম্বর আগে থেকেই ব্যবহৃত হচ্ছে'), { status: 400 });
  const password = String(body.password || '').trim() || generatePassword();
  if (password.length < 8) throw Object.assign(new Error('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'), { status: 400 });
  const classes = role === 'student' ? await classesFor(body.classIds || body.classId, ownerId, isAdmin) : [];
  if (role === 'student' && body.classId && !classes.length) throw Object.assign(new Error('নির্বাচিত শ্রেণী পাওয়া যায়নি'), { status: 400 });
  let roll = '';
  if (role === 'student') {
    roll = normRoll(body.roll) || await uniqueRoll();
    if (!/^\d+$/.test(roll)) throw Object.assign(new Error('রোল নম্বর শুধু numeric হতে হবে'), { status: 400 });
    if (await User.exists({ roll })) throw Object.assign(new Error('এই রোল নম্বর আগে থেকেই ব্যবহৃত হচ্ছে'), { status: 400 });
  }
  const user = await User.create({
    name, email: role === 'teacher' ? email : undefined, phone: role === 'student' ? phone : (phone || undefined),
    password: await bcrypt.hash(password, 10), role, roll, accessCode: role === 'teacher' ? await uniqueAccessCode() : undefined,
    connectedClasses: classes.map((c) => c._id), connectedTeachers: ownerId && role === 'student' && !classes.length ? [ownerId] : [],
    initialPasswordEnc: encryptCredential(password), credentialUpdatedAt: new Date(),
  });
  if (role === 'teacher') await grantTrialIfEnabled(user._id);
  return { user, password, classes };
};
const scopedUsers = async ({ role, ownerId, isAdmin, classId }) => {
  let users;
  if (isAdmin) users = await User.find({ role }).select('+initialPasswordEnc').sort({ createdAt: -1 }).lean();
  else {
    const classes = await Class.find({ teacher: ownerId }).select('_id name').lean();
    const selectedClass = classId && classes.find((c) => String(c._id) === String(classId));
    const scope = selectedClass
      ? { connectedClasses: selectedClass._id }
      : { $or: [{ connectedClasses: { $in: classes.map((c) => c._id) } }, { connectedTeachers: ownerId }] };
    users = await User.find({ role: 'student', ...scope }).select('+initialPasswordEnc').sort({ createdAt: -1 }).lean();
  }
  const classIds = [...new Set(users.flatMap((u) => (u.connectedClasses || []).map(String)))];
  const classes = await Class.find({ _id: { $in: classIds } }).select('name').lean();
  const names = new Map(classes.map((c) => [String(c._id), c.name]));
  return users.map((u) => credentialsFromUser(u, (u.connectedClasses || []).map((id) => ({ name: names.get(String(id)) })).filter((c) => c.name)));
};
const sendExport = async (req, res, isAdmin, format) => {
  const role = isAdmin ? (req.query.role === 'teacher' ? 'teacher' : 'student') : 'student';
  const rows = await scopedUsers({ role, ownerId: req.user.id, isAdmin, classId: req.query.classId });
  if (format === 'pdf') {
    const data = await generateCredentialsPdf(rows, req.query.lang);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=${role}-credentials.pdf` });
    return res.send(data);
  }
  const workbook = await generateCredentialsExcel(rows, req.query.lang);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=${role}-credentials.xlsx` });
  await workbook.xlsx.write(res); return res.end();
};
const importAccounts = async (req, res, isAdmin) => {
  if (!req.file) return res.status(400).json({ message: 'CSV, Excel, PDF, Word বা text file দিন' });
  try {
    const raw = await parseFile(req.file);
    const rows = Array.isArray(raw) ? raw : [raw];
    const created = [], failed = [];
    for (let i = 0; i < rows.length; i += 1) {
      try {
        const row = normalizeRow(rows[i]);
        if (!isAdmin) row.role = 'student';
        const body = { ...row };
        if (row.classId) body.classIds = [row.classId];
        else if (row.className) {
          const q = { name: row.className }; if (!isAdmin) q.teacher = req.user.id;
          const c = await Class.findOne(q).select('_id'); if (c) body.classIds = [c._id];
        }
        const result = await createAccount({ body, ownerId: req.user.id, isAdmin });
        created.push(credentialsFromUser(result.user, result.classes));
      } catch (err) { failed.push({ row: i + 2, message: err.message }); }
    }
    res.status(201).json({ message: `${created.length}টি account তৈরি হয়েছে`, created, failed });
  } finally { require('fs').unlink(req.file.path, () => {}); }
};
exports.adminCreate = async (req, res) => { try { const r = await createAccount({ body: req.body, isAdmin: true }); res.status(201).json({ message: 'Account তৈরি হয়েছে', credential: credentialsFromUser({ ...r.user.toObject(), initialPasswordEnc: encryptCredential(r.password) }, r.classes), password: r.password }); } catch (e) { res.status(e.status || 500).json({ message: e.message }); } };
exports.teacherCreateStudent = async (req, res) => { try { const r = await createAccount({ body: { ...req.body, role: 'student' }, ownerId: req.user.id }); res.status(201).json({ message: 'স্টুডেন্ট account তৈরি হয়েছে', credential: credentialsFromUser({ ...r.user.toObject(), initialPasswordEnc: encryptCredential(r.password) }, r.classes), password: r.password }); } catch (e) { res.status(e.status || 500).json({ message: e.message }); } };
exports.teacherBulkCreate = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ message: 'কমপক্ষে একজন শিক্ষার্থীর তথ্য দিন' });
    const created = [], failed = [];
    for (let i = 0; i < rows.length; i += 1) {
      try {
        const row = normalizeRow(rows[i]);
        const result = await createAccount({ body: { ...row, role: 'student', classIds: row.classId ? [row.classId] : undefined }, ownerId: req.user.id });
        created.push(credentialsFromUser(result.user, result.classes));
      } catch (err) { failed.push({ row: i + 1, message: err.message }); }
    }
    res.status(201).json({ message: `${created.length}টি student account তৈরি হয়েছে`, created, failed });
  } catch (e) { res.status(500).json({ message: e.message || 'Bulk account তৈরি করা যায়নি' }); }
};
exports.adminImport = (req, res) => importAccounts(req, res, true).catch((e) => res.status(400).json({ message: e.message }));
exports.teacherImport = (req, res) => importAccounts(req, res, false).catch((e) => res.status(400).json({ message: e.message }));
exports.adminExcel = (req, res) => sendExport(req, res, true, 'xlsx').catch((e) => res.status(500).json({ message: e.message }));
exports.adminPdf = (req, res) => sendExport(req, res, true, 'pdf').catch((e) => res.status(500).json({ message: e.message }));
exports.teacherExcel = (req, res) => sendExport(req, res, false, 'xlsx').catch((e) => res.status(500).json({ message: e.message }));
exports.teacherPdf = (req, res) => sendExport(req, res, false, 'pdf').catch((e) => res.status(500).json({ message: e.message }));
exports.studentImportTemplate = async (req, res) => {
  try {
    const workbook = await generateStudentImportTemplate();
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename=student-import-template.xlsx' });
    await workbook.xlsx.write(res); res.end();
  } catch (e) { res.status(500).json({ message: 'Template তৈরি করা যায়নি' }); }
};
