const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const WordExtractor = require('word-extractor');
const { registerFonts, writeText } = require('./pdfFonts');

const secret = () => crypto.createHash('sha256').update(String(process.env.JWT_SECRET || 'credential-secret')).digest();
const encryptCredential = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
};
const decryptCredential = (value) => {
  try {
    const [iv, tag, data] = String(value || '').split('.');
    if (!iv || !tag || !data) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch { return ''; }
};
const generatePassword = () => crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
// The controller allocates the final value atomically. This helper remains
// exported for compatibility with older callers and now returns numeric text.
const generateRoll = (value = 100001) => String(Math.max(100001, Number(value) || 100001));
const clean = (v) => String(v ?? '').trim();

const normalizeRow = (row) => {
  const source = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const k = clean(key).toLowerCase().replace(/[\s_.-]+/g, '');
    source[k] = clean(value);
  });
  const pick = (...keys) => keys.map((k) => source[k]).find(Boolean) || '';
  const roleValue = pick('role', 'type', 'ধরন', 'রোল') || 'student';
  return {
    role: /teacher|শিক্ষক/i.test(roleValue) ? 'teacher' : 'student',
    name: pick('name', 'fullname', 'নাম'),
    email: pick('email', 'ইমেইল'),
    phone: pick('phone', 'mobile', 'mobilephone', 'ফোন', 'মোবাইল', 'নম্বর'),
    roll: pick('roll', 'rollnumber', 'rollno', 'রোল', 'রোলনম্বর'),
    password: pick('password', 'pass', 'পাসওয়ার্ড'),
    className: pick('class', 'classname', 'শ্রেণী', 'ক্লাস'),
    classId: pick('classid', 'শ্রেণীআইডি'),
  };
};
const parseDelimited = (text) => {
  const lines = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const split = (line) => line.split(delimiter).map((x) => x.trim().replace(/^['"]|['"]$/g, ''));
  const headers = split(lines[0]);
  const looksLikeHeader = headers.some((h) => /name|email|phone|mobile|password|roll|নাম|ফোন|মোবাইল|পাসওয়ার্ড|রোল/i.test(h));
  const keys = looksLikeHeader ? headers : ['name', 'phone', 'roll', 'password', 'class'];
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => Object.fromEntries(split(line).map((v, i) => [keys[i] || `field${i}`, v])));
};
const extractDocxText = async (filePath) => {
  const archive = await JSZip.loadAsync(fs.readFileSync(filePath));
  const entries = Object.values(archive.files);
  const expandedSize = entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
  if (expandedSize > 50 * 1024 * 1024) throw new Error('DOCX ফাইলের decompressed আকার সর্বোচ্চ ৫০ MB হতে পারবে');
  const documentFile = archive.file('word/document.xml');
  if (!documentFile || documentFile._data?.uncompressedSize > 10 * 1024 * 1024) {
    throw new Error('DOCX document অনুপস্থিত অথবা খুব বড়');
  }
  const xml = await documentFile.async('string');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DOCX-এ নিষিদ্ধ XML declaration রয়েছে');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('DOCX XML পড়া যায়নি');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, 'p'));
  return paragraphs.map((p) => Array.from(p.getElementsByTagNameNS(ns, 't')).map((node) => node.textContent || '').join('')).join('\n');
};
const parseFile = async (file) => {
  const ext = path.extname(file.originalname || file.path).toLowerCase();
  if (ext === '.xls') {
    throw new Error('পুরোনো .xls ফাইল সমর্থিত নয়; ফাইলটি .xlsx হিসেবে সেভ করে আবার দিন');
  }
  if (ext === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
    const sheet = workbook.worksheets[0];
    const rows = [];
    const headers = (sheet.getRow(1).values || []).slice(1).map((x) => clean(x));
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const values = (row.values || []).slice(1);
      rows.push(Object.fromEntries(headers.map((h, i) => [h || `field${i}`, clean(values[i])] )));
    });
    return rows;
  }
  if (ext === '.json') return JSON.parse(fs.readFileSync(file.path, 'utf8'));
  if (ext === '.pdf') return parseDelimited((await pdfParse(fs.readFileSync(file.path))).text);
  if (ext === '.docx') return parseDelimited(await extractDocxText(file.path));
  if (ext === '.doc') {
    const doc = await new WordExtractor().extract(file.path);
    return parseDelimited(doc.getBody());
  }
  return parseDelimited(fs.readFileSync(file.path, 'utf8'));
};
const credentialsFromUser = (user, classes = []) => ({
  _id: user._id,
  role: user.role,
  name: user.name,
  email: user.email || '',
  phone: user.phone || '',
  roll: user.roll || '',
  password: decryptCredential(user.initialPasswordEnc) || '',
  accessCode: user.accessCode || '',
  classes,
  createdAt: user.createdAt,
});
const generateCredentialsExcel = async (rows, lang = 'bn') => {
  const en = String(lang).toLowerCase() === 'en';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Login Credentials');
  sheet.columns = [
    { header: en ? 'Role' : 'রোল', key: 'role', width: 14 }, { header: en ? 'Name' : 'নাম', key: 'name', width: 26 },
    { header: en ? 'Email' : 'ইমেইল', key: 'email', width: 30 }, { header: en ? 'Phone' : 'মোবাইল', key: 'phone', width: 18 },
    { header: en ? 'Roll number' : 'রোল নম্বর', key: 'roll', width: 18 }, { header: en ? 'Password' : 'পাসওয়ার্ড', key: 'password', width: 18 },
    { header: en ? 'Class' : 'শ্রেণী', key: 'classes', width: 28 }, { header: en ? 'Teacher access code' : 'শিক্ষক এক্সেস কোড', key: 'accessCode', width: 22 },
  ];
  rows.forEach((r) => sheet.addRow({ ...r, classes: (r.classes || []).map((c) => c.name || c).join(', '), role: r.role === 'teacher' ? (en ? 'Teacher' : 'শিক্ষক') : (en ? 'Student' : 'শিক্ষার্থী') }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook;
};
const generateStudentImportTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Student Import');
  sheet.columns = [
    { header: 'name', key: 'name', width: 26 }, { header: 'phone', key: 'phone', width: 18 },
    { header: 'roll', key: 'roll', width: 16 }, { header: 'password', key: 'password', width: 18 },
    { header: 'class', key: 'class', width: 24 },
  ];
  sheet.addRow({ name: 'রহিম উদ্দিন', phone: '01700000001', roll: '101', password: 'StudentPass123', class: 'নবম শ্রেণী' });
  sheet.addRow({ name: 'করিম হাসান', phone: '01700000002', roll: '', password: '', class: 'নবম শ্রেণী' });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  sheet.getRow(2).font = { color: { argb: 'FF64748B' }, italic: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'E1' };
  return workbook;
};
const generateCredentialsPdf = (rows, lang = 'bn') => new Promise((resolve, reject) => {
  const en = String(lang).toLowerCase() === 'en';
  const doc = new PDFDocument({ margin: 36, size: 'A4' }); const chunks = []; const fonts = registerFonts(doc);
  doc.on('data', (x) => chunks.push(x)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  doc.fontSize(16); writeText(doc, fonts, en ? 'Account Login Credentials' : 'অ্যাকাউন্ট লগইন তথ্য', { align: 'center' }); doc.moveDown();
  rows.forEach((r, i) => { if (i && i % 5 === 0) doc.addPage(); doc.fontSize(11); writeText(doc, fonts, `${i + 1}. ${r.role === 'teacher' ? (en ? 'Teacher' : 'শিক্ষক') : (en ? 'Student' : 'শিক্ষার্থী')} — ${r.name}`); doc.fontSize(9); writeText(doc, fonts, `Email: ${r.email || '-'}   Phone: ${r.phone || '-'}   Roll: ${r.roll || '-'}`); doc.fontSize(10); writeText(doc, fonts, `Password: ${r.password || '-'}   Class: ${(r.classes || []).map((c) => c.name || c).join(', ') || '-'}`); if (r.accessCode) writeText(doc, fonts, `Access code: ${r.accessCode}`); doc.moveDown(0.8); });
  doc.end();
});
module.exports = { encryptCredential, decryptCredential, generatePassword, generateRoll, normalizeRow, parseFile, credentialsFromUser, generateCredentialsExcel, generateStudentImportTemplate, generateCredentialsPdf };
