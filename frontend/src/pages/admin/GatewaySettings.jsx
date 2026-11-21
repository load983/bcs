// ================== pages/admin/GatewaySettings.jsx ==================
// অ্যাডমিন > পেমেন্ট > অটো পেমেন্ট গেটওয়ে (SSLCommerz / RupantorPay — একটা বেছে নেওয়া যায়): চালু/বন্ধ, Store ID/Password, Sandbox/Live, URL, কানেকশন টেস্ট।
// চালু থাকলে শিক্ষকের সাবস্ক্রিপশন পেজে "অনলাইন পেমেন্ট" বাটন সক্রিয় হয় এবং পেমেন্ট সফল হলে সাবস্ক্রিপশন নিজে থেকে চালু হয়।
import React, { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

export default function GatewaySettings({ say }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ enabled: true, active: 'sslcommerz', rupKey: '', rupDomain: '', sandbox: 'env', storeId: '', storePassword: '', serverUrl: '', clientUrl: '' });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [open, setOpen] = useState(false);

  const apply = (d) => {
    setInfo(d);
    setForm({
      enabled: d.enabled,
      active: d.active,
      rupKey: '',
      rupDomain: d.rupantorpay.domainSaved || '',
      sandbox: d.sandboxSaved === null ? 'env' : d.sandboxSaved ? 'sandbox' : 'live',
      storeId: d.storeIdSaved || '',
      storePassword: '',
      serverUrl: d.serverUrlSaved || '',
      clientUrl: d.clientUrlSaved || '',
    });
  };

  useEffect(() => {
    axiosClient.get('/admin/gateway/settings').then(({ data }) => apply(data)).catch((e) => say(e.response?.data?.message || t('a.loadFailed')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = (extra = {}) => ({
    enabled: form.enabled,
    active: form.active,
    rupantorpayKey: form.rupKey,
    rupantorpayDomain: form.rupDomain,
    sandbox: form.sandbox === 'env' ? null : form.sandbox === 'sandbox',
    storeId: form.storeId,
    storePassword: form.storePassword,
    serverUrl: form.serverUrl,
    clientUrl: form.clientUrl,
    ...extra,
  });

  const save = async (e, extra) => {
    e?.preventDefault();
    setSaving(true);
    setTestMsg('');
    try {
      const { data } = await axiosClient.put('/admin/gateway/settings', payload(extra));
      apply(data);
      setShowPass(false);
      say(data.message || t('a.saved'));
      return true;
    } catch (err) {
      say(err.response?.data?.message || t('a.saveFailed'));
      return false;
    } finally { setSaving(false); }
  };

  const test = async () => {
    const savedSandbox = form.sandbox === 'env' ? null : form.sandbox === 'sandbox';
    const needsSave = form.enabled !== info.enabled
      || form.active !== info.active
      || savedSandbox !== info.sandboxSaved
      || form.storeId !== (info.storeIdSaved || '')
      || form.rupDomain !== (info.rupantorpay.domainSaved || '')
      || form.serverUrl !== (info.serverUrlSaved || '')
      || form.clientUrl !== (info.clientUrlSaved || '')
      || form.storePassword.trim()
      || form.rupKey.trim();
    if (needsSave && !(await save(null))) return; // টেস্টের আগে সব pending setting সেভ, তারপর শুধু saved config টেস্ট
    setTesting(true);
    setTestMsg('');
    try {
      const { data } = await axiosClient.post('/admin/gateway/test');
      setTestMsg(data.message);
    } catch (err) {
      setTestMsg(err.response?.data?.message || t('a.error'));
    } finally { setTesting(false); }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => say(t('a.gw.copied'))).catch(() => {});
  };

  if (!info) return <p className="mb-4 text-gray-500">{t('a.loading')}</p>;

  const isRup = form.active === 'rupantorpay';
  const rup = info.rupantorpay;
  const cur = isRup ? { source: rup.source, hint: rup.hint, configured: rup.configured } : { source: info.source, hint: info.passwordHint, configured: info.configured };
  const srcText = cur.source === 'admin' ? t('a.ai.srcAdmin') : cur.source === 'env' ? t('a.ai.srcEnv') : t('a.ai.srcNone');
  const modeText = info.sandbox ? 'Sandbox' : 'Live';
  const savedIsActive = info.active === form.active; // সেভ করা ও বাছাই করা এক কিনা
  const live = info.live && savedIsActive;

  return (
    <form onSubmit={save} className="card mb-4 space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold dark:text-white">{t('a.gw.title2')}</h3>
          <p className="text-xs text-gray-500">{t('a.gw.hint')}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium dark:text-gray-200">
          <input type="checkbox" className="h-4 w-4" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          {t('a.gw.enabled')}
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[['sslcommerz', 'SSLCommerz', t('a.gw.provSsl')], ['rupantorpay', 'RupantorPay', t('a.gw.provRup')]].map(([k, name, note]) => (
          <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${form.active === k ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-gray-200 dark:border-white/10'}`}>
            <input type="radio" name="gw-provider" className="mt-1 h-4 w-4" checked={form.active === k} onChange={() => { setTestMsg(''); setForm({ ...form, active: k }); }} />
            <span><span className="block font-medium dark:text-gray-100">{name}</span><span className="block text-xs text-gray-500">{note}</span></span>
          </label>
        ))}
      </div>

      <div className={`rounded-xl border p-3 text-sm ${live ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10' : 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'}`}>
        <div className="font-medium dark:text-white">
          {live ? t('a.gw.statusOn') : !cur.configured ? t(isRup ? 'a.gw.statusNoKeyRup' : 'a.gw.statusNoKey') : !info.enabled ? t('a.gw.statusOff') : t('a.gw.statusUnsaved')}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          {isRup ? 'RupantorPay' : `SSLCommerz · ${modeText}`} · {t('a.ai.keySource')}: {srcText}{cur.hint ? ` (••••${cur.hint})` : ''}
        </div>
        {live && !isRup && info.sandbox && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t('a.gw.sandboxWarn')}</div>}
      </div>

      {isRup ? (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium dark:text-gray-200">RupantorPay API Key</span>
            <div className="flex gap-2">
              <input
                className="input" autoComplete="new-password" type={showPass ? 'text' : 'password'}
                value={form.rupKey} onChange={(e) => setForm({ ...form, rupKey: e.target.value })}
                placeholder={rup.configured ? `••••${rup.hint || ''} (${t('a.gw.keepOld')})` : 'API key'}
              />
              <button type="button" className="btn-secondary !px-3" onClick={() => setShowPass((v) => !v)}>{showPass ? '🙈' : '👁'}</button>
            </div>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium dark:text-gray-200">{t('a.gw.rupDomain')}</span>
            <input className="input" value={form.rupDomain} onChange={(e) => setForm({ ...form, rupDomain: e.target.value })} placeholder={rup.domain || 'yoursite.com'} />
          </label>
        </div>
        <p className="text-xs text-gray-500">{t('a.gw.rupNote')}</p>

        <div className="rounded-xl border border-gray-200 p-3 text-sm dark:border-white/10">
          <div className="mb-1 font-medium dark:text-gray-200">{t('a.gw.cbTitle')}</div>
          <p className="mb-2 text-xs text-gray-500">{t('a.gw.cbNoteRup')}</p>
          {[['Webhook', rup.callbacks.webhook], ['Success', rup.callbacks.success], ['Cancel', rup.callbacks.cancel]].map(([name, url]) => (
            <div key={name} className="mb-1 flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-gray-500">{name}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-white/10 dark:text-gray-200">{url}</code>
              <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => copy(url)}>{t('a.gw.copy')}</button>
            </div>
          ))}
        </div>
      </div>

      ) : (
        <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium dark:text-gray-200">Store ID</span>
          <input className="input" autoComplete="off" value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} placeholder={info.storeId || 'yourstore001'} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium dark:text-gray-200">Store Password</span>
          <div className="flex gap-2">
            <input
              className="input" autoComplete="new-password" type={showPass ? 'text' : 'password'}
              value={form.storePassword} onChange={(e) => setForm({ ...form, storePassword: e.target.value })}
              placeholder={info.hasPassword ? `••••${info.passwordHint || ''} (${t('a.gw.keepOld')})` : 'store password'}
            />
            <button type="button" className="btn-secondary !px-3" onClick={() => setShowPass((v) => !v)}>{showPass ? '🙈' : '👁'}</button>
          </div>
        </label>
      </div>
      <p className="-mt-2 text-xs text-gray-500">{t('a.gw.keyNote')}</p>

      <div className="text-sm">
        <span className="mb-1 block font-medium dark:text-gray-200">{t('a.gw.mode')}</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {[['env', t('a.gw.modeEnv')], ['sandbox', t('a.gw.modeSandbox')], ['live', t('a.gw.modeLive')]].map(([k, label]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 ${form.sandbox === k ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-gray-200 dark:border-white/10'}`}>
              <input type="radio" name="gw-mode" className="h-4 w-4" checked={form.sandbox === k} onChange={() => setForm({ ...form, sandbox: k })} />
              <span className="dark:text-gray-100">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-3 text-sm dark:border-white/10">
        <div className="mb-1 font-medium dark:text-gray-200">{t('a.gw.cbTitle')}</div>
        <p className="mb-2 text-xs text-gray-500">{t('a.gw.cbNote')}</p>
        {[['IPN', info.callbacks.ipn], ['Success', info.callbacks.success], ['Fail', info.callbacks.fail], ['Cancel', info.callbacks.cancel]].map(([name, url]) => (
          <div key={name} className="mb-1 flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-gray-500">{name}</span>
            <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 text-xs dark:bg-white/10 dark:text-gray-200">{url}</code>
            <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => copy(url)}>{t('a.gw.copy')}</button>
          </div>
        ))}
      </div>

        </>
      )}

      <div>
        <button type="button" className="text-sm font-medium text-primary-600" onClick={() => setOpen((v) => !v)}>
          {open ? '▾' : '▸'} {t('a.gw.advanced')}
        </button>
        {open && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium dark:text-gray-200">{t('a.gw.serverUrl')}</span>
              <input className="input" value={form.serverUrl} onChange={(e) => setForm({ ...form, serverUrl: e.target.value })} placeholder={info.serverUrl} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium dark:text-gray-200">{t('a.gw.clientUrl')}</span>
              <input className="input" value={form.clientUrl} onChange={(e) => setForm({ ...form, clientUrl: e.target.value })} placeholder={info.clientUrl} />
            </label>
            <p className="text-xs text-gray-500 sm:col-span-2">{t('a.gw.urlNote')}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={saving}>{saving ? t('a.saving') : t('a.save')}</button>
        <button type="button" className="btn-secondary" disabled={testing || saving} onClick={test}>{testing ? t('a.gw.testing') : t('a.gw.test')}</button>
        {cur.source === 'admin' && (
          <button type="button" className="btn-danger" disabled={saving} onClick={() => { if (window.confirm(t('a.gw.clearConfirm'))) save(null, { clearCredentials: isRup ? 'rupantorpay' : 'sslcommerz' }); }}>{t('a.gw.clear')}</button>
        )}
      </div>
      {testMsg && <p className="text-sm dark:text-gray-200">{testMsg}</p>}
    </form>
  );
}
