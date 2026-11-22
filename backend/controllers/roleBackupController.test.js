const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const User = require('../models/User');
const Attempt = require('../models/Attempt');
const ExamFeedback = require('../models/ExamFeedback');
const controller = require('./roleBackupController');

const { studentBackupSignature, hasValidStudentBackupSignature } = controller._test;
const uid = '507f1f77bcf86cd799439012';
const secret = 'test-only-role-backup-signing-secret';
const originals = {
  findById: User.findById,
  attemptCreate: Attempt.create,
  feedbackCreate: ExamFeedback.create,
};

function makeManifest(data, signature = true) {
  const manifest = {
    format: 'fu-role-backup',
    version: 1,
    role: 'student',
    ownerId: uid,
    createdAt: '2026-11-22T00:00:00.000Z',
  };
  if (signature) manifest.signature = studentBackupSignature(manifest, JSON.stringify(data), secret);
  return manifest;
}

async function makeArchiveFile(manifest, data) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('data.json', JSON.stringify(data));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-student-backup-'));
  const filePath = path.join(folder, 'backup.zip');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(filePath, bytes);
  return { folder, filePath, size: bytes.length };
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const restoreData = () => ({
  profile: { name: 'Restored Student', roll: '12', password: '$2b$10$forged-hash' },
  classes: [{ _id: '507f1f77bcf86cd799439099' }],
  attempts: [{ _id: '507f1f77bcf86cd799439021', studentId: uid, obtainedMarks: 100, status: 'submitted' }],
  feedback: [{ _id: '507f1f77bcf86cd799439022', studentId: uid }],
});

async function restore(manifest, data) {
  const archive = await makeArchiveFile(manifest, data);
  const savedUser = {
    _id: uid,
    role: 'student',
    name: 'Current Name',
    roll: '1',
    password: 'current-password-hash',
    connectedClasses: ['507f1f77bcf86cd799439055'],
    async save() {},
  };
  User.findById = async () => savedUser;
  const created = { attempts: [], feedback: [] };
  Attempt.create = async (doc) => { created.attempts.push(doc); };
  ExamFeedback.create = async (doc) => { created.feedback.push(doc); };
  const res = response();
  try {
    await controller.restoreStudent({ file: { path: archive.filePath, size: archive.size }, user: { id: uid } }, res);
  } finally {
    fs.rmSync(archive.folder, { recursive: true, force: true });
  }
  return { res, savedUser, created };
}

test.after(() => {
  User.findById = originals.findById;
  Attempt.create = originals.attemptCreate;
  ExamFeedback.create = originals.feedbackCreate;
  delete process.env.ROLE_BACKUP_SIGNING_SECRET;
});

test('student backup signatures detect data and owner tampering', () => {
  const data = restoreData();
  const manifest = makeManifest(data);
  assert.equal(hasValidStudentBackupSignature(manifest, JSON.stringify(data), secret), true);
  assert.equal(hasValidStudentBackupSignature(manifest, JSON.stringify({ ...data, attempts: [] }), secret), false);
  assert.equal(hasValidStudentBackupSignature({ ...manifest, ownerId: '507f1f77bcf86cd799439013' }, JSON.stringify(data), secret), false);
  assert.equal(hasValidStudentBackupSignature({ ...manifest, signature: undefined }, JSON.stringify(data), secret), false);
});

test('unsigned legacy student backup restores profile only and cannot add results or class membership', async () => {
  process.env.ROLE_BACKUP_SIGNING_SECRET = secret;
  const data = restoreData();
  const { res, savedUser, created } = await restore(makeManifest(data, false), data);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.integrityVerified, false);
  assert.match(res.body.warning, /শুধু profile restore/);
  assert.equal(res.body.stats.skipped, 2);
  assert.equal(savedUser.name, 'Restored Student');
  assert.deepEqual(savedUser.connectedClasses, ['507f1f77bcf86cd799439055']);
  assert.equal(savedUser.password, 'current-password-hash');
  assert.equal(created.attempts.length, 0);
  assert.equal(created.feedback.length, 0);
});

test('valid signed student backup can restore owned results without restoring class enrollment', async () => {
  process.env.ROLE_BACKUP_SIGNING_SECRET = secret;
  const data = restoreData();
  const { res, savedUser, created } = await restore(makeManifest(data), data);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.integrityVerified, true);
  assert.equal(res.body.stats.attempts, 1);
  assert.equal(res.body.stats.feedback, 1);
  assert.deepEqual(savedUser.connectedClasses, ['507f1f77bcf86cd799439055']);
  assert.equal(created.attempts.length, 1);
  assert.equal(created.feedback.length, 1);
});

test('tampered signed student backup is rejected before changing account data', async () => {
  process.env.ROLE_BACKUP_SIGNING_SECRET = secret;
  const data = restoreData();
  const manifest = makeManifest(data);
  const changedData = { ...data, attempts: [{ ...data.attempts[0], obtainedMarks: 0 }] };
  const { res, savedUser, created } = await restore(manifest, changedData);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /signature/);
  assert.equal(savedUser.name, 'Current Name');
  assert.equal(created.attempts.length, 0);
  assert.equal(created.feedback.length, 0);
});
