// ================== components/ChemDiagramList.jsx ==================
// প্রশ্নের কেমিস্ট্রি ডায়াগ্রামগুলো দেখায় (শিক্ষকের এডিটর, প্রিভিউ ও শিক্ষার্থীর পেজে)।
// items: [{ svg, smiles?, conditions?, name?, equation? }]; onRemove(index) দিলে "সরান" বাটন আসে।
// শিক্ষার্থীর পেজে name/equation আসে না — তাই ক্যাপশন দেখা যায় না (উত্তরের ইঙ্গিত ফাঁস হয় না)।
// SVG ফাইল না পেলে (যেমন সার্ভারের ডিস্ক মুছে গেলে) smiles থেকে ক্লায়েন্টেই আবার এঁকে দেখায়।
import React, { useEffect, useState } from 'react';
import assetUrl from '../utils/assetUrl';
import ZoomImage from './ZoomImage';
import { useLanguage } from '../context/LanguageContext';

function ChemImg({ item, className }) {
  const { t } = useLanguage();
  const [src, setSrc] = useState(assetUrl(item.svg));
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSrc(assetUrl(item.svg)); setFailed(false); }, [item.svg]);

  const onError = async () => {
    if (!item.smiles || failed) { setFailed(true); return; }
    setFailed(true);
    try {
      const m = await import('../utils/chemSvg'); // smiles-drawer শুধু দরকার হলেই লোড
      setSrc(m.svgDataUrl(await m.renderSmilesSvg(item.smiles, item.conditions)));
    } catch (e) { /* আঁকা না গেলে ভাঙা ছবিই থাকবে */ }
  };

  return <ZoomImage src={src} onError={onError} alt={item.name || t('chem.alt')} className={className} />;
}

export default function ChemDiagramList({ items = [], onRemove, compact = false }) {
  const { t } = useLanguage();
  if (!items || !items.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((d, i) => (
        <figure key={d.svg || i} className="max-w-full rounded-xl border border-gray-200 bg-white p-2 dark:border-white/10">
          <ChemImg item={d} className={`mx-auto max-w-full rounded object-contain ${compact ? 'max-h-24' : 'max-h-44 sm:max-h-56'}`} />
          {(d.name || d.equation) && (
            <figcaption className="mt-1 max-w-xs text-center text-xs text-gray-600">
              {d.name && <span className="block font-medium">{d.name}</span>}
              {d.equation && <span className="block break-words">{d.equation}</span>}
            </figcaption>
          )}
          {onRemove && (
            <button type="button" onClick={() => onRemove(i)} className="mx-auto mt-1 block text-xs text-red-600 hover:underline">
              ✕ {t('chem.remove')}
            </button>
          )}
        </figure>
      ))}
    </div>
  );
}
