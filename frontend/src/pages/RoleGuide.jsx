import React, { useMemo, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { ROLE_GUIDES } from '../data/roleGuideContent';

const text = (value, lang) => value?.[lang] || value?.en || '';

export default function RoleGuide({ role }) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState('');
  const guide = ROLE_GUIDES[role];
  const isEn = lang === 'en';

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return guide?.sections || [];
    return (guide?.sections || []).map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const searchable = [item.title.bn, item.title.en, item.description.bn, item.description.en,
          ...item.steps.flatMap((step) => [step.bn, step.en]),
          ...(item.note ? [item.note.bn, item.note.en] : [])].join(' ').toLocaleLowerCase();
        return searchable.includes(q);
      }),
    })).filter((section) => section.items.length > 0);
  }, [guide, query]);

  if (!guide) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-indigo-600 p-6 text-white shadow-lg sm:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">{isEn ? 'HELP CENTER' : 'সহায়তা কেন্দ্র'}</div>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{text(guide.title, lang)}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">{text(guide.intro, lang)}</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium ring-1 ring-white/20">
          <span aria-hidden="true">{isEn ? 'BN / EN' : 'বাংলা / English'}</span>
          <span>{isEn ? 'Change language from the top bar' : 'ভাষা বদলাতে উপরের language menu ব্যবহার করুন'}</span>
        </div>
      </header>

      <section className="card space-y-4 p-4 sm:p-5" aria-label={isEn ? 'Guide navigation and search' : 'গাইড নেভিগেশন ও খোঁজ'}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold dark:text-white">{isEn ? 'Search this guide' : 'এই গাইডে খুঁজুন'}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="input w-full" type="search" placeholder={isEn ? 'Try “payment”, “exam”, “result”…' : 'যেমন “পেমেন্ট”, “পরীক্ষা”, “রেজাল্ট”…'} />
        </label>
        {!query.trim() && (
          <nav className="flex flex-wrap gap-2" aria-label={isEn ? 'Guide sections' : 'গাইডের অংশগুলো'}>
            {sections.map((section) => (
              <a key={section.id} href={`#guide-${section.id}`} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-white/10 dark:text-gray-200 dark:hover:text-primary-300">
                {text(section.title, lang)}
              </a>
            ))}
          </nav>
        )}
      </section>

      {sections.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">{isEn ? 'No guide topics match your search.' : 'আপনার খোঁজের সঙ্গে মেলে এমন বিষয় পাওয়া যায়নি।'}</div>
      ) : sections.map((section) => (
        <section key={section.id} id={`guide-${section.id}`} className="scroll-mt-6 space-y-3">
          <h2 className="border-b border-gray-200 pb-2 text-xl font-bold dark:border-white/10 dark:text-white">{text(section.title, lang)}</h2>
          <div className="grid gap-3">
            {section.items.map((item, index) => (
              <details key={item.title.en} className="card group overflow-hidden" open={!!query.trim()}>
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 marker:hidden sm:p-5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold dark:text-white">{text(item.title, lang)}</span>
                    <span className="mt-1 block text-sm leading-6 text-gray-600 dark:text-gray-300">{text(item.description, lang)}</span>
                  </span>
                  <span className="mt-1 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                </summary>
                <div className="space-y-4 border-t border-gray-100 px-4 py-4 dark:border-white/10 sm:px-5">
                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">{isEn ? 'How to use' : 'ব্যবহারের ধাপ'}</h3>
                    <ol className="space-y-2">
                      {item.steps.map((step, stepIndex) => (
                        <li key={stepIndex} className="flex gap-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">{stepIndex + 1}</span>
                          <span>{text(step, lang)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {item.note && (
                    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                      <strong>{isEn ? 'Please note: ' : 'মনে রাখুন: '}</strong>{text(item.note, lang)}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
