const mongoose = require('mongoose');

const examFeedbackSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true, unique: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentName: { type: String, required: true, maxlength: 120 },
    studentRoll: { type: String, required: true, maxlength: 80 },
    body: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true }
);

examFeedbackSchema.index({ exam: 1, createdAt: -1 });

module.exports = mongoose.model('ExamFeedback', examFeedbackSchema);
