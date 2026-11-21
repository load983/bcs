// ================== controllers/aiSettingsController.js ==================
// অ্যাডমিন প্যানেল: AI সহকারী চালু/বন্ধ, কোম্পানি (Claude/Gemini), API key, মডেল ও মেসেজ লিমিট
const { getSettings } = require('../utils/siteSettings');
const { getAiConfig, encrypt, cleanBaseUrl, MODEL_PRESETS, DEFAULT_MODEL, GEMINI_PRESETS, DEFAULT_GEMINI_MODEL, OPENAI_ENDPOINTS, DEFAULT_OPENAI_MODEL } = require('../utils/aiConfig');
const { callModel, explainFailure } = require('../utils/aiProvider');

const pub = (p, presets, defaultModel) => ({
  hasKey: !!p.apiKey,
  source: p.source, // admin | env | none
  keyHint: p.keyHint,
  model: p.modelSaved,
  effectiveModel: p.model,
  presets,
  defaultModel,
});

const view = (c) => ({
  enabled: c.enabled,
  provider: c.provider,
  hasKey: !!c.apiKey,
  source: c.source,
  keyHint: c.keyHint,
  effectiveModel: c.model,
  anthropic: pub(c.providers.anthropic, MODEL_PRESETS, DEFAULT_MODEL),
  gemini: pub(c.providers.gemini, GEMINI_PRESETS, DEFAULT_GEMINI_MODEL),
  openai: {
    ...pub(c.providers.openai, [], DEFAULT_OPENAI_MODEL),
    baseUrl: c.providers.openai.baseUrl,
    baseUrlSaved: c.providers.openai.baseUrlSaved,
    endpoints: OPENAI_ENDPOINTS,
  },
  limitGuest: c.limitGuestSaved,
  limitUser: c.limitUserSaved,
  effectiveLimitGuest: c.limitGuest,
  effectiveLimitUser: c.limitUser,
});

exports.getAiSettings = async (req, res) => {
  try {
    res.json(view(await getAiConfig()));
  } catch (err) {
    res.status(500).json({ message: 'AI সেটিং লোড করা যায়নি' });
  }
};

exports.saveAiSettings = async (req, res) => {
  try {
    const b = req.body || {};
    const s = await getSettings();
    const cur = s.ai || {};

    // কোন কোম্পানি বেছে নেওয়া হলো — key ও মডেল সেই কোম্পানির জন্যই সেভ হবে
    const provider = ['anthropic', 'gemini', 'openai'].includes(b.provider) ? b.provider : ['gemini', 'openai'].includes(cur.provider) ? cur.provider : 'anthropic';
    const PROV = {
      anthropic: { model: 'model', hint: 'keyHint', enc: 'apiKeyEnc', re: /^sk-ant-[A-Za-z0-9_-]{20,300}$/, bad: 'API key সঠিক নয় — এটা sk-ant- দিয়ে শুরু হয়' },
      gemini: { model: 'geminiModel', hint: 'geminiHint', enc: 'geminiKeyEnc', re: /^[A-Za-z0-9._-]{20,200}$/, bad: 'Gemini API key সঠিক নয় — Google AI Studio থেকে নেওয়া key দিন (AIza... বা AQ. দিয়ে শুরু)' },
      openai: { model: 'openaiModel', hint: 'openaiHint', enc: 'openaiKeyEnc', re: /^[A-Za-z0-9._:-]{4,400}$/, bad: 'API key সঠিক নয় — স্পেস ছাড়া শুধু key টি দিন (Ollama হলে যেকোনো একটা শব্দ, যেমন ollama)' },
    };
    const P = PROV[provider];
    const modelRe = provider === 'openai' ? /^[A-Za-z0-9._:\/@-]{2,120}$/ : /^[A-Za-z0-9._-]{3,80}$/;

    const next = {
      enabled: cur.enabled !== false,
      limitGuest: cur.limitGuest || 0,
      limitUser: cur.limitUser || 0,
      model: cur[P.model] || '',
      hint: cur[P.hint] || '',
    };
    if (b.enabled !== undefined) next.enabled = !!b.enabled;

    if (b.model !== undefined) {
      const m = String(b.model || '').trim();
      if (m && !modelRe.test(m)) return res.status(400).json({ message: 'মডেলের নাম সঠিক নয়' });
      next.model = m;
    }
    for (const k of ['limitGuest', 'limitUser']) {
      if (b[k] === undefined) continue;
      const n = Math.floor(Number(b[k]) || 0);
      if (n < 0 || n > 1000) return res.status(400).json({ message: 'মেসেজ লিমিট ০ থেকে ১০০০-এর মধ্যে দিন (০ = ডিফল্ট)' });
      next[k] = n;
    }

    if (provider === 'openai' && b.baseUrl !== undefined) {
      const raw = String(b.baseUrl || '').trim();
      const u = raw ? cleanBaseUrl(raw) : '';
      if (raw && !u) return res.status(400).json({ message: 'Base URL সঠিক নয় — https:// দিয়ে শুরু হতে হবে (লোকাল হলে http://localhost…)' });
      next.baseUrl = u;
    }

    let keyUpdate;
    if (b.clearKey) {
      keyUpdate = '';
      next.hint = '';
    } else if (typeof b.apiKey === 'string' && b.apiKey.trim()) {
      const k = b.apiKey.trim();
      if (!P.re.test(k)) return res.status(400).json({ message: P.bad });
      keyUpdate = encrypt(k);
      next.hint = k.slice(-4);
    }

    s.set('ai.provider', provider);
    s.set('ai.enabled', next.enabled);
    s.set(`ai.${P.model}`, next.model);
    s.set('ai.limitGuest', next.limitGuest);
    s.set('ai.limitUser', next.limitUser);
    s.set(`ai.${P.hint}`, next.hint);
    if (provider === 'openai' && next.baseUrl !== undefined) s.set('ai.openaiBaseUrl', next.baseUrl);
    if (keyUpdate !== undefined) s.set(`ai.${P.enc}`, keyUpdate);
    await s.save();

    res.json({ message: 'AI সেটিং সেভ হয়েছে', ...view(await getAiConfig()) });
  } catch (err) {
    console.error('saveAiSettings:', err.message);
    res.status(500).json({ message: 'AI সেটিং সেভ করা যায়নি' });
  }
};

// সেভ করা সেটিং দিয়ে ছোট একটা টেস্ট কল — key/মডেল কাজ করছে কিনা
exports.testAi = async (req, res) => {
  let c;
  try {
    c = await getAiConfig();
  } catch {
    return res.status(500).json({ ok: false, message: '❌ সেটিং লোড করা যায়নি' });
  }
  if (!c.apiKey) return res.status(400).json({ message: 'আগে একটি API key সেভ করুন' });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await callModel(c, { messages: [{ role: 'user', content: 'Hi' }], maxTokens: 16, signal: ctl.signal });
    if (r.ok) return res.json({ ok: true, message: `✅ কাজ করছে (${c.provider === 'gemini' ? 'Gemini' : c.provider === 'openai' ? new URL(c.baseUrl).hostname : 'Claude'} · ${c.model})` });
    res.status(400).json({ ok: false, message: `❌ ${explainFailure(c.provider, r)}` });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.name === 'AbortError' ? '❌ সময় শেষ, আবার চেষ্টা করুন' : '❌ AI সার্ভারের সাথে সংযোগ হয়নি' });
  } finally {
    clearTimeout(timer);
  }
};
