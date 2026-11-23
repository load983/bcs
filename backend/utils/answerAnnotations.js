const MAX_STROKES_PER_IMAGE = 80;
const MAX_POINTS_PER_STROKE = 250;
const MAX_POINTS_PER_ANSWER = 12000;

function validateAnswerAnnotations(input, fileCount) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'ছবির annotation data সঠিক নয়' };
  }

  const annotations = {};
  let totalPoints = 0;
  for (const [rawIndex, rawStrokes] of Object.entries(input)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= fileCount || !Array.isArray(rawStrokes) || rawStrokes.length > MAX_STROKES_PER_IMAGE) {
      return { ok: false, message: 'ছবির annotation data সঠিক নয়' };
    }
    const strokes = [];
    for (const stroke of rawStrokes) {
      const color = String(stroke?.color || '').toLowerCase();
      const width = Number(stroke?.width);
      const points = stroke?.points;
      if (!/^#[0-9a-f]{6}$/.test(color) || !Number.isFinite(width) || width < 1 || width > 24
        || !Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS_PER_STROKE) {
        return { ok: false, message: 'ছবির annotation data সঠিক নয়' };
      }
      totalPoints += points.length;
      if (totalPoints > MAX_POINTS_PER_ANSWER) return { ok: false, message: 'ছবির annotation data অনেক বড়' };
      const safePoints = [];
      for (const point of points) {
        const x = Number(point?.x);
        const y = Number(point?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
          return { ok: false, message: 'ছবির annotation-এর coordinate সঠিক নয়' };
        }
        safePoints.push({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
      }
      strokes.push({ color, width: Math.round(width * 10) / 10, points: safePoints });
    }
    annotations[String(index)] = strokes;
  }
  return { ok: true, annotations };
}

module.exports = { validateAnswerAnnotations };
