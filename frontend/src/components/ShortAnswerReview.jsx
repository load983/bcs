import React from 'react';
import AnswerImageAnnotation from './AnswerImageAnnotation';

export default function ShortAnswerReview({ item }) {
  const files = item.answerFiles || [];
  return (
    <section className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm dark:text-gray-100">তোমার সংক্ষিপ্ত উত্তর</strong>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'answered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
          {item.status === 'answered' ? (item.marksAwarded === null ? 'শিক্ষক review করবেন' : 'শিক্ষক review করেছেন') : 'উত্তর দেওয়া হয়নি'}
        </span>
      </div>
      {item.answerText && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 dark:text-gray-200">{item.answerText}</p>}
      {!!files.length && <div className="mt-3 space-y-3">
        {files.map((file, index) => String(file.mime || '').startsWith('image/') ? (
          <div key={`${file.name}-${index}`} className="rounded-lg border border-gray-200 bg-white p-2 dark:border-white/10 dark:bg-gray-900">
            <AnswerImageAnnotation src={file.data} name={file.name} strokes={item.annotations?.[String(index)] || []} readOnly />
            <p className="mt-1 truncate text-xs text-gray-500" title={file.name}>{file.name || 'Student answer image'}</p>
          </div>
        ) : (
          <a key={`${file.name}-${index}`} href={file.data} download={file.name || 'student-answer.pdf'} target="_blank" rel="noreferrer" className="block rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-700 underline dark:border-primary-500/20 dark:bg-gray-900 dark:text-primary-300">PDF উত্তর খুলুন / ডাউনলোড করুন: {file.name || 'student-answer.pdf'}</a>
        ))}
      </div>}
      {item.marksAwarded !== null && item.marksAwarded !== undefined && <p className="mt-3 font-semibold text-primary-700 dark:text-primary-300">প্রাপ্ত নম্বর: {item.marksAwarded}</p>}
      {(item.gradingRubric || item.gradingRubricAudio) && <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Key points / marking rubric</p>
        {item.gradingRubric && <p className="mt-1 whitespace-pre-wrap text-sm dark:text-gray-100">{item.gradingRubric}</p>}
        {item.gradingRubricAudio && <audio className="mt-2 w-full" controls preload="none" src={item.gradingRubricAudio}>Audio playback সমর্থিত নয়।</audio>}
      </div>}
    </section>
  );
}
