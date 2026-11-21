// ================== controllers/diagramController.js ==================
// ডায়াগ্রাম লাইব্রেরি: তালিকা (শুধু থাম্বনেইল), একটি পূর্ণ ছবি আনা, সংরক্ষণ, নাম বদল, মুছে ফেলা — সবই শুধু নিজের ডায়াগ্রামের জন্য
const mongoose = require('mongoose');
const Diagram = require('../models/Diagram');

const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE = 1_500_000;
const MAX_THUMB = 60_000;
const MAX_SOURCE = 900_000;
const MAX_ITEMS = 100; // প্রতি শিক্ষকের লাইব্রেরির সীমা

const cleanName = (v) => String(v || '').trim().slice(0, 80);
const cleanSource = (v) => {
  if (typeof v !== 'string' || !v || v.length > MAX_SOURCE) return undefined;
  try { return Array.isArray(JSON.parse(v)) ? v : undefined; } catch (e) { return undefined; }
};
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.list = async (req, res) => {
  try {
    const items = await Diagram.find({ teacher: req.user.id })
      .select('name thumb createdAt source')
      .sort({ createdAt: -1 })
      .limit(MAX_ITEMS)
      .lean();
    res.json(items.map((d) => ({ id: d._id, name: d.name, thumb: d.thumb, editable: !!d.source, createdAt: d.createdAt })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    if (!validId(req.params.did)) return res.status(404).json({ message: 'ডায়াগ্রাম পাওয়া যায়নি' });
    const d = await Diagram.findOne({ _id: req.params.did, teacher: req.user.id }).lean();
    if (!d) return res.status(404).json({ message: 'ডায়াগ্রাম পাওয়া যায়নি' });
    res.json({ id: d._id, name: d.name, image: d.image, source: d.source || '' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { image, thumb, source, name } = req.body || {};
    if (typeof image !== 'string' || image.length > MAX_IMAGE || !IMG_RE.test(image)) {
      return res.status(400).json({ message: 'ছবিটি সংরক্ষণযোগ্য নয়' });
    }
    const t = typeof thumb === 'string' && thumb.length <= MAX_THUMB && IMG_RE.test(thumb) ? thumb : image.length <= MAX_THUMB ? image : '';

    const count = await Diagram.countDocuments({ teacher: req.user.id });
    if (count >= MAX_ITEMS) {
      return res.status(400).json({ message: `লাইব্রেরিতে সর্বোচ্চ ${MAX_ITEMS}টি ডায়াগ্রাম রাখা যায় — পুরনো কিছু মুছে ফেলুন` });
    }
    // একই ছবি বারবার সংরক্ষণ হলে নতুন কপি না বানিয়ে আগেরটিই ফেরত
    const dup = await Diagram.findOne({ teacher: req.user.id, image }).select('_id name');
    if (dup) return res.json({ id: dup._id, name: dup.name, duplicate: true });

    const d = await Diagram.create({ teacher: req.user.id, name: cleanName(name), image, thumb: t, source: cleanSource(source) });
    res.status(201).json({ id: d._id, name: d.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rename = async (req, res) => {
  try {
    if (!validId(req.params.did)) return res.status(404).json({ message: 'ডায়াগ্রাম পাওয়া যায়নি' });
    const d = await Diagram.findOneAndUpdate({ _id: req.params.did, teacher: req.user.id }, { name: cleanName(req.body?.name) }, { new: true }).select('name');
    if (!d) return res.status(404).json({ message: 'ডায়াগ্রাম পাওয়া যায়নি' });
    res.json({ id: d._id, name: d.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    if (!validId(req.params.did)) return res.status(404).json({ message: 'ডায়াগ্রাম পাওয়া যায়নি' });
    const r = await Diagram.deleteOne({ _id: req.params.did, teacher: req.user.id });
    if (!r.deletedCount) return res.status(404).json({ message: 'ডায়াগ্রাম পাওয়া যায়নি' });
    res.json({ message: 'ডায়াগ্রাম মুছে ফেলা হয়েছে' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
