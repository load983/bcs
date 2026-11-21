// ================== utils/ringCircle.js ==================
// বেনজিন-জাতীয় ষড়ভুজ রিংয়ের ভেতরে বৃত্ত (⌬) আঁকা — পাঠ্যবইয়ের স্টাইল।
// smiles-drawer কেকুলে রূপে (বিকল্প দ্বিবন্ধন) আঁকে; এখানে আঁকা রেখাগুলো দেখে
//   ১) সব-কার্বন ষড়ভুজ রিং খুঁজে বের করা হয় (সব বন্ধন একই দৈর্ঘ্যের → হেটারো-অ্যাটমের রিং বাদ),
//   ২) রিংয়ের ভেতরের ছোট দ্বিবন্ধন-রেখাগুলো সরিয়ে ফেলা হয়,
//   ৩) রিংয়ের কেন্দ্রে একটি বৃত্ত বসানো হয়।
// কিছু না মিললে বা কোনো ভুল হলে ছবি অপরিবর্তিত থাকে।

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// lines: [{x1,y1,x2,y2}] → { circles:[{cx,cy,r}], drop:Set<index> }
export function findAromaticCircles(lines) {
  const out = { circles: [], drop: new Set() };
  const len = lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
  if (lines.length < 6) return out;

  // সাধারণ বন্ধন-দৈর্ঘ্য L = সবচেয়ে বেশিবার আসা দৈর্ঘ্য (সমান হলে বড়টা)
  const tally = new Map();
  len.forEach((v) => { if (v > 1) { const k = Math.round(v * 2) / 2; tally.set(k, (tally.get(k) || 0) + 1); } });
  let L = 0; let best = 0;
  tally.forEach((c, k) => { if (c > best || (c === best && k > L)) { best = c; L = k; } });
  if (!L) return out;

  // মূল বন্ধন-রেখা (পুরো দৈর্ঘ্যের) → গ্রাফ
  const nodes = [];
  const nodeOf = (p) => {
    let i = nodes.findIndex((n) => dist(n, p) < 0.18 * L);
    if (i < 0) { nodes.push({ x: p.x, y: p.y }); i = nodes.length - 1; }
    return i;
  };
  const adj = new Map();
  const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const mainEdges = new Set();
  lines.forEach((l, idx) => {
    if (Math.abs(len[idx] - L) > 0.1 * L) return;
    const a = nodeOf({ x: l.x1, y: l.y1 });
    const b = nodeOf({ x: l.x2, y: l.y2 });
    if (a === b) return;
    mainEdges.add(edgeKey(a, b));
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b); adj.get(b).add(a);
  });

  // ৬-সদস্যের চক্র খোঁজা
  const seen = new Set();
  const rings = [];
  const walk = (start, path) => {
    const last = path[path.length - 1];
    if (path.length === 6) {
      if (adj.get(last).has(start)) {
        const key = [...path].sort((x, y) => x - y).join(',');
        if (!seen.has(key)) { seen.add(key); rings.push([...path]); }
      }
      return;
    }
    (adj.get(last) || []).forEach((n) => { if (n > start && !path.includes(n)) walk(start, [...path, n]); });
  };
  [...adj.keys()].forEach((s) => walk(s, [s]));

  const cands = [];
  rings.forEach((r) => {
    const pts = r.map((i) => nodes[i]);
    const c = { x: pts.reduce((a, p) => a + p.x, 0) / 6, y: pts.reduce((a, p) => a + p.y, 0) / 6 };
    if (pts.some((p) => Math.abs(dist(p, c) - L) > 0.18 * L)) return; // নিয়মিত ষড়ভুজ নয় (যেমন বিকৃত রিং)
    // ভেতরের ছোট রেখা: মূল বন্ধন নয়, মাঝবিন্দু কেন্দ্রের কাছাকাছি
    const inner = [];
    lines.forEach((l, idx) => {
      if (Math.abs(len[idx] - L) <= 0.1 * L || len[idx] < 0.3 * L) return;
      const m = { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
      const d = dist(m, c);
      if (d >= 0.42 * L && d <= 0.8 * L) inner.push(idx);
    });
    cands.push({ r, c, inner, edges: r.map((v, i) => edgeKey(v, r[(i + 1) % 6])) });
  });

  // একটি রিং অ্যারোমেটিক ধরা হবে: ভেতরে ≥৩টি দ্বিবন্ধন-রেখা, অথবা ≥২টি এবং পাশের (শেয়ার্ড বন্ধন) রিংয়েরও ≥২টি
  const strong = (x) => x.inner.length >= 2;
  const ok = cands.filter((x) => x.inner.length >= 3
    || (x.inner.length >= 2 && cands.some((y) => y !== x && strong(y) && y.edges.some((e) => x.edges.includes(e)))));
  ok.forEach((x) => {
    out.circles.push({ cx: x.c.x, cy: x.c.y, r: 0.5 * L });
    x.inner.forEach((i) => out.drop.add(i));
  });
  return out;
}

// বাস্তব SVG ডম-এলিমেন্টের ওপর প্রয়োগ (in-place)
export function applyAromaticCircles(svgEl) {
  try {
    const els = [...svgEl.querySelectorAll('line')];
    const lines = els.map((e) => ({
      x1: parseFloat(e.getAttribute('x1')), y1: parseFloat(e.getAttribute('y1')),
      x2: parseFloat(e.getAttribute('x2')), y2: parseFloat(e.getAttribute('y2')),
    }));
    if (lines.some((l) => [l.x1, l.y1, l.x2, l.y2].some((v) => !Number.isFinite(v)))) return;
    const { circles, drop } = findAromaticCircles(lines);
    if (!circles.length) return;
    const style = els[0].getAttribute('style') || '';
    const stroke = (/stroke:\s*([^;]+)/.exec(style) || [])[1] || els[0].getAttribute('stroke') || '#222222';
    const sw = (/stroke-width:\s*([^;]+)/.exec(style) || [])[1] || els[0].getAttribute('stroke-width') || '1.4';
    const parent = els[0].parentNode;
    drop.forEach((i) => els[i].parentNode && els[i].parentNode.removeChild(els[i]));
    circles.forEach((c) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      n.setAttribute('cx', c.cx.toFixed(2)); n.setAttribute('cy', c.cy.toFixed(2)); n.setAttribute('r', c.r.toFixed(2));
      n.setAttribute('fill', 'none'); n.setAttribute('stroke', stroke.trim()); n.setAttribute('stroke-width', String(sw).trim());
      parent.appendChild(n);
    });
  } catch (e) { /* ছবি যেমন ছিল তেমনই থাকবে */ }
}
