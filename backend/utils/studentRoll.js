const User = require('../models/User');
const Sequence = require('../models/Sequence');

function normalizeStudentRoll(value) {
  return String(value ?? '').trim()
    .replace(/[০-৯]/g, (digit) => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
    .replace(/\s+/g, '');
}

function isValidStudentRoll(value) {
  return /^\d{1,20}$/.test(String(value || ''));
}

async function allocateStudentRoll() {
  let roll;
  do {
    let sequence;
    while (!sequence) {
      try {
        sequence = await Sequence.findOneAndUpdate(
          { _id: 'user-roll' },
          { $inc: { value: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        ).lean();
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    roll = String(Math.max(100001, Number(sequence.value) || 100001));
  } while (await User.exists({ roll }));
  return roll;
}

module.exports = { allocateStudentRoll, isValidStudentRoll, normalizeStudentRoll };
