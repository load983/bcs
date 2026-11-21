// ================== utils/imageCompact.js ==================
// ছবি প্রসেসিং: লোড, ফাঁকা সাদা অংশ ছাঁটা, ছোট করে data URL বানানো (প্রশ্ন/অপশনের ছবির জন্য)

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load'));
    img.src = src;
  });

export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read'));
    r.readAsDataURL(file);
  });

// চারপাশের ফাঁকা সাদা অংশ কেটে ফেলা — স্টুডিওর বড় ক্যানভাসে ছোট ডায়াগ্রাম থাকলে ছবি বড় ও স্পষ্ট হয়
export const trimWhite = (img, pad = 28) => {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 10 && (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img; // পুরো ফাঁকা — যেমন আছে তেমন
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
};

// ছবি (বা ক্যানভাস) → data URL; max px ও দৈর্ঘ্যের সীমার ভেতরে না এলে ধাপে ধাপে ছোট করে
export const compactImage = (source, { max = 1800, limit = 1_400_000 } = {}) => {
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  let m = max;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const k = Math.min(1, m / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k));
    cv.height = Math.max(1, Math.round(h * k));
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, 0, 0, cv.width, cv.height);
    let out = cv.toDataURL('image/png');
    if (out.length > limit) out = cv.toDataURL('image/jpeg', 0.93);
    if (out.length <= limit) return out;
    m = Math.round(m * 0.8);
  }
  throw new Error('big');
};
