import React, { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

const Field = ({ label, ...props }) => (
  <label className="block text-sm text-gray-600 dark:text-gray-300">
    {label}
    <input className="input mt-1 w-full" {...props} />
  </label>
);

const STATUS_KEY = {
  sent: 'a.msg.status.sent',
  failed: 'a.msg.status.failed',
  disabled: 'a.msg.status.disabled',
  incomplete: 'a.msg.status.incomplete',
};

export default function MessagingSettings({ say }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ emailEnabled: false, smtpPort: 587, smsEnabled: false });
  const [test, setTest] = useState({ email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    axiosClient.get('/admin/messaging/settings')
      .then(({ data }) => setForm(data))
      .catch((error) => say(error.response?.data?.message || t('a.loadFailed')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await axiosClient.put('/admin/messaging/settings', form);
      setForm((current) => ({
        ...current,
        smtpPass: '',
        twilioToken: '',
        hasSmtpPass: Boolean(current.hasSmtpPass || current.smtpPass),
        hasTwilioToken: Boolean(current.hasTwilioToken || current.twilioToken),
      }));
      say(data.message);
    } catch (error) {
      say(error.response?.data?.message || t('a.msg.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const email = test.email.trim();
    const phone = test.phone.trim();
    if (!email && !phone) {
      say(t('a.msg.recipientRequired'));
      return;
    }

    setTestBusy(true);
    try {
      const { data } = await axiosClient.post('/admin/messaging/test', { email, phone });
      const results = [];
      if (data.emailStatus && data.emailStatus !== 'not_requested') {
        results.push(`${t('a.msg.email')}: ${STATUS_KEY[data.emailStatus] ? t(STATUS_KEY[data.emailStatus]) : data.emailStatus}`);
      }
      if (data.smsStatus && data.smsStatus !== 'not_requested') {
        results.push(`${t('a.msg.sms')}: ${STATUS_KEY[data.smsStatus] ? t(STATUS_KEY[data.smsStatus]) : data.smsStatus}`);
      }
      say([data.message, ...results].filter(Boolean).join(' · '));
    } catch (error) {
      say(error.response?.data?.message || t('a.msg.testFailed'));
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-gray-500">
        {t('a.msg.intro')}
      </p>

      <section className="card space-y-3 p-4">
        <label className="flex gap-2 font-semibold">
          <input type="checkbox" checked={!!form.emailEnabled} onChange={(event) => set('emailEnabled', event.target.checked)} />
          {t('a.msg.emailEnabled')}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('a.msg.smtpHost')} value={form.smtpHost || ''} onChange={(event) => set('smtpHost', event.target.value)} placeholder="smtp.gmail.com" autoComplete="off" />
          <Field label={t('a.msg.smtpPort')} type="number" min="1" max="65535" value={form.smtpPort || 587} onChange={(event) => set('smtpPort', event.target.value)} />
          <Field label={t('a.msg.smtpUser')} value={form.smtpUser || ''} onChange={(event) => set('smtpUser', event.target.value)} autoComplete="username" />
          <Field label={t('a.msg.smtpPass')} type="password" value={form.smtpPass || ''} onChange={(event) => set('smtpPass', event.target.value)} placeholder={form.hasSmtpPass ? t('a.msg.keepSaved') : ''} autoComplete="new-password" />
          <Field label={t('a.msg.fromEmail')} type="email" value={form.fromEmail || ''} onChange={(event) => set('fromEmail', event.target.value)} placeholder="notifications@example.com" />
          <Field label={t('a.msg.fromName')} value={form.fromName || ''} onChange={(event) => set('fromName', event.target.value)} />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <label className="flex gap-2 font-semibold">
          <input type="checkbox" checked={!!form.smsEnabled} onChange={(event) => set('smsEnabled', event.target.checked)} />
          {t('a.msg.smsEnabled')}
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={form.smsExamEnabled !== false} onChange={(event) => set('smsExamEnabled', event.target.checked)} />
            {t('a.msg.smsExamEnabled')}
          </label>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={form.smsResultEnabled !== false} onChange={(event) => set('smsResultEnabled', event.target.checked)} />
            {t('a.msg.smsResultEnabled')}
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('a.msg.twilioSid')} value={form.twilioSid || ''} onChange={(event) => set('twilioSid', event.target.value)} autoComplete="off" />
          <Field label={t('a.msg.twilioToken')} type="password" value={form.twilioToken || ''} onChange={(event) => set('twilioToken', event.target.value)} placeholder={form.hasTwilioToken ? t('a.msg.keepSaved') : ''} autoComplete="new-password" />
          <Field label={t('a.msg.twilioFrom')} type="tel" value={form.twilioFrom || ''} onChange={(event) => set('twilioFrom', event.target.value)} placeholder="+1…" />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy || testBusy} onClick={save}>
          {busy ? t('a.msg.saving') : t('a.msg.save')}
        </button>
      </div>

      <section className="card space-y-3 p-4">
        <div>
          <h4 className="font-semibold">{t('a.msg.testTitle')}</h4>
          <p className="text-xs text-gray-500">{t('a.msg.testDesc')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('a.msg.testEmail')} type="email" value={test.email} onChange={(event) => setTest((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" />
          <Field label={t('a.msg.testPhone')} type="tel" value={test.phone} onChange={(event) => setTest((current) => ({ ...current, phone: event.target.value }))} placeholder="+8801XXXXXXXXX" />
        </div>
        <button type="button" className="btn-secondary" disabled={testBusy || busy || (!test.email.trim() && !test.phone.trim())} onClick={sendTest}>
          {testBusy ? t('a.msg.testing') : t('a.msg.test')}
        </button>
      </section>
    </div>
  );
}
