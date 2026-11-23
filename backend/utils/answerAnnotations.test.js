const assert = require('node:assert/strict');
const test = require('node:test');
const { validateAnswerAnnotations } = require('./answerAnnotations');

test('valid normalized image strokes are preserved', () => {
  const result = validateAnswerAnnotations({
    0: [{ color: '#E11D48', width: 4, points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }] }],
  }, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.annotations['0'][0].points, [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }]);
  assert.equal(result.annotations['0'][0].color, '#e11d48');
});

test('invalid file index and coordinates are rejected', () => {
  assert.equal(validateAnswerAnnotations({ 1: [] }, 1).ok, false);
  assert.equal(validateAnswerAnnotations({ 0: [{ color: '#000000', width: 4, points: [{ x: 1.1, y: 0.5 }, { x: 0.5, y: 0.5 }] }] }, 1).ok, false);
});

test('annotation point and stroke limits are enforced', () => {
  const tooManyStrokes = Array.from({ length: 81 }, () => ({ color: '#000000', width: 4, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }));
  assert.equal(validateAnswerAnnotations({ 0: tooManyStrokes }, 1).ok, false);
  const tooManyPoints = Array.from({ length: 251 }, () => ({ x: 0.5, y: 0.5 }));
  assert.equal(validateAnswerAnnotations({ 0: [{ color: '#000000', width: 4, points: tooManyPoints }] }, 1).ok, false);
});
