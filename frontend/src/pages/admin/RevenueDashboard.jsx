// ================== pages/admin/RevenueDashboard.jsx ==================
// অ্যাডমিন > আয়ের ড্যাশবোর্ড: মাসিক আয় (বার চার্ট), কোন প্ল্যান বেশি বিক্রি হচ্ছে, কোন পেমেন্ট মাধ্যমে কত আয় (ডোনাট চার্ট)।
// চার্ট লাইব্রেরি ছাড়াই SVG দিয়ে আঁকা — তাই নতুন প্যাকেজ লাগে না, ডার্ক মোডেও ঠিক দেখায়।
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

const RANGES = [6, 12, 24];

// পেমেন্ট মাধ্যমের রঙ (ব্র্যান্ডের কাছাকাছি, যাতে এক নজরে চেনা যায়)
const PROVIDER_COLOR = {
  bkash: '#e2136e',
  nagad: '#f6921e',
  rocket: '#8c3494',
  sslcommerz: '#2563eb',
  rupantorpay: '#0d9488',
  promo: '#9ca3af',
  unknown: '#6b7280',
};

// y অক্ষের জন্য "সুন্দর" সর্বোচ্চ মান ও ধাপ (1, 2, 5 × 10ⁿ)
function niceScale(max) {
  if (max <= 0) return { top: 100, step: 25 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  return { top: Math.ceil(max / step) * step, step };
}

function KPI({ label, value, sub, subTone = '' }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{value}</div>
      {sub && <div className={`mt-1 text-xs ${subTone || 'text-gray-500 dark:text-gray-400'}`}>{sub}</div>}
    </div>
  );
}

// ---------- মাসিক বার চার্ট ----------
function MonthlyChart({ data, money, monthLabel, t }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 270, L = 52, R = 10, T = 14, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(...data.map((d) => d.revenue), 0);
  const { top, step } = niceScale(max);
  const ticks = [];
  for (let v = 0; v <= top + 0.001; v += step) ticks.push(v);
  const slot = iw / data.length;
  const bw = Math.min(34, slot * 0.64);
  const skip = data.length > 14 ? 2 : 1; // ২৪ মাসে একটা একটা করে লেবেল বাদ
  const short = (v) => (v >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(v));
  const sel = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 min-h-[1.5rem] text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
        {sel ? (
          <>
            <b className="text-gray-900 dark:text-white">{monthLabel(sel.month, true)}</b>
            {' — '}{money(sel.revenue)} · {t('rev.orders', { n: sel.orders })}
          </>
        ) : (
          <span className="text-gray-400">{t('rev.hoverHint')}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('rev.monthly')} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => {
          const y = T + ih - (v / top) * ih;
          return (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y} y2={y} className="stroke-gray-200 dark:stroke-white/10" strokeWidth="1" />
              <text x={L - 8} y={y + 4} textAnchor="end" fontSize="11" className="fill-gray-500 dark:fill-gray-400">৳{short(v)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = top ? (d.revenue / top) * ih : 0;
          const x = L + slot * i + (slot - bw) / 2;
          const y = T + ih - h;
          const active = hover === i;
          return (
            <g key={d.month}>
              {/* পুরো কলামটাই হোভার/ফোকাস এলাকা, যাতে ছোট বারেও সহজে ধরা যায় */}
              <rect x={L + slot * i} y={T} width={slot} height={ih} fill="transparent" tabIndex={0}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                aria-label={`${monthLabel(d.month, true)}: ${money(d.revenue)}`} className="outline-none" />
              <rect x={x} y={d.revenue > 0 ? y : T + ih - 2} width={bw} height={d.revenue > 0 ? Math.max(h, 2) : 2} rx="3"
                className={d.revenue > 0 ? 'fill-primary-500' : 'fill-gray-300 dark:fill-white/15'} opacity={hover == null || active ? 1 : 0.55} pointerEvents="none" />
              {i % skip === (data.length - 1) % skip && (
                <text x={L + slot * i + slot / 2} y={H - 12} textAnchor="middle" fontSize="11" className="fill-gray-500 dark:fill-gray-400">{monthLabel(d.month)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- ডোনাট চার্ট ----------
function Donut({ slices, total, money, t }) {
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" className="mx-auto h-44 w-44 shrink-0" role="img" aria-label={t('rev.byGateway')}>
      <g transform="rotate(-90 70 70)">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="22" className="stroke-gray-100 dark:stroke-white/10" />
        {slices.map((s) => {
          const len = total ? (s.revenue / total) * C : 0;
          const el = (
            <circle key={s.provider} cx="70" cy="70" r={R} fill="none" strokeWidth="22" stroke={s.color}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}>
              <title>{`${s.label}: ${money(s.revenue)}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
      </g>
      <text x="70" y="66" textAnchor="middle" fontSize="9" className="fill-gray-500 dark:fill-gray-400">{t('rev.total')}</text>
      <text x="70" y="82" textAnchor="middle" fontSize="13" fontWeight="600" className="fill-gray-900 dark:fill-white">{money(total)}</text>
    </svg>
  );
}

export default function RevenueDashboard({ say }) {
  const { t, locale } = useLanguage();
  const [months, setMonths] = useState(12);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const money = useCallback((n) => `৳${Number(n || 0).toLocaleString(locale, { maximumFractionDigits: 0 })}`, [locale]);
  const num = useCallback((n) => Number(n || 0).toLocaleString(locale), [locale]);
  // 'YYYY-MM' → "অক্টোবর" / "Oct" (full হলে বছরসহ)
  const monthLabel = useCallback((key, full = false) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    const fmt = new Intl.DateTimeFormat(locale, full ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' });
    return fmt.format(d);
  }, [locale]);

  const load = useCallback(() => {
    setLoading(true);
    return axiosClient
      .get('/admin/revenue', { params: { months } })
      .then(({ data: d }) => setData(d))
      .catch((e) => say(e.response?.data?.message || t('a.loadFailed')))
      .finally(() => setLoading(false));
  }, [months]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const slices = useMemo(() => (data?.byProvider || []).map((p) => ({
    ...p,
    label: t(`rev.prov.${p.provider}`) === `rev.prov.${p.provider}` ? p.provider : t(`rev.prov.${p.provider}`),
    color: PROVIDER_COLOR[p.provider] || PROVIDER_COLOR.unknown,
  })), [data, t]);

  const s = data?.summary;
  const providerTotal = slices.reduce((a, x) => a + x.revenue, 0);
  const maxOrders = Math.max(...(data?.byPlan || []).map((p) => p.orders), 1);
  const g = s?.growthPercent;
  const growthText = g == null ? t('rev.noGrowth') : `${g > 0 ? '▲' : g < 0 ? '▼' : '■'} ${Math.abs(g)}% ${t('rev.vsLast')}`;
  const growthTone = g == null || g === 0 ? '' : g > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">{t('a.tab.revenue')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('rev.note')}</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-white/10" role="group" aria-label={t('rev.range')}>
          {RANGES.map((n) => (
            <button key={n} type="button" onClick={() => setMonths(n)} aria-pressed={months === n}
              className={`px-3 py-1.5 text-sm transition ${months === n ? 'bg-primary-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/5'}`}>
              {t('rev.months', { n })}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && <div className="card p-6 text-center text-gray-500">{t('a.loading')}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPI label={t('rev.total')} value={money(s.totalRevenue)} sub={t('rev.orders', { n: num(s.totalOrders) })} />
            <KPI label={t('rev.thisMonth')} value={money(s.thisMonth)} sub={growthText} subTone={growthTone} />
            <KPI label={t('rev.rangeRevenue', { n: months })} value={money(s.rangeRevenue)} sub={t('rev.orders', { n: num(s.rangeOrders) })} />
            <KPI label={t('rev.avgOrder')} value={money(s.avgOrder)} />
          </div>

          {s.rangeOrders === 0 ? (
            <div className="card p-8 text-center text-gray-500 dark:text-gray-400">{t('rev.empty')}</div>
          ) : (
            <>
              <section className="card p-4">
                <h3 className="mb-2 font-semibold dark:text-white">{t('rev.monthly')}</h3>
                <MonthlyChart data={data.monthly} money={money} monthLabel={monthLabel} t={t} />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-primary-600 dark:text-primary-300">{t('rev.showTable')}</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="admin-table">
                      <thead className="text-gray-500"><tr><th className="py-2">{t('rev.month')}</th><th>{t('rev.revenue')}</th><th>{t('rev.salesCount')}</th></tr></thead>
                      <tbody className="dark:text-gray-200">
                        {[...data.monthly].reverse().map((m) => (
                          <tr key={m.month} className="border-t border-gray-100 dark:border-white/10">
                            <td className="py-2">{monthLabel(m.month, true)}</td><td className="tabular-nums">{money(m.revenue)}</td><td className="tabular-nums">{num(m.orders)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="card p-4">
                  <h3 className="mb-3 font-semibold dark:text-white">{t('rev.byPlan')}</h3>
                  <ul className="space-y-3">
                    {data.byPlan.map((p, i) => (
                      <li key={p.name}>
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="font-medium dark:text-white">
                            {p.name}
                            {i === 0 && data.byPlan.length > 1 && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">🏆 {t('rev.topSeller')}</span>}
                          </span>
                          <span className="text-gray-600 dark:text-gray-300">{t('rev.orders', { n: num(p.orders) })} · {money(p.revenue)}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                          <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(3, (p.orders / maxOrders) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="card p-4">
                  <h3 className="mb-3 font-semibold dark:text-white">{t('rev.byGateway')}</h3>
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <Donut slices={slices} total={providerTotal} money={money} t={t} />
                    <ul className="w-full space-y-2 text-sm">
                      {slices.map((p) => (
                        <li key={p.provider} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 dark:text-gray-200">
                            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                            {p.label}
                          </span>
                          <span className="text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {money(p.revenue)} <span className="text-xs text-gray-400">({providerTotal ? Math.round((p.revenue / providerTotal) * 100) : 0}% · {t('rev.orders', { n: num(p.orders) })})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
