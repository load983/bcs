// ================== components/ZoomImage.jsx ==================
// ডায়াগ্রাম ছবি — ক্লিক/ট্যাপ করলে পুরো স্ক্রিনে বড় করে দেখায়।
// বড় ভিউতে: + / − বাটন, মাউস হুইল, দুই আঙুলে পিঞ্চ, টেনে সরানো, ডাবল-ক্লিকে ২.৫× / রিসেট (Esc বা ✕ চাপলে বন্ধ)
import React, { useCallback, useEffect, useRef, useState } from 'react';

const MIN = 1;
const MAX = 6;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

function Viewer({ src, alt, onClose }) {
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dialogRef = useRef(null);
  const pts = useRef(new Map());
  const last = useRef({ dist: 0 });
  const drag = useRef(null);

  const reset = useCallback(() => { setZ(1); setPos({ x: 0, y: 0 }); }, []);
  const zoomBy = useCallback((f) => setZ((v) => { const n = clamp(v * f); if (n === 1) setPos({ x: 0, y: 0 }); return n; }), []);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomBy(1.3);
      else if (e.key === '-') zoomBy(1 / 1.3);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, zoomBy, reset]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      last.current.dist = Math.hypot(a.x - b.x, a.y - b.y);
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (last.current.dist) zoomBy(d / last.current.dist);
      last.current.dist = d;
    } else if (drag.current && z > 1) {
      setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
    }
  };
  const onPointerUp = (e) => { pts.current.delete(e.pointerId); drag.current = null; last.current.dist = 0; };

  const btn = 'grid h-10 w-10 place-items-center rounded-full bg-white/90 text-xl font-semibold text-gray-900 shadow hover:bg-white';
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[110] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'diagram'}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out">−</button>
          <span className="w-14 text-center text-sm font-medium text-white">{Math.round(z * 100)}%</span>
          <button type="button" className={btn} onClick={() => zoomBy(1.3)} aria-label="Zoom in">+</button>
          <button type="button" className="h-10 rounded-full bg-white/90 px-4 text-sm font-medium text-gray-900 shadow hover:bg-white" onClick={reset}>1×</button>
        </div>
        <button type="button" className={btn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (z > 1 ? reset() : setZ(2.5))}
      >
        <div className="grid h-full w-full place-items-center p-2">
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})`, cursor: z > 1 ? 'grab' : 'zoom-in' }}
            className="max-h-full max-w-full rounded-lg bg-white object-contain"
          />
        </div>
      </div>
    </div>
  );
}

export default function ZoomImage({ src, alt = '', className = '', onError }) {
  const [open, setOpen] = useState(false);
  const imageRef = useRef(null);
  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => imageRef.current?.focus(), 0);
  }, []);
  if (!src) return null;
  return (
    <>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        role="button"
        tabIndex={0}
        aria-label={alt || 'Open image'}
        onError={onError}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        className={`cursor-zoom-in ${className}`}
      />
      {open && <Viewer src={src} alt={alt} onClose={close} />}
    </>
  );
}
