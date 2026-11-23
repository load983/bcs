// ================== pages/student/StudentResult.jsx ==================
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import axiosClient from '../../api/axiosClient';
import { resetAttempt, fetchAttemptResult, fetchReview } from '../../features/attempt/attemptSlice';
import { useLanguage } from '../../context/LanguageContext';
import MathText from '../../components/MathText';
import assetUrl from '../../utils/assetUrl';
import ChemDiagramList from '../../components/ChemDiagramList';
import ZoomImage from '../../components/ZoomImage';
import ExamFeedbackForm from '../../components/ExamFeedbackForm';
import PdfPreviewModal from '../../components/PdfPreviewModal';
import { downloadBlob, fetchFileBlob } from '../../utils/download';
import FeedbackMediaItem from '../../components/FeedbackMediaItem';
import ShortAnswerReview from '../../components/ShortAnswerReview';

export default function StudentResult() {
  const { t } = useLanguage();
  const { result, attemptId, review } = useSelector((s) => s.attempt);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [showReview, setShowReview] = useState(false);
  const [filter, setFilter] = useState('all');
  const [downloading, setDownloading] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [downloadingResource, setDownloadingResource] = useState(false);
  const [resourceDownloadError, setResourceDownloadError] = useState('');
  const [downloadingOriginal, setDownloadingOriginal] = useState(false);
  const [originalDownloadError, setOriginalDownloadError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => { if (!result) navigate('/'); }, [result, navigate]);

  useEffect(() => {
    if (!attemptId || !result?.reviewPending) return undefined;
    const refresh = () => dispatch(fetchAttemptResult(attemptId));
    refresh();
    const timer = window.setInterval(refresh, 12000);
    return () => window.clearInterval(timer);
  }, [attemptId, result?.reviewPending, dispatch]);

  const closePdfPreview = () => {
    if (pdfPreview?.url) window.URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const blob = await fetchFileBlob(`/attempts/${attemptId}/download-pdf`, { preview: 1 });
      closePdfPreview();
      setPdfPreview({ blob, url: window.URL.createObjectURL(blob), filename: 'result.pdf' });
    } catch {
      setDownloadError(t('result.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadResource = async () => {
    setDownloadingResource(true);
    setResourceDownloadError('');
    try {
      const res = await axiosClient.get(`/attempts/${attemptId}/resource-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', result.resource?.pdfName || 'resource.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
    } catch {
      setResourceDownloadError(t('result.resourceDownloadFailed'));
    } finally {
      setDownloadingResource(false);
    }
  };

  const handleDownloadOriginal = async () => {
    setDownloadingOriginal(true);
    setOriginalDownloadError('');
    try {
      const res = await axiosClient.get(`/attempts/${attemptId}/source-pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const safeTitle = String(result.examTitle || 'exam').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'exam';
      link.setAttribute('download', `${safeTitle}-original.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
    } catch {
      setOriginalDownloadError(t('result.originalDownloadFailed'));
    } finally {
      setDownloadingOriginal(false);
    }
  };

  const handleShowReview = async () => {
    setShowReview(true);
    if (!review) {
      setReviewLoading(true);
      setReviewError('');
      try {
        const res = await dispatch(fetchReview(attemptId));
        if (res.meta?.requestStatus === 'rejected') setReviewError(t('result.reviewFailed'));
      } catch {
        setReviewError(t('result.reviewFailed'));
      } finally {
        setReviewLoading(false);
      }
    }
  };

  if (!result) return null;

  const counts = review
    ? {
        all: review.items.length,
        correct: review.items.filter((i) => i.status === 'correct').length,
        wrong: review.items.filter((i) => i.status === 'wrong').length,
        skipped: review.items.filter((i) => i.status === 'skipped').length,
        answered: review.items.filter((i) => i.status === 'answered').length,
      }
    : { all: 0, correct: 0, wrong: 0, skipped: 0, answered: 0 };

  const filteredItems = review ? review.items.filter((i) => filter === 'all' || i.status === filter) : [];

  return (
    <div className="px-4 py-8">
      <div className="card mx-auto max-w-md p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-500/10">
          🎉
        </div>
        <h2 className="mb-4 text-xl font-bold dark:text-white">{t('result.submitted')}</h2>

        {result.showInstantly ? (
          <div className="mb-6 space-y-4">
            {!result.isShortExam && (() => {
              const totalMarks = Number(result.totalMarks) || 0;
              const pct = totalMarks
                ? Math.max(0, Math.min(100, Math.round((Number(result.obtainedMarks || 0) / totalMarks) * 100)))
                : 0;
              return (
                <div className="relative mx-auto h-32 w-32">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" className="stroke-gray-100 dark:stroke-white/10" />
                    <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary-500" strokeDasharray={`${pct} 100`} />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-2xl font-bold tabular-nums dark:text-white">{pct}%</div>
                </div>
              );
            })()}
            <p className="gradient-text text-3xl font-extrabold">{t('result.marks', { n: result.obtainedMarks })}</p>
            <div className={`grid ${result.isShortExam ? 'grid-cols-1' : 'grid-cols-3'} gap-2 text-center`}>
              {(result.isShortExam
                ? [['result.s', result.totalSkipped, 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300']]
                : [['result.c', result.totalCorrect, 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'],
                  ['result.w', result.totalWrong, 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'],
                  ['result.s', result.totalSkipped, 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300']]).map(([k, v, c]) => (
                <div key={k} className={`rounded-xl px-2 py-2 ${c}`}>
                  <div className="text-xl font-semibold tabular-nums">{v ?? 0}</div>
                  <div className="text-xs">{t(k)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mb-6 text-gray-500 dark:text-gray-400">{result.reviewPending ? 'শিক্ষক উত্তর review করছেন। review শেষ হলে এই পেজে ফলাফল স্বয়ংক্রিয়ভাবে দেখা যাবে।' : t('result.later')}</p>
        )}

        <div className="space-y-3">
          {result.showInstantly && (
            <button onClick={handleDownload} disabled={downloading} className="btn-primary w-full disabled:opacity-60">
              {downloading ? t('result.downloading') : t('result.downloadPdf')}
            </button>
          )}
          {downloadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{downloadError}</p>}

          {result.hasOriginalSource && (
            <button onClick={handleDownloadOriginal} disabled={downloadingOriginal} className="btn-success w-full disabled:opacity-60">
              {downloadingOriginal ? t('result.downloading') : t('result.downloadOriginal')}
            </button>
          )}
          {originalDownloadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{originalDownloadError}</p>}

          {result.resource?.kind === 'link' && (
            <a
              href={result.resource.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-success block w-full"
            >
              {t('result.viewResource')}
            </a>
          )}
          {result.resource?.kind === 'pdf' && (
            <button onClick={handleDownloadResource} disabled={downloadingResource} className="btn-success w-full disabled:opacity-60">
              {downloadingResource ? t('result.downloading') : t('result.downloadResource')}
            </button>
          )}
          {resourceDownloadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{resourceDownloadError}</p>}

          {result.showLeaderboard && result.examId && (
            <Link to={`/exams/${result.examId}/leaderboard`} className="btn-secondary block w-full">
              {t('leaderboard.view')}
            </Link>
          )}

          {result.showInstantly && !showReview && (
            <button onClick={handleShowReview} className="btn-secondary w-full">
              {t('result.detailed')}
            </button>
          )}
        </div>

        <button
          onClick={() => { dispatch(resetAttempt()); navigate('/exams'); }}
          className="mt-4 text-sm text-gray-500 hover:underline dark:text-gray-400"
        >
          {t('result.backHome')}
        </button>
      </div>

      <div className="mx-auto mt-6 max-w-2xl"><ExamFeedbackForm attemptId={attemptId} /></div>

      {showReview && (
        <div className="mx-auto mt-8 max-w-2xl space-y-4">
          {reviewError ? (
            <div role="alert" className="card space-y-3 p-5 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{reviewError}</p>
              <button onClick={handleShowReview} disabled={reviewLoading} className="btn-secondary text-sm disabled:opacity-60">
                {reviewLoading ? t('common.loading') : t('result.retry')}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  ['all', t('result.filterAll', { n: counts.all })],
                  ...(!result.isShortExam ? [
                    ['correct', t('result.filterCorrect', { n: counts.correct })],
                    ['wrong', t('result.filterWrong', { n: counts.wrong })],
                  ] : []),
                  ['skipped', t('result.filterSkipped', { n: counts.skipped })],
                  ['answered', `সংক্ষিপ্ত উত্তর (${counts.answered})`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      filter === key
                        ? 'bg-primary-600 text-white'
                        : 'border border-gray-300 text-gray-600 dark:border-white/10 dark:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {reviewLoading || !review ? (
                <p className="text-center text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
              ) : (
                <>
                  {(review.teacherFeedback || review.teacherFeedbackMedia?.length > 0) && <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4 dark:border-primary-500/20 dark:bg-primary-500/10"><p className="text-sm font-semibold text-primary-900 dark:text-primary-100">শিক্ষকের feedback / মন্তব্য</p>{review.teacherFeedback && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-primary-900 dark:text-primary-100">{review.teacherFeedback}</p>}{!!review.teacherFeedbackMedia?.length && <div className="mt-3 grid gap-3 sm:grid-cols-2">{review.teacherFeedbackMedia.map((item, index) => <FeedbackMediaItem key={`${item.name}-${index}`} item={item} />)}</div>}</div>}
                  {filteredItems.length === 0 ? <p className="text-center text-gray-500 dark:text-gray-400">{t('result.emptyCategory')}</p> : filteredItems.map((item) => <QuestionReviewCard key={item.serial} item={item} />)}
                </>
              )}
            </>
          )}
        </div>
      )}
      <PdfPreviewModal
        url={pdfPreview?.url}
        filename={pdfPreview?.filename}
        title={t('exam.pdfPreview')}
        previewLabel={t('exam.pdfPreviewLabel')}
        downloadLabel={t('exam.pdfDownloadAfterPreview')}
        closeLabel={t('exam.pdfClosePreview')}
        onDownload={() => downloadBlob(pdfPreview.blob, pdfPreview.filename)}
        onClose={closePdfPreview}
      />
    </div>
  );
}

function QuestionReviewCard({ item }) {
  const { t } = useLanguage();
  const options = Array.isArray(item.options) ? item.options : [];
  const badge =
    item.status === 'correct'
      ? { text: t('common.correct'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' }
      : item.status === 'wrong'
      ? { text: t('common.wrong'), cls: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' }
      : item.status === 'answered'
      ? { text: 'উত্তর জমা হয়েছে', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' }
      : { text: t('common.skipped'), cls: 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300' };

  const borderColor =
    item.status === 'correct' ? 'border-emerald-500' : item.status === 'wrong' ? 'border-red-500' : item.status === 'answered' ? 'border-blue-500' : 'border-gray-300 dark:border-white/10';

  return (
    <div className={`card border-l-4 p-5 ${borderColor}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="font-semibold dark:text-white">{t('result.questionN', { n: item.serial })} <MathText text={item.questionText} /></p>
        <span className={`badge shrink-0 ${badge.cls}`}>{badge.text}</span>
      </div>
      {item.questionAudio && <div className="mb-3 rounded-xl bg-primary-50 p-3 dark:bg-primary-500/10"><p className="mb-2 text-sm font-medium dark:text-gray-200">🎧 প্রশ্নের voice note</p><audio className="w-full" controls preload="none" src={item.questionAudio}>Audio playback সমর্থিত নয়।</audio></div>}
      {item.diagram && <ZoomImage src={assetUrl(item.diagram)} className="mb-3 max-h-80 max-w-full rounded-lg border border-gray-200 bg-white object-contain p-1" />}
      {item.diagrams && item.diagrams.length > 0 && <div className="mb-3"><ChemDiagramList items={item.diagrams} /></div>}
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isCorrect = i === item.correctOptionIndex;
          const isSelected = i === item.selectedOptionIndex;
          let cls = 'border border-gray-200 dark:border-white/10';
          if (isCorrect) cls = 'border border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10';
          else if (isSelected) cls = 'border border-red-500 bg-red-50 dark:bg-red-500/10';
          return (
            <div key={i} className={`rounded-lg px-3 py-2 text-sm dark:text-white ${cls}`}>
              ({String.fromCharCode(97 + i)}) {opt ? <MathText text={opt} /> : null}
              {(item.optionImages || [])[i] && <ZoomImage src={item.optionImages[i]} className="mt-1 block max-h-32 max-w-full rounded-lg border border-gray-200 bg-white object-contain" />}
              {isSelected && !isCorrect && <span className="ml-2 font-medium text-red-600 dark:text-red-400">{t('result.yourAnswer')}</span>}
              {isCorrect && <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">{t('result.correctAnswer')}</span>}
            </div>
          );
        })}
      {options.length === 0 && <ShortAnswerReview item={item} />}
      </div>
      {(item.explanation || item.explanationAudio || item.explanationMedia?.length > 0) && (
        <div className="mt-3 rounded-lg bg-primary-50 p-3 text-sm dark:bg-primary-500/10 dark:text-gray-100">
          <strong>{t('result.explanation')}</strong>{item.explanation && <MathText text={item.explanation} />}
          {item.explanationAudio && <audio className="mt-2 w-full" controls preload="none" src={item.explanationAudio}>Audio playback সমর্থিত নয়।</audio>}
          {!!item.explanationMedia?.length && <div className="mt-3 grid gap-3 sm:grid-cols-2">{item.explanationMedia.map((media, index) => <FeedbackMediaItem key={`${media.name}-${index}`} item={media} />)}</div>}
        </div>
      )}
    </div>
  );
}
