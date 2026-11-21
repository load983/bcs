// ================== components/DiagramStudioModal.jsx ==================
// ডায়াগ্রাম স্টুডিও পপআপ (iframe) — অপশনের ডায়াগ্রামের জন্য। init: আগের প্রজেক্ট (JSON স্ট্রিং) বা ''।
// onUse(dataUrl, itemsJson) — "✅ অপশনে যুক্ত করুন" চাপলে; onClose() — বন্ধ।
import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const STUDIO_URL = '/diagram-studio/index.html';

export default function DiagramStudioModal({ init = '', target = 'option', onUse, onClose }) {
  const { t, lang } = useLanguage();
  const [ready, setReady] = useState(false);
  const iframeRef = useRef(null);
  const initRef = useRef(init);
  const useRef2 = useRef(onUse);
  useRef2.current = onUse;

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'diagram-studio:ready') {
        if (initRef.current) e.source.postMessage({ type: 'diagram-studio:load', items: initRef.current }, window.location.origin);
        return;
      }
      if (d.type === 'diagram-studio:use' && typeof d.dataUrl === 'string' && /^data:image\/png;base64,/.test(d.dataUrl)) {
        useRef2.current?.(d.dataUrl, typeof d.items === 'string' ? d.items : '');
      }
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('message', onMsg);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black/60" role="dialog" aria-modal="true" aria-label={t('diagram.create')} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-gray-900">
        <span className="text-sm font-semibold dark:text-white">{t('diagram.studioTitle')}</span>
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1 text-sm dark:border-white/15 dark:text-gray-200">✕ {t('common.cancel')}</button>
      </div>
      <p className="bg-primary-50 px-3 py-1 text-xs text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">{t('diagram.studioHintOption')}</p>
      <div className="relative min-h-0 flex-1 bg-white">
        {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">{t('diagram.loading')}</div>}
        <iframe
          ref={iframeRef}
          title="diagram-studio"
          src={`${STUDIO_URL}?lang=${lang === 'en' ? 'en' : 'bn'}&target=${target}`}
          onLoad={() => setReady(true)}
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
