// ================== pages/teacher/ResultDashboard.jsx ==================
import { Avatar } from '../admin/adminUi';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchExamResults, fetchExamById } from '../../features/exam/examSlice';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';
import useTeacherFeatures from '../../hooks/useTeacherFeatures';

function ScoreDistributionChart({ bins, title, maxCount, lang }) {
  const label = lang === 'en' ? 'Students' : 'শিক্ষার্থী';
  const chartW = 720;
  const chartH = 250;
  const left = 38;
  const top = 20;
  const plotW = chartW - left - 12;
  const plotH = 174;
  const gap = 8;
  const barW = (plotW - gap * (bins.length - 1)) / bins.length;
  return (
    <section className="card mb-5 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold dark:text-white">{title}</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      {bins.length === 0 || bins.every((bin) => bin.count === 0) ? <p className="py-8 text-center text-sm text-gray-500">—</p> : (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} role="img" aria-label={title} className="min-w-[540px] w-full">
            {[0, 0.5, 1].map((fraction) => {
              const y = top + plotH * (1 - fraction);
              return <g key={fraction}><line x1={left} y1={y} x2={chartW - 12} y2={y} stroke="currentColor" className="text-gray-200 dark:text-white/10" strokeDasharray={fraction === 0 ? undefined : '3 4'} /><text x={left - 7} y={y + 4} textAnchor="end" className="fill-gray-400" fontSize="10">{Math.round(maxCount * fraction)}</text></g>;
            })}
            {bins.map((bin, index) => {
              const height = bin.count ? Math.max(2, (bin.count / maxCount) * (plotH - 8)) : 0;
              const x = left + index * (barW + gap);
              const y = top + plotH - height;
              return <g key={bin.label}><rect x={x} y={y} width={barW} height={height} rx="5" className="fill-primary-600" /><text x={x + barW / 2} y={Math.max(top + 10, y - 5)} textAnchor="middle" className="fill-gray-500 dark:fill-gray-300" fontSize="10">{bin.count}</text><text x={x + barW / 2} y={top + plotH + 18} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" fontSize="9">{bin.label}</text></g>;
            })}
          </svg>
        </div>
      )}
    </section>
  );
}

function ShortAnswerFile({ file, index }) {
  const label = file.name || `Answer file ${index + 1}`;
  if (String(file.mime || '').startsWith('image/')) {
    return <a href={file.data} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-gray-200 dark:border-white/10"><img src={file.data} alt={label} className="max-h-80 w-full object-contain bg-gray-50 dark:bg-black/20" /></a>;
  }
  if (file.mime === 'application/pdf') {
    return <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10"><div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-xs dark:bg-white/5"><span className="truncate dark:text-gray-200">{label}</span><a href={file.data} target="_blank" rel="noreferrer" className="text-primary-600 underline">Open PDF</a></div><iframe title={label} src={file.data} className="h-80 w-full bg-white" /></div>;
  }
  return <a href={file.data} target="_blank" rel="noreferrer" className="text-sm text-primary-600 underline">{label}</a>;
}

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [reviewAttempt, setReviewAttempt] = useState(null);
  const [reviewMarks, setReviewMarks] = useState({});
  const [reviewRubrics, setReviewRubrics] = useState({});
  const [suggestionReasons, setSuggestionReasons] = useState({});
  const [suggesting, setSuggesting] = useState(false);
  const [bulkMark, setBulkMark] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const canViewFeedback = !!status && has('examFeedback');
  const submittedResults = results.filter((r) => r.status === 'submitted');
  const observedQuestionCount = Math.max(0, ...submittedResults.map((r) => (Number(r.totalCorrect) || 0) + (Number(r.totalWrong) || 0) + (Number(r.totalSkipped) || 0)));
  const questionsInExam = observedQuestionCount || Number(currentExam?.settings?.totalQuestionsToUse) || 1;
  const maxScore = Math.max(questionsInExam * (Number(currentExam?.settings?.marksPerQuestion) || 1), ...submittedResults.map((r) => Number(r.obtainedMarks) || 0), 1);
  const scoreBins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${(index + 1) * 10}%`, count: 0 }));
  submittedResults.forEach((result) => {
    const pct = Math.max(0, Math.min(99.99, ((Number(result.obtainedMarks) || 0) / maxScore) * 100));
    scoreBins[Math.floor(pct / 10)].count += 1;
  });
  const maxBinCount = Math.max(1, ...scoreBins.map((bin) => bin.count));

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

  const handlePdfExport = async () => {
    if (!has('exportResults')) return warnLocked('exportResults');
    setPdfBusy(true);
    try {
      const res = await axiosClient.get(`/exams/${id}/results/pdf?lang=${lang}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentExam?.title || 'results'}-results.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const message = err.response?.data?.message || (lang === 'en' ? 'Could not create the results PDF.' : 'রেজাল্ট PDF তৈরি করা যায়নি।');
      window.alert(message);
    } finally { setPdfBusy(false); }
  };

  const openReview = async (attemptId) => {
    setReviewBusy(true);
    try {
      const { data } = await axiosClient.get(`/exams/attempts/${attemptId}`);
      setReviewAttempt(data);
      const initial = {};
      const rubrics = {};
      (data.answers || []).forEach((a) => { if (a.question?.type === 'short') { initial[a.question._id] = a.marksAwarded ?? ''; rubrics[a.question._id] = a.question.gradingRubric || ''; } });
      setReviewMarks(initial);
      setReviewRubrics(rubrics);
      setSuggestionReasons({});
      setReviewFeedback(data.teacherFeedback || '');
    } catch (err) { window.alert(err.response?.data?.message || 'Answer load করা যায়নি'); }
    finally { setReviewBusy(false); }
  };

  const saveReview = async () => {
    if (!reviewAttempt) return;
    setReviewBusy(true);
    try {
      await axiosClient.patch(`/exams/attempts/${reviewAttempt._id}/short-answers`, { marks: reviewMarks, rubrics: reviewRubrics, feedback: reviewFeedback });
      setReviewAttempt(null);
      dispatch(fetchExamResults(id));
    } catch (err) { window.alert(err.response?.data?.message || 'Marks save করা যায়নি'); }
    finally { setReviewBusy(false); }
  };

  const applyBulkMark = () => {
    const value = Number(bulkMark);
    if (!Number.isFinite(value) || value < 0 || value > shortMax) return;
    setReviewMarks((current) => {
      const updated = { ...current };
      reviewAnswers.forEach((answer) => { updated[answer.question._id] = String(value); });
      return updated;
    });
  };
  const requestAiSuggestions = async () => {
    if (!reviewAttempt) return;
    setSuggesting(true);
    try {
      const { data } = await axiosClient.post(`/exams/attempts/${reviewAttempt._id}/short-answers/suggest`);
      setReviewMarks((current) => ({ ...current, ...Object.fromEntries((data.suggestions || []).map((item) => [item.questionId, String(item.marks)])) }));
      setSuggestionReasons(Object.fromEntries((data.suggestions || []).map((item) => [item.questionId, item.reason])));
    } catch (err) { window.alert(err.response?.data?.message || 'AI suggestion আনতে সমস্যা হয়েছে'); }
    finally { setSuggesting(false); }
  };
  const reviewAnswers = reviewAttempt
    ? (reviewAttempt.answers || [])
      .filter((a) => a.question?.type === 'short')
      .sort((a, b) => (Number(a.question?.order) || 0) - (Number(b.question?.order) || 0))
    : [];
  const shortMax = Number(currentExam?.settings?.marksPerQuestion) || 1;
  const reviewedTotal = reviewAnswers.reduce((sum, answer) => sum + (Number(reviewMarks[answer.question?._id]) || 0), 0);

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl">{t('resultDash.title')} — {currentExam?.title}</h1>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={handleExport} className={`btn-secondary ${has('exportResults') ? '' : 'opacity-60'}`}>
            {has('exportResults') ? '' : '🔒 '}{t('resultDash.export')}
          </button>
          <button onClick={handlePdfExport} disabled={pdfBusy} className={`btn-primary ${has('exportResults') ? '' : 'opacity-60'}`}>
            {has('exportResults') ? '' : '🔒 '}{pdfBusy ? t('resultDash.pdfPreparing') : t('resultDash.pdfExport')}
          </button>
        </div>
      </div>

      {(() => {
        const done = submittedResults;
        const reviewTotal = done.reduce((sum, item) => sum + (item.reviewProgress?.total || 0), 0);
        const reviewDone = done.reduce((sum, item) => sum + (item.reviewProgress?.reviewed || 0), 0);
        const marks = done.map((r) => Number(r.obtainedMarks) || 0);
        const avg = marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) : '-';
        const top = marks.length ? marks.reduce((max, value) => Math.max(max, value), -Infinity) : '-';
        return (
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[[t('r.stat.count'), results.length], [t('r.stat.avg'), avg], [t('r.stat.top'), top], [lang === 'en' ? 'Short answers reviewed' : 'Short উত্তর review', `${reviewDone}/${reviewTotal}`]].map(([l, v]) => (
              <div key={l} className="card px-4 py-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">{l}</div>
                <div className="text-2xl font-semibold tabular-nums text-primary-700 dark:text-primary-300">{v}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <ScoreDistributionChart bins={scoreBins} maxCount={maxBinCount} title={t('resultDash.graphTitle')} lang={lang} />

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
              <th className="text-center">Short answers</th>
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
                <td className="text-center">{r.status === 'submitted' && <div className="flex flex-col items-center gap-1"><button type="button" className="act" onClick={() => openReview(r._id)} disabled={reviewBusy}>Review</button>{r.reviewProgress?.total > 0 && <span className="text-xs text-gray-500">{r.reviewProgress.reviewed}/{r.reviewProgress.total} reviewed</span>}</div>}</td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr><td colSpan={9} className="!py-10 text-center text-gray-400">{t('resultDash.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {reviewAttempt && <section className="card mt-5 overflow-hidden p-0">
        <div className="border-b border-gray-200 bg-primary-50/70 p-5 dark:border-white/10 dark:bg-primary-500/10">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Short answer script</p><h2 className="mt-1 text-xl font-semibold dark:text-white">{reviewAttempt.studentName || 'Student'}</h2><p className="text-sm text-gray-600 dark:text-gray-300">Roll: {reviewAttempt.studentRoll || '—'} · Submitted: {reviewAttempt.submittedAt ? new Date(reviewAttempt.submittedAt).toLocaleString(lang === 'en' ? 'en-US' : 'bn-BD') : '—'}</p></div><button className="act" onClick={() => setReviewAttempt(null)}>Close</button></div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><span className="rounded-lg bg-white px-3 py-2 font-semibold text-primary-700 shadow-sm dark:bg-white/10 dark:text-primary-200">{reviewAnswers.length} questions</span><span className="rounded-lg bg-white px-3 py-2 font-semibold text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-300">Marks given: {reviewedTotal} / {reviewAnswers.length * shortMax}</span></div>
        </div>
        <div className="space-y-4 p-5">
          {reviewAnswers.length === 0 ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">এই শিক্ষার্থী কোনো Short Question উত্তর জমা দেয়নি।</p> : <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <label className="text-sm font-medium dark:text-gray-200">একই নম্বর সবার জন্য<input className="input mt-1 w-32" type="number" min="0" max={shortMax} step="0.01" value={bulkMark} onChange={(e) => setBulkMark(e.target.value)} placeholder={`0–${shortMax}`} /></label>
              <button type="button" className="btn-secondary" onClick={applyBulkMark}>সব উত্তরে প্রয়োগ</button>
              <button type="button" className="btn-primary" onClick={requestAiSuggestions} disabled={suggesting}>{suggesting ? 'AI দেখছে…' : 'AI নম্বরের প্রস্তাব'}</button>
              <span className="w-full text-xs text-amber-700 dark:text-amber-300">টাইপ করা উত্তর configured AI provider-এ যাবে; AI কেবল প্রস্তাব দেবে—যাচাই/সম্পাদনা করে তারপর Save করুন। ছবি/PDF AI পড়ে না; সেগুলো নিজে দেখে নম্বর দিন।</span>
            </div>
            {reviewAnswers.map((a, index) => {
              const qid = a.question._id;
              return <article key={qid} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-500/20 dark:text-primary-200">{index + 1}</span><p className="pt-1 font-semibold leading-relaxed dark:text-white">{a.question.questionText}</p></div><span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">পূর্ণমান: {shortMax}</span></div>
                <div className="ml-11 mt-4"><label className="block text-xs font-semibold text-gray-500 dark:text-gray-400">MARKING RUBRIC / KEY POINTS<textarea className="input mt-1 min-h-16 w-full bg-gray-50 dark:bg-gray-900" maxLength={3000} value={reviewRubrics[qid] || ''} onChange={(e) => setReviewRubrics((items) => ({ ...items, [qid]: e.target.value }))} placeholder="কোন মূল ধারণা থাকলে কত নম্বর দিতে হবে? (optional)" /></label></div>
                <div className="ml-11 mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4 dark:border-white/15 dark:bg-black/10"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Student answer</p><p className="whitespace-pre-wrap break-words text-sm leading-7 dark:text-gray-200">{a.answerText || 'কোনো লিখিত উত্তর নেই'}</p>{a.answerFiles?.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{a.answerFiles.map((file, i) => <ShortAnswerFile key={`${file.name}-${i}`} file={file} index={i} />)}</div>}</div>
                <div className="ml-11 mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-semibold dark:text-gray-200">প্রাপ্ত নম্বর <input type="number" min="0" max={shortMax} step="0.01" className="input w-28" placeholder="0" value={reviewMarks[qid] ?? ''} onChange={(e) => setReviewMarks((m) => ({ ...m, [qid]: e.target.value }))} /></label>{suggestionReasons[qid] ? <span className="text-xs text-violet-700 dark:text-violet-300">AI প্রস্তাব: {suggestionReasons[qid]}</span> : <span className="text-xs text-gray-500 dark:text-gray-400">এই প্রশ্নের নম্বর লিখুন</span>}</div>
              </article>;
            })}
          </>}
          <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-500/20 dark:bg-primary-500/10"><label className="block text-sm font-semibold text-primary-900 dark:text-primary-100">শিক্ষকের feedback / মন্তব্য<textarea className="input mt-2 min-h-24 w-full resize-y bg-white dark:bg-gray-900" maxLength={5000} placeholder="খাতার সামগ্রিক মন্তব্য লিখুন…" value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} /><span className="mt-1 block text-right text-xs text-gray-500 dark:text-gray-400">{reviewFeedback.length}/5000</span></label></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-white/10"><p className="text-lg font-bold dark:text-white">মোট প্রাপ্ত নম্বর: {reviewedTotal} / {reviewAnswers.length * shortMax}</p><button className="btn-primary" onClick={saveReview} disabled={reviewBusy}>{reviewBusy ? 'Saving…' : 'Save marks & feedback'}</button></div>
        </div>
      </section>}
    </div>
  );
}
