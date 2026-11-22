import React, { useState } from 'react';
import FeedbackMediaItem from './FeedbackMediaItem';

const MAX_ITEMS = 3;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_DATA_CHARS = 8_500_000;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('ফাইলটি পড়া যায়নি'));
  reader.readAsDataURL(file);
});

export default function ExplanationMediaField({ value = [], onChange }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const items = Array.isArray(value) ? value : [];
  const addFiles = async (fileList) => {
    setError('');
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (items.length + files.length > MAX_ITEMS) {
      setError('ব্যাখ্যায় সর্বোচ্চ ৩টি ছবি/ভিডিও যোগ করা যাবে।');
      return;
    }
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setError('প্রতিটি ছবি/ভিডিও সর্বোচ্চ ৪ MB হতে পারবে।');
      return;
    }
    const unsupported = files.find((file) => !ALLOWED_TYPES.has(file.type.toLowerCase()));
    if (unsupported) {
      setError('শুধু JPEG, PNG, WebP, GIF ছবি এবং MP4, WebM বা QuickTime ভিডিও ব্যবহার করুন।');
      return;
    }
    setBusy(true);
    try {
      const additions = await Promise.all(files.map(async (file) => ({
        name: file.name,
        mime: file.type.toLowerCase(),
        data: await readAsDataUrl(file),
      })));
      const next = [...items, ...additions];
      if (next.reduce((total, item) => total + item.data.length, 0) > MAX_TOTAL_DATA_CHARS) {
        setError('ব্যাখ্যার ছবি/ভিডিওর মোট আকার বেশি; ছোট ফাইল ব্যবহার করুন।');
        return;
      }
      onChange(next);
    } catch (e) {
      setError(e.message || 'ফাইল পড়া যায়নি');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer rounded-xl border border-primary-300 bg-white px-3 py-2 text-sm font-medium text-primary-700 dark:border-primary-500/40 dark:bg-gray-900 dark:text-primary-300">
        ব্যাখ্যায় ছবি / ভিডিও যোগ করুন
        <input
          className="sr-only"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          disabled={busy || items.length >= MAX_ITEMS}
          onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}
        />
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400">সর্বোচ্চ ৩টি ফাইল; প্রতিটি ৪ MB পর্যন্ত। Voice note আলাদা করে ঐচ্ছিকভাবে যোগ করা যাবে।</p>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      {!!items.length && <div className="grid gap-3 sm:grid-cols-2">{items.map((item, index) => <FeedbackMediaItem key={`${item.name}-${index}`} item={item} compact onRemove={() => onChange(items.filter((_, i) => i !== index))} />)}</div>}
    </div>
  );
}
