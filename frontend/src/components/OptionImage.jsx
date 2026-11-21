// ================== components/OptionImage.jsx ==================
// অপশনের ছোট ছবি/ডায়াগ্রাম: 🖼 মেনু → (১) ছবি আপলোড (২) ✏️ ডায়াগ্রাম তৈরি (স্টুডিও) (৩) 📚 লাইব্রেরি থেকে বাছাই।
// ছবি থাকলে থাম্বনেইল + ✕ (সরান) + ✏️ (স্টুডিওতে আবার খুলে বদলান)। ছোট করে প্রশ্নের সাথেই (data URL) সংরক্ষিত হয়।
// props: value (data URL বা ''), onChange(newValueOrEmpty)
import React, { useEffect, useRef, useState } from 'react';
import ZoomImage from './ZoomImage';
import DiagramLibrary from './DiagramLibrary';
import DiagramStudioModal from './DiagramStudioModal';
import assetUrl from '../utils/assetUrl';
import { useLanguage } from '../context/LanguageContext';
import { loadImage, trimWhite, compactImage, fileToDataUrl } from '../utils/imageCompact';

const OPT = { max: 520, limit: 300_000 };

export default function OptionImage({ value, onChange }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // null বা { top, left }
  const [studio, setStudio] = useState(null); // null বা { init }
  const [libOpen, setLibOpen] = useState(false);

  // মেনু: বাইরে ক্লিক / স্ক্রল / রিসাইজ / Esc এ বন্ধ
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = 200;
    setMenu({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
  };

  const setFromSource = async (src, { trim = true } = {}) => {
    setBusy(true);
    try {
      const img = await loadImage(src);
      onChange(compactImage(trim ? trimWhite(img, 8) : img, OPT));
    } catch (e) {
      window.alert(t('diagram.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file) => {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      window.alert(t('diagram.badType'));
      return;
    }
    try {
      await setFromSource(await fileToDataUrl(file));
    } catch (e) {
      window.alert(t('diagram.uploadFailed'));
    }
  };

  // আগের ছবিকে স্টুডিওতে একটি ছবি-আইটেম হিসেবে খুলে তার ওপর আঁকা/বদলানো যায়
  const editExisting = async () => {
    setBusy(true);
    try {
      const img = await loadImage(assetUrl(value));
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const k = Math.min(1, 300 / Math.max(w, h));
      const u = compactImage(img, OPT);
      const items = [{ k: 'img', u, x: 200, y: 200, w: w * k, h: h * k, r: 0, s: 1, c: '#000', sw: 1 }];
      setStudio({ init: JSON.stringify(items) });
    } catch (e) {
      setStudio({ init: '' });
    } finally {
      setBusy(false);
    }
  };

  const menuItem = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10';

  return (
    <>
      {value ? (
        <span className="relative flex shrink-0 items-center gap-1">
          <span className="relative">
            <ZoomImage src={assetUrl(value)} alt={t('diagram.optionAlt')} className="h-9 w-9 rounded-md border border-gray-200 bg-white object-contain dark:border-white/15" />
            <button
              type="button"
              onClick={() => onChange('')}
              title={t('diagram.removeOption')}
              className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-red-600 text-[10px] leading-none text-white"
            >
              ×
            </button>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={editExisting}
            title={t('diagram.optEdit')}
            className="shrink-0 rounded-lg border border-gray-300 px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/20 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {busy ? '…' : '✏️'}
          </button>
        </span>
      ) : (
        <button
          ref={btnRef}
          type="button"
          disabled={busy}
          onClick={() => (menu ? setMenu(null) : openMenu())}
          title={t('diagram.addOptionImage')}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          className="shrink-0 rounded-lg border border-dashed border-gray-300 px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-white/20 dark:text-gray-300 dark:hover:bg-white/5"
        >
          {busy ? '…' : '🖼'}
        </button>
      )}

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: menu.top, left: menu.left, width: 200 }}
          className="z-[120] rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-white/15 dark:bg-gray-900"
        >
          <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(null); fileRef.current?.click(); }}>🖼 {t('diagram.upload')}</button>
          <button type="button" role="menuitem" className={`${menuItem} !text-primary-700 dark:!text-primary-300`} onClick={() => { setMenu(null); setStudio({ init: '' }); }}>✏️ {t('diagram.create')}</button>
          <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(null); setLibOpen(true); }}>📚 {t('lib.open')}</button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) pick(f);
        }}
      />

      {studio && (
        <DiagramStudioModal
          init={studio.init}
          target="option"
          onClose={() => setStudio(null)}
          onUse={(dataUrl) => {
            setStudio(null);
            setFromSource(dataUrl);
          }}
        />
      )}

      {libOpen && (
        <DiagramLibrary
          onPick={(p) => {
            if (p?.diagram) setFromSource(assetUrl(p.diagram));
          }}
          onClose={() => setLibOpen(false)}
        />
      )}
    </>
  );
}
