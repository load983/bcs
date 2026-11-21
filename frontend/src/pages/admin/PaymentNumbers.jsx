// ================== pages/admin/PaymentNumbers.jsx ==================
// অ্যাডমিন এখানে বিকাশ / নগদ / রকেটের নাম্বার বদলায় — শিক্ষকের "সাবস্ক্রিপশন" পেজে এই নাম্বারই দেখায়।
import React, { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

const KEYS = ['bkash', 'nagad', 'rocket'];

export default function PaymentNumbers({ say }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ bkash: '', nagad: '', rocket: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axiosClient.get('/admin/payment-numbers')
      .then(({ data }) => setForm((f) => ({ ...f, ...data.numbers })))
      .catch((e) => say(e.response?.data?.message || t('a.loadFailed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await axiosClient.put('/admin/payment-numbers', form);
      setForm((f) => ({ ...f, ...data.numbers }));
      say(data.message || t('a.saved'));
    } catch (err) {
      say(err.response?.data?.message || t('a.saveFailed'));
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-gray-500">{t('a.loading')}</p>;

  return (
    <form onSubmit={save} className="card mb-4 space-y-3 p-4">
      <h3 className="font-semibold dark:text-white">{t('a.pn.title')}</h3>
      <p className="text-xs text-gray-500">{t('a.pn.hint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {KEYS.map((k) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block font-medium dark:text-gray-200">{t(`sub.provider.${k}`)}</span>
            <input className="input" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <button className="btn-primary" disabled={saving}>{saving ? t('a.saving') : t('a.save')}</button>
    </form>
  );
}
