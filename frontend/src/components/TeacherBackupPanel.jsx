import React, { useRef, useState } from 'react';
import axiosClient from '../api/axiosClient';
import { useLanguage } from '../context/LanguageContext';
import UploadProgress from './UploadProgress';

export default function TeacherBackupPanel() {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);

  const downloadBackup = async () => {
    setBusy('download'); setMessage(''); setError('');
    try {
      const { data } = await axiosClient.get('/teacher-backup/export', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `teacher-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setMessage(t('backup.downloadDone'));
    } catch (err) { setError(err.response?.data?.message || t('backup.failed')); }
    finally { setBusy(''); }
  };

  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { setError(t('backup.zipOnly')); return; }
    if (!window.confirm(t('backup.confirmRestore'))) return;
    setBusy('restore'); setMessage(''); setError('');
    setProgress(0);
    try {
      const form = new FormData(); form.append('backup', file);
      const { data } = await axiosClient.post('/teacher-backup/restore', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => event.total && setProgress(Math.round((event.loaded / event.total) * 100)),
      });
      setMessage(t('backup.restoreDone', { classes: data.restored?.classes || 0, exams: data.restored?.exams || 0, students: data.restored?.students || 0, attempts: data.restored?.attempts || 0 }));
    } catch (err) { setError(err.response?.data?.message || t('backup.failed')); }
    finally { setBusy(''); setProgress(null); }
  };

  return <section className="card mb-5 border border-primary-200 p-4 dark:border-primary-500/30">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="font-semibold dark:text-white">{t('backup.title')}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t('backup.description')}</p>
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('backup.credentialsNote')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!!busy} onClick={downloadBackup}>{busy === 'download' ? t('backup.working') : t('backup.download')}</button>
        <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => inputRef.current?.click()}>{busy === 'restore' ? t('backup.working') : t('backup.restore')}</button>
        <input ref={inputRef} type="file" accept=".zip,application/zip" className="sr-only" onChange={restoreBackup} />
      </div>
    </div>
    {message && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    <UploadProgress progress={progress} label={t('backup.working')} />
  </section>;
}
