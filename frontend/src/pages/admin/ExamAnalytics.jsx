import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';

function KPI({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

export default function ExamAnalytics({ say }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return axiosClient.get('/admin/exam-analytics')
      .then(({ data: result }) => setData(result))
      .catch((err) => say(err.response?.data?.message || t('a.loadFailed')))
      .finally(() => setLoading(false));
  }, [say, t]);

  useEffect(() => { load(); }, [load]);

  const num = (value) => Number(value || 0).toLocaleString();
  const pct = (value) => `${Number(value || 0).toLocaleString()}%`;

  if (loading && !data) return <div className="card p-8 text-center text-gray-500">{t('a.loading')}</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">{t('a.tab.analytics')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('a.analytics.subtitle')}</p>
        </div>
        <button type="button" className="btn-secondary text-sm" onClick={load}>{t('a.refresh')}</button>
      </div>

      <section>
        <h3 className="mb-2 text-sm text-gray-500">{t('a.analytics.exams')}</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label={t('a.analytics.totalExams')} value={num(data.exams.total)} />
          <KPI label={t('a.analytics.published')} value={num(data.exams.published)} />
          <KPI label={t('a.analytics.drafts')} value={num(data.exams.draft)} />
          <KPI label={t('a.analytics.closed')} value={num(data.exams.closed)} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm text-gray-500">{t('a.analytics.attempts')}</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label={t('a.analytics.totalAttempts')} value={num(data.attempts.total)} />
          <KPI label={t('a.analytics.submitted')} value={num(data.attempts.submitted)} />
          <KPI label={t('a.analytics.inProgress')} value={num(data.attempts.inProgress)} />
          <KPI label={t('a.analytics.completion')} value={pct(data.attempts.completionRate)} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-4">
          <h3 className="mb-3 font-semibold dark:text-white">{t('a.analytics.performance')}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-gray-500">{t('a.analytics.uniqueStudents')}</span><b>{num(data.uniqueStudents)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-gray-500">{t('a.analytics.scoredAttempts')}</span><b>{num(data.scores.submitted)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-gray-500">{t('a.analytics.averageScore')}</span><b>{Number(data.scores.average || 0).toLocaleString()}</b></div>
            <div className="flex justify-between gap-3"><span className="text-gray-500">{t('a.analytics.positiveRate')}</span><b>{pct(data.scores.positiveRate)}</b></div>
          </div>
        </section>

        <section className="card p-4 lg:col-span-2">
          <h3 className="mb-3 font-semibold dark:text-white">{t('a.analytics.topExams')}</h3>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="text-gray-500"><tr><th className="py-2">{t('a.analytics.exam')}</th><th>{t('a.analytics.teacher')}</th><th>{t('a.analytics.attempts')}</th><th>{t('a.analytics.averageScore')}</th></tr></thead>
              <tbody className="dark:text-gray-200">
                {data.topExams.map((exam) => (
                  <tr key={String(exam._id)} className="border-t border-gray-100 dark:border-white/10">
                    <td className="max-w-[16rem] truncate py-2 font-medium">{exam.title}</td>
                    <td>{exam.teacherName || '-'}</td>
                    <td className="tabular-nums">{num(exam.attempts)}</td>
                    <td className="tabular-nums">{Number(exam.averageScore || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {data.topExams.length === 0 && <tr><td colSpan="4" className="py-4 text-gray-500">{t('a.analytics.noData')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
