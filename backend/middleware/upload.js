// ================== middleware/upload.js ==================
// Multer কনফিগারেশন — ডিফল্টে শুধু PDF; পরীক্ষার প্রশ্নপত্রের জন্য PDF + Word (.docx/.doc)
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('শুধুমাত্র PDF ফাইল আপলোড করা যাবে'), false);
};

// প্রশ্নপত্র আপলোডের জন্য: PDF অথবা Word (.docx / .doc)
const DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const docFileFilter = (req, file, cb) => {
  const okExt = /\.(pdf|docx?)$/i.test(file.originalname || '');
  if (okExt && (DOC_MIMES.includes(file.mimetype) || file.mimetype === 'application/octet-stream')) cb(null, true);
  else cb(new Error('শুধুমাত্র PDF অথবা Word (.docx/.doc) ফাইল আপলোড করা যাবে'), false);
};

// চিত্রসহ PDF/DOCX অনেক সময় ১৫ MB ছাড়ায়; নিরাপদ সর্বোচ্চ ৫০ MB রাখা হলো।
const limits = { fileSize: 50 * 1024 * 1024 };
const uploader = multer({ storage, fileFilter, limits });
uploader.examSource = multer({ storage, limits, fileFilter: docFileFilter });
// Admin/teacher account import: CSV, Excel, PDF, Word, JSON বা text file। Parsing controller-এ হয়।
uploader.dataImport = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/\.(csv|xlsx|pdf|docx?|json|txt)$/i.test(file.originalname || '') ? cb(null, true) : cb(new Error('CSV, Excel (.xlsx), PDF, Word, JSON বা text file আপলোড করুন'))),
});

// মেসেজের single ছবি: পুরনো endpoint-এর জন্য রাখা
const imageFileFilter = (req, file, cb) => {
  const okExt = /\.(jpe?g|png|webp|gif)$/i.test(file.originalname || '');
  if (okExt && /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('শুধুমাত্র ছবি (JPG, PNG, WEBP, GIF) আপলোড করা যাবে'), false);
};
uploader.image = multer({ storage, fileFilter: imageFileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Teacher notification media: একসাথে সর্বোচ্চ ৮টি ছবি/ভিডিও, প্রতিটি সর্বোচ্চ ৫০ MB।
const mediaFileFilter = (req, file, cb) => {
  const okExt = /\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)$/i.test(file.originalname || '');
  const okType = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|x-m4v))$/.test(file.mimetype);
  if (okExt && okType) cb(null, true);
  else cb(new Error('শুধুমাত্র ছবি বা ভিডিও (JPG, PNG, WEBP, GIF, MP4, WEBM, MOV) আপলোড করা যাবে'), false);
};
uploader.notificationMedia = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 50 * 1024 * 1024, files: 8 },
});

// Teacher backup archives: ZIP only, with an environment-configurable upload cap.
uploader.teacherBackup = multer({
  storage,
  limits: { fileSize: Number(process.env.TEACHER_BACKUP_MAX_BYTES || 1024 * 1024 * 1024), files: 1 },
  fileFilter: (req, file, cb) => {
    const validExtension = /\.zip$/i.test(file.originalname || '');
    const validType = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype);
    if (validExtension && validType) cb(null, true);
    else cb(new Error('শুধুমাত্র ZIP backup file আপলোড করা যাবে'), false);
  },
});
uploader.roleBackup = multer({
  storage,
  limits: { fileSize: Number(process.env.ROLE_BACKUP_MAX_BYTES || process.env.TEACHER_BACKUP_MAX_BYTES || 1024 * 1024 * 1024), files: 1 },
  fileFilter: (req, file, cb) => (/\.zip$/i.test(file.originalname || '') && ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype) ? cb(null, true) : cb(new Error('শুধুমাত্র ZIP backup file আপলোড করা যাবে'), false)),
});
module.exports = uploader;
