// ================== pages/teacher/ExamEditor.jsx ==================
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchExamById, updateExamSettings, publishExam, deleteQuestion, updateQuestion,
  setResourceLink, uploadResourcePdf, removeResource,
} from '../../features/exam/examSlice';
import { useLanguage } from '../../context/LanguageContext';
import useTeacherFeatures from '../../hooks/useTeacherFeatures';
import { downloadBlob, fetchFileBlob } from '../../utils/download';
import PdfPreviewModal from '../../components/PdfPreviewModal';
import PdfDropzone from '../../components/PdfDropzone';
import QuestionDiagram from '../../components/QuestionDiagram';
import ChemDiagramList from '../../components/ChemDiagramList';
import assetUrl from '../../utils/assetUrl';
import ZoomImage from '../../components/ZoomImage';
import OptionImage from '../../components/OptionImage';
import ClassSelect from '../../components/ClassSelect';
import MathText from '../../components/MathText';
import FormulaToolbar from '../../components/FormulaToolbar';

// datetime-local ইনপুট শুধু "YYYY-MM-DDTHH:mm" (লোকাল সময়) বোঝে; সার্ভার থেকে আসে UTC ISO স্ট্রিং।
const pad2 = (n) => String(n).padStart(2, '0');
const toLocalInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
// ইনপুটের লোকাল সময়কে ব্রাউজারের টাইমজোনসহ UTC ISO-তে রূপান্তর, যাতে সার্ভারের টাইমজোনে সময় না সরে যায়
const fromLocalInput = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export default function ExamEditor() {
  const { has, lockedMessage, warnLocked } = useTeacherFeatures();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const { t } = useLanguage();
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentExam, questions, shareLink } = useSelector((s) => s.exam);
  const [settings, setSettings] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [classIds, setClassIds] = useState([]);
  const [editingQ, setEditingQ] = useState(null);
  const [resourceLinkInput, setResourceLinkInput] = useState('');
  const [resourcePdfFile, setResourcePdfFile] = useState(null);
  const [resourceError, setResourceError] = useState('');

  useEffect(() => { dispatch(fetchExamById(id)); }, [dispatch, id]);

  useEffect(() => {
    if (currentExam) {
      const sch = currentExam.settings?.schedule || {};
      setSettings({
        ...currentExam.settings,
        schedule: {
          enabled: !!sch.enabled,
          startAt: toLocalInput(sch.startAt),
          endAt: toLocalInput(sch.endAt),
        },
      });
      setAccessCode(currentExam.accessCode || '');
      setClassIds((currentExam.classRefs || []).map((c) => c._id || c));
      setResourceLinkInput(currentExam.resource?.kind === 'link'? currentExam.resource.link : '');
    }
  }, [currentExam]);

  if (!currentExam ||!settings) return <p className="text-center mt-10 dark:text-white">{t('common.loading')}</p>;

  const saveSettings = async () => {
    const totalTimeMinutes = Number(settings.totalTimeMinutes);
    const marksPerQuestion = Number(settings.marksPerQuestion);
    const marksPerWrong = Number(settings.negativeMarking?.marksPerWrong);
    if (!Number.isFinite(totalTimeMinutes) || totalTimeMinutes <= 0 || !Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0) {
      alert(t('editor.invalidNumericSettings'));
      return false;
    }
    if (settings.negativeMarking?.enabled && (!Number.isFinite(marksPerWrong) || marksPerWrong < 0)) {
      alert(t('editor.invalidWrongMarks'));
      return false;
    }
    const sch = settings.schedule || {};
    const startISO = sch.enabled ? fromLocalInput(sch.startAt) : null;
    const endISO = sch.enabled ? fromLocalInput(sch.endAt) : null;
    if (sch.enabled) {
      if (!startISO && !endISO) { alert(t('editor.scheduleNeedTime')); return false; }
      if (startISO && endISO && new Date(endISO) <= new Date(startISO)) { alert(t('editor.scheduleOrder')); return false; }
    }
    const payloadSettings = {
      ...settings,
      schedule: { enabled: !!sch.enabled, startAt: startISO, endAt: endISO },
    };
    const res = await dispatch(updateExamSettings({ id, payload: { title: currentExam.title, settings: payloadSettings, accessCode, ...(classIds.length ? { classIds } : {}) } }));
    if (updateExamSettings.rejected.match(res)) { alert(res.payload || 'Failed to update settings'); return false; }
    return true;
  };

  const handlePublish = async () => {
    if (publishing) return;
    const ok = await saveSettings();
    if (!ok) return;
    setPublishing(true);
    try {
      await dispatch(publishExam(id)).unwrap();
      await dispatch(fetchExamById(id));
    } catch (err) {
      alert(typeof err === 'string' ? err : 'পরীক্ষা প্রকাশ করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setPublishing(false);
    }
  };

  const handleClassChange = (nextClassIds) => {
    if (!nextClassIds.length) {
      alert(t('classes.required'));
      return;
    }
    setClassIds(nextClassIds);
  };

  const handleSaveLink = () => {
    if (!resourceLinkInput.trim()) return;
    dispatch(setResourceLink({ id, link: resourceLinkInput.trim() }));
  };

  const handleUploadPdf = () => {
    if (!resourcePdfFile) return;
    const formData = new FormData();
    formData.append('pdf', resourcePdfFile);
    dispatch(uploadResourcePdf({ id, formData }));
    setResourcePdfFile(null);
  };

  const handleRemoveResource = () => {
    if (!has('resource')) {
      warnLocked('resource');
      return;
    }
    dispatch(removeResource(id));
    setResourceLinkInput('');
    setResourcePdfFile(null);
  };

  const closePdfPreview = () => {
    if (pdfPreview?.url) window.URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  const previewExamPdf = async (withAns) => {
    if (!has('downloadExamPdf')) return warnLocked('downloadExamPdf');
    const filename = `${currentExam.title}-${withAns ? t('exam.pdfWithAnswers') : t('exam.pdfQuestions')}.pdf`;
    setPdfBusy(true);
    try {
      const blob = await fetchFileBlob(`/exams/${id}/pdf`, { ...(withAns ? { answers: 1 } : {}), preview: 1 });
      closePdfPreview();
      setPdfPreview({ blob, url: window.URL.createObjectURL(blob), filename });
    } catch (err) { alert(err.message); }
    finally { setPdfBusy(false); }
  };
  const downloadOriginalSource = async () => {
    try {
      const blob = await fetchFileBlob(`/exams/${id}/source`);
      const ext = String(currentExam.sourcePdfPath || '').split('.').pop() || 'pdf';
      downloadBlob(blob, `${currentExam.title || 'source'}.${ext}`);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-2">
      <h1 className="text-2xl font-semibold tracking-tight dark:text-white sm:text-3xl">{currentExam.title}</h1>

      {/* ---------- Exam Settings ---------- */}
      <div className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold dark:text-white">{t('editor.settingsTitle')}</h2>

        <ClassSelect value={classIds} onChange={handleClassChange} />

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('editor.totalTime')}>
            <input type="number" min={1} value={settings.totalTimeMinutes}
              onChange={(e) => setSettings({...settings, totalTimeMinutes: +e.target.value })}
              className="input" required />
          </Field>
          <Field label={t('editor.marksPerQuestion')}>
            <input type="number" step="0.25" value={settings.marksPerQuestion}
              onChange={(e) => setSettings({...settings, marksPerQuestion: +e.target.value })}
              className="input" required />
          </Field>
          <Field label={t('editor.totalQuestionsToUse', { n: questions.length })}>
            <input type="number" min={0} max={questions.length} value={settings.totalQuestionsToUse}
              onChange={(e) => setSettings({...settings, totalQuestionsToUse: +e.target.value })}
              className="input" />
          </Field>
          <Field label={t('editor.accessCode')}>
            <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} className="input" placeholder={t('editor.accessCodePlaceholder')} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Toggle label={t('editor.negativeMarking')} checked={settings.negativeMarking.enabled}
            onChange={(v) => setSettings({...settings, negativeMarking: {...settings.negativeMarking, enabled: v } })} />
          {settings.negativeMarking.enabled && (
            <Field label={t('editor.marksPerWrong')}>
              <input type="number" min={0} step="0.05" value={settings.negativeMarking.marksPerWrong}
                onChange={(e) => setSettings({...settings, negativeMarking: {...settings.negativeMarking, marksPerWrong: +e.target.value } })}
                className="input" required />
            </Field>
          )}
          <Toggle label={t('editor.shuffleQuestions')} checked={settings.shuffleQuestions}
            onChange={(v) => setSettings({...settings, shuffleQuestions: v })} />
          <Toggle label={t('editor.shuffleOptions')} checked={settings.shuffleOptions}
            onChange={(v) => setSettings({...settings, shuffleOptions: v })} />
          <Toggle label={t('editor.showResultInstantly')} checked={settings.showResultInstantly}
            onChange={(v) => setSettings({...settings, showResultInstantly: v })} />
          <Toggle label={t('editor.showLeaderboard')} checked={!!settings.showLeaderboard}
            onChange={(v) => setSettings({...settings, showLeaderboard: v })} />
          <Toggle label={t('editor.allowRepetition')} checked={settings.allowRepetition}
            onChange={(v) => setSettings({...settings, allowRepetition: v })} />
        </div>

        {/* --- Repetition Warning - স্ক্রিনশট অনুযায়ী --- */}
        {settings.allowRepetition && (
          <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
            {t('editor.repetitionWarning')}
          </p>
        )}

        <Toggle label={t('editor.enableSchedule')} checked={!!settings.schedule?.enabled}
          onChange={(v) => setSettings({...settings, schedule: {...settings.schedule, enabled: v } })} />

        {settings.schedule?.enabled && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('editor.startAt')}>
              <input type="datetime-local" value={settings.schedule?.startAt || ''} onChange={(e) => setSettings({...settings, schedule: {...settings.schedule, startAt: e.target.value } })} className="input" />
            </Field>
            <Field label={t('editor.endAt')}>
              <input type="datetime-local" value={settings.schedule?.endAt || ''} onChange={(e) => setSettings({...settings, schedule: {...settings.schedule, endAt: e.target.value } })} className="input" />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          {[[false, `📄 ${t('exam.pdfQuestionsFull')}`], [true, `📄 ${t('exam.pdfAnswersFull')}`]].map(([withAns, label]) => (
            <button
              key={label}
              type="button"
              disabled={pdfBusy}
              className="btn-secondary"
              onClick={() => previewExamPdf(withAns)}
            >
              {has('downloadExamPdf') ? '' : '🔒 '}{label}
            </button>
          ))}
          {currentExam.sourcePdfPath && (
            <button type="button" className="btn-secondary" onClick={downloadOriginalSource}>
              📎 Original PDF/DOC
            </button>
          )}
          <button onClick={saveSettings} className="btn-secondary">
            {t('editor.saveSettings')}
          </button>
          <button onClick={handlePublish} disabled={publishing} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
            {publishing ? t('common.loading') : t('editor.publish')}
          </button>
        </div>

        {(shareLink || currentExam.status === 'published') && (
          <div className="rounded-lg bg-primary-50 p-3 text-sm dark:bg-primary-500/10 break-all dark:text-white">
            {t('editor.shareLink')} <strong>{shareLink || `${window.location.origin}/join/${currentExam.examCode}`}</strong>
          </div>
        )}
      </div>

      {/* ---------- রিসোর্স ---------- */}
      <div className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold dark:text-white">{t('editor.resourceTitle')}</h2>
        {!has('resource') && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">🔒 {lockedMessage('resource')}</div>
        )}
        {currentExam.resource?.kind && (
          <div className="rounded-lg bg-primary-50 p-3 text-sm dark:bg-primary-500/10 dark:text-white flex justify-between items-center">
            <span>{currentExam.resource.kind === 'link'? t('editor.resourceLinkValue', { value: currentExam.resource.link }) : t('editor.resourcePdfValue', { value: currentExam.resource.pdfOriginalName })}</span>
            <button
              onClick={handleRemoveResource}
              aria-disabled={!has('resource')}
              className={`act-danger ml-3 ${has('resource') ? '' : 'opacity-60'}`}
            >
              {has('resource') ? '' : '🔒 '}{t('editor.remove')}
            </button>
          </div>
        )}
        <div className={`grid sm:grid-cols-2 gap-4 ${has('resource') ? '' : 'pointer-events-none opacity-50'}`}>
          <Field label={t('editor.driveLink')}>
            <div className="flex gap-2">
              <input value={resourceLinkInput} onChange={(e) => setResourceLinkInput(e.target.value)} className="input" placeholder="https://drive.google.com/..." />
              <button onClick={handleSaveLink} className="rounded-lg bg-primary-600 px-3 text-sm text-white hover:bg-primary-700">{t('common.save')}</button>
            </div>
          </Field>
          <Field label={t('editor.orUploadPdf')}>
            <div className="space-y-2">
              <PdfDropzone compact file={resourcePdfFile} onFile={setResourcePdfFile} onError={setResourceError} />
              {resourceError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{resourceError}</p>}
              <button onClick={handleUploadPdf} disabled={!resourcePdfFile} className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">{t('editor.upload')}</button>
            </div>
          </Field>
        </div>
      </div>

      {/* ---------- প্রশ্ন তালিকা ---------- */}
      <FormulaToolbar />
      <div className="card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold dark:text-white">{t('editor.questionsTitle', { n: questions.length })}</h2>
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <QuestionRow key={q._id} index={idx} question={q} isEditing={editingQ === q._id} onEditToggle={() => setEditingQ(editingQ === q._id? null : q._id)} onSave={(payload) => { dispatch(updateQuestion({ questionId: q._id, payload })); setEditingQ(null); }} onDelete={() => dispatch(deleteQuestion(q._id))} />
          ))}
        </div>
      </div>
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

function Field({ label, children }) { return (<label className="block text-sm"><span className="block mb-1 text-gray-600 dark:text-gray-300">{label}</span>{children}</label>); }
function Toggle({ label, checked, onChange }) { return (<label className="flex items-center gap-2 text-sm dark:text-gray-200"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />{label}</label>); }
function QuestionRow({ index, question, isEditing, onEditToggle, onSave, onDelete }) {
  const [text, setText] = useState(question.questionText);
  const [options, setOptions] = useState(question.options);
  const [correctIdx, setCorrectIdx] = useState(question.correctOptionIndex);
  const [diagram, setDiagram] = useState(question.diagram || '');
  const [diagramSource, setDiagramSource] = useState(question.diagramSource || '');
  const [chemDiagrams, setChemDiagrams] = useState(question.diagrams || []);
  const [optionImages, setOptionImages] = useState(() => question.options.map((_, i) => (question.optionImages || [])[i] || ''));
  const [validationError, setValidationError] = useState('');
  const { t } = useLanguage();

  const resetDraft = () => {
    setText(question.questionText || '');
    setOptions(question.options || []);
    setCorrectIdx(question.correctOptionIndex);
    setDiagram(question.diagram || '');
    setDiagramSource(question.diagramSource || '');
    setChemDiagrams(question.diagrams || []);
    setOptionImages((question.options || []).map((_, i) => (question.optionImages || [])[i] || ''));
    setValidationError('');
  };

  useEffect(() => {
    if (!isEditing) resetDraft();
  }, [question, isEditing]);

  const handleSave = () => {
    const isFilledChoice = (option, index) => (typeof option === 'string' && option.trim()) || optionImages[index];
    const filledOptions = options.filter(isFilledChoice);
    if (!text.trim()) {
      setValidationError(t('editor.questionRequired'));
      return;
    }
    if (filledOptions.length < 2) {
      setValidationError(t('editor.choicesRequired'));
      return;
    }
    if (!Number.isInteger(correctIdx) || !isFilledChoice(options[correctIdx], correctIdx)) {
      setValidationError(t('editor.correctChoiceRequired'));
      return;
    }
    setValidationError('');
    onSave({ questionText: text, options, correctOptionIndex: correctIdx, diagram, diagramSource, diagrams: chemDiagrams, optionImages });
  };

  const handleCancel = () => {
    resetDraft();
    onEditToggle();
  };
  if (!isEditing) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 flex justify-between items-start dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <p className="font-medium dark:text-white">{index + 1}. <MathText text={question.questionText} /></p>
          {question.diagram && <ZoomImage src={assetUrl(question.diagram)} className="mt-2 max-h-40 rounded-lg border border-gray-200 bg-white object-contain" />}
          {(question.diagrams || []).length > 0 && <div className="mt-2"><ChemDiagramList items={question.diagrams} compact /></div>}
          {question.correctOptionIndex < 0 && <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">⚠ সঠিক উত্তর বাছাই করা হয়নি</p>}
          <ul className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {question.options.map((opt, i) => (
              <li key={i} className={i === question.correctOptionIndex ? 'text-green-600 font-semibold' : ''}>
                {String.fromCharCode(65 + i)}. <MathText text={opt} /> {i === question.correctOptionIndex && '✓'}
                {(question.optionImages || [])[i] && <ZoomImage src={question.optionImages[i]} className="mt-1 block max-h-20 rounded border border-gray-200 bg-white object-contain" />}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 text-sm shrink-0">
          <button onClick={onEditToggle} className="text-primary-600">{t('common.edit')}</button>
          <button onClick={onDelete} className="text-red-600">{t('common.delete')}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="border dark:border-gray-700 rounded-lg p-3 space-y-2 bg-primary-50 dark:bg-gray-700">
      <textarea data-math rows={2} value={text} onChange={(e) => setText(e.target.value)} className="input resize-none" />
      <QuestionDiagram compact value={diagram} source={diagramSource} onChange={(p) => { setDiagram(p.diagram); setDiagramSource(p.diagramSource); }} chem={{ items: chemDiagrams, onInsert: (d, { insertEquation } = {}) => { setChemDiagrams((a) => [...a.filter((x) => x.svg !== d.svg), d].slice(-8)); if (insertEquation && d.equation) setText((tx) => (tx.trim() ? `${tx.trimEnd()}\n${d.equation}` : d.equation)); }, onRemove: (i) => setChemDiagrams((a) => a.filter((_, k) => k !== i)) }} />
      <fieldset role="radiogroup" aria-labelledby={`correct-answer-label-${question._id}`} className="space-y-2">
        <legend id={`correct-answer-label-${question._id}`} className="text-sm font-medium dark:text-gray-200">{t('editor.correctAnswer')}</legend>
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-answer-${question._id}`}
              checked={correctIdx === i}
              onChange={() => setCorrectIdx(i)}
              aria-label={`${t('editor.correctAnswer')} ${String.fromCharCode(65 + i)}`}
            />
            <input data-math value={opt} onChange={(e) => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} className="input" />
            <OptionImage value={optionImages[i] || ''} onChange={(v) => setOptionImages((arr) => arr.map((x, k) => (k === i ? v : x)))} />
          </div>
        ))}
      </fieldset>
      {validationError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{validationError}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm">{t('common.save')}</button>
        <button onClick={handleCancel} className="text-sm text-gray-500">{t('common.cancel')}</button>
      </div>
    </div>
  );
}
