// ================== utils/aiConfig.js ==================
// AI সহকারীর কনফিগ: অ্যাডমিন প্যানেলে সেভ করা মান আগে, না থাকলে .env-এর মান।
// API key ডাটাবেসে AES-256-GCM দিয়ে এনক্রিপ্ট করা থাকে (কী তৈরি হয় JWT_SECRET থেকে)।
// তিন ধরনের সমর্থিত: anthropic (Claude), gemini (Google) ও openai (OpenAI-compatible যেকোনো সার্ভিস — OpenRouter, Groq, DeepSeek ইত্যাদি) — অ্যাডমিন যেটা বেছে নেবে সেটা চলবে।
const crypto = require('crypto');
const SiteSettings = require('../models/SiteSettings');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MODEL_PRESETS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-opus-5-5'];
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_PRESETS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];

// OpenAI-compatible সার্ভিসের প্রিসেট — baseUrl বদলালেই যেকোনো সার্ভিস চলে। মডেলের নাম সময়ের সাথে বদলায়, তাই "অন্য মডেল" অপশনে নিজেও লেখা যায়।
const OPENAI_ENDPOINTS = [
  { id: 'openrouter', name: 'OpenRouter (শত শত মডেল / hundreds of models)', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat', 'google/gemini-2.5-flash', 'anthropic/claude-haiku-4.5'] },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o'] },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-large-latest'] },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'] },
  { id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-3-mini', models: ['grok-3-mini', 'grok-3'] },
  { id: 'ollama', name: 'Ollama (নিজের সার্ভার / local)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.2', models: ['llama3.2', 'qwen2.5'] },
];
const DEFAULT_OPENAI_BASE = OPENAI_ENDPOINTS[0].baseUrl;
const DEFAULT_OPENAI_MODEL = OPENAI_ENDPOINTS[0].defaultModel;

// শুধু https://… অথবা লোকাল (localhost/127.0.0.1) http://… গ্রহণযোগ্য; শেষের / বাদ যায়
const cleanBaseUrl = (u) => {
  try {
    const x = new URL(String(u).trim());
    const local = x.hostname === 'localhost' || x.hostname === '127.0.0.1';
    if (x.protocol !== 'https:' && !(x.protocol === 'http:' && local)) return '';
    if (x.username || x.password || x.search || x.hash) return '';
    return x.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const secretKey = () => crypto.createHash('sha256').update(`ai-key:${process.env.JWT_SECRET || ''}`).digest();

const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join(':');
};

const decrypt = (blob) => {
  try {
    const [iv, tag, enc] = String(blob).split(':').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return ''; // JWT_SECRET বদলে গেলে বা ডেটা নষ্ট হলে — key নেই ধরা হবে
  }
};

// এক কোম্পানির key/মডেলের অবস্থা
const providerInfo = ({ enc, hint, savedModel, envKey, envModel, defaultModel }) => {
  const dbKey = enc ? decrypt(enc) : '';
  return {
    apiKey: dbKey || envKey || '',
    source: dbKey ? 'admin' : envKey ? 'env' : 'none',
    keyHint: dbKey ? hint || dbKey.slice(-4) : envKey ? envKey.slice(-4) : '',
    envKeyPresent: !!envKey,
    modelSaved: savedModel || '',
    model: savedModel || envModel || defaultModel,
  };
};

const getAiConfig = async () => {
  let ai = {};
  try {
    const s = await SiteSettings.findOne({ key: 'main' }).select('+ai.apiKeyEnc +ai.geminiKeyEnc +ai.openaiKeyEnc').lean();
    ai = s?.ai || {};
  } catch { /* ignore */ }

  const providers = {
    anthropic: providerInfo({
      enc: ai.apiKeyEnc, hint: ai.keyHint, savedModel: ai.model,
      envKey: process.env.ANTHROPIC_API_KEY, envModel: process.env.AI_MODEL, defaultModel: DEFAULT_MODEL,
    }),
    gemini: providerInfo({
      enc: ai.geminiKeyEnc, hint: ai.geminiHint, savedModel: ai.geminiModel,
      envKey: process.env.GEMINI_API_KEY, envModel: process.env.GEMINI_MODEL, defaultModel: DEFAULT_GEMINI_MODEL,
    }),
    openai: {
      ...providerInfo({
        enc: ai.openaiKeyEnc, hint: ai.openaiHint, savedModel: ai.openaiModel,
        envKey: process.env.OPENAI_API_KEY, envModel: process.env.OPENAI_MODEL, defaultModel: DEFAULT_OPENAI_MODEL,
      }),
      baseUrl: cleanBaseUrl(ai.openaiBaseUrl) || cleanBaseUrl(process.env.OPENAI_BASE_URL) || DEFAULT_OPENAI_BASE,
      baseUrlSaved: ai.openaiBaseUrl || '',
    },
  };
  const provider = ['gemini', 'openai'].includes(ai.provider) ? ai.provider : 'anthropic';
  const active = providers[provider];

  return {
    enabled: ai.enabled !== false,
    provider,
    providers,
    apiKey: active.apiKey,
    source: active.source,
    keyHint: active.keyHint,
    model: active.model,
    baseUrl: provider === 'openai' ? active.baseUrl : '',
    limitGuest: ai.limitGuest > 0 ? ai.limitGuest : Number(process.env.AI_LIMIT_GUEST) || 10,
    limitUser: ai.limitUser > 0 ? ai.limitUser : Number(process.env.AI_LIMIT_USER) || 25,
    limitGuestSaved: ai.limitGuest || 0,
    limitUserSaved: ai.limitUser || 0,
  };
};

module.exports = {
  getAiConfig, encrypt, decrypt, cleanBaseUrl,
  DEFAULT_MODEL, MODEL_PRESETS, DEFAULT_GEMINI_MODEL, GEMINI_PRESETS,
  OPENAI_ENDPOINTS, DEFAULT_OPENAI_BASE, DEFAULT_OPENAI_MODEL,
};
