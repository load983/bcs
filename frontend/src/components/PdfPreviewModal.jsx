import React, { useEffect } from 'react';

export default function PdfPreviewModal({ url, filename, title, previewLabel, downloadLabel, closeLabel, onDownload, onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onDownload} className="btn-primary !px-3 !py-1.5 text-sm">{downloadLabel}</button>
            <button type="button" onClick={onClose} className="btn-secondary !px-3 !py-1.5 text-sm">{closeLabel}</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-gray-100 p-1 dark:bg-gray-800">
          <iframe title={previewLabel} src={url} className="h-full w-full rounded border-0 bg-white" />
        </div>
        <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">{filename}</p>
      </div>
    </div>
  );
}
