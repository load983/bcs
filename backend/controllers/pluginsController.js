// ================== controllers/pluginsController.js ==================
// অ্যাডমিন প্যানেল → প্লাগইন: সব ইন্টিগ্রেশনের (পেমেন্ট গেটওয়ে, ম্যানুয়াল পেমেন্ট, AI সহকারী, ফ্রি ট্রায়াল) এক জায়গায় অবস্থা।
// state: active (চালু ও কাজ করছে) | off (বন্ধ) | setup (সেটআপ বাকি)
const { getSettings } = require('../utils/siteSettings');
const { getGatewayConfig } = require('../utils/gatewayConfig');
const { getAiConfig } = require('../utils/aiConfig');
const { getPaymentNumbers } = require('../utils/paymentNumbers');
const messaging = require('../utils/messaging');

exports.getPlugins = async (req, res) => {
  try {
    const [gw, ai, nums, s, msg] = await Promise.all([getGatewayConfig(req), getAiConfig(), getPaymentNumbers(), getSettings(), messaging.config()]);

    const gateway = (id, cfg, configured) => ({
      id,
      group: 'payment',
      state: gw.enabled && gw.active === id && configured ? 'active' : !configured ? 'setup' : 'off',
      configured,
      source: cfg.source,
      hint: cfg.hint || '',
      mode: id === 'sslcommerz' ? (gw.sandbox ? 'sandbox' : 'live') : '',
    });

    const anyNumber = Object.values(nums).some((v) => String(v || '').trim());
    const aiState = !ai.apiKey ? 'setup' : ai.enabled ? 'active' : 'off';
    const emailConfigured = !!(msg.smtpHost && msg.smtpUser && msg.smtpPass && msg.fromEmail);
    const smsConfigured = !!(msg.twilioSid && msg.twilioToken && msg.twilioFrom);
    const emailReady = !!msg.emailEnabled && emailConfigured;
    const smsReady = !!msg.smsEnabled && smsConfigured;
    const messagingEnabled = !!(msg.emailEnabled || msg.smsEnabled);

    res.json({
      plugins: [
        gateway('sslcommerz', { source: gw.source, hint: gw.passwordHint }, gw.configured),
        gateway('rupantorpay', { source: gw.rupantorpay.source, hint: gw.rupantorpay.hint }, gw.rupantorpay.configured),
        { id: 'manual', group: 'payment', state: anyNumber ? 'active' : 'setup', configured: anyNumber },
        { id: 'ai', group: 'tools', state: aiState, configured: !!ai.apiKey, provider: ai.provider },
        { id: 'trial', group: 'tools', state: s.trial?.enabled ? 'active' : 'off', configured: true, days: s.trial?.durationDays || 7 },
        {
          id: 'messaging',
          group: 'notifications',
          state: emailReady || smsReady ? 'active' : messagingEnabled ? 'setup' : 'off',
          configured: emailConfigured || smsConfigured,
          channels: {
            email: emailReady ? 'active' : msg.emailEnabled ? 'setup' : 'off',
            sms: smsReady ? 'active' : msg.smsEnabled ? 'setup' : 'off',
          },
        },
      ],
      gateway: { enabled: gw.enabled, active: gw.active, live: gw.live },
    });
  } catch (err) {
    console.error('plugins error:', err.message);
    res.status(500).json({ message: 'প্লাগইনের তালিকা লোড করা যায়নি' });
  }
};
