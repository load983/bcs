// ================== components/DiagramLibrary.jsx ==================
// ডায়াগ্রাম লাইব্রেরি (পপআপ): (১) এই ফর্মের অন্য প্রশ্নের ডায়াগ্রাম, (২) শিক্ষকের সংরক্ষিত ডায়াগ্রামের তালিকা।
// বেছে নিলে onPick({ diagram, diagramSource }) — নাম বদল ও মুছে ফেলাও এখানেই।
import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';
import { useLanguage } from '../context/LanguageContext';

export default function DiagramLibrary({ siblings = [], onPick, onClose }) {
  const { t } = useLanguage();
  const [items, setItems] = useState(null); // null = লোড হচ্ছে
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const { data } = await axiosClient.get('/exams/diagrams');
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
      setErr(e?.response?.data?.message || t('lib.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    load();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (it) => {
    setBusyId(it.id);
    setErr('');
    try {
      const { data } = await axiosClient.get(`/exams/diagrams/${it.id}`);
      onPick({ diagram: data.image, diagramSource: data.source || '' });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message || t('lib.loadFailed'));
    } finally {
      setBusyId('');
    }
  };

  const rename = async (it) => {
    const name = window.prompt(t('lib.renamePrompt'), it.name || '');
    if (name === null) return;
    try {
      await axiosClient.patch(`/exams/diagrams/${it.id}`, { name });
      setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, name: name.trim().slice(0, 80) } : x)));
    } catch (e) {
      setErr(e?.response?.data?.message || t('lib.loadFailed'));
    }
  };

  const remove = async (it) => {
    if (!window.confirm(t('lib.confirmDelete'))) return;
    try {
      await axiosClient.delete(`/exams/diagrams/${it.id}`);
      setItems((arr) => arr.filter((x) => x.id !== it.id));
    } catch (e) {
      setErr(e?.response?.data?.message || t('lib.loadFailed'));
    }
  };

  const thumbBox = 'aspect-square w-full rounded-lg border border-gray-200 bg-white object-contain dark:border-white/10';

  return (
    <div className="fixed inset-0 z-[105] grid place-items-center bg-black/60 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('lib.title')}>
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <h3 className="font-semibold dark:text-white">📚 {t('lib.title')}</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1 text-sm dark:border-white/15 dark:text-gray-200">✕</button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600 dark:bg-red-500/10">{err}</p>}

          {siblings.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">{t('lib.fromForm')}</h4>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {siblings.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { onPick({ diagram: s.diagram, diagramSource: s.diagramSource || '' }); onClose(); }}
                    className="group text-left"
                    title={t('lib.use')}
                  >
                    <img src={s.diagram} alt="" className={`${thumbBox} group-hover:ring-2 group-hover:ring-primary-400`} />
                    <span className="mt-1 block truncate text-xs text-gray-500">{s.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">{t('lib.saved')}</h4>
            {items === null && <p className="text-sm text-gray-500">{t('diagram.loading')}</p>}
            {items && items.length === 0 && !err && <p className="text-sm text-gray-500">{t('lib.empty')}</p>}
            {items && items.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-gray-100 p-2 dark:border-white/10">
                    <button type="button" disabled={busyId === it.id} onClick={() => pick(it)} className="block w-full" title={t('lib.use')}>
                      {it.thumb ? <img src={it.thumb} alt={it.name} className={`${thumbBox} hover:ring-2 hover:ring-primary-400`} /> : <div className={`${thumbBox} grid place-items-center text-xs text-gray-400`}>—</div>}
                    </button>
                    <p className="mt-1 truncate text-xs font-medium dark:text-gray-200" title={it.name}>{it.name || t('lib.unnamed')}</p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <button type="button" onClick={() => rename(it)} className="text-primary-600">{t('lib.rename')}</button>
                      <button type="button" onClick={() => remove(it)} className="text-red-600">{t('common.delete')}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
