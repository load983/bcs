const SiteSettings = require('../models/SiteSettings');
const messaging = require('../utils/messaging');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;

exports.get = async (req, res) => {
  try {
    const config = await messaging.config();
    res.json({
      emailEnabled: !!config.emailEnabled,
      smtpHost: config.smtpHost || '',
      smtpPort: config.smtpPort || 587,
      smtpUser: config.smtpUser || '',
      fromEmail: config.fromEmail || '',
      fromName: config.fromName || '',
      hasSmtpPass: !!config.smtpPass,
      smsEnabled: !!config.smsEnabled,
      smsExamEnabled: config.smsExamEnabled !== false,
      smsResultEnabled: config.smsResultEnabled !== false,
      twilioSid: config.twilioSid || '',
      twilioFrom: config.twilioFrom || '',
      hasTwilioToken: !!config.twilioToken,
    });
  } catch (error) {
    console.error('Messaging settings load failed:', error.message);
    res.status(500).json({ message: 'সেটিংস লোড করা যায়নি' });
  }
};

exports.save = async (req, res) => {
  try {
    const body = req.body || {};
    const settings = await SiteSettings.findOneAndUpdate(
      { key: 'main' },
      { $setOnInsert: { key: 'main' } },
      { upsert: true, new: true }
    );

    const stringFields = ['smtpHost', 'smtpUser', 'fromEmail', 'fromName', 'twilioSid', 'twilioFrom'];
    for (const field of stringFields) {
      if (body[field] !== undefined) {
        if (typeof body[field] !== 'string') {
          return res.status(400).json({ message: 'সেটিংসের ফরম্যাট সঠিক নয়' });
        }
        settings.set(`messaging.${field}`, body[field].trim());
      }
    }

    for (const field of ['emailEnabled', 'smsEnabled', 'smsExamEnabled', 'smsResultEnabled']) {
      if (body[field] !== undefined) settings.set(`messaging.${field}`, body[field] === true || body[field] === 'true');
    }

    if (body.smtpPort !== undefined) {
      const port = Number(body.smtpPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return res.status(400).json({ message: 'SMTP port ১–৬৫৫৩৫-এর মধ্যে হতে হবে' });
      }
      settings.set('messaging.smtpPort', port);
    }

    if (body.smtpPass !== undefined && body.smtpPass !== '') {
      if (typeof body.smtpPass !== 'string' || body.smtpPass.length > 4096) {
        return res.status(400).json({ message: 'SMTP password-এর ফরম্যাট সঠিক নয়' });
      }
      settings.set('messaging.smtpPassEnc', messaging.encrypt(body.smtpPass));
    }
    if (body.twilioToken !== undefined && body.twilioToken !== '') {
      if (typeof body.twilioToken !== 'string' || body.twilioToken.length > 4096) {
        return res.status(400).json({ message: 'Twilio token-এর ফরম্যাট সঠিক নয়' });
      }
      settings.set('messaging.twilioTokenEnc', messaging.encrypt(body.twilioToken));
    }

    await settings.save();
    res.json({ message: 'ইমেইল/SMS সেটিংস সংরক্ষিত হয়েছে' });
  } catch (error) {
    console.error('Messaging settings save failed:', error.message);
    res.status(400).json({ message: 'সেটিংস সংরক্ষণ করা যায়নি' });
  }
};

exports.test = async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();

    if (!email && !phone) {
      return res.status(400).json({ message: 'টেস্টের জন্য একটি ইমেইল বা ফোন নম্বর দিন' });
    }
    if (email && !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'সঠিক টেস্ট ইমেইল ঠিকানা দিন' });
    }
    if (phone && !E164_RE.test(phone)) {
      return res.status(400).json({ message: 'ফোন নম্বরটি E.164 ফরম্যাটে দিন, যেমন +8801XXXXXXXXX' });
    }

    const config = await messaging.config();
    const emailConfigured = !!(config.smtpHost && config.smtpUser && config.smtpPass && config.fromEmail);
    const smsConfigured = !!(config.twilioSid && config.twilioToken && config.twilioFrom);

    const [emailStatus, smsStatus] = await Promise.all([
      !email ? 'not_requested'
        : !config.emailEnabled ? 'disabled'
          : !emailConfigured ? 'incomplete'
            : await messaging.sendEmail(email, 'Notification test', 'Your email notification setup is working.') ? 'sent' : 'failed',
      !phone ? 'not_requested'
        : !config.smsEnabled ? 'disabled'
          : !smsConfigured ? 'incomplete'
            : await messaging.sendSms(phone, 'Notification test: SMS setup is working.') ? 'sent' : 'failed',
    ]);

    const statuses = [emailStatus, smsStatus].filter((status) => status !== 'not_requested');
    const successes = statuses.filter((status) => status === 'sent').length;
    const message = successes === statuses.length
      ? 'টেস্ট নোটিফিকেশন পাঠানো হয়েছে'
      : successes > 0
        ? 'কিছু টেস্ট নোটিফিকেশন পাঠানো হয়েছে; ব্যর্থ চ্যানেলের সেটিংস পরীক্ষা করুন'
        : 'কোনো টেস্ট নোটিফিকেশন পাঠানো যায়নি; চ্যানেল ও সেটিংস পরীক্ষা করুন';

    res.json({
      message,
      emailStatus,
      smsStatus,
      emailSent: emailStatus === 'not_requested' ? null : emailStatus === 'sent',
      smsSent: smsStatus === 'not_requested' ? null : smsStatus === 'sent',
    });
  } catch (error) {
    console.error('Messaging test delivery failed:', error.message);
    res.status(500).json({ message: 'টেস্ট পাঠাতে সমস্যা হয়েছে; সার্ভার লগ ও provider সেটিংস পরীক্ষা করুন' });
  }
};
