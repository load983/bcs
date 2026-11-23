// ================== components/Timer.jsx ==================
// Live countdown timer — সময় শেষ হলে onTimeUp() কল করে (অটো সাবমিটের জন্য)
import React, { useEffect, useRef, useState } from 'react';

export default function Timer({ startedAt, deadlineAt, serverNow, clientReceivedAt, totalMinutes, onTimeUp, onThreeMinutes, label = 'Time remaining' }) {
  const endTime = useRef(null);
  const onTimeUpRef = useRef(onTimeUp);
  const onThreeMinutesRef = useRef(onThreeMinutes);
  const didFireRef = useRef(false);
  const didWarnRef = useRef(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => { onTimeUpRef.current = onTimeUp; }, [onTimeUp]);
  useEffect(() => { onThreeMinutesRef.current = onThreeMinutes; }, [onThreeMinutes]);

  useEffect(() => {
    if (!startedAt) return undefined;
    const fallbackDeadline = new Date(startedAt).getTime() + (Number(totalMinutes) || 0) * 60 * 1000;
    const parsedDeadline = deadlineAt ? new Date(deadlineAt).getTime() : fallbackDeadline;
    if (!Number.isFinite(parsedDeadline)) return undefined;
    endTime.current = parsedDeadline;
    didFireRef.current = false;
    didWarnRef.current = false;

    const parsedServerNow = serverNow ? new Date(serverNow).getTime() : NaN;
    const receivedAt = Number(clientReceivedAt);
    // Advance the server timestamp by time elapsed since the API response. This
    // remains correct across refreshes even if the device clock itself is skewed.
    const serverAtMount = Number.isFinite(parsedServerNow) && Number.isFinite(receivedAt)
      ? parsedServerNow + Math.max(0, Date.now() - receivedAt)
      : Date.now();
    const monotonicAtMount = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = () => {
      const monotonicNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = Math.max(0, monotonicNow - monotonicAtMount);
      const left = parsedDeadline - (serverAtMount + elapsed);
      if (left <= 0) {
        setRemaining(0);
        if (!didFireRef.current) {
          didFireRef.current = true;
          onTimeUpRef.current?.();
        }
      } else {
        setRemaining(left);
        if (left <= 3 * 60 * 1000 && !didWarnRef.current) {
          didWarnRef.current = true;
          onThreeMinutesRef.current?.();
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt, deadlineAt, serverNow, clientReceivedAt, totalMinutes]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const isCritical = remaining < 60000; // ১ মিনিটের কম থাকলে লাল
  const isWarning = !isCritical && remaining < 5 * 60000; // ৫ মিনিটের কম থাকলে অ্যাম্বার

  const cls = isCritical
    ? 'bg-red-100 text-red-700 animate-pulse dark:bg-red-500/10 dark:text-red-400'
    : isWarning
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
    : 'bg-primary-100 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300';

  return (
    <div role="timer" aria-label={label} className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${cls}`}>
      ⏱ {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  );
}
