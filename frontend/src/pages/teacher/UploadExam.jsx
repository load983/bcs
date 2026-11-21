// ================== pages/teacher/UploadExam.jsx ==================
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { uploadExamPdf } from '../../features/exam/examSlice';
import { useLanguage } from '../../context/LanguageContext';
import PdfDropzone from '../../components/PdfDropzone';
import ClassSelect from '../../components/ClassSelect';

export default function UploadExam() {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [classIds, setClassIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localError, setLocalError] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { error } = useSelector((s) => s.exam);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (classIds.length === 0) return setLocalError(t('classes.required'));
    if (!file) return setLocalError(t('upload.selectFile'));
    setLoading(true);
    setUploadProgress(0);
    setLocalError('');

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('title', title);
    formData.append('classIds', JSON.stringify(classIds));

    const result = await dispatch(uploadExamPdf({
      formData,
      onUploadProgress: (event) => {
        if (event.total) setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    }));
    setLoading(false);
    if (uploadExamPdf.fulfilled.match(result)) {
      navigate(`/teacher/exam/${result.payload.exam._id}`);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-2">
      <h2 className="text-xl font-bold mb-2 dark:text-white">{t('upload.title')}</h2>
      <section className="mb-4 rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-4 text-sm leading-relaxed text-primary-900 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-100">
        <p className="font-semibold">{t('upload.supportedFiles')}</p>
        <p className="mt-1 text-xs text-primary-800/90 dark:text-primary-200/90">{t('upload.searchablePdfNote')}</p>
        <p className="mt-3 text-xs font-semibold">{t('upload.formatLabel')}</p>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-white/80 p-3 font-mono text-xs text-gray-800 dark:bg-gray-900/70 dark:text-gray-100">{t('upload.mcqDemo')}</pre>
        <p className="mt-2 text-xs">{t('upload.answerOptional')}</p>
      </section>
      <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-xs leading-relaxed text-primary-800 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-200">
        <strong>{t('upload.richContentTitle')}</strong> {t('upload.richContentNote')}
      </div>
      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <input placeholder={t('upload.titlePlaceholder')}
          value={title} onChange={(e) => setTitle(e.target.value)}
          className="input" />

        <ClassSelect value={classIds} onChange={setClassIds} />

        <PdfDropzone allowDoc file={file} onFile={setFile} onError={setLocalError} />

        {(localError || error) && <p className="text-red-600 text-sm">{localError || error}</p>}
        {loading && (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{uploadProgress < 100 ? t('upload.uploading') : t('upload.parsing')}</span>
              <span className="font-semibold tabular-nums">{uploadProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
        <button disabled={loading} className="btn-primary w-full">
          {loading ? t('upload.parsing') : t('upload.submit')}
        </button>
      </form>
    </div>
  );
}
