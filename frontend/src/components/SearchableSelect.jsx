// ================== components/SearchableSelect.jsx ==================
// সার্চ করা যায় এমন ড্রপডাউন। options: [{ value, label }]
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search...',
  emptyText = 'No results',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listId = useId();
  const boxRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const l = String(o.label).toLowerCase();
      return words.every((w) => l.includes(w));
    });
  }, [options, q]);

  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  const close = (restoreFocus = false) => {
    setOpen(false);
    setQ('');
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector('[data-hi="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const choose = (v) => { onChange?.(v); close(); };

  const onKey = (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!q && value) { e.preventDefault(); choose(''); }
    }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) choose(filtered[hi].value); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="input flex w-full items-center justify-between gap-2 text-left"
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if ((e.key === 'Backspace' || e.key === 'Delete') && value) {
            e.preventDefault();
            choose('');
          }
          if (e.key === 'Escape' && open) { e.preventDefault(); close(true); }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
      >
        <span className={`truncate ${selected ? '' : 'opacity-60'}`}>{selected ? selected.label : placeholder}</span>
        <svg className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/15 dark:bg-slate-800">
          <div className="border-b border-gray-100 p-2 dark:border-white/10">
            <input
              ref={inputRef}
              type="text"
              className="input w-full"
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={filtered[hi] ? `${listId}-option-${hi}` : undefined}
              placeholder={searchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1 text-sm">
            {value && (
              <li
                role="option"
                aria-selected="false"
                className="w-full cursor-pointer px-3 py-1.5 text-left text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                onClick={() => choose('')}
              >
                {placeholder}
              </li>
            )}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-option-${i}`}
                role="option"
                aria-selected={String(o.value) === String(value)}
                data-hi={i === hi}
                className={`w-full cursor-pointer px-3 py-1.5 text-left ${i === hi ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200' : 'hover:bg-gray-100 dark:hover:bg-white/10'}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(o.value)}
              >
                {o.label}
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-gray-500">{emptyText}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
