// ================== components/KetcherModal.jsx ==================
// ঐচ্ছিক: Ketcher (স্ট্রাকচার এডিটর) দিয়ে নিজে আঁকা। Ketcher standalone build-টি frontend/public/ketcher/
// ফোল্ডারে রাখলে (index.html সহ) iframe-এ খোলে; না থাকলে নির্দেশনা দেখায় — অ্যাপ ভাঙে না।
// আঁকা থেকে SMILES নিয়ে পিকারের একই পাইপলাইনে (smiles-drawer → SVG) পাঠানো হয়।
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const KETCHER_URL = '/ketcher/index.html';

export default function KetcherModal({ onResult, onClose }) {
  const { t } = useLanguage();
  const frameRef = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | missing
  const [err, setErr] = useState('');

  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      try {
        const k = frameRef.current?.contentWindow?.ketcher;
        if (k && typeof k.getSmiles === 'function') { setState('ready'); clearInterval(id); return; }
      } catch (e) { /* এখনো লোড হচ্ছে */ }
      if (tries > 40) { setState('missing'); clearInterval(id); }
    }, 400);
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(id); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const use = async () => {
    setErr('');
    try {
      const smi = String((await frameRef.current.contentWindow.ketcher.getSmiles()) || '').trim();
      if (!smi) { setErr(t('chem.ketcher.empty')); return; }
      onResult(smi);
    } catch (e) { setErr(t('chem.ketcher.failed')); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/60" role="dialog" aria-modal="true" aria-label={t('chem.ketcher.title')}>
      <div className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-gray-900">
        <span className="text-sm font-semibold dark:text-white">{t('chem.ketcher.title')}</span>
        <div className="flex items-center gap-2">
          {state === 'ready' && <button type="button" onClick={use} className="rounded-lg bg-primary-600 px-3 py-1 text-sm text-white">{t('chem.ketcher.use')}</button>}
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1 text-sm dark:border-white/15 dark:text-gray-200">✕ {t('common.cancel')}</button>
        </div>
      </div>
      {err && <p className="bg-red-50 px-3 py-1 text-xs text-red-700">{err}</p>}
      <div className="relative min-h-0 flex-1 bg-white">
        {state === 'loading' && <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">{t('chem.ketcher.loading')}</div>}
        {state === 'missing' && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-gray-600">{t('chem.ketcher.missing')}</div>}
        {state !== 'missing' && (
          <iframe ref={frameRef} title="ketcher" src={KETCHER_URL} className={`h-full w-full border-0 ${state === 'ready' ? '' : 'invisible'}`} />
        )}
      </div>
    </div>
  );
}
