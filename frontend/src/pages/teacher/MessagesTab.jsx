// ================== pages/teacher/MessagesTab.jsx ==================
// "Message with student": শিক্ষক মেসেজ + ছবি পাঠায়; স্টুডেন্টরা ওয়েবসাইটে ও ডিভাইসের নোটিফিকেশন bar-এ দেখে।
// পাঠানো মেসেজ শিক্ষক ইচ্ছামতো এডিট / ডিলিট করতে পারে। নতুন পরীক্ষা পাবলিশ করলে অটো নোটিফিকেশন যায়।
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import assetUrl from '../../utils/assetUrl';
import { useLanguage } from '../../context/LanguageContext';
import useTeacherFeatures from '../../hooks/useTeacherFeatures';
import UploadProgress from '../../components/UploadProgress';
import ProtectedVideo from '../../components/ProtectedVideo';

const MAX_TEXT = 2000;
const MAX_MEDIA_FILES = 8;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
]);

export default function MessagesTab({ classes }) {
  const { t, locale } = useLanguage();
  const { has, lockedMessage } = useTeacherFeatures();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ type: '', text: '' });

  // নতুন মেসেজ ফর্ম
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  // এডিট
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editImage, setEditImage] = useState(null);
  const [editRemove, setEditRemove] = useState(false);
  const [renotify, setRenotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editProgress, setEditProgress] = useState(null);

  const load = useCallback(() => {
    axiosClient
      .get('/messages')
      .then(({ data }) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // শ্রেণী লোড হলে ডিফল্টে সব নির্বাচিত
  useEffect(() => {
    setSelected((prev) => (prev.length === 0 ? classes.map((c) => c._id) : prev));
  }, [classes]);

  useEffect(() => {
    const urls = files.map((file) => ({ url: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image' }));
    setPreviews(urls);
    return () => urls.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  const flash = (type, msg) => {
    setNotice({ type, text: msg });
    setTimeout(() => setNotice({ type: '', text: '' }), 4000);
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    const accepted = incoming.filter((file) => ALLOWED_MEDIA_TYPES.has(file.type));
    if (accepted.length !== incoming.length) flash('error', t('msg.invalidMedia'));
    const remaining = MAX_MEDIA_FILES - files.length;
    if (accepted.length > remaining) flash('error', t('msg.filesLimit'));
    const nextFiles = accepted.slice(0, Math.max(0, remaining));
    if (nextFiles.length) setFiles((current) => [...current, ...nextFiles]);
  };

  const toggleClass = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = async (e) => {
    e.preventDefault();
    if (!has('messages')) return flash('error', lockedMessage('messages'));
    if (!text.trim() && files.length === 0) return flash('error', t('msg.needContent'));
    if (selected.length === 0) return flash('error', t('msg.needClass'));
    setSending(true);
    setSendProgress(0);
    try {
      const fd = new FormData();
      fd.append('text', text.trim());
      fd.append('classIds', JSON.stringify(selected));
      files.forEach((file) => fd.append('files', file));
      const { data } = await axiosClient.post('/messages', fd, { onUploadProgress: (event) => event.total && setSendProgress(Math.round((event.loaded / event.total) * 100)) });
      setItems((list) => [data.item, ...list]);
      setText('');
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      flash('success', t('msg.sent'));
    } catch (err) {
      flash('error', err.response?.data?.message || t('msg.sendFailed'));
    } finally {
      setSending(false); setSendProgress(null);
    }
  };

  const startEdit = (m) => {
    setEditId(m._id);
    setEditText(m.text || '');
    setEditImage(null);
    setEditRemove(false);
    setRenotify(false);
  };

  const saveEdit = async (m) => {
    if (!editText.trim() && !editImage && (editRemove || !m.imageUrl)) return flash('error', t('msg.needContent'));
    setSaving(true);
    setEditProgress(0);
    try {
      const fd = new FormData();
      fd.append('text', editText.trim());
      if (editImage) fd.append('image', editImage);
      if (editRemove) fd.append('removeImage', 'true');
      if (renotify) fd.append('renotify', 'true');
      const { data } = await axiosClient.put(`/messages/${m._id}`, fd, { onUploadProgress: (event) => event.total && setEditProgress(Math.round((event.loaded / event.total) * 100)) });
      setItems((list) => list.map((x) => (x._id === m._id ? data.item : x)));
      setEditId(null);
      flash('success', t('msg.updated'));
    } catch (err) {
      flash('error', err.response?.data?.message || t('msg.sendFailed'));
    } finally {
      setSaving(false); setEditProgress(null);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(t('msg.confirmDelete'))) return;
    try {
      await axiosClient.delete(`/messages/${m._id}`);
      setItems((list) => list.filter((x) => x._id !== m._id));
      flash('success', t('msg.deleted'));
    } catch (err) {
      flash('error', err.response?.data?.message || t('msg.sendFailed'));
    }
  };

  const fmt = (d) => new Date(d).toLocaleString(locale || undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('msg.intro')}</p>

      {notice.text && (
        <p className={`mb-3 text-sm ${notice.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{notice.text}</p>
      )}

      {/* ✍️ নতুন মেসেজ */}
      <form onSubmit={send} className="card mb-8 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          rows={4}
          placeholder={t('msg.placeholder')}
          className="input w-full"
        />
        <div className="text-right text-xs text-gray-400">{text.length}/{MAX_TEXT}</div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v"
            multiple
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
            className="sr-only"
          />
          <div
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false);
            }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); addFiles(e.dataTransfer.files); }}
            className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${dragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600'}`}
          >
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('msg.dropMedia')}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('msg.mediaTypes')}</p>
            <button type="button" className="btn-secondary mt-3 !px-3 !py-1.5 text-sm" onClick={() => fileRef.current?.click()}>
              {t('msg.chooseMedia')}
            </button>
          </div>
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {previews.map((item, index) => (
                <div key={`${files[index]?.name}-${index}`} className="relative overflow-hidden rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                  {item.kind === 'video'
                    ? <ProtectedVideo src={item.url} controls className="h-28 w-full rounded object-cover" />
                    : <img src={item.url} alt={files[index]?.name || ''} className="h-28 w-full rounded object-cover" />}
                  <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{files[index]?.name}</p>
                  <button type="button" aria-label={t('msg.removeAttachment')} className="mt-1 text-xs text-red-600 hover:underline" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                    {t('msg.removeAttachment')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-sm font-medium dark:text-gray-200">{t('msg.sendTo')}</p>
          {classes.length === 0 ? (
            <p className="text-sm text-gray-500">{t('msg.noClasses')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => (
                <label
                  key={c._id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                    selected.includes(c._id)
                      ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={selected.includes(c._id)} onChange={() => toggleClass(c._id)} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <button type="submit" disabled={sending || classes.length === 0} className="btn-primary">
          {sending ? t('msg.sending') : t('msg.send')}
        </button>
        <UploadProgress progress={sendProgress} label={t('msg.sending')} />
      </form>

      {/* 📜 পাঠানো মেসেজ */}
      <h2 className="mb-3 text-lg font-semibold dark:text-white">{t('msg.sentList')}</h2>
      {loading ? (
        <p className="text-gray-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-gray-500 dark:text-gray-400">{t('msg.emptyTeacher')}</p>
      ) : (
        <div className="space-y-4">
          {items.map((m) => (
            <div key={m._id} className="card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {m.kind === 'exam' ? `📝 ${t('msg.autoExam')}` : '💬'} · {m.classNames.join(', ')}
                </span>
                <span>
                  {fmt(m.createdAt)}
                  {m.editedAt && <span className="ml-1 italic">({t('msg.edited')})</span>}
                </span>
              </div>

              {editId === m._id ? (
                <div className="space-y-3">
                  <textarea value={editText} onChange={(e) => setEditText(e.target.value.slice(0, MAX_TEXT))} rows={4} className="input w-full" />
                  {m.imageUrl && !editRemove && !editImage && (
                    <div className="flex items-start gap-3">
                      <img src={assetUrl(m.imageUrl)} alt="" className="max-h-32 rounded-lg" />
                      <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setEditRemove(true)}>
                        {t('msg.removeImage')}
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => { setEditImage(e.target.files?.[0] || null); setEditRemove(false); }}
                    className="text-sm dark:text-gray-200"
                  />
                  <label className="flex items-center gap-2 text-sm dark:text-gray-200">
                    <input type="checkbox" checked={renotify} onChange={(e) => setRenotify(e.target.checked)} />
                    {t('msg.renotify')}
                  </label>
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={saving} onClick={() => saveEdit(m)}>
                      {saving ? '...' : t('common.save')}
                    </button>
                    <button className="btn-secondary" onClick={() => setEditId(null)}>{t('common.cancel')}</button>
                  </div>
                  <UploadProgress progress={editProgress} label={t('msg.sending')} />
                </div>
              ) : (
                <>
                  {m.text && <p className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{m.text}</p>}
                  {(m.media || (m.imageUrl ? [{ url: m.imageUrl, kind: 'image' }] : [])).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {(m.media || [{ url: m.imageUrl, kind: 'image' }]).map((media, index) => media.kind === 'video'
                        ? <ProtectedVideo key={`${media.url}-${index}`} src={assetUrl(media.url)} controls className="max-h-60 max-w-full rounded-lg" />
                        : <img key={`${media.url}-${index}`} src={assetUrl(media.url)} alt="" loading="lazy" className="max-h-60 rounded-lg" />)}
                    </div>
                  )}
                  <div className="mt-3 flex gap-4 text-sm">
                    <button className="text-primary-600 hover:underline" onClick={() => startEdit(m)}>{t('common.edit')}</button>
                    <button className="text-red-600 hover:underline" onClick={() => remove(m)}>{t('common.delete')}</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
