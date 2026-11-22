import React from 'react';

export default function FeedbackMediaItem({ item, onRemove, compact = false }) {
  const name = item.name || 'Feedback attachment';
  const mime = String(item.mime || '');
  const frameClass = compact ? 'max-h-48' : 'max-h-80';

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900">
      {mime.startsWith('image/') && <img src={item.data} alt={name} className={`${frameClass} w-full bg-gray-50 object-contain dark:bg-black/20`} />}
      {mime.startsWith('audio/') && <div className="p-3"><audio className="w-full" controls preload="metadata" src={item.data}>Audio playback is not supported.</audio></div>}
      {mime.startsWith('video/') && <video className={`${frameClass} w-full bg-black object-contain`} controls preload="metadata" src={item.data}>Video playback is not supported.</video>}
      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 text-xs dark:border-white/10">
        <span className="truncate text-gray-600 dark:text-gray-300" title={name}>{name}</span>
        {onRemove && <button type="button" className="shrink-0 font-medium text-red-600 hover:underline dark:text-red-400" onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
}
