// ================== pages/admin/ActivityLog.jsx ==================
// অ্যাডমিন > অ্যাক্টিভিটি লগ: কে কখন কোন সেটিং বদলাল, কোন পেমেন্ট approve/reject করল ইত্যাদি। শুধু পড়া যায়।
import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

const CATS = ['payment', 'teacher', 'user', 'plan', 'promo', 'settings', 'site', 'support', 'export', 'other'];
const CAT_CLS = {
  payment: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  teacher: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  user: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  plan: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  promo: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  settings: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  site: 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
  support: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  export: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300',
};

// লগের details থেকে ছোট ছোট "key: value" চিপ (খালি মান বাদ)
function Details({ d }) {
  const entries = Object.entries(d || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (!entries.length) return <span className="text-gray-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-white/10 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400">{k}:</span>{' '}
          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </span>
      ))}
    </div>
  );
}

export default function ActivityLog({ say }) {
  const { t, locale } = useLanguage();
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');

  // সার্চ বক্সে প্রতি অক্ষরে রিকোয়েস্ট না পাঠিয়ে একটু থেমে পাঠায়
  useEffect(() => { const id = setTimeout(() => { setQApplied(q); setPage(1); }, 300); return () => clearTimeout(id); }, [q]);

  const load = useCallback(() => {
    setLoading(true);
    return axiosClient
      .get('/admin/activity-log', { params: { page, category, actor, from, to, q: qApplied } })
      .then(({ data: d }) => setData(d))
      .catch((e) => say(e.response?.data?.message || t('a.loadFailed')))
      .finally(() => setLoading(false));
  }, [page, category, actor, from, to, qApplied]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const label = (key, fallback) => { const v = t(key); return v === key ? fallback : v; };
  const setF = (fn) => (e) => { fn(e.target.value); setPage(1); };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('a.log.intro')}</p>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input className="input lg:col-span-2" placeholder={t('a.log.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={category} onChange={setF(setCategory)}>
          <option value="">{t('a.log.allCats')}</option>
          {CATS.map((c) => <option key={c} value={c}>{label(`a.log.cat.${c}`, c)}</option>)}
        </select>
        <select className="input" value={actor} onChange={setF(setActor)}>
          <option value="">{t('a.log.allActors')}</option>
          <option value="admin">{t('a.log.byAdmin')}</option>
          <option value="system">{t('a.log.bySystem')}</option>
        </select>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>🔄 {t('a.log.refresh')}</button>
        <label className="block text-xs text-gray-500">{t('a.log.from')}
          <input className="input mt-1" type="date" value={from} max={to || undefined} onChange={setF(setFrom)} />
        </label>
        <label className="block text-xs text-gray-500">{t('a.log.to')}
          <input className="input mt-1" type="date" value={to} min={from || undefined} onChange={setF(setTo)} />
        </label>
        <div className="flex items-end text-sm text-gray-500 lg:col-span-3">{t('a.log.total', { n: data.total })}</div>
      </div>

      <div className="card overflow-x-auto !p-1">
        <table className="admin-table">
          <thead className="text-gray-500">
            <tr>
              <th className="py-2">{t('a.log.when')}</th>
              <th>{t('a.log.who')}</th>
              <th>{t('a.log.what')}</th>
              <th>{t('a.log.target')}</th>
              <th>{t('a.log.details')}</th>
            </tr>
          </thead>
          <tbody className="align-top dark:text-gray-200">
            {data.items.map((l) => (
              <tr key={l._id} className="border-t border-gray-100 dark:border-white/10">
                <td className="whitespace-nowrap py-2 text-xs">{new Date(l.createdAt).toLocaleString(locale)}</td>
                <td>
                  {l.actor === 'system'
                    ? <span className="badge bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300">⚙️ {t('a.log.system')}</span>
                    : <><div className="font-medium">{l.adminName || '-'}</div><div className="text-xs text-gray-500">{l.adminEmail}</div></>}
                  {l.ip && <div className="text-xs text-gray-400">{l.ip}</div>}
                </td>
                <td>
                  <span className={`badge ${CAT_CLS[l.category] || CAT_CLS.other}`}>{label(`a.log.cat.${l.category}`, l.category)}</span>
                  <div className="mt-1 font-medium">{label(`a.log.act.${l.action}`, l.action)}</div>
                </td>
                <td className="text-sm">{l.target?.name || (l.target?.id ? <span className="text-xs text-gray-400">{l.target.id}</span> : '-')}</td>
                <td className="max-w-xs"><Details d={l.details} /></td>
              </tr>
            ))}
            {!loading && data.items.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-gray-500">{t('a.log.empty')}</td></tr>}
            {loading && data.items.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-gray-500">{t('a.loading')}</td></tr>}
          </tbody>
        </table>
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>‹ {t('a.log.prev')}</button>
          <span className="dark:text-gray-200">{t('a.log.page', { p: data.page, n: data.pages })}</span>
          <button type="button" className="btn-secondary" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>{t('a.log.next')} ›</button>
        </div>
      )}
    </div>
  );
}
