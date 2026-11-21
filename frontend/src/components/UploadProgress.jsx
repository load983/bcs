import React from 'react';

export default function UploadProgress({ progress, label = 'আপলোড হচ্ছে...' }) {
  if (progress === null || progress === undefined) return null;
  const value = Math.max(0, Math.min(100, Number(progress) || 0));
  return (
    <div className="mt-2 w-full space-y-1" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-[width] duration-200" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
