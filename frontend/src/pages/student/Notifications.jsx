// ================== pages/student/Notifications.jsx ==================
// শিক্ষকদের মেসেজ ও নতুন পরীক্ষার নোটিফিকেশন তালিকা (স্টুডেন্ট)
import { Avatar } from '../admin/adminUi';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';
import { getPushState, enablePush, disablePush } from '../../utils/push';
import ProtectedVideo from '../../components/ProtectedVideo';

export default function Notifications() {
  const { t, locale } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [pushState, setPushState] = useState('off');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState('');
  const zoomCloseRef = useRef(null);

  const loadFeed = async () => {
    setLoading(true);
    setFeedError(false);
    try {
      const { data } = await axiosClient.get('/messages/student/feed');
      setItems(Array.isArray(data.items) ? data.items : []);
      axiosClient.post('/messages/student/seen').catch(() => {}); // দেখা হয়ে গেছে
    } catch {
      setItems([]);
      setFeedError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
    getPushState().then(setPushState);
  }, []);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setZoom('');
    };
    window.addEventListener('keydown', onKeyDown);
    zoomCloseRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoom]);

  const togglePush = async () => {
    setBusy(true);
    try {
      setPushState(pushState === 'on' ? await disablePush() : await enablePush());
    } catch {
      setPushState('off');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (d) => new Date(d).toLocaleString(locale || undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const pushNote = {
    unsupported: t('msg.push.unsupported'),
    'server-off': t('msg.push.serverOff'),
    denied: t('msg.push.denied'),
  }[pushState];

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl">🔔 {t('msg.notifications')}</h1>

      {/* ডিভাইস নোটিফিকেশন চালু/বন্ধ */}
      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 !bg-primary-50/60 p-4 dark:!bg-primary-500/5">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <p className="font-medium dark:text-white">{t('msg.push.title')}</p>
          <p>{pushNote || t('msg.push.desc')}</p>
        </div>
        {!pushNote && (
          <button onClick={togglePush} disabled={busy} className={pushState === 'on' ? 'btn-secondary' : 'btn-primary'}>
            {busy ? '...' : pushState === 'on' ? t('msg.push.turnOff') : t('msg.push.turnOn')}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : feedError ? (
        <div role="alert" className="card space-y-3 p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{t('msg.feedFailed')}</p>
          <button type="button" onClick={loadFeed} className="btn-secondary text-sm">{t('msg.retry')}</button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-gray-500 dark:text-gray-400">{t('msg.emptyStudent')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m._id} className={`card flex gap-3 p-4 sm:p-5 ${m.isNew ? 'border-l-4 border-l-primary-500' : ''}`}>
              <Avatar name={m.teacherName || '?'} />
              <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {m.kind === 'exam' ? '📝' : '💬'} {m.teacherName}
                  {m.classNames.length > 0 && <span className="ml-1 font-normal">· {m.classNames.join(', ')}</span>}
                </span>
                <span>
                  {fmt(m.createdAt)}
                  {m.editedAt && <span className="ml-1 italic">({t('msg.edited')})</span>}
                  {m.isNew && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">{t('msg.new')}</span>}
                </span>
              </div>
              {m.text && <p className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{m.text}</p>}
              {(m.media || (m.imageUrl ? [{ url: m.imageUrl, kind: 'image' }] : [])).length > 0 && (
                <div className="mt-3 space-y-3">
                  {(m.media || [{ url: m.imageUrl, kind: 'image' }]).map((media, index) => media.kind === 'video'
                    ? <ProtectedVideo key={`${media.url}-${index}`} src={media.url} controls preload="metadata" className="max-h-96 w-full rounded-xl bg-black" />
                    : <button key={`${media.url}-${index}`} type="button" onClick={() => setZoom(media.url)} aria-label={t('msg.openImage')} className="block w-full cursor-zoom-in rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"><img src={media.url} alt={t('msg.imageAlt')} loading="lazy" className="max-h-80 w-full rounded-xl object-cover" /></button>)}
                </div>
              )}
              {m.kind === 'exam' && m.examCode && m.examStatus === 'published' && (
                <Link to={`/join/${m.examCode}`} className="btn-primary mt-3 inline-block text-sm">
                  {t('msg.openExam')}
                </Link>
              )}
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('msg.imageAlt')}
          onClick={(e) => { if (e.target === e.currentTarget) setZoom(''); }}
        >
          <button
            ref={zoomCloseRef}
            type="button"
            onClick={() => setZoom('')}
            aria-label={t('msg.closeImage')}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-xl font-semibold text-gray-900 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            ×
          </button>
          <img src={zoom} alt={t('msg.imageAlt')} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
