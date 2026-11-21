// ================== components/ThemeSwitcher.jsx ==================
// Accessible appearance picker for mode, accent color, and page wallpaper.
import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

const MODE_OPTIONS = [
  { key: 'light', labelKey: 'theme.light', icon: SunIcon },
  { key: 'dark', labelKey: 'theme.dark', icon: MoonIcon },
  { key: 'system', labelKey: 'theme.system', icon: SystemIcon },
];

export default function ThemeSwitcher() {
  const { mode, setMode, accent, setAccent, bgStyle, setBgStyle, resolvedDark, accents, bgStyles } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && dialogRef.current) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  const CurrentIcon = resolvedDark ? MoonIcon : SunIcon;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('theme.settings')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="theme-settings-dialog"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:text-primary-400"
      >
        <CurrentIcon className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          ref={dialogRef}
          id="theme-settings-dialog"
          role="dialog"
          aria-modal="false"
          aria-labelledby="theme-settings-title"
          tabIndex={-1}
          className="animate-fade-in absolute right-0 top-full z-50 mt-2 max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-3 shadow-xl shadow-gray-900/10 outline-none dark:border-white/10 dark:bg-gray-800 dark:shadow-black/40 sm:w-[22rem] sm:p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 id="theme-settings-title" className="text-sm font-bold text-gray-900 dark:text-white">
                {t('theme.settings')}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('theme.preview.desc')}</p>
            </div>
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300"
            >
              <CurrentIcon className="h-5 w-5" />
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-gray-100 bg-gradient-to-br from-primary-50 via-white to-sky-50 p-3 dark:border-white/10 dark:from-primary-500/10 dark:via-gray-800 dark:to-sky-500/10">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                {t('theme.preview')}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm dark:bg-white/10 dark:text-gray-300">
                {t(`theme.${mode}`)}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-lg shadow-sm" style={{ backgroundColor: accents.find((item) => item.key === accent)?.swatch }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{t('theme.preview.title')}</div>
                <div className="mt-1 h-1.5 w-4/5 rounded-full bg-gray-200 dark:bg-white/10">
                  <span className="block h-full w-2/3 rounded-full bg-primary-500" />
                </div>
              </div>
              <span className="rounded-lg bg-white/75 px-2 py-1 text-[10px] font-semibold text-primary-700 shadow-sm dark:bg-white/10 dark:text-primary-300">
                {t('theme.preview.action')}
              </span>
            </div>
          </div>

          <section aria-labelledby="theme-mode-heading" className="border-b border-gray-100 pb-3 dark:border-white/10">
            <h3 id="theme-mode-heading" className="mb-2 px-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
              {t('theme.mode')}
            </h3>
            <div role="radiogroup" aria-labelledby="theme-mode-heading" className="grid grid-cols-3 gap-1.5">
              {MODE_OPTIONS.map(({ key, labelKey, icon: Icon }) => {
                const selected = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMode(key)}
                    className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      selected
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-300'
                        : 'border-gray-100 text-gray-700 hover:bg-gray-50 dark:border-white/5 dark:text-gray-200 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(labelKey)}
                    {selected && <span aria-hidden="true" className="absolute right-1.5 top-1 text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="theme-accent-heading" className="border-b border-gray-100 py-3 dark:border-white/10">
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 id="theme-accent-heading" className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {t('theme.accent')}
              </h3>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{t(`theme.accent.${accent}`)}</span>
            </div>
            <div role="radiogroup" aria-labelledby="theme-accent-heading" className="flex flex-wrap gap-2.5 px-1 py-1">
              {accents.map((item) => {
                const selected = accent === item.key;
                const label = t(`theme.accent.${item.key}`);
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-label={label}
                    aria-checked={selected}
                    title={label}
                    onClick={() => setAccent(item.key)}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:ring-offset-gray-800 ${
                      selected ? 'ring-2 ring-gray-900 dark:ring-white' : ''
                    }`}
                    style={{ backgroundColor: item.swatch }}
                  >
                    {selected && <span aria-hidden="true" className="text-xs font-bold text-white drop-shadow">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="theme-wallpaper-heading" className="pt-3">
            <h3 id="theme-wallpaper-heading" className="mb-2 px-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
              {t('theme.wallpaper')}
            </h3>
            <div role="radiogroup" aria-labelledby="theme-wallpaper-heading" className="grid grid-cols-2 gap-1.5">
              {bgStyles.map((item) => {
                const selected = bgStyle === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setBgStyle(item.key)}
                    className={`flex min-h-10 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                      selected
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500/60 dark:bg-primary-500/10 dark:text-primary-300'
                        : 'border-gray-100 text-gray-700 hover:bg-gray-50 dark:border-white/5 dark:text-gray-200 dark:hover:bg-white/5'
                    }`}
                  >
                    <BgStylePreview styleKey={item.key} />
                    <span className="min-w-0 flex-1">{t(item.labelKey)}</span>
                    {selected && <span aria-hidden="true" className="text-primary-600 dark:text-primary-300">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function BgStylePreview({ styleKey }) {
  const base = 'relative h-6 w-9 shrink-0 overflow-hidden rounded-md border border-gray-200 dark:border-white/20';
  if (styleKey === 'minimal') {
    return <span aria-hidden="true" className={`${base} bg-gradient-to-b from-primary-200/70 to-white dark:from-primary-500/30 dark:to-gray-800`} />;
  }
  if (styleKey === 'blobs') {
    return (
      <span aria-hidden="true" className={`${base} bg-gray-50 dark:bg-gray-900`}>
        <span className="absolute -left-1 -top-1 h-4 w-4 rounded-full bg-primary-400/80 blur-[2px]" />
        <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-sky-400/70 blur-[2px]" />
      </span>
    );
  }
  if (styleKey === 'dots') {
    return (
      <span
        aria-hidden="true"
        className={`${base} bg-white dark:bg-gray-900`}
        style={{ backgroundImage: 'radial-gradient(rgb(var(--color-primary-500) / 0.65) 1px, transparent 1px)', backgroundSize: '5px 5px' }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${base} bg-white dark:bg-gray-900`}
      style={{ backgroundImage: 'radial-gradient(at 20% 20%, rgb(var(--color-primary-400) / .8), transparent 70%), radial-gradient(at 85% 75%, rgb(56 189 248 / .75), transparent 70%)' }}
    />
  );
}

function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.9 14.6a9 9 0 1 1-11.5-11.5 7.2 7.2 0 0 0 11.5 11.5Z" />
    </svg>
  );
}

function SystemIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
