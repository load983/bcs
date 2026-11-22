const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Sequence = require('../models/Sequence');
const { allocateStudentRoll, isValidStudentRoll, normalizeStudentRoll } = require('./studentRoll');

test('allocates unique sequential rolls and skips an existing legacy roll', async () => {
  const originalFindOneAndUpdate = Sequence.findOneAndUpdate;
  const originalExists = User.exists;
  let value = 100000;
  Sequence.findOneAndUpdate = () => ({ lean: async () => ({ value: ++value }) });
  User.exists = async ({ roll }) => roll === '100001';
  try {
    const allocated = await Promise.all([allocateStudentRoll(), allocateStudentRoll()]);
    assert.deepEqual(allocated.sort(), ['100002', '100003']);
  } finally {
    Sequence.findOneAndUpdate = originalFindOneAndUpdate;
    User.exists = originalExists;
  }
});

test('normalizes Bengali digits and removes whitespace', () => {
  assert.equal(normalizeStudentRoll('  ১২ ৩৪৫  '), '12345');
  assert.equal(normalizeStudentRoll(undefined), '');
});

test('accepts only numeric rolls of 1 through 20 digits', () => {
  assert.equal(isValidStudentRoll('123456'), true);
  assert.equal(isValidStudentRoll('1'.repeat(20)), true);
  assert.equal(isValidStudentRoll(''), false);
  assert.equal(isValidStudentRoll('12A'), false);
  assert.equal(isValidStudentRoll('1'.repeat(21)), false);
});
