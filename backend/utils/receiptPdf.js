// ================== utils/receiptPdf.js ==================
// সফল পেমেন্টের রসিদ/ইনভয়েস PDF। বাংলা + ইংরেজি দুই ভাষাতেই লেখা থাকে (শিক্ষকের সাইটের ভাষা যা-ই হোক)।
// ফন্ট: utils/pdfFonts.js (বাংলা অংশ Bangla ফন্টে, বাকি সব DejaVu Sans-এ)।
const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');
const { registerFonts, writeText } = require('./pdfFonts');

const BRAND = () => process.env.SITE_NAME || 'MCQ Exam Platform';

// রসিদ পাওয়ার যোগ্য কিনা: পেমেন্ট সফল হয়ে সাবস্ক্রিপশন চালু হয়েছে (বা পরে অ্যাডমিন স্থগিত করেছেন)।
// ফ্রি ট্রায়াল ও অ্যাডমিনের নিজে দেওয়া সাবস্ক্রিপশনে কোনো পেমেন্ট হয়নি, তাই রসিদ নেই।
const isReceiptEligible = (sub) =>
  !!sub &&
  ['active', 'suspended'].includes(sub.status) &&
  Number(sub.amount) > 0 &&
  !sub.isTrial &&
  sub.method !== 'admin';

// রসিদ নম্বর: RCPT-তারিখ-আইডির শেষ ৬ অক্ষর (একই সাবস্ক্রিপশনে সবসময় একই নম্বর)
const receiptNumber = (sub) => {
  const d = new Date(sub.createdAt || Date.now());
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d).reduce((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
  const ymd = `${dateParts.year}${dateParts.month}${dateParts.day}`;
  return `RCPT-${ymd}-${String(sub._id).slice(-6).toUpperCase()}`;
};

const PROVIDER = {
  bkash: 'bKash / বিকাশ',
  nagad: 'Nagad / নগদ',
  rocket: 'Rocket / রকেট',
  sslcommerz: 'Online (SSLCommerz) / অনলাইন',
  rupantorpay: 'Online (RupantorPay) / অনলাইন',
  promo: 'Promo code (100% off) / প্রোমো কোড',
};

// ঢাকার সময়ে তারিখ (সার্ভার যেখানেই চলুক): 08 Oct 2026, 03:45 PM
const fmtDate = (d, withTime = false) => {
  if (!d) return '-';
  const opts = { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: true });
  return new Date(d).toLocaleString('en-GB', opts).replace(',', withTime ? ',' : '');
};
const fmtMoney = (n) => `৳${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * রসিদ PDF আঁকে এবং stream (res) এ পাইপ করে।
 * data: { sub, teacher: {name,email}, logo: Buffer|null (PNG/JPEG), issuedAt }
 */
function buildReceipt(stream, { sub, teacher, logo, issuedAt = new Date() }) {
  const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: `Receipt ${receiptNumber(sub)}` } });
  doc.pipe(stream);
  const fonts = registerFonts(doc);
  const W = (text, size, opts, color) => {
    doc.fillColor(color || '#111827').fontSize(size);
    writeText(doc, fonts, text, opts);
  };

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const right = left + width;

  // ---------- হেডার ----------
  let textX = left;
  if (logo) {
    try {
      doc.image(logo, left, 44, { fit: [46, 46] });
      textX = left + 58;
    } catch (e) { /* লোগো পড়া না গেলে বাদ */ }
  }
  doc.x = textX; doc.y = 48;
  W(BRAND(), 18, { width: width - (textX - left) - 150, lineBreak: false }, '#1d4ed8');
  doc.x = textX; doc.y = 72;
  W('Payment Receipt / পেমেন্ট রসিদ', 11, { lineBreak: false }, '#4b5563');

  // PAID ব্যাজ (ডানে)
  doc.roundedRect(right - 92, 46, 92, 30, 6).fill('#dcfce7');
  doc.x = right - 92; doc.y = 54;
  W('PAID / পরিশোধিত', 9, { width: 92, align: 'center' }, '#166534');

  doc.moveTo(left, 102).lineTo(right, 102).lineWidth(1.2).strokeColor('#1d4ed8').stroke();

  // ---------- রসিদের তথ্য ----------
  doc.x = left; doc.y = 116;
  const row = (label, value, o = {}) => {
    const y = doc.y;
    doc.x = left; doc.y = y;
    W(label, 10, { width: 190, lineBreak: false }, '#6b7280');
    doc.x = left + 195; doc.y = y;
    W(String(value ?? '-') || '-', o.size || 10.5, { width: width - 195 }, o.color);
    doc.moveDown(0.35);
  };
  const section = (title) => {
    doc.moveDown(0.6);
    const y = doc.y;
    doc.rect(left, y, width, 20).fill('#f3f4f6');
    doc.x = left + 8; doc.y = y + 5;
    W(title, 10.5, { lineBreak: false }, '#111827');
    doc.x = left; doc.y = y + 28;
  };

  const gateway = sub.method === 'gateway';
  const txnId = gateway ? sub.tranId : sub.trxId;

  section('Receipt details / রসিদের বিবরণ');
  row('Receipt No / রসিদ নম্বর', receiptNumber(sub), { color: '#1d4ed8' });
  row('Issued on / ইস্যুর তারিখ', fmtDate(issuedAt, true));
  row('Payment date / পেমেন্টের তারিখ', fmtDate(sub.createdAt, true));
  if (!gateway && sub.reviewedAt) row('Approved on / অনুমোদনের তারিখ', fmtDate(sub.reviewedAt, true));

  section('Billed to / গ্রাহক (শিক্ষক)');
  row('Name / নাম', teacher?.name);
  if (teacher?.email) row('Email / ইমেইল', teacher.email);

  section('Subscription / সাবস্ক্রিপশন');
  row('Plan / প্ল্যান', sub.planName);
  row('Duration / মেয়াদ', `${sub.durationDays} days / দিন`);
  row('Valid from / শুরু', fmtDate(sub.startsAt));
  row('Valid until / শেষ', fmtDate(sub.expiresAt));
  row(
    'Exam limit / পরীক্ষার সীমা',
    sub.examLimitType === 'limited' ? `${sub.examLimit} exams / টি পরীক্ষা` : 'Unlimited / আনলিমিটেড'
  );

  section('Payment / পেমেন্ট');
  row('Method / মাধ্যম', PROVIDER[sub.provider] || sub.provider || '-');
  if (txnId) row(gateway ? 'Transaction ID / ট্রানজেকশন আইডি' : 'TrxID / ট্রানজেকশন আইডি', txnId);
  if (gateway && sub.gatewayValId) row('Gateway Ref / গেটওয়ে রেফারেন্স', sub.gatewayValId);
  if (!gateway && sub.senderNumber) row('Sender number / প্রেরকের নাম্বার', sub.senderNumber);

  // ---------- টাকার হিসাব ----------
  doc.moveDown(0.8);
  const boxY = doc.y;
  const hasDiscount = sub.promoCode && sub.originalAmount != null && sub.originalAmount > sub.amount;
  const boxH = hasDiscount ? 92 : 56;
  doc.roundedRect(left, boxY, width, boxH, 6).lineWidth(0.8).strokeColor('#d1d5db').stroke();

  const line = (label, value, y, bold, color) => {
    doc.x = left + 12; doc.y = y;
    W(label, bold ? 11.5 : 10, { width: width - 140, lineBreak: false }, color || '#374151');
    doc.x = right - 128; doc.y = y;
    W(value, bold ? 13 : 10.5, { width: 116, align: 'right' }, color || '#111827');
  };
  let y = boxY + 10;
  if (hasDiscount) {
    line('Plan price / প্ল্যানের দাম', fmtMoney(sub.originalAmount), y);
    y += 20;
    line(`Discount (${sub.promoCode}, ${sub.discountPercent || 0}%) / ছাড়`, `-${fmtMoney(sub.originalAmount - sub.amount)}`, y, false, '#047857');
    y += 22;
    doc.moveTo(left + 12, y - 4).lineTo(right - 12, y - 4).lineWidth(0.6).strokeColor('#e5e7eb').stroke();
  }
  line('Total paid / মোট পরিশোধ', fmtMoney(sub.amount), y + 4, true, '#1d4ed8');

  // ---------- ফুটার ----------
  doc.x = left; doc.y = boxY + boxH + 28;
  W('This is a computer-generated receipt and does not require a signature.', 9, { width, align: 'center' }, '#6b7280');
  W('এটি কম্পিউটারে তৈরি রসিদ, স্বাক্ষরের প্রয়োজন নেই।', 9, { width, align: 'center' }, '#6b7280');

  doc.end();
}

function buildReceiptBuffer(data) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    try { buildReceipt(stream, data); } catch (err) { reject(err); }
  });
}

module.exports = { buildReceipt, buildReceiptBuffer, isReceiptEligible, receiptNumber };
