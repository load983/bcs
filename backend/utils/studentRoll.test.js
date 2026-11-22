const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Sequence = require('../models/Sequence');
const { allocateStudentRoll } = require('./studentRoll');

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
