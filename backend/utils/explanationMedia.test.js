const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateExplanationMedia,
  MAX_EXPLANATION_MEDIA_FILE_BYTES,
  MAX_EXPLANATION_MEDIA_ITEMS,
} = require('./explanationMedia');

const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.alloc(bytes, 2).toString('base64')}`;

test('accepts bounded explanation images and videos', () => {
  const result = validateExplanationMedia([
    { name: 'diagram.png', mime: 'image/png', data: dataUrl('image/png', 20) },
    { name: 'walkthrough.mp4', mime: 'video/mp4', data: dataUrl('video/mp4', 30) },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.media.length, 2);
});

test('rejects audio, unsupported MIME types, and malformed data URLs', () => {
  assert.equal(validateExplanationMedia([{ mime: 'audio/mpeg', data: dataUrl('audio/mpeg', 10) }]).ok, false);
  assert.equal(validateExplanationMedia([{ mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,PHN2Zz4=' }]).ok, false);
  assert.equal(validateExplanationMedia([{ mime: 'image/jpeg', data: 'https://example.test/image.jpg' }]).ok, false);
});

test('rejects too many attachments and oversized individual files', () => {
  const image = { mime: 'image/png', data: dataUrl('image/png', 1) };
  assert.equal(validateExplanationMedia(Array(MAX_EXPLANATION_MEDIA_ITEMS + 1).fill(image)).ok, false);
  assert.equal(validateExplanationMedia([{ mime: 'video/mp4', data: dataUrl('video/mp4', MAX_EXPLANATION_MEDIA_FILE_BYTES + 1) }]).ok, false);
});

test('rejects aggregate attachment data beyond the request budget', () => {
  const image = { mime: 'image/png', data: dataUrl('image/png', 3_200_000) };
  assert.equal(validateExplanationMedia([image, image]).ok, false);
});
