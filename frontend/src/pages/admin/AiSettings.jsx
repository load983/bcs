// ================== pages/admin/AiSettings.jsx ==================
// অ্যাডমিন > AI সহকারী: চালু/বন্ধ, কোম্পানি (Claude / Gemini / OpenAI-compatible: OpenRouter, Groq, DeepSeek ...), API key, মডেল ও মেসেজ লিমিট
import React, { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

export default function AiSettings({ say }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ enabled: true, provider: 'anthropic', apiKey: '', model: '', baseUrl: '', limitGuest: 0, limitUser: 0 });
  const [customMode, setCustomMode] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const apply = (d) => {
    setInfo(d);
    setCustomMode(false);
    setForm({ enabled: d.enabled, provider: d.provider, apiKey: '', model: d[d.provider].model || '', baseUrl: d.openai.baseUrl || '', limitGuest: d.limitGuest || 0, limitUser: d.limitUser || 0 });
  };

  useEffect(() => {
    axiosClient.get('/admin/ai/settings').then(({ data }) => apply(data)).catch((e) => say(e.response?.data?.message || t('a.loadFailed')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e, extra = {}) => {
    e?.preventDefault();
    setSaving(true);
    setTestMsg('');
    try {
      const { data } = await axiosClient.put('/admin/ai/settings', { ...form, ...extra });
      apply(data);
      setShowKey(false);
      say(data.message || t('a.saved'));
      return true;
    } catch (err) {
      say(err.response?.data?.message || t('a.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const selected = info[form.provider] || {};
    const needsSave = form.provider !== info.provider
      || form.enabled !== info.enabled
      || form.model !== (selected.model || '')
      || (form.provider === 'openai' && form.baseUrl !== info.openai.baseUrl)
      || Number(form.limitGuest) !== Number(info.limitGuest || 0)
      || Number(form.limitUser) !== Number(info.limitUser || 0)
      || form.apiKey.trim();
    // সেভের সময় blank apiKey পাঠালে backend আগের saved secret রেখে দেয়; নতুন key-ও আগে সেভ হয়
    if (needsSave && !(await save(null))) return;
    setTesting(true);
    setTestMsg('');
    try {
      const { data } = await axiosClient.post('/admin/ai/test');
      setTestMsg(data.message);
    } catch (err) {
      setTestMsg(err.response?.data?.message || t('a.error'));
    } finally {
      setTesting(false);
    }
  };

  const switchProvider = (p) => {
    setCustomMode(false);
    setForm((f) => ({ ...f, provider: p, apiKey: '', model: info[p].model || '', baseUrl: info.openai.baseUrl || '' }));
  };

  const pickEndpoint = (id) => {
    setCustomMode(false);
    if (id === '__custom') return setForm((f) => ({ ...f, baseUrl: '' }));
    const ep = info.openai.endpoints.find((x) => x.id === id);
    setForm((f) => ({ ...f, baseUrl: ep.baseUrl, model: '' }));
  };

  if (!info) return <p className="text-gray-500">{t('a.loading')}</p>;

  const isGemini = form.provider === 'gemini';
  const isOpenAi = form.provider === 'openai';
  const cur = info[form.provider]; // এই মুহূর্তে বাছাই করা কোম্পানির তথ্য
  const endpoints = info.openai.endpoints || [];
  const endpoint = isOpenAi ? endpoints.find((x) => x.baseUrl === form.baseUrl) : null; // না মিললে = কাস্টম
  const providerName = isGemini ? 'Google Gemini' : isOpenAi ? `OpenAI-compatible · ${endpoint ? endpoint.name.split(' (')[0] : form.baseUrl || t('a.ai.endpointCustom')}` : 'Anthropic Claude';
  const keyTitle = isOpenAi ? t('a.ai.keyTitleOpenai') : isGemini ? t('a.ai.keyTitleGemini') : t('a.ai.keyTitle');
  const keyLabel = isOpenAi ? t('a.ai.keyLabelOpenai') : isGemini ? t('a.ai.keyLabelGemini') : t('a.ai.keyLabel');
  const keyNote = isOpenAi ? t('a.ai.keyNoteOpenai') : isGemini ? t('a.ai.keyNoteGemini') : t('a.ai.keyNote');
  const modelPlaceholder = isOpenAi ? 'model-name' : isGemini ? 'gemini-...' : 'claude-...';
  const savedIsActive = info.provider === form.provider; // সেভ করা ও বাছাই করা এক কিনা
  const live = info.enabled && info.hasKey && savedIsActive;
  const sourceText = cur.source === 'admin' ? t('a.ai.srcAdmin') : cur.source === 'env' ? t('a.ai.srcEnv') : t('a.ai.srcNone');
  const presets = isOpenAi ? (endpoint ? endpoint.models : []) : cur.presets || [];
  const defaultModel = isOpenAi && endpoint ? endpoint.defaultModel : cur.defaultModel;
  const customModel = customMode || (form.model && !presets.includes(form.model));

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="text-sm text-gray-500">{t('a.ai.intro')}</p>

      <div className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${live ? '' : 'border-amber-400'}`}>
        <div className="text-sm">
          <div className="font-semibold dark:text-white">{live ? t('a.ai.statusOn') : !info.hasKey ? t('a.ai.statusNoKey') : !info.enabled ? t('a.ai.statusOff') : t('a.ai.statusUnsaved')}</div>
          <div className="text-xs text-gray-500">
            {providerName} · {t('a.ai.keySource')}: {sourceText}{cur.keyHint ? ` (••••${cur.keyHint})` : ''} · {t('a.ai.model')}: {cur.effectiveModel}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium dark:text-gray-200">
          <input type="checkbox" className="h-4 w-4" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {t('a.ai.enabled')}
        </label>
      </div>

      <div className="card space-y-2 p-4">
        <h3 className="font-semibold dark:text-white">{t('a.ai.providerTitle')}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {[['anthropic', 'Anthropic Claude', t('a.ai.provClaudeNote')], ['gemini', 'Google Gemini', t('a.ai.provGeminiNote')], ['openai', 'OpenAI-compatible', t('a.ai.provOpenaiNote')]].map(([k, name, note]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${form.provider === k ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-gray-200 dark:border-white/10'}`}>
              <input type="radio" name="ai-provider" className="mt-1 h-4 w-4" checked={form.provider === k} onChange={() => switchProvider(k)} />
              <span><span className="block font-medium dark:text-gray-100">{name}</span><span className="block text-xs text-gray-500">{note}</span></span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">{t('a.ai.providerNote')}</p>
      </div>

      {isOpenAi && (
        <div className="card space-y-3 p-4">
          <h3 className="font-semibold dark:text-white">{t('a.ai.endpointTitle')}</h3>
          <select className="input" value={endpoint ? endpoint.id : '__custom'} onChange={(e) => pickEndpoint(e.target.value)}>
            {endpoints.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="__custom">{t('a.ai.endpointCustom')}</option>
          </select>
          {!endpoint && (
            <input className="input" type="url" spellCheck="false" placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          )}
          <p className="text-xs text-gray-500">{t('a.ai.endpointNote')}</p>
        </div>
      )}

      <div className="card space-y-3 p-4">
        <h3 className="font-semibold dark:text-white">{keyTitle}</h3>
        <label className="block text-sm">
          <span className="mb-1 block font-medium dark:text-gray-200">{keyLabel}</span>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck="false"
              placeholder={cur.source === 'admin' ? `••••••••${cur.keyHint}  (${t('a.ai.keepHint')})` : isOpenAi ? 'sk-... / key' : isGemini ? 'AQ.… / AIza…' : 'sk-ant-...'}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
            <button type="button" className="btn-secondary !px-3 text-xs" onClick={() => setShowKey((v) => !v)}>{showKey ? t('a.ai.hide') : t('a.ai.show')}</button>
          </div>
        </label>
        <p className="text-xs text-gray-500">{keyNote}</p>
        {cur.source === 'admin' && (
          <button type="button" className="btn-danger !px-3 !py-1 text-xs" disabled={saving} onClick={() => window.confirm(t('a.ai.confirmClear')) && save(null, { clearKey: true })}>
            {t('a.ai.clearKey')}
          </button>
        )}
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-3">
          <span className="mb-1 block font-medium dark:text-gray-200">{t('a.ai.model')}</span>
          <select className="input" value={customModel ? '__custom' : form.model} onChange={(e) => {
            const custom = e.target.value === '__custom';
            setCustomMode(custom);
            setForm({ ...form, model: custom ? '' : e.target.value });
          }}>
            <option value="">{t('a.ai.modelDefault')} ({defaultModel})</option>
            {presets.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="__custom">{t('a.ai.modelCustom')}</option>
          </select>
          {customModel && <input className="input mt-2" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={modelPlaceholder} />}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium dark:text-gray-200">{t('a.ai.limitGuest')}</span>
          <input className="input" type="number" min="0" max="1000" value={form.limitGuest} onChange={(e) => setForm({ ...form, limitGuest: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium dark:text-gray-200">{t('a.ai.limitUser')}</span>
          <input className="input" type="number" min="0" max="1000" value={form.limitUser} onChange={(e) => setForm({ ...form, limitUser: e.target.value })} />
        </label>
        <p className="self-end text-xs text-gray-500">{t('a.ai.limitNote')} ({info.effectiveLimitGuest}/{info.effectiveLimitUser})</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={saving}>{saving ? t('a.saving') : t('a.save')}</button>
        <button type="button" className="btn-secondary" disabled={testing || saving || (!form.apiKey.trim() && !cur.hasKey)} onClick={test}>{testing ? t('a.ai.testing') : t('a.ai.test')}</button>
        {testMsg && <span className="text-sm dark:text-gray-200">{testMsg}</span>}
      </div>
      <p className="text-xs text-gray-500">{t('a.ai.testNote')}</p>
    </form>
  );
}
