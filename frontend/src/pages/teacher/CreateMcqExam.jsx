// ================== pages/teacher/CreateMcqExam.jsx ==================
// শিক্ষক এখানে নিজে টাইপ করে অনলাইনে MCQ প্রশ্ন তৈরি করতে পারেন এবং পরীক্ষা তৈরি করার পর
// আগের মতোই (PDF আপলোডের মতো) সেটিংস ঠিক করে পাবলিশ করতে পারবেন।
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createExam } from '../../features/exam/examSlice';
import { useLanguage } from '../../context/LanguageContext';
import ClassSelect from '../../components/ClassSelect';
import MathText from '../../components/MathText';
import FormulaToolbar from '../../components/FormulaToolbar';
import QuestionDiagram from '../../components/QuestionDiagram';
import QuestionAudioField from '../../components/QuestionAudioField';
import ExplanationMediaField from '../../components/ExplanationMediaField';
import assetUrl from '../../utils/assetUrl';
import ZoomImage from '../../components/ZoomImage';
import ChemDiagramList from '../../components/ChemDiagramList';
import OptionImage from '../../components/OptionImage';
import { hasMath } from '../../utils/mathParse';
import { savePendingExam, fetchPendingExam, finalizePendingExam } from '../../api/pendingExams';

// একই ছবি একাধিক প্রশ্নে থাকলে তালিকায় একবারই দেখানো
const dedupeDiagrams = (list) => {
  const seen = new Set();
  return list.filter((x) => (seen.has(x.diagram) ? false : seen.add(x.diagram)));
};

const newKey = () => Math.random().toString(36).slice(2);
const MAX_OPTIONS = 12;

const emptyQuestion = () => ({
  key: newKey(),
  type: 'mcq',
  questionText: '',
  options: ['', ''],
  optionImages: ['', ''],
  correctOptionIndex: 0,
  explanation: '',
  questionAudio: '',
  explanationAudio: '',
  explanationMedia: [],
  diagram: '',
  diagramSource: '',
  diagrams: [], // কেমিস্ট্রি ডায়াগ্রাম (ChemistryDiagramPicker)
});

// ফর্মে কিছুই লেখা হয়নি কিনা
const isBlank = (title, questions) =>
  !title.trim() &&
  questions.every((q) => !q.questionText.trim() && !(q.explanation || '').trim() && !q.questionAudio && !q.explanationAudio && !(q.explanationMedia || []).length && !q.diagram && !(q.diagrams || []).length && q.options.every((o) => !o.trim()) && !(q.optionImages || []).some(Boolean));

// সংরক্ষিত অবস্থা মেলানোর জন্য ফর্মের ছাপ (key বাদে)
const snapshotOf = (title, classIds, questions) =>
  JSON.stringify({ title, classIds, q: questions.map(({ key, ...rest }) => rest) });

// সংরক্ষিত প্রশ্নের তালিকাকে ফর্মের উপযোগী করা (নতুন key সহ)
const withKeys = (list) =>
  Array.isArray(list) && list.length
    ? list.map((q) => ({
        ...emptyQuestion(),
        ...q,
        key: newKey(),
        options: Array.isArray(q.options) && q.options.length >= 2 ? q.options : ['', ''],
        optionImages: (Array.isArray(q.options) && q.options.length >= 2 ? q.options : ['', '']).map((_, i) => (Array.isArray(q.optionImages) && typeof q.optionImages[i] === 'string' ? q.optionImages[i] : '')),
      }))
    : [emptyQuestion()];

// ব্রাউজারে তাৎক্ষণিক নিরাপত্তা-কপি: ভুলে পেছনে গেলে বা ট্যাব বন্ধ হলেও লেখা থাকে
const readLocal = (k) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v && v.data ? v : null;
  } catch (e) {
    return null;
  }
};
const writeLocal = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    /* স্টোরেজ পূর্ণ/নিষিদ্ধ হলে সার্ভারের সংরক্ষণই ভরসা */
  }
};
const clearLocal = (k) => {
  try {
    localStorage.removeItem(k);
  } catch (e) {
    /* ignore */
  }
};

export default function CreateMcqExam() {
  const { t } = useLanguage();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { error } = useSelector((s) => s.exam);
  const { user } = useSelector((s) => s.auth);
  const [searchParams] = useSearchParams();
  const pendingParam = searchParams.get('pending');
  const storageKey = `mcqCreateDraft:${user?._id || user?.id || 'teacher'}`;

  // প্রিভিউ কোথায় দেখাবে: 'side' = পাশে, 'below' = নিচে (শিক্ষকের পছন্দ মনে রাখা হয়)
  const [previewMode, setPreviewMode] = useState(() => {
    try { return localStorage.getItem('mcqPreviewMode') === 'below' ? 'below' : 'side'; } catch { return 'side'; }
  });
  const changePreviewMode = (m) => {
    setPreviewMode(m);
    try { localStorage.setItem('mcqPreviewMode', m); } catch { /* ignore */ }
  };
  const side = previewMode === 'side';
  const [title, setTitle] = useState('');
  const [classIds, setClassIds] = useState([]);
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  // ⏳ পেন্ডিং/অটো-সেভ সংক্রান্ত অবস্থা
  const [ready, setReady] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [restored, setRestored] = useState(false);

  const stateRef = useRef({ title, classIds, questions });
  stateRef.current = { title, classIds, questions };
  const pendingIdRef = useRef(null); // সার্ভারে থাকা পেন্ডিং পরীক্ষার id
  const syncedRef = useRef(''); // সর্বশেষ যে অবস্থা সার্ভারে সংরক্ষিত
  const timerRef = useRef(null);
  const queueRef = useRef(Promise.resolve()); // সংরক্ষণগুলো একটার পর একটা চলবে (ডুপ্লিকেট এড়াতে)
  const epochRef = useRef(0);
  const doneRef = useRef(false); // চূড়ান্ত/বাতিল হয়ে গেলে আর অটো-সেভ নয়

  // সার্ভারে পেন্ডিং হিসেবে সংরক্ষণ (অসম্পূর্ণ ফর্মও চলে)
  const persistToServer = useCallback(
    (opts = {}) => {
      const run = async () => {
        if (doneRef.current) return null;
        const epoch = epochRef.current;
        const { title: ti, classIds: ci, questions: qs } = stateRef.current;
        if (isBlank(ti, qs) && !pendingIdRef.current) return null;
        const snap = snapshotOf(ti, ci, qs);
        if (snap === syncedRef.current && !opts.force) {
          return pendingIdRef.current ? { _id: pendingIdRef.current } : null;
        }
        setSaveState('saving');
        const plainQs = qs.map(({ key, ...rest }) => rest);
        const body = { id: pendingIdRef.current || undefined, title: ti, classIds: ci, questions: plainQs };
        try {
          let res;
          try {
            res = await savePendingExam(body);
          } catch (e) {
            // পেন্ডিংটি মুছে ফেলা হয়ে থাকলে নতুন করে সংরক্ষণ
            if (e.response?.status === 404 && body.id) {
              res = await savePendingExam({ ...body, id: undefined });
            } else throw e;
          }
          if (epoch !== epochRef.current) return null; // ইতিমধ্যে "নতুন করে শুরু" করা হয়েছে
          const ex = res.data.exam;
          pendingIdRef.current = ex._id;
          setPendingId(ex._id);
          syncedRef.current = snap;
          setSaveState('saved');
          writeLocal(storageKey, { pendingId: ex._id, savedAt: Date.now(), data: { title: ti, classIds: ci, questions: plainQs } });
          return ex;
        } catch (e) {
          if (epoch === epochRef.current) setSaveState('error');
          return null;
        }
      };
      queueRef.current = queueRef.current.then(run, run);
      return queueRef.current;
    },
    [storageKey]
  );

  const applyDraft = (d, id, markSynced) => {
    const qs = withKeys(d.questions);
    const ci = Array.isArray(d.classIds) ? d.classIds : [];
    const ti = d.title || '';
    setTitle(ti);
    setClassIds(ci);
    setQuestions(qs);
    pendingIdRef.current = id || null;
    setPendingId(id || null);
    syncedRef.current = markSynced ? snapshotOf(ti, ci, qs) : '';
  };

  // ১) খোলার সময়: ?pending=ID থাকলে সার্ভার থেকে, নইলে আগের অসমাপ্ত লেখা (থাকলে) ফিরিয়ে আনা
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readLocal(storageKey);
      if (pendingParam) {
        try {
          const { data } = await fetchPendingExam(pendingParam);
          if (cancelled) return;
          const localNewer =
            local && local.pendingId === pendingParam && !isBlank(local.data.title || '', withKeys(local.data.questions)) &&
            new Date(local.savedAt) > new Date(data.updatedAt);
          if (localNewer) {
            applyDraft(local.data, pendingParam, false);
            setRestored(true);
          } else {
            applyDraft(data.draft, pendingParam, true);
          }
        } catch (e) {
          if (!cancelled) setLocalError(t('createMcq.pendingLoadFailed'));
        }
      } else if (local && !isBlank(local.data.title || '', withKeys(local.data.questions))) {
        applyDraft(local.data, local.pendingId || null, false);
        setRestored(true);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ২) প্রতিটি পরিবর্তনে ব্রাউজারে সঙ্গে সঙ্গে কপি; ২.৫ সেকেন্ড থেমে থাকলে সার্ভারে পেন্ডিং হিসেবে সংরক্ষণ
  useEffect(() => {
    if (!ready || doneRef.current || isBlank(title, questions)) return undefined;
    writeLocal(storageKey, {
      pendingId: pendingIdRef.current,
      savedAt: Date.now(),
      data: { title, classIds, questions: questions.map(({ key, ...rest }) => rest) },
    });
    if (snapshotOf(title, classIds, questions) === syncedRef.current) return undefined;
    timerRef.current = setTimeout(() => persistToServer(), 2500);
    return () => clearTimeout(timerRef.current);
  }, [title, classIds, questions, ready, storageKey, persistToServer]);

  // ৩) ভুলে পেছনে (অন্য পেজে) চলে গেলে: সঙ্গে সঙ্গে সার্ভারে পেন্ডিং হিসেবে জমা
  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      if (doneRef.current) return;
      const { title: ti, classIds: ci, questions: qs } = stateRef.current;
      if (isBlank(ti, qs)) return;
      if (snapshotOf(ti, ci, qs) !== syncedRef.current) persistToServer();
    },
    [persistToServer]
  );

  // ৪) ট্যাব বন্ধ/রিফ্রেশ করতে গেলে (সার্ভারে যায়নি এমন লেখা থাকলে) ব্রাউজারের সতর্কতা
  useEffect(() => {
    const onBeforeUnload = (e) => {
      const { title: ti, classIds: ci, questions: qs } = stateRef.current;
      if (doneRef.current || isBlank(ti, qs)) return;
      if (snapshotOf(ti, ci, qs) === syncedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const startFresh = () => {
    clearTimeout(timerRef.current);
    epochRef.current += 1;
    clearLocal(storageKey);
    pendingIdRef.current = null;
    setPendingId(null);
    syncedRef.current = '';
    setTitle('');
    setClassIds([]);
    setQuestions([emptyQuestion()]);
    setRestored(false);
    setSaveState('idle');
    setLocalError('');
    if (pendingParam) navigate('/teacher/create', { replace: true });
  };

  const updateQuestion = (key, patch) => {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  const updateOption = (key, idx, value) => {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const options = [...q.options];
        options[idx] = value;
        return { ...q, options };
      })
    );
  };

  const updateOptionImage = (key, idx, value) => {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key) return q;
        const optionImages = q.options.map((_, i) => (q.optionImages || [])[i] || '');
        optionImages[idx] = value;
        return { ...q, optionImages };
      })
    );
  };

  const addOption = (key) => {
    setQuestions((qs) =>
      qs.map((q) =>
        q.key === key && q.options.length < MAX_OPTIONS
          ? { ...q, options: [...q.options, ''], optionImages: [...q.options.map((_, i) => (q.optionImages || [])[i] || ''), ''] }
          : q
      )
    );
  };

  const removeOption = (key, idx) => {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.key !== key || q.options.length <= 2) return q;
        const options = q.options.filter((_, i) => i !== idx);
        const optionImages = q.options.map((_, i) => (q.optionImages || [])[i] || '').filter((_, i) => i !== idx);
        let correctOptionIndex = q.correctOptionIndex;
        if (correctOptionIndex === idx) correctOptionIndex = 0;
        else if (correctOptionIndex > idx) correctOptionIndex -= 1;
        return { ...q, options, optionImages, correctOptionIndex };
      })
    );
  };

  const addQuestionRow = () => setQuestions((qs) => [...qs, emptyQuestion()]);

  const removeQuestionRow = (key) => {
    setQuestions((qs) => (qs.length > 1 ? qs.filter((q) => q.key !== key) : qs));
  };

  const validate = () => {
    if (!title.trim()) return t('createMcq.needTitle');
    if (classIds.length === 0) return t('classes.required');
    if (questions.length === 0) return t('createMcq.needQuestion');

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText.trim()) return t('createMcq.needQuestionText', { n: i + 1 });
      if (q.type === 'short') continue;
      const has = (k) => !!(q.options[k] || '').trim() || !!(q.optionImages || [])[k];
      const filled = q.options.filter((_, k) => has(k));
      if (filled.length < 2) return t('createMcq.needTwoOptions', { n: i + 1 });
      if (!has(q.correctOptionIndex)) {
        return t('createMcq.needCorrectAnswer', { n: i + 1 });
      }
    }
    return '';
  };

  // ⏳ "পেন্ডিংয়ে সংরক্ষণ": অসম্পূর্ণ অবস্থায় রেখে ড্যাশবোর্ডের পেন্ডিং ট্যাবে যাওয়া
  const handleSavePending = async () => {
    if (isBlank(title, questions)) {
      setLocalError(t('createMcq.nothingToSave'));
      return;
    }
    clearTimeout(timerRef.current);
    setLocalError('');
    const ex = await persistToServer({ force: true });
    if (!ex) {
      setLocalError(t('createMcq.autoSaveFailed'));
      return;
    }
    doneRef.current = true;
    clearLocal(storageKey);
    navigate('/teacher/dashboard?tab=pending');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');
    setLoading(true);
    clearTimeout(timerRef.current);

    const payload = {
      title: title.trim(),
      classIds,
      questions: questions.map((q) => ({
        questionText: q.questionText.trim(),
        type: q.type || 'mcq',
        gradingRubric: q.type === 'short' ? (q.gradingRubric || '').trim() || undefined : undefined,
        options: q.type === 'short' ? [] : q.options.map((o) => o.trim()),
        correctOptionIndex: q.type === 'short' ? undefined : q.correctOptionIndex,
        explanation: q.explanation.trim() || undefined,
        questionAudio: q.questionAudio || undefined,
        explanationAudio: q.explanationAudio || undefined,
        explanationMedia: q.explanationMedia || [],
        optionImages: (q.optionImages || []).some(Boolean) ? q.options.map((_, k) => (q.optionImages || [])[k] || '') : undefined,
        diagram: q.diagram || undefined,
        diagramSource: q.diagram && q.diagramSource ? q.diagramSource : undefined,
        diagrams: (q.diagrams || []).length ? q.diagrams : undefined,
      })),
    };

    let exam = null;
    try {
      await queueRef.current; // চলমান অটো-সেভ শেষ হোক
      if (pendingIdRef.current) {
        try {
          const r = await finalizePendingExam(pendingIdRef.current, payload);
          exam = r.data.exam;
        } catch (err) {
          if (err.response?.status !== 404) throw err;
          pendingIdRef.current = null; // পেন্ডিংটি আর নেই — সরাসরি তৈরি হবে
        }
      }
      if (!exam) {
        const result = await dispatch(createExam(payload));
        if (createExam.fulfilled.match(result)) exam = result.payload.exam || result.payload;
      }
    } catch (err) {
      setLocalError(err.response?.data?.message || 'Failed to create exam');
    }
    setLoading(false);

    if (exam?._id) {
      doneRef.current = true;
      clearLocal(storageKey);
      navigate(`/teacher/exam/${exam._id}`);
    }
  };

  if (!ready) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-gray-500 dark:text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className={`mx-auto pb-4 pt-2 ${side ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <h2 className="mb-1 text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl">{t('createMcq.title')}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('createMcq.subtitle')}</p>

      {restored && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200">
          <span>{t('createMcq.restored')}</span>
          <button type="button" onClick={startFresh} className="font-medium underline">
            {t('createMcq.startFresh')}
          </button>
        </div>
      )}
      <p className="mb-6 text-xs text-gray-500 dark:text-gray-400">
        {pendingId && !restored ? `⏳ ${t('createMcq.editingPending')} — ` : ''}
        {t('createMcq.pendingHint')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card space-y-4 p-5 sm:p-6">
          <input
            placeholder={t('createMcq.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input !py-3 text-base font-medium"
          />
          <ClassSelect value={classIds} onChange={setClassIds} />
        </div>

        <FormulaToolbar />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400">{t('createMcq.previewPos')}</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-white/10">
            {[['side', t('createMcq.previewSide')], ['below', t('createMcq.previewBelow')]].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => changePreviewMode(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${previewMode === m ? 'bg-primary-600 text-white' : 'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {questions.map((q, index) => (
            <div key={q.key} className={side ? 'card grid grid-cols-2 gap-2 p-2.5 sm:gap-4 sm:p-5 lg:gap-6 lg:p-6' : 'card space-y-4 p-5 sm:p-6'}>
             <div className={side ? 'min-w-0 space-y-3 sm:space-y-4' : 'space-y-4'}>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-3 font-semibold dark:text-white">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-600 text-sm font-bold text-white">{index + 1}</span>
                  <span className="text-gray-500 dark:text-gray-400">{t('createMcq.questionLabel', { n: index + 1 })}</span>
                </h3>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestionRow(q.key)}
                    className="act-danger"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>

              <textarea
                data-math
                placeholder={t('createMcq.questionPlaceholder')}
                value={q.questionText}
                onChange={(e) => updateQuestion(q.key, { questionText: e.target.value })}
                rows={2}
                className={side ? 'input resize-none !px-2 !text-sm sm:!px-3 sm:!text-base' : 'input resize-none'}
              />
              <QuestionAudioField label="প্রশ্নের voice note" value={q.questionAudio} onChange={(questionAudio) => updateQuestion(q.key, { questionAudio })} />
              <select className="input" value={q.type || 'mcq'} onChange={(e) => updateQuestion(q.key, { type: e.target.value })}>
                <option value="mcq">MCQ question</option>
                <option value="short">Short question</option>
              </select>

              <QuestionDiagram
                compact={side}
                siblings={dedupeDiagrams(questions.filter((o) => o.key !== q.key && o.diagram).map((o) => ({ key: o.key, diagram: o.diagram, diagramSource: o.diagramSource, label: t('createMcq.questionLabel', { n: questions.indexOf(o) + 1 }) })))}
                value={q.diagram}
                source={q.diagramSource} onChange={(patch) => updateQuestion(q.key, patch)}
                chem={{
                  items: q.diagrams || [],
                  onInsert: (d, { insertEquation } = {}) =>
                    updateQuestion(q.key, {
                      diagrams: [...(q.diagrams || []).filter((x) => x.svg !== d.svg), d].slice(-8),
                      ...(insertEquation && d.equation ? { questionText: q.questionText.trim() ? `${q.questionText.trimEnd()}\n${d.equation}` : d.equation } : {}),
                    }),
                  onRemove: (i) => updateQuestion(q.key, { diagrams: (q.diagrams || []).filter((_, k) => k !== i) }),
                }} />

              {q.type === 'short' ? <div className="space-y-2"><p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">Student লিখিত উত্তর বা image/PDF দেবে; শিক্ষক হাতে নম্বর দেবেন।</p><label className="block text-sm font-medium dark:text-gray-200">শিক্ষকের marking rubric / নম্বর দেওয়ার নির্দেশনা (ঐচ্ছিক)<textarea maxLength={3000} rows={3} value={q.gradingRubric || ''} onChange={(e) => updateQuestion(q.key, { gradingRubric: e.target.value })} className="input mt-1 w-full resize-y" placeholder="যেমন: মূল ধারণা ১ নম্বর, উদাহরণ ১ নম্বর; আংশিক উত্তরে আংশিক নম্বর" /></label></div> : <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <div key={i} className={`flex items-center rounded-xl border transition-colors ${side ? 'gap-1 p-1 sm:gap-2 sm:p-1.5 sm:pr-2' : 'gap-2 p-1.5 pr-2'} ${q.correctOptionIndex === i ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10' : 'border-transparent'}`}>
                    <input
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                      type="radio"
                      name={`correct-${q.key}`}
                      checked={q.correctOptionIndex === i}
                      onChange={() => updateQuestion(q.key, { correctOptionIndex: i })}
                      title={t('createMcq.markCorrect')}
                    />
                    <span className={`h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-100 text-xs font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300 ${side ? 'hidden sm:grid' : 'grid'}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <input
                      data-math
                      placeholder={t('createMcq.optionPlaceholder', { letter: String.fromCharCode(65 + i) })}
                      value={opt}
                      onChange={(e) => updateOption(q.key, i, e.target.value)}
                      className={side ? 'input min-w-0 !px-2 !text-sm sm:!px-3 sm:!text-base' : 'input'}
                    />
                    <OptionImage value={(q.optionImages || [])[i] || ''} onChange={(v) => updateOptionImage(q.key, i, v)} />
                    {q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(q.key, i)}
                        className={side ? 'act-danger shrink-0 !px-1.5' : 'act-danger shrink-0 !px-2'}
                        title={t('common.delete')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                {q.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => addOption(q.key)}
                    className="act"
                  >
                    {t('createMcq.addOption')} ({q.options.length}/{MAX_OPTIONS})
                  </button>
                )}
                <span className="text-[11px] text-gray-500">{q.options.length >= MAX_OPTIONS ? `সর্বোচ্চ ${MAX_OPTIONS}টি অপশন` : 'সঠিক উত্তরের পাশে গোল বাটনে ক্লিক করুন'}</span>
                </div>
              </div>}

              <label className="block text-sm font-medium dark:text-gray-200">লিখিত ব্যাখ্যা (ঐচ্ছিক)<textarea data-math rows={3} placeholder={t('createMcq.explanationPlaceholder')} value={q.explanation} onChange={(e) => updateQuestion(q.key, { explanation: e.target.value })} className="input mt-1 w-full resize-y" /></label>
              <QuestionAudioField label="ব্যাখ্যার voice note" value={q.explanationAudio} onChange={(explanationAudio) => updateQuestion(q.key, { explanationAudio })} />
              <ExplanationMediaField value={q.explanationMedia || []} onChange={(explanationMedia) => updateQuestion(q.key, { explanationMedia })} />

             </div>

              {/* প্রিভিউ — 'পাশে' মোডে ডানদিকে (স্ক্রল করলে আটকে থাকে), 'নিচে' মোডে আগের মতো নিচে ও শুধু সূত্র থাকলে */}
              {(side || hasMath(q.questionText) || q.options.some(hasMath) || hasMath(q.explanation) || (q.optionImages || []).some(Boolean)) && (
                <div className={side ? 'sticky top-16 min-w-0 self-start sm:top-20' : ''}>
                  <div className={`rounded-xl border border-dashed border-primary-300 bg-primary-50/40 dark:border-primary-500/30 dark:bg-primary-500/5 dark:text-gray-100 ${side ? 'p-2 text-xs sm:p-3 sm:text-sm' : 'p-3 text-sm'}`}>
                    <div className={`text-gray-400 ${side ? 'mb-2 text-[10px] sm:text-xs' : 'mb-1 text-xs'}`}>{t('exam.previewLabel')}</div>
                    <MathText as="p" className="break-words font-medium" text={q.questionText} />
                    {q.diagram && <ZoomImage src={assetUrl(q.diagram)} className="mt-2 max-h-40 rounded-lg border border-gray-200 bg-white object-contain" />}
                    {(q.diagrams || []).length > 0 && <div className="mt-2"><ChemDiagramList items={q.diagrams} compact /></div>}
                    <ul className={side ? 'mt-2 space-y-1' : 'mt-1 space-y-0.5'}>
                      {q.options.map((o, i) => (
                        <li key={i} className="break-words">{String.fromCharCode(65 + i)}. <MathText text={o} />{(q.optionImages || [])[i] && <ZoomImage src={q.optionImages[i]} className="mt-1 block max-h-24 rounded border border-gray-200 bg-white object-contain" />}</li>
                      ))}
                    </ul>
                    {q.explanation && <MathText as="p" className={`text-gray-500 ${side ? 'mt-2' : 'mt-1'}`} text={q.explanation} />}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addQuestionRow} className="btn-secondary w-full border-dashed !py-3">
          {t('createMcq.addQuestion')}
        </button>

        {(localError || error) && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{localError || error}</p>}

        <div className="glass sticky bottom-0 z-30 -mx-4 space-y-2 rounded-t-2xl px-4 pb-4 pt-3 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.15)] sm:mx-0">
          <p className="min-h-[1rem] text-xs text-gray-500 dark:text-gray-400">
            {saveState === 'saving' && t('createMcq.saving')}
            {saveState === 'saved' && t('createMcq.autoSaved')}
            {saveState === 'error' && <span className="text-amber-600">{t('createMcq.autoSaveFailed')}</span>}
          </p>

          <div className="flex gap-3">
            <button type="button" onClick={handleSavePending} disabled={loading} className="btn-secondary flex-1">
              {t('createMcq.savePending')}
            </button>
            <button disabled={loading} className="btn-primary flex-1">
              {loading ? t('createMcq.creating') : t('createMcq.submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
