// ================== pages/admin/CustomizeWebsite.jsx ==================
// অ্যাডমিন এখান থেকে: (১) লোগো ও সাইটের নাম (২) ওয়েবসাইটের যেকোনো লেখা (৩) ফুটারের "Important Links" ও তাদের পেজ বদলায়।
import React, { useEffect, useMemo, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import assetUrl from '../../utils/assetUrl';
import { translations } from '../../i18n/translations';
import { useLanguage } from '../../context/LanguageContext';
import { useSite } from '../../context/SiteContext';
import { useDialog } from './adminUi';
import UploadProgress from '../../components/UploadProgress';

const BRAND_KEYS = ['brand.name', 'brand.short', 'brand.splash'];
const PAGE_SIZE = 40;
const ALL_KEYS = Object.keys(translations.bn);
const GROUPS = [...new Set(ALL_KEYS.map((k) => k.split('.')[0]))].sort();

// overrides: { key: { bn, en } }
const toMap = (list) => Object.fromEntries((list || []).map((o) => [o.key, { bn: o.bn || '', en: o.en || '' }]));
const toList = (map) => Object.entries(map).filter(([, v]) => v.bn.trim() || v.en.trim()).map(([key, v]) => ({ key, bn: v.bn, en: v.en }));
let uid = 0;
const withKey = (l) => ({ ...l, _k: ++uid });

export default function CustomizeWebsite({ say }) {
  const { t } = useLanguage();
  const { refreshSite } = useSite();
  const [ask, dialog] = useDialog();
  const [sub, setSub] = useState('brand');
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [images, setImages] = useState({});
  const [media, setMedia] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [links, setLinks] = useState([]);
  const [homepage, setHomepage] = useState({});
  const [seo, setSeo] = useState({ title: '', description: '', keywords: '' });
  const [appearance, setAppearance] = useState({ accent: 'coral', mode: 'dark', background: 'minimal', density: 'comfortable', radius: 'soft' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axiosClient.get('/admin/site')
      .then(({ data }) => {
        setLogoUrl(data.logoUrl || '');
        setImages(data.images || {});
        setMedia(data.media || []);
        setOverrides(toMap(data.textOverrides));
        setLinks((data.footerLinks || []).map(withKey));
        setHomepage(data.homepage || {});
        setSeo(data.seo || { title: '', description: '', keywords: '' });
        setAppearance({ accent: 'coral', mode: 'dark', background: 'minimal', density: 'comfortable', radius: 'soft', ...(data.appearance || {}) });
      })
      .catch((e) => say(e.response?.data?.message || t('a.loadFailed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setText = (key, lang, value) =>
    setOverrides((o) => ({ ...o, [key]: { bn: '', en: '', ...o[key], [lang]: value } }));
  const resetText = (keys) =>
    setOverrides((o) => { const n = { ...o }; keys.forEach((k) => delete n[k]); return n; });

  const run = async (fn) => {
    setSaving(true);
    try { await fn(); await refreshSite(); } catch (err) { say(err.response?.data?.message || t('a.saveFailed')); } finally { setSaving(false); }
  };

  const saveTexts = () => run(async () => {
    const { data } = await axiosClient.put('/admin/site/texts', { overrides: toList(overrides) });
    setOverrides(toMap(data.textOverrides));
    say(data.message || t('a.saved'));
  });

  const saveFooter = () => run(async () => {
    const { data } = await axiosClient.put('/admin/site/footer-and-texts', { overrides: toList(overrides), footerLinks: links });
    setOverrides(toMap(data.textOverrides));
    setLinks((data.footerLinks || []).map(withKey));
    say(data.message || t('a.saved'));
  });

  const savePresentation = () => run(async () => {
    const { data } = await axiosClient.put('/admin/site/presentation', { homepage, seo, appearance });
    setHomepage(data.homepage || {});
    setSeo(data.seo || {});
    setAppearance({ accent: 'coral', mode: 'dark', background: 'minimal', density: 'comfortable', radius: 'soft', ...(data.appearance || {}) });
    say(data.message || t('a.saved'));
  });

  if (loading) return <p className="text-gray-500">{t('a.loading')}</p>;

  const SUBS = [['brand', 'cz.sub.brand'], ['presentation', 'Homepage & SEO'], ['texts', 'cz.sub.texts'], ['footer', 'cz.sub.footer']];

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">{t('cz.intro')}</p>

      <div className="flex flex-wrap gap-2" role="tablist">
        {SUBS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={sub === k}
            onClick={() => setSub(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${sub === k ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15'}`}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {sub === 'brand' && (
        <BrandTab
          say={say} saving={saving} logoUrl={logoUrl} setLogoUrl={setLogoUrl} refreshSite={refreshSite}
          overrides={overrides} setText={setText} onSave={saveTexts} images={images} setImages={setImages} media={media} setMedia={setMedia}
        />
      )}
      {sub === 'texts' && (
        <TextsTab overrides={overrides} setText={setText} resetText={resetText} onSave={saveTexts} saving={saving} />
      )}
      {sub === 'presentation' && (
        <PresentationTab homepage={homepage} setHomepage={setHomepage} seo={seo} setSeo={setSeo} appearance={appearance} setAppearance={setAppearance} onSave={savePresentation} saving={saving} />
      )}
      {sub === 'footer' && (
        <FooterTab
          links={links} setLinks={setLinks} overrides={overrides} setText={setText}
          onSave={saveFooter} saving={saving} ask={ask}
        />
      )}
      {dialog}
    </div>
  );
}

// ------------------------------------------------------------ দুই ভাষার ইনপুট
function BilingualField({ label, k, overrides, setText, long }) {
  const { t } = useLanguage();
  const Tag = long ? 'textarea' : 'input';
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {['bn', 'en'].map((lang) => (
        <label key={lang} className="block text-sm">
          <span className="mb-1 block font-medium dark:text-gray-200">{label} — {t(`cz.${lang}`)}</span>
          <Tag
            className={`input ${long ? 'min-h-[4.5rem]' : ''}`}
            maxLength={2000}
            placeholder={translations[lang][k] || ''}
            value={overrides[k]?.[lang] || ''}
            onChange={(e) => setText(k, lang, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ ১) লোগো ও নাম
function BrandTab({ say, saving, logoUrl, setLogoUrl, refreshSite, overrides, setText, onSave, images, setImages, media, setMedia }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const uploadConfig = { onUploadProgress: (event) => event.total && setUploadProgress(Math.round((event.loaded / event.total) * 100)) };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return say(t('cz.logoBadType'));
    if (file.size > 1024 * 1024) return say(t('cz.logoTooBig'));
    const fd = new FormData();
    fd.append('logo', file);
    setBusy(true);
    try {
      setUploadProgress(0);
      const { data } = await axiosClient.post('/admin/site/logo', fd, uploadConfig);
      setLogoUrl(data.logoUrl);
      await refreshSite();
      say(data.message || t('a.saved'));
    } catch (err) {
      say(err.response?.data?.message || t('a.saveFailed'));
    } finally { setBusy(false); setUploadProgress(null); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { data } = await axiosClient.delete('/admin/site/logo');
      setLogoUrl('');
      await refreshSite();
      say(data.message || t('a.saved'));
    } catch (err) {
      say(err.response?.data?.message || t('a.saveFailed'));
    } finally { setBusy(false); setUploadProgress(null); }
  };

  const uploadSlot = async (slot, e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 5 * 1024 * 1024) return say('PNG/JPG/WEBP/GIF ছবি, সর্বোচ্চ ৫ MB');
    const fd = new FormData(); fd.append('image', file); fd.append('slot', slot); fd.append('alt', slot);
    setBusy(true);
    setUploadProgress(0);
    try { const { data } = await axiosClient.post('/admin/site/image', fd, uploadConfig); setImages(data.images || {}); await refreshSite(); say(data.message || t('a.saved')); }
    catch (err) { say(err.response?.data?.message || t('a.saveFailed')); }
    finally { setBusy(false); setUploadProgress(null); }
  };
  const removeSlot = async (slot) => {
    setBusy(true);
    try { const { data } = await axiosClient.delete(`/admin/site/image/${slot}`); setImages(data.images || {}); await refreshSite(); say(data.message || t('a.saved')); }
    catch (err) { say(err.response?.data?.message || t('a.saveFailed')); }
    finally { setBusy(false); setUploadProgress(null); }
  };

  const uploadMedia = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|ogg))$/.test(file.type) || file.size > 50 * 1024 * 1024) return say('ছবি বা MP4/WEBM/OGG ভিডিও, সর্বোচ্চ ৫০ MB');
    const fd = new FormData(); fd.append('media', file); fd.append('title', file.name.replace(/\.[^.]+$/, ''));
    setBusy(true); setUploadProgress(0); try { const { data } = await axiosClient.post('/admin/site/media', fd, uploadConfig); setMedia(data.media || []); await refreshSite(); say(data.message || t('a.saved')); } catch (err) { say(err.response?.data?.message || t('a.saveFailed')); } finally { setBusy(false); setUploadProgress(null); }
  };
  const removeMedia = async (id) => {
    setBusy(true); try { const { data } = await axiosClient.delete(`/admin/site/media/${id}`); setMedia(data.media || []); await refreshSite(); say(data.message || t('a.saved')); } catch (err) { say(err.response?.data?.message || t('a.saveFailed')); } finally { setBusy(false); setUploadProgress(null); }
  };

  return (
    <div className="space-y-5">
      <UploadProgress progress={uploadProgress} label={t('cz.uploading')} />
      <div className="card p-4">
        <h3 className="mb-1 font-semibold dark:text-white">{t('cz.logo')}</h3>
        <p className="mb-3 text-sm text-gray-500">{t('cz.logoHint')}</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
            {logoUrl ? <img src={assetUrl(logoUrl)} alt="" className="h-full w-full object-contain" /> : <span className="text-2xl" aria-hidden="true">📝</span>}
          </div>
          <div className="space-y-2">
            {!logoUrl && <p className="text-sm text-gray-500">{t('cz.noLogo')}</p>}
            <div className="flex flex-wrap gap-2">
              <label className={`btn-primary cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                {busy ? t('cz.uploading') : t('cz.upload')}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={upload} disabled={busy} />
              </label>
              {logoUrl && <button type="button" className="btn-secondary" onClick={remove} disabled={busy}>{t('cz.removeLogo')}</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div><h3 className="font-semibold dark:text-white">সাইটের visual images</h3><p className="text-sm text-gray-500">Homepage-এর hero, promotion ও feature অংশে ছবি বসান।</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {['hero', 'promo', 'feature'].map((slot) => (
            <div key={slot} className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
              <div className="mb-2 text-sm font-medium dark:text-gray-200">{slot}</div>
              {images[slot]?.url && <img src={assetUrl(images[slot].url)} alt={images[slot].alt || slot} className="mb-2 h-24 w-full rounded-lg object-cover" />}
              <div className="flex flex-wrap gap-2">
                <label className="btn-secondary cursor-pointer !px-2 !py-1 text-xs">Upload<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => uploadSlot(slot, e)} disabled={busy} /></label>
                {images[slot]?.url && <button type="button" className="btn-danger !px-2 !py-1 text-xs" onClick={() => removeSlot(slot)} disabled={busy}>Remove</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div><h3 className="font-semibold dark:text-white">Homepage ছবি ও ভিডিও গ্যালারি</h3><p className="text-sm text-gray-500">যত ইচ্ছা ছবি/ভিডিও যোগ করুন—সব homepage-এ দেখা যাবে। প্রতি ফাইল সর্বোচ্চ ৫০ MB।</p></div>
        <label className="btn-primary inline-flex w-fit cursor-pointer">+ ছবি / ভিডিও যোগ করুন<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg" className="sr-only" onChange={uploadMedia} disabled={busy} /></label>
        {media?.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{media.map((item) => <div key={item.id} className="overflow-hidden rounded-xl border border-gray-200 p-2 dark:border-white/10">{item.kind === 'video' ? <video src={assetUrl(item.url)} controls className="h-28 w-full rounded-lg bg-black object-cover" /> : <img src={assetUrl(item.url)} alt={item.alt || item.title} className="h-28 w-full rounded-lg object-cover" />}<div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-xs text-gray-600 dark:text-gray-300">{item.title || item.kind}</span><button type="button" className="btn-danger !px-2 !py-1 text-xs" onClick={() => removeMedia(item.id)} disabled={busy}>Remove</button></div></div>)}</div>}
      </div>

      <div className="card space-y-4 p-4">
        <h3 className="font-semibold dark:text-white">{t('cz.brandNames')}</h3>
        <BilingualField label={t('cz.brandName')} k="brand.name" overrides={overrides} setText={setText} />
        <BilingualField label={t('cz.brandShort')} k="brand.short" overrides={overrides} setText={setText} />
        <BilingualField label={t('cz.brandSplash')} k="brand.splash" overrides={overrides} setText={setText} />
        <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>{saving ? t('a.saving') : t('a.save')}</button>
      </div>
    </div>
  );
}

function PresentationTab({ homepage, setHomepage, seo, setSeo, appearance, setAppearance, onSave, saving }) {
  const sections = [
    ['showHero', 'Hero section'], ['showGallery', 'Image/video gallery'], ['showFeatures', 'Features'],
    ['showHowItWorks', 'How it works'], ['showAudience', 'Teachers & students'], ['showFaq', 'FAQ'], ['showCta', 'Call to action'],
  ];
  const setSeoField = (key, value) => setSeo((old) => ({ ...old, [key]: value }));
  const setAppearanceField = (key, value) => setAppearance((old) => ({ ...old, [key]: value }));
  const appearanceOptions = [
    ['accent', 'Accent color', [['coral', 'Coral'], ['indigo', 'Indigo'], ['violet', 'Violet'], ['sky', 'Sky'], ['emerald', 'Emerald'], ['rose', 'Rose'], ['amber', 'Amber']]],
    ['mode', 'Default theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]],
    ['background', 'Background style', [['minimal', 'Minimal'], ['blobs', 'Blobs'], ['dots', 'Dots'], ['mesh', 'Mesh']]],
    ['density', 'UI spacing', [['comfortable', 'Comfortable'], ['compact', 'Compact']]],
    ['radius', 'Corner style', [['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']]],
  ];
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div><h3 className="font-semibold dark:text-white">Global UI appearance</h3><p className="text-sm text-gray-500">এই ৫টি option বদলালে site-এর সব visitor-এর জন্য নতুন UI style প্রয়োগ হবে।</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {appearanceOptions.map(([key, label, options]) => <label key={key} className="block text-sm">
            <span className="mb-1 block font-medium dark:text-gray-200">{label}</span>
            <select className="input" value={appearance[key] || options[0][0]} onChange={(e) => setAppearanceField(key, e.target.value)}>
              {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>)}
        </div>
      </div>
      <div className="card space-y-3 p-4">
        <div><h3 className="font-semibold dark:text-white">Homepage sections</h3><p className="text-sm text-gray-500">যে section দরকার নেই সেটি লুকিয়ে দিন। নতুন settings না থাকলে সব section default-এ দেখা যাবে।</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sections.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm dark:border-white/10 dark:text-gray-200">
            <input type="checkbox" className="h-4 w-4" checked={homepage[key] !== false} onChange={(e) => setHomepage((old) => ({ ...old, [key]: e.target.checked }))} />
            {label}
          </label>)}
        </div>
      </div>
      <div className="card space-y-3 p-4">
        <div><h3 className="font-semibold dark:text-white">SEO & social preview text</h3><p className="text-sm text-gray-500">Search engine title, description ও keywords সেট করুন।</p></div>
        <label className="block text-sm"><span className="mb-1 block font-medium dark:text-gray-200">SEO title</span><input className="input" maxLength={160} value={seo.title || ''} onChange={(e) => setSeoField('title', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium dark:text-gray-200">Meta description</span><textarea className="input min-h-[5rem]" maxLength={320} value={seo.description || ''} onChange={(e) => setSeoField('description', e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium dark:text-gray-200">Keywords</span><input className="input" maxLength={500} placeholder="exam, online test, education" value={seo.keywords || ''} onChange={(e) => setSeoField('keywords', e.target.value)} /></label>
        <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save homepage settings'}</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ ২) ওয়েবসাইটের সব লেখা
function TextsTab({ overrides, setText, resetText, onSave, saving }) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const changed = useMemo(() => Object.keys(overrides).filter((k) => overrides[k].bn.trim() || overrides[k].en.trim()), [overrides]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ALL_KEYS.filter((k) => {
      if (group && !k.startsWith(`${group}.`)) return false;
      if (onlyEdited && !changed.includes(k)) return false;
      if (!s) return true;
      return k.toLowerCase().includes(s)
        || (translations.bn[k] || '').toLowerCase().includes(s)
        || (translations.en[k] || '').toLowerCase().includes(s)
        || (overrides[k]?.bn || '').toLowerCase().includes(s)
        || (overrides[k]?.en || '').toLowerCase().includes(s);
    });
  }, [q, group, onlyEdited, changed, overrides]);

  useEffect(() => setLimit(PAGE_SIZE), [q, group, onlyEdited]);
  const shown = filtered.slice(0, limit);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('cz.textsHint')}</p>

      <div className="card sticky top-14 z-10 flex flex-wrap items-center gap-2 p-3">
        <input className="input sm:max-w-xs" placeholder={t('cz.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input sm:max-w-[11rem]" value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('cz.allGroups')}>
          <option value="">{t('cz.allGroups')}</option>
          {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm dark:text-gray-200">
          <input type="checkbox" className="h-4 w-4" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} />
          {t('cz.onlyEdited')}
        </label>
        <span className="text-xs text-gray-500">{t('cz.changedCount', { n: changed.length })}</span>
        <button type="button" className="btn-primary ml-auto" onClick={onSave} disabled={saving}>{saving ? t('a.saving') : t('a.save')}</button>
      </div>

      {filtered.length === 0 && <p className="text-sm text-gray-500">{t('cz.noMatch')}</p>}

      <div className="space-y-3">
        {shown.map((k) => {
          const isChanged = changed.includes(k);
          return (
            <div key={k} className={`card space-y-2 p-3 ${isChanged ? 'ring-1 ring-primary-400' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <code className="break-all text-xs text-gray-500">{k}</code>
                {isChanged && <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => resetText([k])}>{t('cz.reset')}</button>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {['bn', 'en'].map((lang) => {
                  const def = translations[lang][k] || '';
                  const long = def.length > 70;
                  const Tag = long ? 'textarea' : 'input';
                  return (
                    <label key={lang} className="block text-xs">
                      <span className="mb-1 block font-medium text-gray-600 dark:text-gray-300">{t(`cz.${lang}`)}</span>
                      <Tag
                        className={`input ${long ? 'min-h-[4.5rem]' : ''}`}
                        maxLength={2000}
                        placeholder={def}
                        value={overrides[k]?.[lang] || ''}
                        onChange={(e) => setText(k, lang, e.target.value)}
                      />
                      {isChanged && <span className="mt-0.5 block text-gray-400">{t('cz.default')}: {def}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-500">{t('cz.showing', { shown: shown.length, total: filtered.length })}</span>
          {shown.length < filtered.length && <button type="button" className="btn-secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>{t('cz.more')}</button>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ ৩) ফুটারের Important Links
function FooterTab({ links, setLinks, overrides, setText, onSave, saving, ask }) {
  const { t } = useLanguage();
  const upd = (i, patch) => setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const move = (i, d) => setLinks((ls) => {
    const j = i + d;
    if (j < 0 || j >= ls.length) return ls;
    const n = [...ls];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const add = () => setLinks((ls) => (ls.length >= 10 ? ls : [...ls, withKey({ slug: `page-${ls.length + 1}`, titleBn: '', titleEn: '', contentBn: '', contentEn: '', externalUrl: '', enabled: true })]));
  const remove = async (i) => {
    const ok = await ask({ title: t('cz.f.confirmRemove'), danger: true });
    if (ok) setLinks((ls) => ls.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('cz.f.intro')}</p>

      <div className="card p-4">
        <BilingualField label={t('cz.f.heading')} k="footer.importantLinks" overrides={overrides} setText={setText} />
      </div>

      {links.length === 0 && <p className="text-sm text-gray-500">{t('cz.f.empty')}</p>}

      {links.map((l, i) => (
        <div key={l._k} className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-medium dark:text-gray-200">
              <input type="checkbox" className="h-4 w-4" checked={l.enabled !== false} onChange={(e) => upd(i, { enabled: e.target.checked })} />
              {t('cz.f.enabled')}
            </label>
            <div className="flex gap-1">
              <button type="button" className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => move(i, -1)} disabled={i === 0}>↑ {t('cz.f.up')}</button>
              <button type="button" className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => move(i, 1)} disabled={i === links.length - 1}>↓ {t('cz.f.down')}</button>
              <button type="button" className="btn-danger !px-3" onClick={() => remove(i)} aria-label={t('a.delete')}>✕</button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium dark:text-gray-200">{t('cz.f.titleBn')}</span>
              <input className="input" maxLength={80} value={l.titleBn} onChange={(e) => upd(i, { titleBn: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium dark:text-gray-200">{t('cz.f.titleEn')}</span>
              <input className="input" maxLength={80} value={l.titleEn} onChange={(e) => upd(i, { titleEn: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium dark:text-gray-200">{t('cz.f.slug')}</span>
              <input className="input" maxLength={40} value={l.slug} onChange={(e) => upd(i, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
              <span className="mt-0.5 block text-xs text-gray-400">{t('cz.f.slugHint')}</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium dark:text-gray-200">{t('cz.f.url')}</span>
              <input className="input" maxLength={300} placeholder="https://" value={l.externalUrl} onChange={(e) => upd(i, { externalUrl: e.target.value })} />
              <span className="mt-0.5 block text-xs text-gray-400">{t('cz.f.urlHint')}</span>
            </label>
          </div>

          {!l.externalUrl.trim() && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium dark:text-gray-200">{t('cz.f.contentBn')}</span>
                <textarea className="input min-h-[10rem]" maxLength={20000} value={l.contentBn} onChange={(e) => upd(i, { contentBn: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium dark:text-gray-200">{t('cz.f.contentEn')}</span>
                <textarea className="input min-h-[10rem]" maxLength={20000} value={l.contentEn} onChange={(e) => upd(i, { contentEn: e.target.value })} />
              </label>
              <p className="text-xs text-gray-400 sm:col-span-2">{t('cz.f.contentHint')}</p>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={add} disabled={links.length >= 10}>{t('cz.f.add')}</button>
        <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>{saving ? t('a.saving') : t('a.save')}</button>
      </div>
    </div>
  );
}
