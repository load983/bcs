const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const controller = require('./attemptController');

const attemptId = '507f1f77bcf86cd799439011';
const studentId = '507f1f77bcf86cd799439012';
const otherStudentId = '507f1f77bcf86cd799439013';
const originalAttemptFindById = Attempt.findById;
const originalExamFindById = Exam.findById;

function response() {
  return {
    statusCode: 200,
    body: undefined,
    downloadPath: undefined,
    downloadName: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    download(filePath, filename) {
      this.downloadPath = filePath;
      this.downloadName = filename;
      return this;
    },
  };
}

function mockAttempt(attempt) {
  Attempt.findById = async () => attempt;
}

function mockExam(exam) {
  Exam.findById = () => ({
    async select() {
      return exam;
    },
  });
}

test.after(() => {
  Attempt.findById = originalAttemptFindById;
  Exam.findById = originalExamFindById;
});

test('student original source download enforces ownership, submission, and file checks', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-source-download-'));
  const sourcePath = path.join(tempDir, 'uploaded-source.pdf');
  fs.writeFileSync(sourcePath, 'test pdf');

  try {
    mockAttempt({ _id: attemptId, studentId, status: 'submitted', exam: 'exam-1' });
    mockExam({ title: 'Physics / Model Exam', sourcePdfPath: sourcePath });
    let res = response();
    await controller.downloadOriginalSourcePdf({ params: { attemptId }, user: { id: studentId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.downloadPath, sourcePath);
    assert.equal(res.downloadName, 'Physics Model Exam-original.pdf');

    mockAttempt({ _id: attemptId, studentId, status: 'in-progress', exam: 'exam-1' });
    res = response();
    await controller.downloadOriginalSourcePdf({ params: { attemptId }, user: { id: studentId } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'পরীক্ষা এখনো জমা হয়নি');

    mockAttempt({ _id: attemptId, studentId: otherStudentId, status: 'submitted', exam: 'exam-1' });
    res = response();
    await controller.downloadOriginalSourcePdf({ params: { attemptId }, user: { id: studentId } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, 'Attempt পাওয়া যায়নি');

    mockAttempt({ _id: attemptId, studentId, status: 'submitted', exam: 'exam-1' });
    mockExam({ title: 'Physics', sourcePdfPath: path.join(tempDir, 'missing.pdf') });
    res = response();
    await controller.downloadOriginalSourcePdf({ params: { attemptId }, user: { id: studentId } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, 'মূল আপলোড PDF ফাইলটি সার্ভারে খুঁজে পাওয়া যায়নি');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
