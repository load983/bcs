// ================== components/ChemistryDiagramPicker.jsx ==================
// শিক্ষক প্রশ্ন বানানোর সময় কেমিস্ট্রি ডায়াগ্রাম সার্চ করে যোগ করার মডাল।
//  • সার্চ: ইংরেজি, বাংলা (বেনজিন → benzene) ও বাংলিশ (benjin); সামান্য বানান ভুলও চলে
//  • প্রিভিউ: smiles-drawer দিয়ে ব্রাউজারেই SVG (কোনো বাইরের API নয়)
//  • ক্লিক করলে: SVG সার্ভারে /uploads/diagrams/-এ সেভ → onInsert({ id, name, svg, smiles, conditions, equation }, { insertEquation })
//  • "নিজে আঁকুন" ট্যাব: SMILES লিখে বা (ঐচ্ছিক) Ketcher এডিটরে আঁকা
import React, { useEffect, useMemo, useState } from 'react';
import { searchDiagrams, TYPE_LABELS, TYPE_ORDER } from '../data/chemistryDiagrams';
import { renderDiagramSvg, renderSmilesSvg, saveDiagramSvg, svgDataUrl } from '../utils/chemSvg';
import KetcherModal from './KetcherModal';
import { useLanguage } from '../context/LanguageContext';

const PAGE = 36;

function Preview({ item, circle = false, className = '' }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ src: '', failed: false });
  useEffect(() => {
    let alive = true;
    setState({ src: '', failed: false });
    renderDiagramSvg(item, { circle })
      .then((svg) => alive && setState({ src: svgDataUrl(svg), failed: false }))
      .catch(() => alive && setState({ src: '', failed: true }));
    return () => { alive = false; };
  }, [item.smiles, item.conditions, circle]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.failed) return <span className="px-2 text-center text-xs text-red-500">{t('chem.renderFailed')}</span>;
  if (!state.src) return <span className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />;
  return <img src={state.src} alt={item.name_en} className={`max-h-full max-w-full object-contain ${className}`} />;
}

export default function ChemistryDiagramPicker({ onInsert, onClose }) {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState('library');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const [insertEq, setInsertEq] = useState(true);
  const [circle, setCircle] = useState(false); // বেনজিন রিংয়ে বৃত্ত
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // নিজে আঁকুন
  const [smiles, setSmiles] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSvg, setCustomSvg] = useState('');
  const [customErr, setCustomErr] = useState('');
  const [ketcher, setKetcher] = useState(false);

  const results = useMemo(() => searchDiagrams(query, type), [query, type]);
  useEffect(() => setLimit(PAGE), [query, type]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !ketcher && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, ketcher]);

  // কাস্টম SMILES-এর লাইভ প্রিভিউ (লেখা থামলে)
  useEffect(() => {
    const s = smiles.trim();
    setCustomErr('');
    if (!s) { setCustomSvg(''); return undefined; }
    let alive = true;
    const id = setTimeout(() => {
      renderSmilesSvg(s, '', { circle })
        .then((svg) => alive && setCustomSvg(svg))
        .catch(() => { if (alive) { setCustomSvg(''); setCustomErr(t('chem.custom.invalid')); } });
    }, 400);
    return () => { alive = false; clearTimeout(id); };
  }, [smiles, circle]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = async (item) => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const svg = await renderDiagramSvg(item, { circle });
      const url = await saveDiagramSvg(svg);
      onInsert(
        {
          id: item.id,
          name: (lang === 'en' ? item.name_en : item.name_bn) || item.name_en,
          svg: url,
          smiles: item.smiles,
          conditions: item.conditions || '',
          equation: item.equation || '',
        },
        { insertEquation: insertEq }
      );
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message || t('chem.insertFailed'));
    } finally {
      setBusy(false);
    }
  };

  const insertCustom = () =>
    insert({
      id: `custom-${Date.now().toString(36)}`,
      name_en: customName.trim() || 'Custom diagram',
      name_bn: customName.trim() || t('chem.custom.defaultName'),
      smiles: smiles.trim(),
      equation: '',
    });

  const types = ['all', ...TYPE_ORDER];
  const typeLabel = (k) => (k === 'all' ? t('chem.type.all') : TYPE_LABELS[k][lang === 'en' ? 'en' : 'bn']);
  const tabBtn = (k, label) => (
    <button type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-primary-600 text-white' : 'border border-gray-200 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5'}`}>{label}</button>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t('chem.title')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-gray-900 sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <h3 className="text-base font-semibold dark:text-white">⚗️ {t('chem.title')}</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1 text-sm dark:border-white/15 dark:text-gray-200">✕</button>
        </div>

        <div className="space-y-3 border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <div className="flex gap-2">{tabBtn('library', t('chem.tab.library'))}{tabBtn('custom', t('chem.tab.custom'))}</div>
          {tab === 'library' && (
            <>
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('chem.searchPlaceholder')}
                className="input w-full"
                aria-label={t('chem.searchPlaceholder')}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {types.map((k) => (
                  <button key={k} type="button" onClick={() => setType(k)} className={`rounded-full px-3 py-1 text-xs ${type === k ? 'bg-primary-100 font-semibold text-primary-800 dark:bg-primary-500/20 dark:text-primary-200' : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/15 dark:text-gray-300'}`}>{typeLabel(k)}</button>
                ))}
                <span className="ml-auto text-xs text-gray-500">{t('chem.found', { n: results.length })}</span>
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={insertEq} onChange={(e) => setInsertEq(e.target.checked)} />
            {t('chem.insertEquation')}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={circle} onChange={(e) => setCircle(e.target.checked)} />
            ⌬ {t('chem.ringCircle')}
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {busy && <p className="mb-2 text-xs text-gray-500">{t('chem.inserting')}</p>}

          {tab === 'library' && (
            results.length ? (
              <>
                <p className="mb-2 text-[11px] text-gray-400">{t('chem.hintClick')}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {results.slice(0, limit).map((item) => (
                    <button key={item.id} type="button" disabled={busy} onClick={() => insert(item)}
                      className="group flex flex-col rounded-xl border border-gray-200 p-2 text-left transition hover:border-primary-400 hover:shadow disabled:opacity-60 dark:border-white/10">
                      <div className={`grid place-items-center overflow-hidden rounded-lg bg-white ${item.type === 'reaction' ? 'h-24 sm:h-28' : 'h-28'}`}><Preview item={item} circle={circle} /></div>
                      <span className="mt-1.5 line-clamp-2 text-sm font-medium dark:text-white">{lang === 'en' ? item.name_en : item.name_bn}</span>
                      <span className="line-clamp-1 text-[11px] text-gray-500">{lang === 'en' ? item.name_bn : item.name_en}</span>
                    </button>
                  ))}
                </div>
                {results.length > limit && (
                  <div className="mt-4 text-center">
                    <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm hover:bg-gray-50 dark:border-white/15 dark:text-gray-200">{t('chem.showMore')}</button>
                  </div>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-gray-500">{t('chem.noResults')}</p>
            )
          )}

          {tab === 'custom' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <input value={smiles} onChange={(e) => setSmiles(e.target.value)} placeholder={t('chem.custom.smiles')} className="input w-full font-mono" spellCheck={false} />
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={t('chem.custom.name')} className="input w-full" />
                <p className="text-[11px] text-gray-400">{t('chem.custom.hint')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setKetcher(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-white/15 dark:text-gray-200">🧪 {t('chem.ketcher.open')}</button>
                  <button type="button" disabled={!customSvg || busy} onClick={insertCustom} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{t('chem.custom.add')}</button>
                </div>
                {customErr && <p className="text-xs text-red-600">{customErr}</p>}
              </div>
              <div className="grid min-h-[12rem] place-items-center rounded-xl border border-dashed border-gray-300 bg-white p-2">
                {customSvg ? <img src={svgDataUrl(customSvg)} alt={t('chem.custom.preview')} className="max-h-64 max-w-full object-contain" /> : <span className="text-xs text-gray-400">{t('chem.custom.preview')}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
      {ketcher && <KetcherModal onClose={() => setKetcher(false)} onResult={(smi) => { setSmiles(smi); setKetcher(false); }} />}
    </div>
  );
}
