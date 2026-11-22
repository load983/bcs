// ================== models/Question.js ==================
// প্রতিটি প্রশ্ন এই স্কিমা অনুযায়ী সেভ হবে। PDF পার্স করার পর এখানে বাল্ক ইনসার্ট হয়।
const mongoose = require('mongoose');

const explanationMediaSchema = new mongoose.Schema({
  name: { type: String, maxlength: 180 },
  mime: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'] },
  data: { type: String, maxlength: 5_700_000 },
}, { _id: false });

const questionSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    questionText: { type: String, required: true },
    type: { type: String, enum: ['mcq', 'short'], default: 'mcq' },
    gradingRubric: { type: String, default: '', maxlength: 3000 },
    options: {
      type: [String], // ['অপশন A টেক্সট', 'অপশন B টেক্সট', ...]
      default: undefined,
      validate: { validator: function (v) { return this.type === 'short' || (Array.isArray(v) && v.length >= 2); }, message: 'MCQ প্রশ্নে কমপক্ষে দুটি অপশন প্রয়োজন' },
    },
    correctOptionIndex: { type: Number }, // 0=A, 1=B, 2=C, 3=D
    explanation: { type: String }, // ঐচ্ছিক — কেন এই উত্তরটা সঠিক তার ব্যাখ্যা
    questionAudio: { type: String, maxlength: 2_500_000 }, // প্রশ্নের recording (validated data URL)
    explanationAudio: { type: String, maxlength: 2_500_000 }, // ফলাফল প্রকাশের পর দেখানো ব্যাখ্যার recording
    explanationMedia: { type: [explanationMediaSchema], default: [] }, // ফলাফল প্রকাশের পর দেখানো ব্যাখ্যার ছবি/ভিডিও
    optionImages: { type: [String], default: undefined }, // ঐচ্ছিক — প্রতিটি অপশনের ছবি (options-এর সাথে একই ক্রমে; ফাঁকা = ছবি নেই)
    diagramSource: { type: String }, // ঐচ্ছিক — স্টুডিও প্রজেক্ট (JSON), যাতে পরে ডায়াগ্রাম আবার সম্পাদনা করা যায়; শিক্ষার্থীকে পাঠানো হয় না
    diagram: { type: String }, // ঐচ্ছিক — প্রশ্নের ডায়াগ্রাম/ছবি (/uploads/... পাথ)
    // ঐচ্ছিক — কেমিস্ট্রি ডায়াগ্রামের তালিকা (ChemistryDiagramPicker থেকে)। svg = /uploads/diagrams/<hash>.svg;
    // smiles/conditions রাখা হয় যাতে SVG ফাইল হারিয়ে গেলেও (যেমন ephemeral ডিস্কে) ক্লায়েন্টে আবার আঁকা যায়।
    diagrams: {
      type: [new mongoose.Schema({
        id: String,
        name: String,
        svg: String,
        smiles: String,
        conditions: String,
        equation: String,
      }, { _id: false })],
      default: undefined,
    },
    order: { type: Number, default: 0 }, // প্রশ্নের সিরিয়াল (Reorder এর জন্য)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
