const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTeacherFeedbackMedia, MAX_MEDIA_FILE_BYTES, MAX_MEDIA_ITEMS } = require('./teacherFeedbackMedia');

const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.alloc(bytes, 1).toString('base64')}`;

test('accepts bounded image, audio, and video feedback media', () => {
  const result = validateTeacherFeedbackMedia([
    { name: 'marking.png', mime: 'image/png', data: dataUrl('image/png', 20) },
    { name: 'note.mp3', mime: 'audio/mpeg', data: dataUrl('audio/mpeg', 30) },
    { name: 'demo.mp4', mime: 'video/mp4', data: dataUrl('video/mp4', 40) },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.media.length, 3);
});

test('rejects unsupported MIME types and malformed data URLs', () => {
  assert.equal(validateTeacherFeedbackMedia([{ mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,PHN2Zz4=' }]).ok, false);
  assert.equal(validateTeacherFeedbackMedia([{ mime: 'image/jpeg', data: 'https://example.test/image.jpg' }]).ok, false);
});

test('rejects too many attachments and oversized individual files', () => {
  const image = { mime: 'image/png', data: dataUrl('image/png', 1) };
  assert.equal(validateTeacherFeedbackMedia(Array(MAX_MEDIA_ITEMS + 1).fill(image)).ok, false);
  assert.equal(validateTeacherFeedbackMedia([{ mime: 'video/mp4', data: dataUrl('video/mp4', MAX_MEDIA_FILE_BYTES + 1) }]).ok, false);
});

test('rejects aggregate attachment data beyond the bounded request budget', () => {
  const individuallyValid = { mime: 'image/png', data: dataUrl('image/png', 3_200_000) };
  assert.ok(individuallyValid.data.length < MAX_MEDIA_FILE_BYTES * 4 / 3 + 100);
  assert.equal(validateTeacherFeedbackMedia([individuallyValid, individuallyValid]).ok, false);
});
