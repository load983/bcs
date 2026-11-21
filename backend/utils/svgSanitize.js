// ================== utils/svgSanitize.js ==================
// শিক্ষকের পাঠানো SVG সার্ভারে সংরক্ষণের আগে "সাদা-তালিকা" (whitelist) দিয়ে ছেঁকে নেওয়া হয়।
// শুধু আঁকার নিরীহ ট্যাগ/অ্যাট্রিবিউট থাকবে — স্ক্রিপ্ট, ইভেন্ট হ্যান্ডলার, বাইরের লিংক/ছবি, DOCTYPE/ENTITY কিছুই নয়।
// অনুমোদিত নয় এমন ট্যাগ পেলে পুরো SVG বাতিল (throw); অনুমোদিত নয় এমন অ্যাট্রিবিউট চুপচাপ বাদ।
// ফেরত আসে: পরিষ্কার করে নতুন করে সাজানো SVG স্ট্রিং।

const MAX_BYTES = 400 * 1024;
const MAX_NODES = 20000;
const MAX_DEPTH = 14;

// কেস-ইনসেনসিটিভ নাম → SVG-র সঠিক নাম
const TAGS = {
  svg: 'svg', g: 'g', defs: 'defs', mask: 'mask', clippath: 'clipPath', rect: 'rect', line: 'line', path: 'path',
  circle: 'circle', ellipse: 'ellipse', polygon: 'polygon', polyline: 'polyline', text: 'text', tspan: 'tspan',
  style: 'style', title: 'title', desc: 'desc',
};
const TEXT_TAGS = new Set(['text', 'tspan', 'title', 'desc', 'style']);

const ATTRS = {};
[
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-opacity', 'fill-opacity', 'opacity', 'fill-rule', 'clip-rule', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'dx', 'dy', 'baseline-shift', 'letter-spacing',
  'class', 'id', 'viewBox', 'preserveAspectRatio', 'mask', 'clip-path', 'style', 'maskUnits', 'maskContentUnits',
  'clipPathUnits', 'vector-effect', 'shape-rendering', 'text-rendering', 'visibility', 'display', 'xmlns', 'version',
  'baseProfile', 'xml:space',
].forEach((a) => { ATTRS[a.toLowerCase()] = a; });

const TAG_RE = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[^\s=\/>"']+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTR_RE = /([^\s=\/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const escText = (s) => s.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// url(...) শুধু ডকুমেন্টের ভেতরের রেফারেন্স (url(#id)) হতে পারবে
const urlsOk = (v) => {
  const found = v.match(/url\s*\(/gi);
  if (!found) return true;
  const good = v.match(/url\(\s*#[\w.-]+\s*\)/gi) || [];
  return good.length === found.length;
};

const safeValue = (name, raw) => {
  // XML সত্তা (&…;) আগে ডিকোড করে যাচাই — যাতে "java&#115;cript:" জাতীয় লুকোনো কৌশল ধরা পড়ে
  const v = raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10) || 32))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (v.length > 4000) return null;
  if (/[<>]/.test(v)) return null;
  if (/javascript:|data:|vbscript:|expression\s*\(|@import|behavior\s*:|-moz-binding/i.test(v)) return null;
  if (!urlsOk(v)) return null;
  const n = name.toLowerCase();
  if (n === 'xmlns') return v === 'http://www.w3.org/2000/svg' ? v : null;
  if (n === 'class' || n === 'id') return /^[\w\s.-]+$/.test(v) ? v : null;
  return v;
};

const safeCss = (css) => {
  if (css.length > 6000) throw new Error('style অংশ অনেক বড়');
  if (/@import|url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|\\/i.test(css)) throw new Error('style-এ অনুমোদিত নয় এমন কিছু আছে');
  return css;
};

function sanitizeSvg(input) {
  if (typeof input !== 'string') throw new Error('SVG টেক্সট নয়');
  if (Buffer.byteLength(input, 'utf8') > MAX_BYTES) throw new Error('SVG অনেক বড়');

  const src = input.replace(/^\uFEFF/, '');
  const out = [];
  const stack = [];
  let i = 0;
  let nodes = 0;
  let rootSeen = false;
  let rootClosed = false;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const textEnd = lt === -1 ? src.length : lt;
    if (textEnd > i) {
      const text = src.slice(i, textEnd);
      const top = stack[stack.length - 1];
      if (text.trim()) {
        if (top && TEXT_TAGS.has(top.lower)) {
          out.push(escText(top.lower === 'style' ? safeCss(text) : text));
        } // অন্য কোথাও ফালতু লেখা — বাদ
      }
    }
    if (lt === -1) break;

    if (src.startsWith('<!--', lt)) { // মন্তব্য — বাদ
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('অসম্পূর্ণ মন্তব্য');
      i = end + 3; continue;
    }
    if (src.startsWith('<?', lt)) { // xml ঘোষণা — বাদ
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) throw new Error('অসম্পূর্ণ ঘোষণা');
      i = end + 2; continue;
    }
    if (src.startsWith('<!', lt)) throw new Error('DOCTYPE/ENTITY/CDATA অনুমোদিত নয়');

    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m) throw new Error('ট্যাগ বোঝা যায়নি');
    i = TAG_RE.lastIndex;
    const closing = m[1] === '/';
    const lower = m[2].toLowerCase();
    const selfClose = m[4] === '/';
    const canon = TAGS[lower];
    if (!canon) throw new Error(`<${m[2]}> ট্যাগ অনুমোদিত নয়`);

    if (closing) {
      const top = stack.pop();
      if (!top || top.lower !== lower) throw new Error('ট্যাগ ঠিকমতো বন্ধ হয়নি');
      out.push(`</${canon}>`);
      if (!stack.length) rootClosed = true;
      continue;
    }

    if (rootClosed) throw new Error('রুটের পরে বাড়তি কনটেন্ট');
    if (!stack.length) {
      if (lower !== 'svg' || rootSeen) throw new Error('রুট <svg> হতে হবে');
      rootSeen = true;
    }
    nodes += 1;
    if (nodes > MAX_NODES) throw new Error('SVG অতিরিক্ত জটিল');
    if (stack.length >= MAX_DEPTH) throw new Error('SVG অতিরিক্ত গভীর');

    const attrs = [];
    const seen = new Set();
    let a;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(m[3] || '')) !== null) {
      const canonName = ATTRS[a[1].toLowerCase()];
      if (!canonName || seen.has(canonName)) continue; // অজানা/ডুপ্লিকেট অ্যাট্রিবিউট বাদ
      const val = safeValue(canonName, a[2] !== undefined ? a[2] : a[3]);
      if (val === null) {
        if (canonName.toLowerCase() === 'xmlns') continue;
        throw new Error(`"${canonName}" অ্যাট্রিবিউটের মান অনুমোদিত নয়`);
      }
      seen.add(canonName);
      attrs.push(`${canonName}="${escAttr(val)}"`);
    }
    if (!stack.length && !seen.has('xmlns')) attrs.unshift('xmlns="http://www.w3.org/2000/svg"');

    out.push(`<${canon}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClose ? '/>' : '>'}`);
    if (selfClose) {
      if (!stack.length) rootClosed = true;
    } else {
      stack.push({ lower });
    }
  }

  if (!rootSeen) throw new Error('<svg> পাওয়া যায়নি');
  if (stack.length) throw new Error('SVG অসম্পূর্ণ');
  return out.join('');
}

module.exports = { sanitizeSvg };
