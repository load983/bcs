// ================== pages/teacher/TeacherNotifications.jsx ==================
// শিক্ষকের নোটিফিকেশন: সাবস্ক্রিপশনের মেয়াদ শেষের ৭/৩/১ দিন আগের রিমাইন্ডার + ডিভাইস পুশ চালু/বন্ধ
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';
import { getPushState, enablePush, disablePush } from '../../utils/push';

const PUSH_BASE = '/teacher-notifications/push';

export default function TeacherNotifications() {
  const { t, locale } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState('off');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axiosClient
      .get('/teacher-notifications')
      .then(({ data }) => {
        setItems(data.items || []);
        axiosClient.post('/teacher-notifications/seen').catch(() => {}); // দেখা হয়ে গেছে → বেলের সংখ্যা মুছবে
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
    getPushState().then(setPushState);
  }, []);

  const togglePush = async () => {
    setBusy(true);
    try {
      setPushState(pushState === 'on' ? await disablePush(PUSH_BASE) : await enablePush(PUSH_BASE));
    } catch {
      setPushState('off');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (d) => new Date(d).toLocaleString(locale || undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const fmtDay = (d) => new Date(d).toLocaleDateString(locale || undefined);

  const pushNote = {
    unsupported: t('msg.push.unsupported'),
    'server-off': t('msg.push.serverOff'),
    denied: t('msg.push.denied'),
  }[pushState];

  const titleOf = (n) => {
    const base = n.isTrial ? 'tn.trial.title' : 'tn.expiry.title';
    return n.daysBefore === 1 ? t(`${base}1`) : t(base, { days: n.daysBefore });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl">🔔 {t('msg.notifications')}</h1>

      {/* ডিভাইস নোটিফিকেশন চালু/বন্ধ */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 !bg-primary-50/60 p-4 dark:!bg-primary-500/5">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <p className="font-medium dark:text-white">{t('msg.push.title')}</p>
          <p>{pushNote || t('tn.push.desc')}</p>
        </div>
        {!pushNote && (
          <button onClick={togglePush} disabled={busy} className={pushState === 'on' ? 'btn-secondary' : 'btn-primary'}>
            {busy ? '...' : pushState === 'on' ? t('msg.push.turnOff') : t('msg.push.turnOn')}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-gray-500 dark:text-gray-400">{t('tn.empty')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n._id} className={`card p-4 sm:p-5 ${n.isNew ? 'border-l-4 border-l-amber-500' : ''}`}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-700 dark:text-gray-200">⏰ {titleOf(n)}</span>
                <span>
                  {fmt(n.createdAt)}
                  {n.isNew && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">{t('msg.new')}</span>}
                </span>
              </div>
              <p className="text-gray-800 dark:text-gray-100">
                {t(n.isTrial ? 'tn.trial.body' : 'tn.expiry.body', { date: fmtDay(n.expiresAt) })}
              </p>
              <Link to="/teacher/subscribe" className="btn-primary mt-3 inline-block text-sm">
                {n.isTrial ? t('banner.subscribe') : t('banner.renew')}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
