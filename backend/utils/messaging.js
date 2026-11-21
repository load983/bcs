const crypto = require('crypto');
const nodemailer = require('nodemailer');
const SiteSettings = require('../models/SiteSettings');
const key = () => crypto.createHash('sha256').update(`messaging:${process.env.JWT_SECRET || ''}`).digest();
const encrypt = (v) => { if (!v) return ''; const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv); const data = Buffer.concat([c.update(String(v), 'utf8'), c.final()]); return [iv, c.getAuthTag(), data].map(x => x.toString('base64')).join(':'); };
const decrypt = (v) => { try { const [iv, tag, data] = String(v || '').split(':').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', key(), iv); d.setAuthTag(tag); return Buffer.concat([d.update(data), d.final()]).toString(); } catch { return ''; } };
async function config() { const s = await SiteSettings.findOne({ key: 'main' }).select('+messaging.smtpPassEnc +messaging.twilioTokenEnc').lean(); const m = s?.messaging || {}; return { ...m, smtpPass: decrypt(m.smtpPassEnc), twilioToken: decrypt(m.twilioTokenEnc) }; }
async function sendEmail(to, subject, text, attachments = []) {
  const c = await config(); if (!c.emailEnabled || !c.smtpHost || !c.smtpUser || !c.smtpPass || !c.fromEmail || !to) return false;
  try { const transporter = nodemailer.createTransport({ host: c.smtpHost, port: Number(c.smtpPort) || 587, secure: Number(c.smtpPort) === 465, auth: { user: c.smtpUser, pass: c.smtpPass } }); await transporter.sendMail({ from: c.fromName ? `\"${c.fromName}\" <${c.fromEmail}>` : c.fromEmail, to, subject, text, attachments }); return true; } catch (e) { console.error('email delivery failed:', e.message); return false; }
}

// GSM-7 basic and extension alphabets. Extension characters consume two septets.
const GSM7_BASIC = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const GSM7_EXTENSION = new Set(Array.from('\f^{}\\[~]|€'));
const SMS_MAX_SEGMENTS = 10;
const splitGraphemes = (value) => (typeof Intl.Segmenter === 'function'
  ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), item => item.segment)
  : Array.from(value));
const gsmCost = (cluster) => Array.from(cluster).reduce((n, ch) => n + (GSM7_EXTENSION.has(ch) ? 2 : 1), 0);
const unicodeCost = (cluster) => cluster.length; // UTF-16 code units, as required by UCS-2 SMS limits
function smsMetrics(text) {
  const chars = splitGraphemes(String(text ?? '').replace(/\r\n?/g, '\n'));
  const gsm = chars.every(ch => GSM7_BASIC.has(ch) || GSM7_EXTENSION.has(ch));
  const encoding = gsm ? 'GSM-7' : 'UCS-2';
  const units = chars.reduce((n, ch) => n + (gsm ? gsmCost(ch) : unicodeCost(ch)), 0);
  const singleLimit = gsm ? 160 : 70;
  const multipartLimit = gsm ? 153 : 67;
  const segments = units <= singleLimit ? (units ? 1 : 0) : Math.ceil(units / multipartLimit);
  return { chars, encoding, units, segments, singleLimit, multipartLimit };
}
function prepareSms(text, maxSegments = SMS_MAX_SEGMENTS) {
  const original = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  const originalMetrics = smsMetrics(original);
  if (originalMetrics.segments <= maxSegments) return { text: original, encoding: originalMetrics.encoding, units: originalMetrics.units, segments: originalMetrics.segments, truncated: false };
  const suffix = originalMetrics.encoding === 'GSM-7' ? '...' : '…';
  const budget = originalMetrics.multipartLimit * maxSegments - smsMetrics(suffix).units;
  let prefix = ''; let used = 0;
  for (const ch of originalMetrics.chars) {
    const cost = originalMetrics.encoding === 'GSM-7' ? gsmCost(ch) : unicodeCost(ch);
    if (used + cost > budget) break;
    prefix += ch; used += cost;
  }
  // Keep the last whole word when truncating; avoid splitting Bengali grapheme sequences at arbitrary code units.
  const boundary = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('\n'));
  if (boundary > prefix.length * 0.6) prefix = prefix.slice(0, boundary);
  const shortened = `${prefix.trimEnd()}${suffix}`;
  const result = smsMetrics(shortened);
  return { text: shortened, encoding: result.encoding, units: result.units, segments: result.segments, truncated: true };
}
async function sendSms(to, text) {
  const c = await config(); if (!c.smsEnabled || !c.twilioSid || !c.twilioToken || !c.twilioFrom || !to) return false;
  const prepared = prepareSms(text);
  if (!prepared.text) return false;
  try {
    const body = new URLSearchParams({ To: String(to), From: c.twilioFrom, Body: prepared.text });
    const auth = Buffer.from(`${c.twilioSid}:${c.twilioToken}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.twilioSid)}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) throw new Error(`Twilio HTTP ${r.status}`);
    if (prepared.segments > 1 || prepared.truncated) console.info(`SMS accepted: ${prepared.encoding}, ${prepared.segments} segment(s)${prepared.truncated ? ', truncated to provider-safe limit' : ''}`);
    return true;
  } catch (e) { console.error('SMS delivery failed:', e.message); return false; }
}
async function notifyUser(user, subject, text, attachments = []) { const [email, sms] = await Promise.all([sendEmail(user.email, subject, text, attachments), sendSms(user.phone, text)]); return { email, sms }; }
module.exports = { config, encrypt, decrypt, sendEmail, sendSms, notifyUser, smsMetrics, prepareSms };
