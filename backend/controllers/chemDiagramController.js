// ================== controllers/chemDiagramController.js ==================
// কেমিস্ট্রি ডায়াগ্রামের SVG সংরক্ষণ: ব্রাউজারে smiles-drawer দিয়ে বানানো SVG এখানে আসে;
// সাদা-তালিকা দিয়ে ছেঁকে /uploads/diagrams/<hash>.svg হিসেবে রাখা হয় এবং URL ফেরত যায়।
// ফাইলের নাম কনটেন্টের হ্যাশ — একই ডায়াগ্রাম বারবার সেভ করলে একই ফাইল (ডুপ্লিকেট হয় না)।
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sanitizeSvg } = require('../utils/svgSanitize');

const dir = path.join(__dirname, '..', 'uploads', 'diagrams');

exports.saveSvg = async (req, res) => {
  try {
    const raw = req.body && req.body.svg;
    if (typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ message: 'SVG পাওয়া যায়নি' });
    }
    let clean;
    try {
      clean = sanitizeSvg(raw);
    } catch (e) {
      return res.status(400).json({ message: `এই SVG সংরক্ষণযোগ্য নয়: ${e.message}` });
    }
    await fs.promises.mkdir(dir, { recursive: true });
    const hash = crypto.createHash('sha256').update(clean).digest('hex').slice(0, 32);
    const file = path.join(dir, `${hash}.svg`);
    if (!fs.existsSync(file)) await fs.promises.writeFile(file, clean, 'utf8');
    res.status(201).json({ url: `/uploads/diagrams/${hash}.svg` });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ডায়াগ্রাম সংরক্ষণ করা যায়নি' });
  }
};
