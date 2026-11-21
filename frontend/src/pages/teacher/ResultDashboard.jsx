// ================== pages/teacher/ResultDashboard.jsx ==================
import { Avatar } from '../admin/adminUi';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchExamResults, fetchExamById } from '../../features/exam/examSlice';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';
import useTeacherFeatures from '../../hooks/useTeacherFeatures';

export default function ResultDashboard() {
  const { t, lang } = useLanguage();
  const { status, has, warnLocked, lockedMessage } = useTeacherFeatures();
  const { id } = useParams();
  const dispatch = useDispatch();
  const { results: storedResults, currentExam, resultsDisabledMessage, resultsExamId } = useSelector((s) => s.exam);
  const results = Array.isArray(storedResults) ? storedResults : [];
  const [feedbackData, setFeedbackData] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const canViewFeedback = !!status && has('examFeedback');

  useEffect(() => {
    dispatch(fetchExamById(id));
    dispatch(fetchExamResults(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (!status) return;
    if (!canViewFeedback) {
      setFeedbackData(null);
      return;
    }
    let alive = true;
    setFeedbackLoading(true);
    setFeedbackError('');
    axiosClient.get(`/exams/${id}/feedback`)
      .then(({ data }) => { if (alive) setFeedbackData(data); })
      .catch((err) => { if (alive) setFeedbackError(err.response?.data?.message || t('feedback.teacherError')); })
      .finally(() => { if (alive) setFeedbackLoading(false); });
    return () => { alive = false; };
  }, [id, status?.featureLimited, status?.catalogVersion, status?.features?.join(','), canViewFeedback, t]);

  const handleExport = async () => {
    if (!has('exportResults')) return warnLocked('exportResults');
    const res = await axiosClient.get(`/exams/${id}/results/export`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentExam?.title || 'results'}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (resultsExamId === id && resultsDisabledMessage) {
    return (
      <div className="mx-auto max-w-6xl py-2">
        <h1 className="text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl mb-6">{t('resultDash.title')} — {currentExam?.title}</h1>
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
          {resultsDisabledMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl py-2">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl">{t('resultDash.title')} — {currentExam?.title}</h1>
        <button onClick={handleExport} className={`btn-primary ${has('exportResults') ? '' : 'opacity-60'}`}>
          {has('exportResults') ? '' : '🔒 '}{t('resultDash.export')}
        </button>
      </div>

      {(() => {
        const done = results.filter((r) => r.status === 'submitted');
        const marks = done.map((r) => Number(r.obtainedMarks) || 0);
        const avg = marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) : '-';
        const top = marks.length ? Math.max(...marks) : '-';
        return (
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[[t('r.stat.count'), results.length], [t('r.stat.avg'), avg], [t('r.stat.top'), top]].map(([l, v]) => (
              <div key={l} className="card px-4 py-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{l}</div>
                <div className="text-2xl font-semibold tabular-nums text-primary-700 dark:text-primary-300">{v}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <section className="card mb-5 space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold dark:text-white">{t('feedback.teacherTitle')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('feedback.method')}</p>
        </div>
        {!status ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : !canViewFeedback ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">🔒 {lockedMessage('examFeedback')}</p>
        ) : feedbackError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{feedbackError}</p>
        ) : feedbackLoading || !feedbackData ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                [t('feedback.total'), feedbackData.analysis?.total ?? feedbackData.comments?.length ?? 0],
                [t('feedback.positive'), feedbackData.analysis?.sentiment?.positive || 0],
                [t('feedback.neutral'), feedbackData.analysis?.sentiment?.neutral || 0],
                [t('feedback.critical'), feedbackData.analysis?.sentiment?.critical || 0],
                [t('feedback.mixed'), feedbackData.analysis?.sentiment?.mixed || 0],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-gray-50 p-3 dark:bg-white/5"><div className="text-xs text-gray-500">{label}</div><div className="text-xl font-semibold dark:text-white">{value}</div></div>)}
            </div>
            {!!feedbackData.analysis?.topics?.length && (
              <div>
                <h3 className="mb-2 text-sm font-semibold dark:text-white">{t('feedback.topics')}</h3>
                <div className="flex flex-wrap gap-2">
                  {feedbackData.analysis.topics.map((topic) => <span key={topic.key} className="badge bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">{t(`feedback.topic.${topic.key}`)} · {topic.count}</span>)}
                </div>
              </div>
            )}
            {feedbackData.comments?.length ? (
              <div className="space-y-3">
                {feedbackData.comments.map((comment, index) => (
                  <article key={`${comment.studentRoll}-${comment.createdAt}-${index}`} className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <strong className="text-sm text-gray-800 dark:text-gray-100">{comment.studentName} · {t('common.roll')} {comment.studentRoll}</strong>
                      <time dateTime={comment.createdAt}>{new Date(comment.updatedAt || comment.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'bn-BD')}</time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm dark:text-gray-200">{comment.body}</p>
                  </article>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500 dark:text-gray-400">{t('feedback.none')}</p>}
          </>
        )}
      </section>

      <div className="card overflow-x-auto !p-1">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="text-left">{t('resultDash.colName')}</th>
              <th className="text-left">{t('resultDash.colRoll')}</th>
              <th className="text-left">IP</th>
              <th className="text-center">{t('resultDash.colCorrect')}</th>
              <th className="text-center">{t('resultDash.colWrong')}</th>
              <th className="text-center">{t('resultDash.colSkipped')}</th>
              <th className="text-center">{t('resultDash.colMarks')}</th>
              <th className="text-center">{t('resultDash.colStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r._id} className="dark:text-gray-200">
                <td><div className="flex items-center gap-3"><Avatar name={r.studentName} /><span className="font-medium">{r.studentName}</span></div></td>
                <td>{r.studentRoll}</td>
                <td>{r.ipAddress}</td>
                <td className="text-center text-emerald-600">{r.totalCorrect}</td>
                <td className="text-center text-red-600">{r.totalWrong}</td>
                <td className="text-center text-gray-500">{r.totalSkipped}</td>
                <td className="text-center font-semibold">{r.obtainedMarks}</td>
                <td className="text-center"><span className={`badge ${r.status === 'submitted' ? (r.autoSubmitted ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300') : 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'}`}>{r.status === 'submitted' ? (r.autoSubmitted ? t('resultDash.autoSubmit') : t('resultDash.submitted')) : t('resultDash.ongoing')}</span></td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr><td colSpan={8} className="!py-10 text-center text-gray-400">{t('resultDash.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
