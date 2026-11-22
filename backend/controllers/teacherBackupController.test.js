const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const controller = require('./teacherBackupController');
const { sanitizeSvg } = require('../utils/svgSanitize');

const { restoredMediaLocation } = controller._test;

test('restored SVG diagrams are remapped to the public, sandboxed diagram route', () => {
  const location = restoredMediaLocation('.svg', 'teacher-1', 'restore-1', 'diagram.svg');
  assert.equal(location.url, '/uploads/diagrams/diagram.svg');
  assert.equal(path.basename(location.directory), 'diagrams');
});

test('restored non-SVG media remains scoped under the teacher backup directory', () => {
  const location = restoredMediaLocation('.png', 'teacher-1', 'restore-1', 'photo.png');
  assert.equal(location.url, '/uploads/teacher-backups/teacher-1/restore-1/photo.png');
  assert.equal(path.basename(location.directory), 'restore-1');
});

test('backup SVG sanitization keeps safe drawings and rejects active content', () => {
  const safe = sanitizeSvg('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  assert.match(safe, /<circle/);
  assert.throws(() => sanitizeSvg('<svg><script>alert(1)</script></svg>'), /অনুমোদিত নয়/);
});
