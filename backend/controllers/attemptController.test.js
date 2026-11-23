const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const controller = require('./attemptController');

const attemptId = '507f1f77bcf86cd799439011';
const studentId = '507f1f77bcf86cd799439012';
const otherStudentId = '507f1f77bcf86cd799439013';
const originalAttemptFindById = Attempt.findById;
const originalAttemptFindOneAndUpdate = Attempt.findOneAndUpdate;
const originalExamFindById = Exam.findById;
const originalQuestionFind = Question.find;
const originalQuestionFindById = Question.findById;

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
  Attempt.findOneAndUpdate = originalAttemptFindOneAndUpdate;
  Exam.findById = originalExamFindById;
  Question.find = originalQuestionFind;
  Question.findById = originalQuestionFindById;
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

test('saveAnswer rejects answers after the exam schedule end even when attempt time remains', async () => {
  const questionId = '507f1f77bcf86cd799439014';
  const now = Date.now();
  mockAttempt({
    _id: attemptId,
    studentId,
    exam: 'exam-1',
    status: 'in-progress',
    startedAt: new Date(now - 1000),
    questionOrder: [questionId],
    answers: [],
    optionOrderMap: { [questionId]: [0, 1] },
  });
  mockExam({ settings: { totalTimeMinutes: 30, schedule: { enabled: true, endAt: new Date(now - 1000) } } });
  let persisted = false;
  Attempt.findOneAndUpdate = async () => { persisted = true; return {}; };
  const res = response();

  await controller.saveAnswer({
    params: { attemptId },
    user: { id: studentId },
    body: { questionId, selectedOptionIndex: 0 },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(persisted, false);
});

test('submit counts only unanswered short questions as skipped', async () => {
  const answeredId = '507f1f77bcf86cd799439014';
  const blankId = '507f1f77bcf86cd799439015';
  const attempt = {
    _id: attemptId,
    studentId,
    exam: 'exam-short',
    status: 'in-progress',
    submittedAt: undefined,
    startedAt: new Date(Date.now() - 1000),
    questionOrder: [answeredId, blankId],
    answers: [{ question: answeredId, answerText: '', answerFiles: [{ name: 'answer.pdf', mime: 'application/pdf', data: 'data:application/pdf;base64,QQ==' }], selectedOptionIndex: null }],
    __v: 0,
  };
  const exam = { _id: 'exam-short', settings: { totalTimeMinutes: 30, marksPerQuestion: 2, questionType: 'short', showResultInstantly: false } };
  const shortQuestions = [{ _id: answeredId, type: 'short', options: undefined }, { _id: blankId, type: 'short', options: undefined }];
  Attempt.findById = async () => attempt;
  Exam.findById = async () => exam;
  Question.find = async () => shortQuestions;
  Attempt.findOneAndUpdate = async (query, update) => {
    Object.assign(attempt, update.$set);
    if (update.$inc) attempt.__v += update.$inc.__v;
    return attempt;
  };

  const res = response();
  await controller.submitAttempt({ params: { attemptId }, user: { id: studentId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(attempt.totalSkipped, 1);
  assert.equal(attempt.totalCorrect, 0);
  assert.equal(attempt.totalWrong, 0);
  assert.equal(attempt.status, 'submitted');
});

test('released short-answer review is returned as answered and includes teacher marks and annotations', async () => {
  const questionId = '507f1f77bcf86cd799439014';
  const attempt = {
    _id: attemptId,
    studentId,
    exam: 'exam-short',
    status: 'submitted',
    questionOrder: [questionId],
    answers: [{
      question: questionId,
      answerText: 'Written answer',
      answerFiles: [{ name: 'answer.jpg', mime: 'image/jpeg', data: 'data:image/jpeg;base64,QQ==' }],
      annotations: { 0: [{ color: '#e11d48', width: 4, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }] },
      marksAwarded: 1.5,
      reviewed: true,
      selectedOptionIndex: null,
    }],
  };
  const exam = { title: 'Short exam', settings: { questionType: 'short', showResultInstantly: true } };
  const question = { _id: questionId, type: 'short', questionText: 'Explain', options: undefined, gradingRubric: 'Key point', gradingRubricAudio: 'data:audio/webm;base64,QQ==' };
  const query = {
    select() { return this; },
    lean() { return this; },
    then(resolve, reject) { return Promise.resolve([question]).then(resolve, reject); },
  };
  Attempt.findById = async () => attempt;
  Exam.findById = async () => exam;
  Question.find = () => query;

  const res = response();
  await controller.getAttemptReview({ params: { attemptId }, user: { id: studentId } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.items[0].status, 'answered');
  assert.equal(res.body.items[0].marksAwarded, 1.5);
  assert.equal(res.body.items[0].answerText, 'Written answer');
  assert.equal(res.body.items[0].annotations['0'][0].points.length, 2);
  assert.equal(res.body.items[0].gradingRubricAudio, question.gradingRubricAudio);

  attempt.answers[0].reviewed = false;
  const locked = response();
  await controller.getAttemptReview({ params: { attemptId }, user: { id: studentId } }, locked);
  assert.equal(locked.statusCode, 403);
});

test('short answer autosave can update a prior draft and rejects invalid file data URLs', async () => {
  const questionId = '507f1f77bcf86cd799439014';
  const attempt = {
    _id: attemptId,
    studentId,
    exam: 'exam-short',
    status: 'in-progress',
    startedAt: new Date(Date.now() - 1000),
    questionOrder: [questionId],
    answers: [{ question: questionId, answerText: 'Old draft', answerFiles: [], selectedOptionIndex: null }],
    __v: 0,
  };
  mockAttempt(attempt);
  mockExam({ settings: { totalTimeMinutes: 30, questionType: 'short' } });
  Question.findById = () => ({ select: async () => ({ _id: questionId, type: 'short', options: undefined }) });
  Attempt.findOneAndUpdate = async (_filter, update) => {
    attempt.answers = update.$set.answers;
    attempt.__v += update.$inc.__v;
    return attempt;
  };

  let res = response();
  await controller.saveAnswer({
    params: { attemptId },
    user: { id: studentId },
    body: { questionId, selectedOptionIndex: null, answerText: 'Edited draft', answerFiles: [] },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(attempt.answers[0].answerText, 'Edited draft');

  res = response();
  await controller.saveAnswer({
    params: { attemptId },
    user: { id: studentId },
    body: { questionId, selectedOptionIndex: null, answerText: 'Edited draft', answerFiles: [{ name: 'bad.pdf', mime: 'application/pdf', data: 'data:text/html;base64,QQ==' }] },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /format/);
});
