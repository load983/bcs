// ================== models/Diagram.js ==================
// শিক্ষকের ডায়াগ্রাম লাইব্রেরি: একবার আঁকা/সংরক্ষিত ডায়াগ্রাম পরের প্রশ্ন বা পরীক্ষায় আবার ব্যবহার করা যায়।
const mongoose = require('mongoose');

const diagramSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, default: '', maxlength: 80 },
    image: { type: String, required: true }, // data URL (পূর্ণ ছবি)
    thumb: { type: String, default: '' }, // ছোট থাম্বনেইল data URL (তালিকা দ্রুত লোডের জন্য)
    source: { type: String }, // ঐচ্ছিক — স্টুডিও প্রজেক্ট (JSON), সম্পাদনার জন্য
  },
  { timestamps: true }
);

module.exports = mongoose.model('Diagram', diagramSchema);
