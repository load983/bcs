const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMcqText, parseShortQuestionText } = require('./pdfParser');

test('parses MCQ answer keys written as Ans: (B) to', () => {
  const text = [
    '1. He is senior ______ me in service.',
    '(A) than (B) to',
    '(C) from (D) with',
    'Ans: (B) to',
  ].join('\n');
  const [question] = parseMcqText(text);
  assert.equal(question.questionText, 'He is senior ______ me in service.');
  assert.deepEqual(question.options, ['than', 'to', 'from', 'with']);
  assert.equal(question.correctOptionIndex, 1);
  assert.equal(question.explanation, undefined);
});

test('parses numbered Bengali and English short questions with wrapped lines', () => {
  const text = [
    'Short Questions',
    '১। বাংলাদেশের সংবিধানের মূলনীতি কয়টি?',
    'সংক্ষেপে চারটি মূলনীতি লিখুন।',
    'Question 2: Explain the importance of photosynthesis.',
    'Answer key',
    '1. This must not be imported.',
  ].join('\n');

  const questions = parseShortQuestionText(text);
  assert.equal(questions.length, 2);
  assert.deepEqual(questions.map((q) => q.type), ['short', 'short']);
  assert.equal(questions[0].questionText, 'বাংলাদেশের সংবিধানের মূলনীতি কয়টি? সংক্ষেপে চারটি মূলনীতি লিখুন।');
  assert.equal(questions[1].questionText, 'Explain the importance of photosynthesis.');
  assert.deepEqual(questions.map((q) => q.order), [0, 1]);
  assert.ok(questions.every((q) => !Object.hasOwn(q, 'options')));
});

test('parses Q-number and parenthesized short-question labels', () => {
  const questions = parseShortQuestionText('Q.3 Describe the water cycle.\n(4) Define evaporation.');
  assert.deepEqual(questions.map((q) => q.questionText), [
    'Describe the water cycle.',
    'Define evaporation.',
  ]);
});
