// ================== components/QuestionDiagram.jsx ==================
// প্রশ্নের ডায়াগ্রাম: (১) ছবি আপলোড / টেনে এনে ছাড়া / Ctrl+V পেস্ট, (২) "ডায়াগ্রাম তৈরি করুন" — স্টুডিওতে এঁকে প্রশ্নে যুক্ত,
// (৩) "সম্পাদনা" — আগে আঁকা ডায়াগ্রাম স্টুডিওতে আবার খুলে বদলানো।
// ছবি ছোট করে প্রশ্নের সাথেই (data URL) সংরক্ষিত হয়; স্টুডিও থেকে আঁকলে প্রজেক্ট (JSON) আলাদা রাখা হয় সম্পাদনার জন্য।
// props: value (ছবি), source (স্টুডিও প্রজেক্ট), onChange({ diagram, diagramSource })
// ঐচ্ছিক chem = { items, onInsert(diagram, { insertEquation }), onRemove(index) } দিলে "ডায়াগ্রাম যোগ করুন" (কেমিস্ট্রি) বাটন ও তালিকা আসে
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import assetUrl from '../utils/assetUrl';
import ZoomImage from './ZoomImage';
import DiagramLibrary from './DiagramLibrary';
import ChemDiagramList from './ChemDiagramList';
// smiles-drawer ভারী — পিকার খুললেই লোড হয়, মূল বান্ডেলে নয়
const ChemistryDiagramPicker = lazy(() => import('./ChemistryDiagramPicker'));
import axiosClient from '../api/axiosClient';
import { loadImage, trimWhite, compactImage, fileToDataUrl } from '../utils/imageCompact';
import { useLanguage } from '../context/LanguageContext';

const STUDIO_URL = '/diagram-studio/index.html';
export default function QuestionDiagram({ value, source, onChange, siblings = [], compact: small = false, chem = null }) {
  const { t, lang } = useLanguage();
  const [studio, setStudio] = useState(null); // null = বন্ধ; { init: '' | JSON } = খোলা
  const [frameReady, setFrameReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [chemOpen, setChemOpen] = useState(false);
  const [note, setNote] = useState('');
  const iframeRef = useRef(null);
  const fileRef = useRef(null);
  const initRef = useRef('');

  const attach = async (src, { trim = false, project = '' } = {}) => {
    setErr('');
    setBusy(true);
    try {
      const img = await loadImage(src);
      onChange({ diagram: compactImage(trim ? trimWhite(img) : img), diagramSource: project || '' });
    } catch (e) {
      setErr(t('diagram.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const attachFile = async (file) => {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setErr(t('diagram.badType'));
      return;
    }
    try {
      await attach(await fileToDataUrl(file));
    } catch (e) {
      setErr(t('diagram.uploadFailed'));
    }
  };

  // বর্তমান ডায়াগ্রামটি লাইব্রেরিতে সংরক্ষণ (নাম জিজ্ঞেস করে; থাম্বনেইল এখানেই বানানো হয়)
  const saveToLibrary = async () => {
    if (!value) return;
    const name = window.prompt(t('lib.namePrompt'), '');
    if (name === null) return;
    setErr('');
    setNote('');
    setBusy(true);
    try {
      const img = await loadImage(assetUrl(value));
      const thumb = compactImage(img, { max: 150, limit: 30_000 });
      const { data } = await axiosClient.post('/exams/diagrams', { name, image: value, thumb, source: source || undefined });
      setNote(data?.duplicate ? t('lib.alreadySaved') : t('lib.saved.ok'));
    } catch (e) {
      setErr(e?.response?.data?.message || t('lib.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openStudio = (init) => {
    initRef.current = init || '';
    setFrameReady(false);
    setStudio({ init: init || '' });
  };

  // স্টুডিও থেকে বার্তা: ready (আগের প্রজেক্ট পাঠাও) ও use (ছবি + প্রজেক্ট গ্রহণ) — শুধু একই সাইট ও আমাদের iframe থেকে
  useEffect(() => {
    if (!studio) return undefined;
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
        setStudio(null);
        attach(d.dataUrl, { trim: true, project: typeof d.items === 'string' && d.items.length <= 900_000 ? d.items : '' });
      }
    };
    const onKey = (e) => e.key === 'Escape' && setStudio(null);
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
  }, [studio]);

  const onPaste = (e) => {
    const f = Array.from(e.clipboardData?.files || []).find((x) => x.type.startsWith('image/'));
    if (f) {
      e.preventDefault();
      attachFile(f);
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) attachFile(f);
  };

  const btn = 'rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5 sm:text-sm';
  const accent = `${btn} !border-primary-300 !text-primary-700 dark:!text-primary-300`;

  return (
    <div
      tabIndex={0}
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      title={t('diagram.dropHint')}
      className={`space-y-2 rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-400 ${dragOver ? 'bg-primary-50 ring-2 ring-primary-300 dark:bg-primary-500/10' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={btn}>🖼 {t('diagram.upload')}</button>
        <button type="button" disabled={busy} onClick={() => openStudio('')} className={accent}>✏️ {t('diagram.create')}</button>
        <button type="button" disabled={busy} onClick={() => setLibOpen(true)} className={btn}>📚 {t('lib.open')}</button>
        {chem && (
          <button type="button" disabled={busy} onClick={() => setChemOpen(true)} title={t('chem.insertTitle')} className={accent}>⚗️ {t('chem.insert')}</button>
        )}
        {value && source && (
          <button type="button" disabled={busy} onClick={() => openStudio(source)} className={accent}>🛠 {t('diagram.edit')}</button>
        )}
        {value && (
          <button type="button" disabled={busy} onClick={saveToLibrary} className={btn}>💾 {t('lib.save')}</button>
        )}
        {value && (
          <button type="button" disabled={busy} onClick={() => onChange({ diagram: '', diagramSource: '' })} className={`${btn} !text-red-600`}>{t('diagram.remove')}</button>
        )}
        {busy && <span className="text-xs text-gray-500">{t('diagram.uploading')}</span>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) attachFile(f);
          }}
        />
      </div>
      {!value && <p className="text-[11px] text-gray-400">{t('diagram.dropHint')}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {note && <p className="text-xs text-emerald-600">{note}</p>}
      {value && (
        <ZoomImage
          src={assetUrl(value)}
          alt={t('diagram.alt')}
          className={`rounded-lg border border-gray-200 bg-white object-contain dark:border-white/10 ${small ? 'max-h-32' : 'max-h-56'}`}
        />
      )}

      {chem && chem.items && chem.items.length > 0 && (
        <ChemDiagramList items={chem.items} compact={small} onRemove={chem.onRemove} />
      )}
      {chem && chemOpen && (
        <Suspense fallback={null}>
          <ChemistryDiagramPicker onClose={() => setChemOpen(false)} onInsert={chem.onInsert} />
        </Suspense>
      )}

      {libOpen && <DiagramLibrary siblings={siblings} onPick={(p) => { setNote(''); onChange(p); }} onClose={() => setLibOpen(false)} />}

      {studio && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/60" role="dialog" aria-modal="true" aria-label={t('diagram.create')}>
          <div className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-gray-900">
            <span className="text-sm font-semibold dark:text-white">{t('diagram.studioTitle')}</span>
            <button type="button" onClick={() => setStudio(null)} className="rounded-lg border border-gray-200 px-3 py-1 text-sm dark:border-white/15 dark:text-gray-200">✕ {t('common.cancel')}</button>
          </div>
          <p className="bg-primary-50 px-3 py-1 text-xs text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">{t('diagram.studioHint')}</p>
          <div className="relative min-h-0 flex-1 bg-white">
            {!frameReady && <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">{t('diagram.loading')}</div>}
            <iframe ref={iframeRef} title="diagram-studio" src={`${STUDIO_URL}?lang=${lang === 'en' ? 'en' : 'bn'}`} onLoad={() => setFrameReady(true)} className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
