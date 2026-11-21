// ================== pages/admin/Plugins.jsx ==================
// অ্যাডমিন > প্লাগইন: সব ইন্টিগ্রেশন একটা হাবে — কার্ডে অবস্থা (চালু / বন্ধ / সেটআপ বাকি), দ্রুত চালু-বন্ধ, আর "সেটিংস" চাপলে ওই প্লাগইনের অপশন খোলে।
import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from './adminUi';
import GatewaySettings from './GatewaySettings';
import PaymentNumbers from './PaymentNumbers';
import AiSettings from './AiSettings';
import TrialSettings from './TrialSettings';
import MessagingSettings from './MessagingSettings';

const META = {
  sslcommerz: { icon: 'card', group: 'payment' },
  rupantorpay: { icon: 'card', group: 'payment' },
  manual: { icon: 'phone', group: 'payment' },
  ai: { icon: 'ai', group: 'tools' },
  trial: { icon: 'clock', group: 'tools' },
  messaging: { icon: 'phone', group: 'notifications' },
};
const BADGE = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  off: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  setup: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

export default function Plugins({ say }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null); // কোন প্লাগইনের সেটিংস খোলা
  const [busy, setBusy] = useState('');

  const load = useCallback(() => axiosClient.get('/admin/plugins').then(({ data: d }) => setData(d)).catch((e) => say(e.response?.data?.message || t('a.loadFailed'))), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  // সেটিংস থেকে ফিরলে কার্ডের অবস্থা নতুন করে আনা
  const back = () => { setOpenId(null); load(); };

  const toggle = async (p) => {
    setBusy(p.id);
    try {
      let res;
      if (p.group === 'payment' && p.id !== 'manual') {
        // গেটওয়ে: চালু = এটাকে সক্রিয় বানানো (অন্যটা আপনাআপনি বন্ধ); বন্ধ = অনলাইন পেমেন্ট বন্ধ
        res = p.state === 'active'
          ? await axiosClient.put('/admin/gateway/settings', { enabled: false })
          : await axiosClient.put('/admin/gateway/settings', { enabled: true, active: p.id });
      } else if (p.id === 'ai') {
        res = await axiosClient.put('/admin/ai/settings', { enabled: p.state !== 'active' });
      }
      if (res) say(res.data.message || t('a.saved'));
      await load();
    } catch (err) {
      say(err.response?.data?.message || t('a.saveFailed'));
    } finally { setBusy(''); }
  };

  if (!data) return <p className="text-gray-500">{t('a.loading')}</p>;

  // ---- সেটিংস ভিউ ----
  if (openId) {
    const view = {
      sslcommerz: <GatewaySettings say={say} />,
      rupantorpay: <GatewaySettings say={say} />,
      manual: <PaymentNumbers say={say} />,
      ai: <AiSettings say={say} />,
      trial: <TrialSettings say={say} />,
      messaging: <MessagingSettings say={say} />,
    }[openId];
    return (
      <div>
        <button type="button" className="btn-secondary mb-3" onClick={back}>← {t('a.plug.back')}</button>
        <h3 className="mb-2 font-semibold dark:text-white">{t(`a.plug.${openId}.name`)}</h3>
        {view}
      </div>
    );
  }

  const canToggle = (p) => (p.group === 'payment' && p.id !== 'manual') || p.id === 'ai';
  const groups = ['payment', 'tools', 'notifications'];

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">{t('a.plug.intro')}</p>
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t(`a.plug.grp.${g}`)}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.plugins.filter((p) => (META[p.id] || {}).group === g).map((p) => (
              <div key={p.id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                    <Icon name={META[p.id].icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold dark:text-white">{t(`a.plug.${p.id}.name`)}</span>
                      <span className={`badge ${BADGE[p.state]}`}>{t(`a.plug.state.${p.state}`)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{t(`a.plug.${p.id}.desc`)}</p>
                    {p.id === 'sslcommerz' && p.configured && <p className="mt-1 text-xs text-gray-500">{p.mode === 'sandbox' ? 'Sandbox' : 'Live'}{p.hint ? ` · ••••${p.hint}` : ''}</p>}
                    {p.id === 'rupantorpay' && p.configured && p.hint && <p className="mt-1 text-xs text-gray-500">••••{p.hint}</p>}
                    {p.id === 'trial' && p.state === 'active' && <p className="mt-1 text-xs text-gray-500">{t('a.plug.trial.days', { n: p.days })}</p>}
                    {p.id === 'messaging' && p.channels && <p className="mt-1 text-xs text-gray-500">Email: {t(`a.plug.state.${p.channels.email}`)} · SMS: {t(`a.plug.state.${p.channels.sms}`)}</p>}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" onClick={() => setOpenId(p.id)}>{p.state === 'setup' ? t('a.plug.setup') : t('a.plug.settings')}</button>
                  {canToggle(p) && p.configured && (
                    <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" disabled={busy === p.id} onClick={() => toggle(p)}>
                      {p.state === 'active' ? t('a.plug.turnOff') : t('a.plug.turnOn')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-gray-500">{t('a.plug.note')}</p>
    </div>
  );
}
