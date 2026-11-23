// ================== pages/student/StudentExam.jsx ==================
// Live পরীক্ষার মূল পেজ — Timer, Question Palette, Answer সিলেকশন, Submit
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Timer from '../../components/Timer';
import QuestionPalette from '../../components/QuestionPalette';
import { resumeAttempt, saveAnswer, submitAttempt } from '../../features/attempt/attemptSlice';
import { useLanguage } from '../../context/LanguageContext';
import MathText from '../../components/MathText';
import assetUrl from '../../utils/assetUrl';
import ChemDiagramList from '../../components/ChemDiagramList';
import ZoomImage from '../../components/ZoomImage';
import { compactImage, fileToDataUrl, loadImage } from '../../utils/imageCompact';

const sameFiles = (left = [], right = []) => left.length === right.length
  && left.every((file, index) => file.data === right[index]?.data && file.name === right[index]?.name && file.mime === right[index]?.mime);

export default function StudentExam() {
  const { t } = useLanguage();
  const { attemptId, examTitle, totalTimeMinutes, startedAt, deadlineAt, serverNow, clientReceivedAt, questions, answersMap, shortAnswers, result } =
    useSelector((s) => s.attempt);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // একই সাথে দ্রুত দুইবার ক্লিক ঠেকাতে: যে প্রশ্নের উত্তর পাঠানো শুরু হয়েছে সেটা সাথে সাথে লক
  const [lockedQ, setLockedQ] = useState({});
  const [saveError, setSaveError] = useState('');
  const [shortDrafts, setShortDrafts] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [savingShort, setSavingShort] = useState({});
  const pendingSavesRef = useRef(new Map());
  const shortTimersRef = useRef(new Map());
  const shortSaveQueueRef = useRef(Promise.resolve());
  const failedSavesRef = useRef(new Set());
  const submittedRef = useRef(false);
  const questionRefs = useRef([]);
  const attachmentPickerRef = useRef(false);
  useEffect(() => {
    const elements = questionRefs.current.filter(Boolean);
    if (!elements.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) { const index = Number(visible.target.dataset.questionIndex); if (Number.isFinite(index)) setCurrentIndex(index); }
    }, { threshold: [0.25, 0.5, 0.75] });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [questions.length]);

  // জয়েন না করে সরাসরি এই পেজে এলে জয়েন পেজে ফেরত পাঠাও
  useEffect(() => {
    if (!attemptId) navigate('/');
  }, [attemptId, navigate]);

  useEffect(() => {
    if (attemptId && !result) dispatch(resumeAttempt(attemptId));
  }, [attemptId, dispatch, result]);

  useEffect(() => {
    setShortDrafts((drafts) => {
      const next = { ...drafts };
      Object.entries(shortAnswers || {}).forEach(([qid, answer]) => {
        if (!Object.prototype.hasOwnProperty.call(next, qid)) next[qid] = { answerText: answer.answerText || '', files: answer.answerFiles || [] };
      });
      return next;
    });
  }, [shortAnswers]);

  const queueShortSave = useCallback((questionId, draft) => {
    failedSavesRef.current.delete(questionId);
    setSaveError(failedSavesRef.current.size ? t('exam.answerSaveFailed') : '');
    setSavingShort((current) => ({ ...current, [questionId]: true }));
    const request = () => dispatch(saveAnswer({
      attemptId, questionId, selectedOptionIndex: null,
      answerText: draft.answerText || '', answerFiles: draft.files || [],
    }));
    const savePromise = shortSaveQueueRef.current.catch(() => undefined).then(request);
    shortSaveQueueRef.current = savePromise.then(() => undefined, () => undefined);
    pendingSavesRef.current.set(questionId, savePromise);
    savePromise.then((res) => {
      if (res.meta?.requestStatus === 'rejected') {
        failedSavesRef.current.add(questionId);
        setSaveError(res.payload || t('exam.answerSaveFailed'));
      } else {
        failedSavesRef.current.delete(questionId);
        if (!failedSavesRef.current.size) setSaveError('');
      }
    }).finally(() => {
      if (pendingSavesRef.current.get(questionId) === savePromise) pendingSavesRef.current.delete(questionId);
      setSavingShort((current) => { const next = { ...current }; delete next[questionId]; return next; });
    });
    return savePromise;
  }, [attemptId, dispatch, t]);

  useEffect(() => {
    if (submitting) return undefined;
    questions.filter((q) => q.type === 'short').forEach((q) => {
      const qid = q._id;
      const draft = shortDrafts[qid] || { answerText: '', files: [] };
      const saved = shortAnswers?.[qid] || { answerText: '', answerFiles: [] };
      const sameText = (draft.answerText || '') === (saved.answerText || '');
      if (sameText && sameFiles(draft.files || [], saved.answerFiles || [])) return;
      clearTimeout(shortTimersRef.current.get(qid));
      shortTimersRef.current.set(qid, setTimeout(() => {
        shortTimersRef.current.delete(qid);
        queueShortSave(qid, draft);
      }, 650));
    });
    return () => {
      shortTimersRef.current.forEach(clearTimeout);
      shortTimersRef.current.clear();
    };
  }, [shortDrafts, shortAnswers, questions, submitting, queueShortSave]);

  // একবার Submit হয়ে গেলে রেজাল্ট পেজে যাও
  useEffect(() => {
    if (result) navigate('/exam/result');
  }, [result, navigate]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      // Flush all current drafts before finalizing; a failed autosave must never be
      // silently omitted from the submitted attempt.
      submittedRef.current = true;
      setSubmitting(true);
      shortTimersRef.current.forEach(clearTimeout);
      shortTimersRef.current.clear();
      const latestSaves = [];
      questions.filter((q) => q.type === 'short').forEach((q) => {
        const draft = shortDrafts[q._id] || { answerText: '', files: [] };
        const saved = shortAnswers?.[q._id] || { answerText: '', answerFiles: [] };
        if ((draft.answerText || '') !== (saved.answerText || '') || !sameFiles(draft.files || [], saved.answerFiles || [])) {
          latestSaves.push(queueShortSave(q._id, draft));
        }
      });
      const pendingSaves = [...pendingSavesRef.current.values()];
      const saveResults = await Promise.all([...new Set([...pendingSaves, ...latestSaves])]);
      if (saveResults.some((res) => res.meta?.requestStatus === 'rejected') || failedSavesRef.current.size > 0) {
        // The save handler unlocks failed questions and leaves the student able to retry.
        submittedRef.current = false;
        setSubmitting(false);
        return;
      }

      const res = await dispatch(submitAttempt({ attemptId, autoSubmitted: auto }));
      // নেটওয়ার্ক সমস্যায় সাবমিট ব্যর্থ হলে আবার চেষ্টা করা যাবে
      if (res.meta?.requestStatus === 'rejected') {
        submittedRef.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, dispatch, questions, shortDrafts, shortAnswers, queueShortSave]
  );

  // 🔒 পরীক্ষা চলাকালীন অন্য ট্যাব/ব্রাউজার/অ্যাপে চলে গেলে যতটুকু দেওয়া হয়েছে তা অটো সাবমিট
  useEffect(() => {
    if (!attemptId || result) return;
    const leave = () => { if (!attachmentPickerRef.current) handleSubmit(true); };
    const onVisibility = () => {
      if (document.hidden) leave();
      else attachmentPickerRef.current = false;
    };
    const onWindowFocus = () => { attachmentPickerRef.current = false; };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    window.addEventListener('focus', onWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [attemptId, result, handleSubmit]);

  // 🔒 একবার উত্তর দিলে আর বদলানো যাবে না
  const isLocked = (qid) =>
    !!lockedQ[qid] || (answersMap[qid] !== null && answersMap[qid] !== undefined);

  const handleSelect = (questionId, optionIndex) => {
    if (isLocked(questionId) || submitting) return;
    failedSavesRef.current.delete(questionId);
    setSaveError(failedSavesRef.current.size ? t('exam.answerSaveFailed') : '');
    setLockedQ((m) => ({ ...m, [questionId]: true }));
    const savePromise = dispatch(saveAnswer({ attemptId, questionId, selectedOptionIndex: optionIndex }));
    pendingSavesRef.current.set(questionId, savePromise);
    savePromise.then((res) => {
      // সেভ ব্যর্থ হলে (নেটওয়ার্ক সমস্যা) আবার চেষ্টা করার সুযোগ দাও
      if (res.meta?.requestStatus === 'rejected') {
        failedSavesRef.current.add(questionId);
        setLockedQ((m) => {
          const n = { ...m };
          delete n[questionId];
          return n;
        });
        setSaveError(t('exam.answerSaveFailed'));
      }
    }).finally(() => {
      if (pendingSavesRef.current.get(questionId) === savePromise) {
        pendingSavesRef.current.delete(questionId);
      }
    });
  };

  const readAnswerFiles = (fileList, questionId) => {
    const alreadyAttached = shortDrafts[questionId]?.files?.length || 0;
    const selected = [...fileList];
    const remaining = Math.max(0, 5 - alreadyAttached);
    const files = selected.slice(0, remaining);
    if (selected.length > remaining) setSaveError('সর্বোচ্চ ৫টি ছবি/PDF সংযুক্ত করা যাবে।');
    const supported = files.filter((file) => /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type));
    if (supported.length < files.length) setSaveError('শুধু JPG, PNG, WebP ছবি অথবা PDF সংযুক্ত করুন।');
    const tooLargePdf = supported.some((file) => file.type === 'application/pdf' && file.size > 1_450_000);
    if (tooLargePdf) setSaveError('PDF সর্বোচ্চ ১.৪ MB হতে পারবে।');
    const accepted = supported.filter((file) => file.type !== 'application/pdf' || file.size <= 1_450_000);
    const imageFiles = accepted.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.some((file) => file.size > 10 * 1024 * 1024)) setSaveError('ছবি ১০ MB-এর বেশি হতে পারবে না।');
    const readyFiles = accepted.filter((file) => file.type === 'application/pdf' || file.size <= 10 * 1024 * 1024);
    Promise.all(readyFiles.map(async (file) => {
      try {
        if (file.type === 'application/pdf') {
          return { name: file.name, mime: file.type, data: await fileToDataUrl(file) };
        }
        const source = await fileToDataUrl(file);
        const image = await loadImage(source);
        const data = compactImage(image, { max: 1800, limit: 1_850_000 });
        return { name: file.name, mime: data.slice(5, data.indexOf(';')), data };
      } catch (error) {
        setSaveError(error.message || 'ছবি/PDF পড়া যায়নি।');
        return null;
      }
    })).then((items) => {
      const ready = items.filter(Boolean);
      if (ready.length) setShortDrafts((drafts) => ({ ...drafts, [questionId]: { ...(drafts[questionId] || {}), files: [...(drafts[questionId]?.files || []), ...ready].slice(0, 5) } }));
    });
  };

  if (!questions.length) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-center">
        <div>
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const hasShortResponse = (qid) => {
    const draft = shortDrafts[qid];
    const saved = shortAnswers?.[qid];
    return !!((draft?.answerText || saved?.answerText || '').trim() || draft?.files?.length || saved?.answerFiles?.length);
  };
  const isAnswered = (question) => question.type === 'short'
    ? hasShortResponse(question._id)
    : answersMap[question._id] !== null && answersMap[question._id] !== undefined;
  const answeredCount = questions.filter(isAnswered).length;
  const progressPct = Math.round((answeredCount / questions.length) * 100);
  const jumpToQuestion = (index) => {
    setCurrentIndex(index);
    questionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:py-6">
      <div className="glass -mx-4 mb-4 px-4 pb-3 pt-3 sm:mx-0 sm:rounded-2xl sm:px-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h1 className="truncate text-lg font-semibold dark:text-white">{examTitle}</h1>
          <Timer startedAt={startedAt} deadlineAt={deadlineAt} serverNow={serverNow} clientReceivedAt={clientReceivedAt} totalMinutes={totalTimeMinutes} onTimeUp={() => handleSubmit(true)} />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-gray-500 dark:text-gray-400">{answeredCount}/{questions.length}</span>
        </div>
      </div>
      <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t('exam.tabWarning')}</div>
      {saveError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{saveError}</p>}

      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="order-2 space-y-4 sm:order-1">
          {questions.map((q, index) => (
            <article key={q._id} ref={(element) => { questionRefs.current[index] = element; }} data-question-index={index} className="card scroll-mt-4 p-5 sm:p-7">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-primary-600 dark:text-primary-400">{t('exam.questionOf', { current: index + 1, total: questions.length })}</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isAnswered(q) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
                  {isAnswered(q) ? 'উত্তর সেভ হয়েছে' : 'উত্তর বাকি'}
                </span>
              </div>
              <h2 className="mb-5 text-lg font-medium leading-relaxed dark:text-white sm:text-xl"><MathText text={q.questionText} /></h2>
              {q.questionAudio && <div className="mb-5 rounded-xl bg-primary-50 p-3 dark:bg-primary-500/10"><p className="mb-2 text-sm font-medium dark:text-gray-200">🎧 প্রশ্নের voice note</p><audio className="w-full" controls preload="none" src={q.questionAudio}>Audio playback সমর্থিত নয়।</audio></div>}
              {q.diagram && <div className="mb-5"><ZoomImage src={assetUrl(q.diagram)} alt={t('diagram.alt')} className="mx-auto max-h-[28rem] w-full rounded-lg border border-gray-200 bg-white object-contain p-1 sm:w-auto" /><p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">🔍 {t('diagram.zoomHint')}</p></div>}
              {q.diagrams?.length > 0 && <div className="mb-5 flex justify-center"><ChemDiagramList items={q.diagrams} /></div>}
              {q.type === 'short' ? (
                <div className="space-y-3">
                  <textarea className="input min-h-36 w-full" maxLength={20000} disabled={submitting} value={shortDrafts[q._id]?.answerText || ''} onChange={(e) => setShortDrafts((d) => ({ ...d, [q._id]: { ...(d[q._id] || {}), answerText: e.target.value } }))} placeholder="উত্তর লিখুন…" />
                  <p className="text-right text-xs text-gray-500">{(shortDrafts[q._id]?.answerText || '').length}/20,000</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-xl border border-primary-300 px-3 py-2 text-sm font-medium text-primary-700 dark:border-primary-500/40 dark:text-primary-300">
                      ক্যামেরা দিয়ে ছবি তুলুন
                      <input className="sr-only" type="file" disabled={submitting} accept="image/jpeg,image/png,image/webp" capture="environment" onClick={() => { attachmentPickerRef.current = true; }} onChange={(e) => { attachmentPickerRef.current = false; readAnswerFiles(e.target.files, q._id); e.target.value = ''; }} />
                    </label>
                    <label className="cursor-pointer rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-white/15 dark:text-gray-200">
                      ছবি/PDF আপলোড করুন
                      <input className="sr-only" type="file" disabled={submitting} accept="image/jpeg,image/png,image/webp,application/pdf" multiple onClick={() => { attachmentPickerRef.current = true; }} onChange={(e) => { attachmentPickerRef.current = false; readAnswerFiles(e.target.files, q._id); e.target.value = ''; }} />
                    </label>
                  </div>
                  {!!shortDrafts[q._id]?.files?.length && <div className="space-y-1">{shortDrafts[q._id].files.map((file, fileIndex) => <div key={`${file.name}-${fileIndex}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/5"><button type="button" className="min-w-0 truncate text-left text-primary-700 underline dark:text-primary-300" onClick={() => setPreviewFile(file)}>{file.name} · {file.mime === 'application/pdf' ? 'PDF দেখুন' : 'ছবি দেখুন'}</button><button type="button" className="shrink-0 text-red-600 hover:underline" disabled={submitting} onClick={() => setShortDrafts((drafts) => ({ ...drafts, [q._id]: { ...(drafts[q._id] || {}), files: (drafts[q._id]?.files || []).filter((_, index) => index !== fileIndex) } }))}>সরান</button></div>)}</div>}
                  <p className="text-xs text-gray-500" role="status">{savingShort[q._id] ? 'উত্তর অটো-সেভ হচ্ছে…' : isAnswered(q) ? 'উত্তর অটো-সেভ হয়েছে' : 'লেখা বা ছবি/PDF দিলে স্বয়ংক্রিয়ভাবে সেভ হবে'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(Array.isArray(q.options) ? q.options : []).map((opt, optionIndex) => {
                    const locked = isLocked(q._id);
                    const selected = answersMap[q._id] === optionIndex;
                    return <label key={optionIndex} className={`flex items-center gap-3 rounded-2xl border-2 p-3.5 transition-all focus-within:ring-2 focus-within:ring-primary-500/40 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'} ${selected ? 'border-primary-500 bg-primary-50 shadow-sm dark:border-primary-500/60 dark:bg-primary-500/10' : locked ? 'border-gray-100 opacity-50 dark:border-white/10' : 'border-gray-100 bg-white hover:border-primary-300 dark:border-white/10 dark:bg-transparent dark:hover:border-primary-500/40'}`}>
                      <input type="radio" name={`q-${q._id}`} checked={selected} disabled={locked || submitting} onChange={() => handleSelect(q._id, optionIndex)} className="sr-only" />
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors ${selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{String.fromCharCode(65 + optionIndex)}</span>
                      <span className="min-w-0 dark:text-white">{opt ? <MathText text={opt} /> : null}{(q.optionImages || [])[optionIndex] && <ZoomImage src={q.optionImages[optionIndex]} className={`max-h-40 max-w-full rounded-lg border border-gray-200 bg-white object-contain ${opt ? 'mt-2' : ''}`} />}</span>
                    </label>;
                  })}
                  {isLocked(q._id) && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t('exam.answerLocked')}</p>}
                </div>
              )}
            </article>
          ))}
          <button onClick={() => handleSubmit(false)} disabled={submitting} className="btn-success w-full py-4 text-base disabled:opacity-60">{submitting ? 'জমা হচ্ছে…' : t('exam.submitNow')}</button>
        </div>
        <aside className="card order-1 h-fit p-4 sm:sticky sm:top-4 sm:order-2">
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('exam.answered', { answered: answeredCount, total: questions.length })}</p>
          <QuestionPalette questions={questions} answersMap={answersMap} currentIndex={currentIndex} onJump={jumpToQuestion} />
          <button onClick={() => handleSubmit(false)} disabled={submitting} className="btn-success mt-4 w-full text-sm disabled:opacity-60">{submitting ? 'জমা হচ্ছে…' : t('exam.submitNow')}</button>
        </aside>
      </div>
      {previewFile && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="উত্তরের ফাইল preview" onClick={() => setPreviewFile(null)}><div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10"><span className="truncate text-sm font-medium dark:text-white">{previewFile.name}</span><button type="button" className="rounded-lg border px-3 py-1.5 text-sm dark:border-white/15 dark:text-white" onClick={() => setPreviewFile(null)}>বন্ধ করুন</button></div><div className="min-h-0 flex-1 overflow-auto p-3">{previewFile.mime === 'application/pdf' ? <iframe title={previewFile.name || 'PDF preview'} src={previewFile.data} className="h-[75vh] w-full bg-white" /> : <img src={previewFile.data} alt={previewFile.name || 'উত্তরের ছবি'} className="mx-auto max-h-[75vh] max-w-full object-contain" />}</div></div></div>}
    </div>
  );
}
