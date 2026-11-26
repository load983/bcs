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
import QuestionAudioField from '../../components/QuestionAudioField';
import ExplanationMediaField from '../../components/ExplanationMediaField';
import ChemDiagramList from '../../components/ChemDiagramList';
import assetUrl from '../../utils/assetUrl';
import ZoomImage from '../../components/ZoomImage';
import OptionImage from '../../components/OptionImage';
import ClassSelect from '../../components/ClassSelect';
import MathText from '../../components/MathText';
import FormulaToolbar from '../../components/FormulaToolbar';
import UploadProgress from '../../components/UploadProgress';

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
function getPublishIssueKeys(question, examSettings = {}) {
  const issues = [];
  if (!String(question.questionText || '').trim()) issues.push('questionText');
  const options = Array.isArray(question.options) ? question.options : [];
  const isShort = question.type === 'short'
    || (examSettings.questionType === 'short' && options.length === 0);
  if (isShort) return issues;
  const answer = question.correctOptionIndex;
  if (options.length < 2) issues.push('options');
  const answerHasContent = Number.isInteger(answer)
    && answer >= 0
    && answer < options.length
    && (!!String(options[answer] || '').trim() || !!String(question.optionImages?.[answer] || '').trim());
  if (!answerHasContent) issues.push('answer');
  return issues;
}
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
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [classIds, setClassIds] = useState([]);
  const [editingQ, setEditingQ] = useState(null);
  const [resourceLinkInput, setResourceLinkInput] = useState('');
  const [resourcePdfFile, setResourcePdfFile] = useState(null);
  const [resourceUploadProgress, setResourceUploadProgress] = useState(null);
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

  const publishIssues = (questions || []).map((question, index) => ({
    question,
    index,
    issueKeys: getPublishIssueKeys(question, currentExam?.settings || {}),
  })).filter((item) => item.issueKeys.length > 0);

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
    if (publishIssues.length) {
      setPublishAttempted(true);
      const firstId = publishIssues[0].question._id;
      setEditingQ(firstId);
      window.setTimeout(() => document.getElementById(`exam-question-${firstId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setPublishAttempted(false);
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
    setResourceUploadProgress(0);
    dispatch(uploadResourcePdf({
      id,
      formData,
      onUploadProgress: (event) => event.total && setResourceUploadProgress(Math.round((event.loaded / event.total) * 100)),
    })).finally(() => setResourceUploadProgress(null));
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
      const sourceName = currentExam.sourcePdfOriginalName || currentExam.sourcePdfPath || '';
      const ext = String(sourceName).match(/\.([a-z0-9]{1,8})$/i)?.[1] || 'pdf';
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
          {(currentExam.sourcePdfPath || currentExam.sourcePdfGridFsId) && (
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
              <UploadProgress progress={resourceUploadProgress} label={t('diagram.uploading')} />
            </div>
          </Field>
        </div>
      </div>

      {/* ---------- প্রশ্ন তালিকা ---------- */}
      <FormulaToolbar />
      <div className="card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold dark:text-white">{t('editor.questionsTitle', { n: questions.length })}</h2>
        {publishAttempted && publishIssues.length > 0 && <div role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-semibold">{t('editor.publishIssuesTitle', { count: publishIssues.length })}</p>
          <div className="mt-2 flex flex-wrap gap-2">{publishIssues.map(({ question, index }) => <button key={question._id} type="button" className="rounded-full border border-red-400 bg-white px-3 py-1 font-semibold text-red-700 underline decoration-dotted underline-offset-2 hover:bg-red-100 dark:border-red-500/50 dark:bg-gray-900 dark:text-red-300" onClick={() => { setEditingQ(question._id); document.getElementById(`exam-question-${question._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t('createMcq.questionLabel', { n: index + 1 })}</button>)}</div>
        </div>}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <QuestionRow key={q._id} index={idx} question={q} publishIssueKeys={publishAttempted ? getPublishIssueKeys(q, currentExam?.settings || {}) : []} isEditing={editingQ === q._id} onEditToggle={() => setEditingQ(editingQ === q._id? null : q._id)} onSave={(payload) => { dispatch(updateQuestion({ questionId: q._id, payload })); setEditingQ(null); }} onDelete={() => dispatch(deleteQuestion(q._id))} />
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
function QuestionRow({ index, question, publishIssueKeys = [], isEditing, onEditToggle, onSave, onDelete }) {
  const questionOptions = Array.isArray(question.options) ? question.options : [];
  const [text, setText] = useState(question.questionText);
  const [explanation, setExplanation] = useState(question.explanation || '');
  const [questionAudio, setQuestionAudio] = useState(question.questionAudio || '');
  const [explanationAudio, setExplanationAudio] = useState(question.explanationAudio || '');
  const [explanationMedia, setExplanationMedia] = useState(question.explanationMedia || []);
  const [gradingRubric, setGradingRubric] = useState(question.gradingRubric || '');
  const [type, setType] = useState(question.type || (questionOptions.length ? 'mcq' : 'short'));
  const [options, setOptions] = useState(questionOptions.length ? questionOptions : ['', '']);
  const [correctIdx, setCorrectIdx] = useState(question.correctOptionIndex);
  const [diagram, setDiagram] = useState(question.diagram || '');
  const [diagramSource, setDiagramSource] = useState(question.diagramSource || '');
  const [chemDiagrams, setChemDiagrams] = useState(question.diagrams || []);
  const [optionImages, setOptionImages] = useState(() => questionOptions.map((_, i) => (question.optionImages || [])[i] || ''));
  const [validationError, setValidationError] = useState('');
  const { t } = useLanguage();

  const resetDraft = () => {
    setText(question.questionText || '');
    setExplanation(question.explanation || '');
    setQuestionAudio(question.questionAudio || '');
    setExplanationAudio(question.explanationAudio || '');
    setExplanationMedia(question.explanationMedia || []);
    setGradingRubric(question.gradingRubric || '');
    setType(question.type || (questionOptions.length ? 'mcq' : 'short'));
    setOptions(questionOptions.length ? questionOptions : ['', '']);
    setCorrectIdx(question.correctOptionIndex);
    setDiagram(question.diagram || '');
    setDiagramSource(question.diagramSource || '');
    setChemDiagrams(question.diagrams || []);
    setOptionImages(questionOptions.map((_, i) => (question.optionImages || [])[i] || ''));
    setValidationError('');
  };

  useEffect(() => {
    if (!isEditing) resetDraft();
  }, [question, isEditing]);

  const handleSave = () => {
    const isFilledChoice = (option, index) => (typeof option === 'string' && option.trim()) || optionImages[index];
    if (!text.trim()) {
      setValidationError(t('editor.questionRequired'));
      return;
    }
    const filledOptions = options.filter(isFilledChoice);
    if (type !== 'short' && filledOptions.length < 2) {
      setValidationError(t('editor.choicesRequired'));
      return;
    }
    if (type !== 'short' && (!Number.isInteger(correctIdx) || !isFilledChoice(options[correctIdx], correctIdx))) {
      setValidationError(t('editor.correctChoiceRequired'));
      return;
    }
    setValidationError('');
    onSave({ type, questionText: text, explanation, gradingRubric: type === 'short' ? gradingRubric : '', questionAudio, explanationAudio, explanationMedia, options: type === 'short' ? [] : options, correctOptionIndex: type === 'short' ? undefined : correctIdx, diagram, diagramSource, diagrams: chemDiagrams, optionImages: type === 'short' ? undefined : optionImages });
  };

  const handleCancel = () => {
    resetDraft();
    onEditToggle();
  };
  if (!isEditing) {
    return (
      <div id={`exam-question-${question._id}`} className={`rounded-xl border p-3 flex justify-between items-start ${publishIssueKeys.length ? 'border-red-400 bg-red-50/80 ring-1 ring-red-300 dark:border-red-500/50 dark:bg-red-500/10 dark:ring-red-500/30' : 'border-gray-100 bg-gray-50/60 dark:border-white/10 dark:bg-white/[0.03]'}`}>
        <div>
          <p className="font-medium dark:text-white">{index + 1}. <MathText text={question.questionText} /></p>
          {publishIssueKeys.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" role="alert">{publishIssueKeys.map((issue) => <span key={issue} className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">{t(`editor.publishIssue.${issue}`)}</span>)}</div>}
          {question.diagram && <ZoomImage src={assetUrl(question.diagram)} className="mt-2 max-h-40 rounded-lg border border-gray-200 bg-white object-contain" />}
          {(question.diagrams || []).length > 0 && <div className="mt-2"><ChemDiagramList items={question.diagrams} compact /></div>}
          {question.questionAudio && <audio className="mt-2 max-w-sm" controls preload="none" src={question.questionAudio} />}
          {question.explanationAudio && <p className="mt-1 text-xs text-gray-500">ব্যাখ্যার voice note সংযুক্ত</p>}
          {question.type === 'short' ? <p className="mt-2 text-sm text-primary-600">Short question — student লিখিত উত্তর বা image/PDF দিতে পারবে</p> : <><ul className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {questionOptions.map((opt, i) => (
              <li key={i} className={i === question.correctOptionIndex ? 'text-green-600 font-semibold' : ''}>
                {String.fromCharCode(65 + i)}. <MathText text={opt} /> {i === question.correctOptionIndex && '✓'}
                {(question.optionImages || [])[i] && <ZoomImage src={question.optionImages[i]} className="mt-1 block max-h-20 rounded border border-gray-200 bg-white object-contain" />}
              </li>
            ))}
          </ul>{question.correctOptionIndex < 0 && <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">⚠ সঠিক উত্তর বাছাই করা হয়নি</p>}</>}
        </div>
        <div className="flex gap-2 text-sm shrink-0">
          <button onClick={onEditToggle} className="text-primary-600">{t('common.edit')}</button>
          <button onClick={onDelete} className="text-red-600">{t('common.delete')}</button>
        </div>
      </div>
    );
  }
  return (
    <div id={`exam-question-${question._id}`} className={`rounded-lg border p-3 space-y-2 ${publishIssueKeys.length ? 'border-red-400 bg-red-50/80 ring-1 ring-red-300 dark:border-red-500/50 dark:bg-red-500/10 dark:ring-red-500/30' : 'border-gray-200 bg-primary-50 dark:border-gray-700 dark:bg-gray-700'}`}>
      {publishIssueKeys.length > 0 && <div className="flex flex-wrap gap-1.5" role="alert">{publishIssueKeys.map((issue) => <span key={issue} className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">{t(`editor.publishIssue.${issue}`)}</span>)}</div>}
      <textarea data-math rows={2} value={text} onChange={(e) => setText(e.target.value)} className="input resize-none" />
      <select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="mcq">MCQ question</option><option value="short">Short question</option></select>
      <QuestionAudioField label="প্রশ্নের voice note" value={questionAudio} onChange={setQuestionAudio} />
      <QuestionDiagram compact value={diagram} source={diagramSource} onChange={(p) => { setDiagram(p.diagram); setDiagramSource(p.diagramSource); }} chem={{ items: chemDiagrams, onInsert: (d, { insertEquation } = {}) => { setChemDiagrams((a) => [...a.filter((x) => x.svg !== d.svg), d].slice(-8)); if (insertEquation && d.equation) setText((tx) => (tx.trim() ? `${tx.trimEnd()}\n${d.equation}` : d.equation)); }, onRemove: (i) => setChemDiagrams((a) => a.filter((_, k) => k !== i)) }} />
      <div className="space-y-2"><label className="block text-sm font-medium dark:text-gray-200">লিখিত ব্যাখ্যা (ঐচ্ছিক)<textarea className="input mt-1 w-full resize-y" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></label><QuestionAudioField label="ব্যাখ্যার voice note (ঐচ্ছিক)" value={explanationAudio} onChange={setExplanationAudio} /><ExplanationMediaField value={explanationMedia} onChange={setExplanationMedia} /><p className="text-xs text-gray-500">ব্যাখ্যার লেখা, voice note, ছবি ও video ফলাফল প্রকাশ/teacher review-এর পর শিক্ষার্থীরা দেখতে পাবে।</p></div>
      {type === 'short' ? <div className="space-y-2"><p className="rounded-lg bg-primary-100 p-3 text-sm text-primary-700">শিক্ষার্থী লিখিত উত্তর বা image/PDF দেবে; শিক্ষক হাতে নম্বর দেবেন।</p><label className="block text-sm font-medium dark:text-gray-200">শিক্ষকের marking rubric / নম্বর দেওয়ার নির্দেশনা (ঐচ্ছিক)<textarea maxLength={3000} rows={3} value={gradingRubric} onChange={(e) => setGradingRubric(e.target.value)} className="input mt-1 w-full resize-y" /></label></div> : <>
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
      </>}
      {validationError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{validationError}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm">{t('common.save')}</button>
        <button onClick={handleCancel} className="text-sm text-gray-500">{t('common.cancel')}</button>
      </div>
    </div>
  );
}
