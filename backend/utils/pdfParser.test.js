const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMcqText } = require('./pdfParser');

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
