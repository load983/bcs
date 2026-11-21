// ================== utils/chemSvg.js ==================
// SMILES → SVG (smiles-drawer, ব্রাউজারেই — কোনো বাইরের API নয়)।
//  • অণু:    "C1=CC=CC=C1"
//  • বিক্রিয়া: "বিক্রিয়ক>>উৎপাদ" (একাধিক অণু '.' দিয়ে); conditions = "তীরের ওপরে | তীরের নিচে"
// ফলাফল একটাই স্বয়ংসম্পূর্ণ SVG স্ট্রিং (সাদা ব্যাকগ্রাউন্ডসহ, যাতে ডার্ক থিমেও পড়া যায়)।
// SVG কখনো innerHTML-এ বসানো হয় না — <img src="data:image/svg+xml,..."> হিসেবে দেখানো হয়, তাই স্ক্রিপ্ট চলার সুযোগ নেই।
import * as SmilesDrawerModule from 'smiles-drawer';
import axiosClient from '../api/axiosClient';
import { applyAromaticCircles } from './ringCircle';

const NS = 'http://www.w3.org/2000/svg';
const FONT = "Arial, 'DejaVu Sans', 'Segoe UI Symbol', sans-serif";
const CELL = { w: 220, h: 180 }; // smiles-drawer-এর নিজস্ব ক্যানভাস
const DRAW_OPTS = {
  width: CELL.w,
  height: CELL.h,
  padding: 12,
  bondThickness: 1.4,
  bondLength: 22,
  compactDrawing: false,
  terminalCarbons: true, // CH₃ প্রান্তে লেখা থাকবে — পাঠ্যবইয়ের মতো
  fontSizeLarge: 8,
  fontSizeSmall: 5,
};
const SINGLE_BOX = { w: 260, h: 200 }; // একক অণুর চূড়ান্ত ছবির সীমা
const REACTION_H = 130; // বিক্রিয়ায় সবচেয়ে লম্বা অণুর উচ্চতা
const REACTION_MAX_W = 980;
const TIMEOUT_MS = 6000;

// ইম্পোর্টের ধরন (CJS/ESM/global) যাই হোক, SvgDrawer + parse আছে এমন অবজেক্টটি খুঁজে নেয়
const getSD = () => {
  const m = SmilesDrawerModule;
  const cands = [m && m.default, m, typeof window !== 'undefined' ? window.SmilesDrawer : null];
  const found = cands.find((c) => c && typeof c.SvgDrawer === 'function' && typeof c.parse === 'function');
  if (!found) throw new Error('smiles-drawer লোড হয়নি (npm install smiles-drawer চালিয়েছেন?)');
  return found;
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n) => Math.round(n * 100) / 100;

// একটি অণু আঁকা → { inner, vb:[x,y,w,h] }
function drawSpecies(SD, smiles, circle = false) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('আঁকতে অনেক সময় লাগছে')), TIMEOUT_MS);
    const done = (fn, v) => { clearTimeout(timer); fn(v); };
    try {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', String(CELL.w));
      svg.setAttribute('height', String(CELL.h));
      const drawer = new SD.SvgDrawer(DRAW_OPTS);
      SD.parse(
        smiles,
        (tree) => {
          try {
            const out = drawer.draw(tree, svg, 'light');
            const el = out && out.nodeType === 1 ? out : svg;
            if (circle) applyAromaticCircles(el); // বেনজিন রিংয়ে বৃত্ত
            const raw = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
            const okVb = raw.length === 4 && raw.every(Number.isFinite) && raw[2] > 0 && raw[3] > 0;
            const w = parseFloat(el.getAttribute('width')) || CELL.w;
            const h = parseFloat(el.getAttribute('height')) || CELL.h;
            done(resolve, { inner: el.innerHTML, vb: okVb ? raw : [0, 0, w, h] });
          } catch (e) { done(reject, e); }
        },
        (err) => done(reject, err instanceof Error ? err : new Error(`SMILES বোঝা যায়নি: ${smiles}`))
      );
    } catch (e) { done(reject, e); }
  });
}

// একাধিক অণু একই SVG-তে বসালে id (যেমন text-mask) ধাক্কা খায় — প্রতিটির id আলাদা করে দেওয়া
function uniquifyIds(inner, tag) {
  const ids = [...inner.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  let out = inner;
  [...new Set(ids)].forEach((id) => {
    const re = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\bid="${re}"`, 'g'), `id="${id}-${tag}"`)
      .replace(new RegExp(`url\\(\\s*#${re}\\s*\\)`, 'g'), `url(#${id}-${tag})`);
  });
  return out;
}

const nested = (sp, x, y, w, h) =>
  `<svg x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" viewBox="${sp.vb.map(num).join(' ')}" preserveAspectRatio="xMidYMid meet">${sp.inner}</svg>`;

const textEl = (x, y, size, str, extra = '') =>
  `<text x="${num(x)}" y="${num(y)}" font-family="${FONT}" font-size="${size}" text-anchor="middle" fill="#222"${extra}>${esc(str)}</text>`;

const wrap = (W, H, body) =>
  `<svg xmlns="${NS}" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}"><rect width="${num(W)}" height="${num(H)}" fill="#ffffff"/>${body}</svg>`;

async function buildMolecule(SD, smiles, circle) {
  const sp = await drawSpecies(SD, smiles, circle);
  const [, , vw, vh] = sp.vb;
  const k = Math.min(SINGLE_BOX.w / vw, SINGLE_BOX.h / vh, 6);
  const w = vw * k;
  const h = vh * k;
  const W = Math.max(w, 80) + 24;
  const H = Math.max(h, 60) + 24;
  return wrap(W, H, nested({ ...sp, inner: uniquifyIds(sp.inner, 'm0') }, (W - w) / 2, (H - h) / 2, w, h));
}

async function buildReaction(SD, smiles, conditions, circle) {
  const [left, right] = smiles.split('>>');
  const reactants = left.split('.').filter(Boolean);
  const products = (right || '').split('.').filter(Boolean);
  if (!reactants.length || !products.length) throw new Error('বিক্রিয়ার ফরম্যাট ভুল');
  const [above = '', below = ''] = String(conditions || '').split('|').map((s) => s.trim());

  const drawn = [];
  for (const s of [...reactants, ...products]) drawn.push(await drawSpecies(SD, s, circle)); // eslint-disable-line no-await-in-loop
  const nR = reactants.length;

  const PLUS = 26;
  const GAP = 8;
  const arrowLen = Math.min(300, Math.max(96, Math.max(above.length, below.length) * 5.7 + 28));

  const widthAt = (k) => drawn.reduce((a, s) => a + s.vb[2] * k, 0) + PLUS * (nR - 1) + PLUS * (products.length - 1) + arrowLen + GAP * 2 + 24;
  const maxH = Math.max(...drawn.map((s) => s.vb[3]));
  let k = REACTION_H / maxH;
  if (widthAt(k) > REACTION_MAX_W) k *= REACTION_MAX_W / widthAt(k);

  const H = Math.max(maxH * k, 70) + 70; // তীরের ওপর-নিচের লেখার জায়গা
  const midY = H / 2;
  let x = 12;
  const parts = [];

  const placeSpecies = (sp, idx) => {
    const w = sp.vb[2] * k;
    const h = sp.vb[3] * k;
    parts.push(nested({ ...sp, inner: uniquifyIds(sp.inner, `m${idx}`) }, x, midY - h / 2, w, h));
    x += w;
  };
  const placePlus = () => {
    parts.push(textEl(x + PLUS / 2, midY + 6, 20, '+'));
    x += PLUS;
  };

  drawn.slice(0, nR).forEach((sp, i) => { if (i) placePlus(); placeSpecies(sp, i); });

  x += GAP;
  const ax1 = x;
  const ax2 = x + arrowLen;
  parts.push(`<line x1="${num(ax1)}" y1="${num(midY)}" x2="${num(ax2 - 7)}" y2="${num(midY)}" stroke="#222" stroke-width="1.8"/>`);
  parts.push(`<polygon points="${num(ax2)},${num(midY)} ${num(ax2 - 11)},${num(midY - 5)} ${num(ax2 - 11)},${num(midY + 5)}" fill="#222"/>`);
  if (above) parts.push(textEl((ax1 + ax2) / 2, midY - 9, 11.5, above));
  if (below) parts.push(textEl((ax1 + ax2) / 2, midY + 19, 10.5, below));
  x = ax2 + GAP;

  drawn.slice(nR).forEach((sp, i) => { if (i) placePlus(); placeSpecies(sp, nR + i); });

  return wrap(x + 12, H, parts.join(''));
}

const cache = new Map();

// smiles (+ conditions) → SVG স্ট্রিং (ক্যাশ করা; ব্যর্থ হলে ক্যাশ থেকে সরে যায়, যাতে আবার চেষ্টা করা যায়)
export function renderSmilesSvg(smiles, conditions = '', { circle = false } = {}) {
  const s = String(smiles || '').trim();
  if (!s) return Promise.reject(new Error('SMILES ফাঁকা'));
  const key = `${s}|${conditions || ''}|${circle ? 'c' : ''}`;
  if (!cache.has(key)) {
    const p = (async () => {
      const SD = getSD();
      return s.includes('>>') ? buildReaction(SD, s, conditions, circle) : buildMolecule(SD, s, circle);
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

export const renderDiagramSvg = (item, opts) => renderSmilesSvg(item.smiles, item.conditions, opts);

export const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// সার্ভারে সংরক্ষণ → "/uploads/diagrams/<hash>.svg"
export async function saveDiagramSvg(svg) {
  const { data } = await axiosClient.post('/exams/chem-diagram', { svg });
  return data.url;
}
