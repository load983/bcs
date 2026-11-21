const mongoose = require('mongoose');

const sequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: Number, required: true, default: 100000 },
}, { versionKey: false });

module.exports = mongoose.model('Sequence', sequenceSchema);
