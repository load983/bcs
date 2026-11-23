import React, { useRef, useState } from 'react';

export default function AnswerImageAnnotation({ src, name, strokes = [], onChange, readOnly = false }) {
  const imageRef = useRef(null);
  const activeRef = useRef(false);
  const drawingRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [drawing, setDrawing] = useState(null);
  const [color, setColor] = useState('#e11d48');

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
      const stroke = { color, width: 4, points: [point] };
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
        <button type="button" className="rounded-lg border px-2 py-1 text-xs dark:border-white/15 dark:text-gray-200" disabled={!strokes?.length} onClick={() => onChange?.((strokes || []).slice(0, -1))}>Undo</button>
        <button type="button" className="rounded-lg border px-2 py-1 text-xs text-red-600 dark:border-white/15" disabled={!strokes?.length} onClick={() => onChange?.([])}>সব মুছুন</button>
      </div>}
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
    </div>
  );
}
