const EDGE_GUARD_PX = 32;

export function clampWidgetPosition(x, y, width = window.innerWidth, height = window.innerHeight) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const minX = Math.min(50, (EDGE_GUARD_PX / safeWidth) * 100);
  const minY = Math.min(50, (EDGE_GUARD_PX / safeHeight) * 100);
  return {
    x: Math.min(100 - minX, Math.max(minX, Number(x) || minX)),
    y: Math.min(100 - minY, Math.max(minY, Number(y) || minY)),
  };
}

export function loadWidgetPosition(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return clampWidgetPosition(fallback.x, fallback.y);
    const parsed = JSON.parse(saved);
    if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return clampWidgetPosition(parsed.x, parsed.y);
    }
    // Migrate earlier builds that persisted only a vertical percentage.
    const oldY = Number(saved);
    return Number.isFinite(oldY) ? clampWidgetPosition(fallback.x, oldY) : clampWidgetPosition(fallback.x, fallback.y);
  } catch {
    return clampWidgetPosition(fallback.x, fallback.y);
  }
}

export function saveWidgetPosition(key, position) {
  try { localStorage.setItem(key, JSON.stringify(position)); } catch { /* storage may be unavailable */ }
}
