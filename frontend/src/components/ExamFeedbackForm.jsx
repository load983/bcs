import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';
import { useLanguage } from '../context/LanguageContext';

export default function ExamFeedbackForm({ attemptId }) {
  const { t } = useLanguage();
  const [body, setBody] = useState('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!attemptId) return;
    let alive = true;
    setLoading(true);
    axiosClient.get(`/attempts/${attemptId}/feedback`)
      .then(({ data }) => {
        if (!alive) return;
        setBody(data.feedback?.body || '');
        setExists(!!data.feedback);
      })
      .catch(() => { if (alive) setError(t('feedback.loadFailed')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attemptId, t]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!body.trim()) return setError(t('feedback.required'));
    setSaving(true);
    try {
      const { data } = await axiosClient.put(`/attempts/${attemptId}/feedback`, { body });
      setBody(data.feedback?.body || body.trim());
      setExists(true);
      setNotice(t('feedback.saved'));
    } catch (err) {
      setError(err.response?.data?.message || t('feedback.saveFailed'));
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={save} className="card space-y-3 p-5">
      <div>
        <h3 className="font-semibold dark:text-white">{t('feedback.studentTitle')}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('feedback.prompt')}</p>
      </div>
      <textarea className="input min-h-28 w-full resize-y" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('feedback.placeholder')} disabled={loading || saving} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <span>{loading ? t('common.loading') : `${body.length}/1000 · ${t('feedback.max')}`}</span>
        <button type="submit" className="btn-primary" disabled={loading || saving}>{saving ? t('feedback.saving') : exists ? t('feedback.update') : t('feedback.save')}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}
    </form>
  );
}
