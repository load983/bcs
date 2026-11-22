import React, { useRef, useState } from 'react';
import axiosClient from '../api/axiosClient';
import UploadProgress from './UploadProgress';

export default function RoleBackupPanel({ role = 'student' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const admin = role === 'admin';
  const base = admin ? '/role-backup/admin' : '/role-backup/student';
  const download = async () => {
    setBusy('download'); setMessage(''); setError('');
    try {
      const { data } = await axiosClient.get(`${base}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(data); const link = document.createElement('a'); link.href = url;
      link.download = `${role}-backup-${new Date().toISOString().slice(0, 10)}.zip`; link.click(); URL.revokeObjectURL(url);
      setMessage('ZIP backup download শুরু হয়েছে।');
    } catch (e) { setError(e.response?.data?.message || 'Backup তৈরি করা যায়নি।'); }
    finally { setBusy(''); }
  };
  const restore = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!/\.zip$/i.test(file.name)) { setError('শুধুমাত্র ZIP backup upload করুন।'); return; }
    if (!window.confirm(admin ? 'Admin full backup restore করবেন? Existing data overwrite বা delete হবে না।' : 'নিজের student backup restore করবেন? Existing data overwrite বা delete হবে না।')) return;
    setBusy('restore'); setMessage(''); setError(''); setProgress(0);
    try { const form = new FormData(); form.append('backup', file); const { data } = await axiosClient.post(`${base}/restore`, form, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: (e) => e.total && setProgress(Math.round(e.loaded / e.total * 100)) }); setMessage([data.message || 'Restore সম্পন্ন হয়েছে।', data.warning].filter(Boolean).join(' ')); }
    catch (e) { setError(e.response?.data?.message || 'Restore করা যায়নি।'); }
    finally { setBusy(''); setProgress(null); }
  };
  return <section className="card mb-5 border border-primary-200 p-4 dark:border-primary-500/30">
    <h2 className="font-semibold dark:text-white">{admin ? 'Admin full data backup & restore' : 'Student data backup & restore'}</h2>
    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{admin ? 'System data ZIP-এ সংরক্ষণ করুন। Payment/API secret ও audit token backup হবে না।' : 'নিজের profile, classes, attempts, results ও feedback ZIP-এ সংরক্ষণ করুন।'}</p>
    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Password plaintext নয়; ZIP password-protected নয়—নিরাপদে সংরক্ষণ করুন। Restore existing data overwrite বা delete করবে না।</p>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={!!busy} onClick={download}>{busy === 'download' ? 'Working…' : 'Download ZIP backup'}</button><button type="button" className="btn-secondary" disabled={!!busy} onClick={() => inputRef.current?.click()}>{busy === 'restore' ? 'Working…' : 'Upload ZIP & restore'}</button><input ref={inputRef} type="file" accept=".zip,application/zip" className="sr-only" onChange={restore} /></div>
    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<UploadProgress progress={progress} label="Uploading…" />
  </section>;
}
