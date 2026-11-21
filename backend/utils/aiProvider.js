// ================== utils/aiProvider.js ==================
// একই ইন্টারফেসে Anthropic (Claude) ও Google Gemini কল করা।
// callModel(cfg, { system, messages, maxTokens, signal }) → { ok, status, text, reason }
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const errorReason = (raw) => {
  try {
    const j = JSON.parse(raw);
    return String(j?.error?.message || '').slice(0, 200);
  } catch {
    return '';
  }
};

async function callAnthropic(cfg, { system, messages, maxTokens, signal }) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, ...(system ? { system } : {}), messages }),
  });
  if (!r.ok) {
    const raw = await r.text().catch(() => '');
    return { ok: false, status: r.status, reason: errorReason(raw), raw: raw.slice(0, 300) };
  }
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { ok: true, status: 200, text };
}

async function callGemini(cfg, { system, messages, maxTokens, signal }) {
  // Gemini-র "thinking" টোকেনও লিমিটের ভেতরে গোনা হয়। 2.5-pro-তে thinking বন্ধ করা যায় না — তাই বেশি জায়গা না দিলে উত্তর ফাঁকা/কাটা আসে
  const isPro = /-pro/.test(cfg.model);
  const generationConfig = { maxOutputTokens: isPro ? Math.max(maxTokens, 8192) : Math.max(maxTokens, 2048) };
  // 2.5 Flash/Flash-Lite-তে thinking বন্ধ করলে উত্তর দ্রুত ও ছোট খরচে আসে
  if (/2\.5-flash/.test(cfg.model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body = {
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig,
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const r = await fetch(`${GEMINI_BASE}/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const raw = await r.text().catch(() => '');
    return { ok: false, status: r.status, reason: errorReason(raw), raw: raw.slice(0, 300) };
  }
  const data = await r.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return { ok: true, status: 200, text, blocked: !text && (data.promptFeedback?.blockReason || cand?.finishReason) };
}

// OpenAI-compatible (/chat/completions) — OpenRouter, OpenAI, Groq, DeepSeek, Mistral, Together, xAI, Ollama ...
async function callOpenAI(cfg, { system, messages, maxTokens, signal }) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  // OpenAI-র নতুন মডেলে max_tokens চলে না, max_completion_tokens লাগে; অন্য সার্ভিসে max_tokens-ই চলে
  const tokenField = /(^|\.)api\.openai\.com$/.test(new URL(base).hostname) ? 'max_completion_tokens' : 'max_tokens';
  const msgs = [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))];
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, [tokenField]: maxTokens, messages: msgs }),
  });
  if (!r.ok) {
    const raw = await r.text().catch(() => '');
    return { ok: false, status: r.status, reason: errorReason(raw), raw: raw.slice(0, 300) };
  }
  const data = await r.json();
  const choice = data.choices?.[0];
  const c = choice?.message?.content;
  const text = (Array.isArray(c) ? c.map((p) => p.text || '').join('') : String(c || '')).trim();
  return { ok: true, status: 200, text, blocked: !text && (choice?.finish_reason || data.error?.message) };
}

const callModel = (cfg, args) => (cfg.provider === 'gemini' ? callGemini(cfg, args) : cfg.provider === 'openai' ? callOpenAI(cfg, args) : callAnthropic(cfg, args));

// স্ট্যাটাস কোড → ইউজারকে দেখানোর মতো সংক্ষিপ্ত কারণ (অ্যাডমিন টেস্টে ব্যবহার হয়)
const explainFailure = (provider, r) => {
  const name = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'AI' : 'Claude';
  const base = r.status === 401 || r.status === 403 ? `${name} API key ভুল, বাতিল বা অনুমতি নেই`
    : r.status === 404 ? 'মডেলের নাম ভুল'
    : r.status === 429 || r.status === 402 ? 'লিমিট বা ব্যালেন্স/কোটা শেষ'
    : r.status === 400 && provider === 'gemini' && /free tier/i.test(r.reason || '') ? 'আপনার দেশে Gemini ফ্রি টিয়ার চালু নেই'
    : r.status === 400 && /API key/i.test(r.reason || '') ? (provider === 'gemini' ? 'API key সঠিক নয় (নতুন key বানিয়ে আবার দিন; key-র আগে-পরে স্পেস আছে কিনা দেখুন)' : 'API key সঠিক নয়')
    : `ত্রুটি ${r.status}`;
  return r.reason ? `${base} — ${r.reason.slice(0, 160)}` : base;
};

module.exports = { callModel, explainFailure };
