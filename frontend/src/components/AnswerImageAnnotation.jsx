import React, { useRef, useState } from 'react';

export default function AnswerImageAnnotation({ src, name, strokes = [], onChange, readOnly = false }) {
  const imageRef = useRef(null);
  const activeRef = useRef(false);
  const drawingRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [drawing, setDrawing] = useState(null);
  const [color, setColor] = useState('#e11d48');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [showZoom, setShowZoom] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);

  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const start = (event) => {
    if (readOnly || !onChange || !dimensions.width) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activeRef.current = true;
    const point = pointFromEvent(event);
    if (point) {
      const stroke = { color, width: strokeWidth, points: [point] };
      drawingRef.current = stroke;
      setDrawing(stroke);
    }
  };
  const move = (event) => {
    if (!activeRef.current) return;
    const point = pointFromEvent(event);
    if (point && drawingRef.current) {
      const stroke = { ...drawingRef.current, points: [...drawingRef.current.points, point] };
      drawingRef.current = stroke;
      setDrawing(stroke);
    }
  };
  const finish = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (stroke?.points?.length > 1) onChange?.([...(strokes || []), stroke]);
    setDrawing(null);
  };
  const renderedStrokes = drawing ? [...(strokes || []), drawing] : (strokes || []);
  const hasDimensions = dimensions.width > 0 && dimensions.height > 0;

  return (
    <div className="min-w-0">
      {!readOnly && <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">ছবিতে আঁকুন</span>
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">রং<input aria-label="আঁকার রং" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">✏️ ঘনত্ব<input aria-label="কলমের ঘনত্ব" type="range" min="1" max="24" step="1" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} className="w-24 accent-primary-600" /><span className="w-7 tabular-nums">{strokeWidth}px</span></label>
        <button type="button" className="rounded-lg border px-2 py-1 text-xs dark:border-white/15 dark:text-gray-200" disabled={!strokes?.length} onClick={() => onChange?.((strokes || []).slice(0, -1))}>Undo</button>
        <button type="button" className="rounded-lg border px-2 py-1 text-xs text-red-600 dark:border-white/15" disabled={!strokes?.length} onClick={() => onChange?.([])}>সব মুছুন</button>
      </div>}
      <button type="button" className="mb-2 rounded-lg border border-primary-300 px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 dark:border-primary-500/30 dark:text-primary-300 dark:hover:bg-primary-500/10" onClick={() => { setZoomScale(1); setShowZoom(true); }}>ছবি বড় করে দেখুন</button>
      <div className="relative inline-block max-w-full overflow-hidden rounded-lg bg-white align-top">
        <img
          ref={imageRef}
          src={src}
          alt={name || 'Student answer image'}
          className="block max-h-[32rem] max-w-full object-contain"
          onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        />
        {hasDimensions && <svg
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          preserveAspectRatio="none"
          className={`absolute inset-0 h-full w-full ${readOnly ? 'pointer-events-none' : 'touch-none cursor-crosshair'}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          aria-label={readOnly ? 'Teacher annotations' : 'Draw on student answer image'}
        >
          {renderedStrokes.map((stroke, index) => {
            const points = (stroke.points || []).map((point) => `${point.x * dimensions.width},${point.y * dimensions.height}`).join(' ');
            return <polyline key={index} points={points} fill="none" stroke={stroke.color || '#e11d48'} strokeWidth={stroke.width || 4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>}
      </div>
      {showZoom && <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={`${name || 'উত্তরের ছবি'} বড় করে দেখুন`} onClick={() => setShowZoom(false)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white" onClick={(event) => event.stopPropagation()}>
          <p className="min-w-0 truncate text-sm font-medium">{name || 'শিক্ষার্থীর উত্তরের ছবি'}</p>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg border border-white/30 px-3 py-1.5 text-sm" aria-label="ছোট করে দেখুন" disabled={zoomScale <= 1} onClick={() => setZoomScale((scale) => Math.max(1, scale - 0.25))}>−</button>
            <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoomScale * 100)}%</span>
            <button type="button" className="rounded-lg border border-white/30 px-3 py-1.5 text-sm" aria-label="বড় করে দেখুন" disabled={zoomScale >= 3} onClick={() => setZoomScale((scale) => Math.min(3, scale + 0.25))}>+</button>
            <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm" onClick={() => setShowZoom(false)}>বন্ধ করুন</button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto" onClick={(event) => event.stopPropagation()}>
          <div className="relative inline-block" style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}>
            <img src={src} alt={name || 'Student answer image'} className="block max-h-[calc(100vh-7rem)] max-w-[92vw] object-contain" />
            {hasDimensions && <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              {renderedStrokes.map((stroke, index) => {
                const points = (stroke.points || []).map((point) => `${point.x * dimensions.width},${point.y * dimensions.height}`).join(' ');
                return <polyline key={index} points={points} fill="none" stroke={stroke.color || '#e11d48'} strokeWidth={stroke.width || 4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
              })}
            </svg>}
          </div>
        </div>
      </div>}
    </div>
  );
}
