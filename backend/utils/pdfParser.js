// ================== utils/pdfParser.js ==================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pdfParse = require('pdf-parse');
const { layoutPageRender } = require('./pdfLayout');
const { unicodeScriptsToSentinels, sentinelsToLatex, UP_O, UP_C, DN_O, DN_C } = require('./mathText');

/**
 * UTF-8 টেক্সট ক্লিন এবং নরমালাইজ করার ফাংশন
 */
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')                 // অনুপস্থিত গ্লিফ থেকে আসা NUL অক্ষর
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // জিরো-উইডথ স্পেস সরানো
    .replace(/\u2021/g, '')              // ‡ (এনকোডিং ভুলে আসা বাজে চিহ্ন) — '=' ও '7' আর মোছা হয় না, কারণ সূত্র ও সংখ্যা নষ্ট হতো
    .replace(/\s+/g, ' ')                // একাধিক স্পেস ক্লিন করা
    .trim();
}

/**
 * PDF থেকে টেক্সট এক্সট্র্যাক্ট করার মূল ফাংশন (File path বা Buffer দুটোই সাপোর্ট করবে)
 */
async function extractQuestionsFromPdf(pdfSource, questionType = 'mcq') {
  let dataBuffer;

  if (Buffer.isBuffer(pdfSource)) {
    dataBuffer = pdfSource;
  } else if (typeof pdfSource === 'string') {
    dataBuffer = fs.readFileSync(pdfSource);
  } else {
    throw new Error('অবৈধ PDF সোর্স দেওয়া হয়েছে');
  }

  let rawText;
  let rawOrderText = null;
  const tmp = path.join(os.tmpdir(), `mcq-import-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, dataBuffer);
  try {
    // Embedded raster image থাকলে পুরনো pdf.js-এর Image crash এড়িয়ে Poppler ব্যবহার করি।
    const imageList = execFileSync('pdfimages', ['-list', tmp], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const hasRasterImage = /\n\s*\d+\s+\d+\s+image\s+/i.test(imageList);
    if (!hasRasterImage) {
      // সাধারণ PDF-এ সাব/সুপারস্ক্রিপ্ট ও ভগ্নাংশ ধরার জন্য layout-aware পাঠ।
      rawText = (await pdfParse(dataBuffer, { pagerender: layoutPageRender })).text;
    } else {
      rawText = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    }
    try {
      // Three-column MCQ sheets can be misread by layout-aware extraction.
      rawOrderText = execFileSync('pdftotext', ['-raw', tmp, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    } catch (rawError) {
      if (rawError.code !== 'ENOENT') console.warn('Raw PDF text extraction skipped:', rawError.message);
    }
  } catch (e) {
    // PDF.js/ফন্ট/চিত্র যেকোনো কারণে ব্যর্থ হলে layout-preserving Poppler fallback।
    // Docker বা host-এ Poppler binary না থাকলে pdf-parse দিয়ে graceful fallback।
    try {
      rawText = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      try {
        rawOrderText = execFileSync('pdftotext', ['-raw', tmp, '-'], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      } catch (rawError) {
        if (rawError.code !== 'ENOENT') console.warn('Raw PDF text extraction skipped:', rawError.message);
      }
    } catch (popplerError) {
      if (popplerError.code !== 'ENOENT') throw popplerError;
      rawText = (await pdfParse(dataBuffer, { pagerender: layoutPageRender })).text;
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort cleanup */ }
  }
  // ফন্টে Unicode ম্যাপিং না থাকলে বাংলা অক্ষরের জায়গায় নিয়ন্ত্রণ-চিহ্ন (\u0002 ...) আসে — বিকৃত প্রশ্ন সেভ না করে জানিয়ে দেওয়া
  const visible = rawText.replace(/\s/g, '');
  const garbled = (visible.match(/[\u0001-\u0008\u000e-\u001f]/g) || []).length;
  if (visible.length > 0 && garbled / visible.length > 0.02) {
    throw new Error(
      'PDF-এর ফন্ট থেকে লেখা ঠিকভাবে পড়া যাচ্ছে না (বাংলা অক্ষর বিকৃত আসছে)। Word/Google Docs থেকে Unicode বাংলা ফন্ট (Noto Sans Bengali, Kalpurush, SolaimanLipi) দিয়ে আবার PDF বানিয়ে আপলোড করো।'
    );
  }
  let questions = questionType === 'short' ? parseShortQuestionText(rawText) : parseMcqText(rawText);
  if (rawOrderText) {
    const rawOrderQuestions = questionType === 'short' ? parseShortQuestionText(rawOrderText) : parseMcqText(rawOrderText);
    if (questionType === 'short') {
      if (rawOrderQuestions.length > questions.length) questions = rawOrderQuestions;
    } else {
      const score = (items) => [items.filter((item) => item.correctOptionIndex >= 0).length, items.length];
      const currentScore = score(questions);
      const rawScore = score(rawOrderQuestions);
      if (rawScore[0] > currentScore[0] || (rawScore[0] === currentScore[0] && rawScore[1] > currentScore[1])) {
        questions = rawOrderQuestions;
      }
    }
  }
  // Supplied Physics Engineering PDF-তে diagramগুলো vector artwork—pdfimages
  // এগুলো আলাদা image হিসেবে দেয় না। Render করে প্রশ্নের diagram field-এ বসাই।
  const sourceName = typeof pdfSource === 'string' ? pdfSource : '';
  if (sourceName && /physics/i.test(sourceName) && /engineering|100\s*mcq|masterclass/i.test(sourceName)) {
    try {
      const script = path.join(__dirname, 'extractPhysicsDiagrams.py');
      const diagramJson = execFileSync('python3', [script, sourceName], {
        encoding: 'utf8', maxBuffer: 12 * 1024 * 1024,
      });
      const diagrams = JSON.parse(diagramJson);
      for (const [number, diagram] of Object.entries(diagrams)) {
        const index = Number(number) - 1;
        if (questions[index] && !questions[index].diagram) questions[index].diagram = diagram;
      }
    } catch (diagramError) {
      // Diagram extraction is additive; text import must still succeed if Poppler
      // or Pillow is unavailable on a deployment target.
      console.warn('Physics diagram extraction skipped:', diagramError.message);
    }
  }
  return questions;
}


// ---------- Word (.docx / .doc) থেকে প্রশ্ন পার্স ----------
const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** mammoth-এর HTML → সাধারণ লাইন-ভিত্তিক টেক্সট (<sup>/<sub> সেন্টিনেলে রূপান্তর) */
function docxHtmlToText(html) {
  return String(html || '')
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, (m, t) => UP_O + t.replace(/<[^>]+>/g, '') + UP_C)
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, (m, t) => DN_O + t.replace(/<[^>]+>/g, '') + DN_C)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|tr|h[1-6]|div)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return HTML_ENTITIES[e.toLowerCase()] ?? m;
    });
}

async function extractQuestionsFromDocx(source, questionType = 'mcq') {
  const mammoth = require('mammoth');
  const input = Buffer.isBuffer(source) ? { buffer: source } : { path: source };
  const { value } = await mammoth.convertToHtml(input);
  const text = docxHtmlToText(value);
  return questionType === 'short' ? parseShortQuestionText(text) : parseMcqText(text);
}

async function extractQuestionsFromDoc(source, questionType = 'mcq') {
  const WordExtractor = require('word-extractor');
  const doc = await new WordExtractor().extract(source);
  const text = doc.getBody();
  return questionType === 'short' ? parseShortQuestionText(text) : parseMcqText(text);
}

/** ফাইলের এক্সটেনশন দেখে PDF / DOCX / DOC পার্সার বেছে নেয় */
async function extractQuestionsFromFile(source, originalName = '', questionType = 'mcq') {
  const name = (originalName || (typeof source === 'string' ? source : '')).toLowerCase();
  if (name.endsWith('.docx')) return extractQuestionsFromDocx(source, questionType);
  if (name.endsWith('.doc')) return extractQuestionsFromDoc(source, questionType);
  return extractQuestionsFromPdf(source, questionType);
}

function parseMcqText(rawText) {
  // PDF/DOC ফাইলে বাংলা অঙ্ক, Q.1, (১) — সবকিছুকে একই canonical ফরম্যাটে আনা হয়।
  // এতে বাংলা প্রশ্নপত্রের সিরিয়াল নষ্ট না হয়ে parser-এর সব strategy-তে কাজ করে।
  const normalized = String(rawText || '')
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/\bQ\s*\.?\s*(\d{1,3})\b/gi, '$1.')
    .replace(/\u000c/g, '\n');
  const text = unicodeScriptsToSentinels(normalized);
  // একই PDF-কে একাধিক strategy দিয়ে পড়ি; broken column/label extraction-এ
  // যে strategy বেশি MCQ উদ্ধার করে সেটিই নিই (tie হলে আগের নির্ভুল parser জেতে)।
  const list = parseDetailedFormat(text);
  const simple = parseSimpleFormat(text);
  const visual = parseUnlabeledFormat(text);
  const table = parseTableFormat(text);
  const result = [list, simple, visual, table].reduce((best, next) => (next.length > best.length ? next : best), []);
  return result.map(finalizeQuestion);
}

/** Numbered short prompts with optional inline or separate answer-key answers. */
function parseShortQuestionText(rawText) {
  const normalized = String(rawText || '')
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/\u000c/g, '\n');
  const text = unicodeScriptsToSentinels(normalized);
  const prefixedQuestionStartRegex = /^\s*(?:(?:q(?:uestion)?|প্রশ্ন)\s*\.?\s*)(\d{1,3})\s*[.)।:]?\s*(.*?)\s*$/i;
  const numberedQuestionStartRegex = /^\s*[\[(]?(\d{1,3})[\])\].।:]\s*(.*?)\s*$/i;
  const answerKeyHeaderRegex = /^(?:answer\s*key|উত্তরমালা|উত্তরসূচি)\s*:?(?:\s*)$/i;
  const answerLineRegex = /^(?:ans(?:wer)?|উত্তর)\s*[:\-]\s*(.*)$/i;
  const rawQuestions = [];
  const answerKey = new Map();
  let current = null;
  let inAnswerKey = false;

  const finishCurrent = () => {
    if (!current) return;
    const questionText = cleanText(current.questionText);
    if (questionText) rawQuestions.push({ num: current.num, questionText, answer: cleanText(current.answer) });
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /page\s+\d+\s+of\s+\d+/i.test(line)) continue;
    if (answerKeyHeaderRegex.test(line)) {
      finishCurrent();
      inAnswerKey = true;
      continue;
    }
    if (inAnswerKey) {
      const answerEntry = line.match(/^\s*[\[(]?(\d{1,3})[\])\].।:]\s*(.+?)\s*$/);
      if (answerEntry) answerKey.set(Number(answerEntry[1]), cleanText(answerEntry[2]));
      continue;
    }

    const match = line.match(prefixedQuestionStartRegex) || line.match(numberedQuestionStartRegex);
    if (match) {
      finishCurrent();
      current = { num: Number(match[1]), questionText: match[2] || '', answer: '' };
      continue;
    }
    if (!current) continue;
    const answerMatch = line.match(answerLineRegex);
    if (answerMatch) current.answer = cleanText(`${current.answer} ${answerMatch[1]}`);
    else if (current.answer) current.answer = cleanText(`${current.answer} ${line}`);
    else current.questionText = `${current.questionText} ${line}`;
  }
  finishCurrent();

  return rawQuestions.map((item, order) => {
    const answer = item.answer || answerKey.get(item.num);
    return {
      type: 'short',
      questionText: sentinelsToLatex(item.questionText),
      ...(answer ? { explanation: sentinelsToLatex(answer) } : {}),
      order,
    };
  });
}

// সেন্টিনেল-চিহ্নিত সূত্রকে চূড়ান্ত LaTeX ($...$, \ce{...}) এ বদলানো
function finalizeQuestion(q) {
  const out = { ...q, questionText: sentinelsToLatex(q.questionText), options: q.options.map(sentinelsToLatex) };
  if (q.explanation) out.explanation = sentinelsToLatex(q.explanation);
  return out;
}

// ---------- ১. Detailed Format (প্রশ্ন, অপশন, উত্তর ও ব্যাখ্যা) ----------
function parseDetailedFormat(rawText) {
  const text = rawText.replace(/\r/g, '');
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^page\s+\d+\s+of\s+\d+$/i.test(l));

  const questionStartRegex = /^(\d{1,3})[\.\)](?!\d)\s*(.+)/;
  const optionPairRegex = /\(([a-dA-D])\)\s*([\s\S]+?)(?=\s+\([a-dA-D]\)(?:\s|$)|$)/g;
  
  const answerLineRegex = /^(Ans(?:wer)?|উত্তর)\s*[:\-]?\s*\(?([A-Da-d])\)?\s*(.*)/i;
  const explanationStartRegex = /^(ব্যাখ্যা|Explanation)\s*[:\-]?\s*(.*)/i;

  const rawQuestions = [];
  let current = null;
  let phase = null;

  const pushCurrent = () => {
    if (current) rawQuestions.push(current);
  };

  for (const line of lines) {
    const qMatch = line.match(questionStartRegex);
    const aMatch = line.match(answerLineRegex);
    const expMatch = line.match(explanationStartRegex);
    const hasOptionPattern = /\([a-dA-D]\)\s*\S/.test(line);

    if (qMatch && !aMatch && !expMatch) {
      pushCurrent();
      current = {
        num: parseInt(qMatch[1], 10),
        questionText: cleanText(qMatch[2].replace(/^"|"$/g, '')),
        optionsMap: {},
        explanationLines: [],
      };
      phase = 'question';
      continue;
    }

    if (!current) continue;

    if (aMatch && phase !== 'explanation') {
      current.correctLetter = aMatch[2].toLowerCase();
      phase = 'explanation';
      
      if (!/^ans$/i.test(aMatch[1]) && aMatch[3] && aMatch[3].trim().length > 0) {
        let textAfterAns = aMatch[3].replace(/^(ব্যাখ্যা|Explanation)\s*[:\-]?/i, '').trim();
        if (textAfterAns) {
          current.explanationLines.push(cleanText(textAfterAns));
        }
      }
      continue;
    }

    if (expMatch && phase !== 'explanation') {
      phase = 'explanation';
      if (expMatch[2]) {
        let cleanExp = expMatch[2].replace(/^(ব্যাখ্যা|Explanation)\s*[:\-]?/i, '').trim();
        if (cleanExp) current.explanationLines.push(cleanText(cleanExp));
      }
      continue;
    }

    if (phase === 'explanation') {
      let lineText = line.replace(/^(ব্যাখ্যা|Explanation)\s*[:\-]?/i, '').trim();
      if (lineText) current.explanationLines.push(cleanText(lineText));
      continue;
    }

    if (hasOptionPattern) {
      let m;
      optionPairRegex.lastIndex = 0;
      while ((m = optionPairRegex.exec(line)) !== null) {
        const letter = m[1].toLowerCase();
        if (!current.optionsMap[letter]) {
          current.optionsMap[letter] = cleanText(m[2]);
        }
      }
      phase = 'options';
      continue;
    }

    if (phase === 'question') {
      current.questionText = cleanText(current.questionText + ' ' + line);
    }
  }
  pushCurrent();

  const letters = ['a', 'b', 'c', 'd'];
  const questions = [];

  for (const rq of rawQuestions) {
    const presentLetters = letters.filter((l) => rq.optionsMap[l]);
    if (presentLetters.length < 2) continue;

    const correctOptionIndex = rq.correctLetter ? presentLetters.indexOf(rq.correctLetter) : -1;
    if (rq.correctLetter && correctOptionIndex === -1) continue;

    let explanation = cleanText(rq.explanationLines.join(' '));
    explanation = explanation.replace(/^(ব্যাখ্যা\s*:\s*)+/i, '');

    questions.push({
      questionText: rq.questionText,
      options: presentLetters.map((l) => rq.optionsMap[l]),
      correctOptionIndex,
      explanation: explanation || undefined,
    });
  }

  return questions.map((q, idx) => ({ ...q, order: idx }));
}

// ---------- ২. Simple Format (এক লাইনে প্রশ্ন + A-D অপশন + Answer সমর্থন করে) ----------
function parseSimpleFormat(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions = [];
  let current = null;

  const questionStartRegex = /^(\d+)[\.\)](?!\d)\s*(.+)/;
  // JavaScript's \b is ASCII-word based, so it does not match before Bengali text.
  const answerRegex = /(?:^|[^A-Za-z0-9_])(Ans(?:wer)?|উত্তর)\s*[:\-]?\s*\(?([A-Da-d])\)?/i;
  // Labels are retained separately: if a source has only A and C, C is index 1
  // in the packed options array, not index 2.
  // A., A), (A) — Word/PDF export-এ তিন ধরনের option label দেখা যায়।
  const optionLabelRegex = /(?:^|\s|\()([A-Da-d])(?:[\.\)]|\))\s*/g;

  const parseInlineOptions = (value) => {
    const matches = [...String(value || '').matchAll(optionLabelRegex)];
    if (matches.length === 0) return null;

    const options = [];
    const labels = [];
    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i];
      const start = match.index + match[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : String(value || '').length;
      const optionText = cleanText(String(value || '').slice(start, end));
      if (!optionText) continue;
      labels.push(match[1].toLowerCase());
      options.push(optionText);
    }
    return {
      questionText: cleanText(String(value || '').slice(0, matches[0].index)),
      labels,
      options,
    };
  };

  const appendOptions = (target, parsed) => {
    if (!target || !parsed) return;
    parsed.labels.forEach((label, i) => {
      if (target.optionLabels.includes(label)) return;
      target.optionLabels.push(label);
      target.options.push(parsed.options[i]);
    });
  };

  const finishCurrent = () => {
    if (!current || current.options.length < 2) return;
    const correctOptionIndex = current.correctLetter ? current.optionLabels.indexOf(current.correctLetter) : -1;
    if (current.correctLetter && correctOptionIndex === -1) return;
    questions.push({
      questionText: current.questionText,
      options: current.options,
      correctOptionIndex,
    });
  };

  for (const line of lines) {
    const qMatch = line.match(questionStartRegex);
    if (qMatch) {
      finishCurrent();
      const rest = qMatch[2];
      const inlineAnswer = rest.match(answerRegex);
      const beforeAnswer = inlineAnswer ? rest.slice(0, inlineAnswer.index).trim() : rest;
      const parsed = parseInlineOptions(beforeAnswer);
      current = {
        questionText: parsed?.questionText || cleanText(beforeAnswer),
        optionLabels: [],
        options: [],
        correctLetter: inlineAnswer ? inlineAnswer[2].toLowerCase() : null,
      };
      appendOptions(current, parsed);
      continue;
    }

    if (!current) continue;

    const lineAnswer = line.match(answerRegex);
    const beforeAnswer = lineAnswer ? line.slice(0, lineAnswer.index).trim() : line;
    const parsed = parseInlineOptions(beforeAnswer);
    if (parsed) {
      appendOptions(current, parsed);
      if (!current.options.length && parsed.questionText) {
        current.questionText = cleanText(current.questionText + ' ' + parsed.questionText);
      }
    } else if (!lineAnswer && current.options.length === 0) {
      current.questionText = cleanText(current.questionText + ' ' + line);
    }
    if (lineAnswer) current.correctLetter = lineAnswer[2].toLowerCase();
  }
  finishCurrent();

  return questions.map((q, idx) => ({ ...q, order: idx }));
}

// ---------- ৩. Label-বিহীন/চিত্রযুক্ত MCQ ----------
// অনেক HTML/print করা question bank-এ A./B. অক্ষর হারিয়ে যায়, কিন্তু প্রতিটি
// প্রশ্নের শেষে চারটি option আলাদা লাইনে থাকে। এই strategy-টি সেই ক্ষেত্রে সব
// প্রশ্ন আমদানি করে; শিক্ষক পরে উত্তর বেছে নিতে পারবেন।
function parseUnlabeledFormat(rawText) {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const starts = [];
  const startRe = /^(\d{1,3})[\.\)](?!\d)\s*(.*)$/;
  lines.forEach((line, i) => { if (startRe.test(line)) starts.push(i); });
  if (starts.length < 2) return [];
  const questions = [];
  const ignored = /^(?:☆|✔|❌|select an option|view step|incorrect\.|correct answer|explanation|প্রশ্ন|উত্তর)/i;
  for (let s = 0; s < starts.length; s += 1) {
    const block = lines.slice(starts[s], starts[s + 1] ?? lines.length);
    const first = block.shift().match(startRe);
    if (!first) continue;
    let questionText = first[2] || '';
    const candidates = [];
    let questionDone = /[?:]$/.test(questionText);
    let answerText = '';
    for (const line of block) {
      const answer = line.match(/(?:correct option was|সঠিক উত্তর)\s*:\s*(.+)$/i);
      if (answer) { answerText = cleanText(answer[1]); continue; }
      if (ignored.test(line)) continue;
      if (!questionDone) {
        questionText = cleanText(`${questionText} ${line}`);
        questionDone = /[?:]$/.test(line) || /\?$/.test(questionText);
        continue;
      }
      // Diagram labels (P, Q, θ, m₁, m₂, g) are normally short and appear
      // before the real options. Keep the final four meaningful lines.
      if (line.length <= 2 && !/^(?:0|1|2|3|4|5|6|7|8|9)$/u.test(line)) continue;
      candidates.push(cleanText(line.replace(/[✔❌]+/g, '')));
    }
    let options = candidates.filter(Boolean).slice(-4);
    // প্রশ্নে ?/ঃ না থাকলে আগের loop-এ option mode শুরু নাও হতে পারে।
    // তখনও block-এর শেষ চারটি meaningful line-কে option ধরে নাও।
    if (options.length < 2) {
      const fallback = block
        .filter((line) => !ignored.test(line) && !/^(?:☆|✔|❌)$/u.test(line))
        .map((line) => cleanText(line.replace(/[✔❌]+/g, '')))
        .filter(Boolean);
      options = fallback.slice(-4);
      if (options.length >= 2) questionText = cleanText(`${questionText} ${fallback.slice(0, -options.length).join(' ')}`);
    }
    if (questionText && options.length >= 2) {
      let correctOptionIndex = -1;
      if (answerText) {
        const exact = options.findIndex((o) => o === answerText || o.includes(answerText) || answerText.includes(o));
        if (exact >= 0) correctOptionIndex = exact;
      }
      questions.push({ questionText, options, correctOptionIndex, order: questions.length });
    }
  }
  return questions;
}

// ---------- ৪. Table Format (Answer Key আলাদা থাকলে) ----------
function parseTableFormat(rawText) {
  const text = rawText.replace(/\r/g, '');

  const answerKeyMatch = text.match(/(answer\s*key|উত্তরপত্র)/i);
  const questionsText = answerKeyMatch ? text.slice(0, answerKeyMatch.index) : text;
  const answerText = answerKeyMatch ? text.slice(answerKeyMatch.index) : '';

  const lines = questionsText
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^page\s+\d+\s+of\s+\d+$/i.test(l));

  const questionStartRegex = /^(\d{1,3})[\.\)](?!\d)\s*(.+)/;
  const optionPairRegex = /\(([a-dA-D])\)\s*([\s\S]+?)(?=\s+\([a-dA-D]\)(?:\s|$)|$)/g;

  const rawQuestions = [];
  let current = null;

  for (const line of lines) {
    const qMatch = line.match(questionStartRegex);
    const hasOptions = /\([a-dA-D]\)/.test(line);

    if (qMatch && !hasOptions) {
      if (current) rawQuestions.push(current);
      current = {
        num: parseInt(qMatch[1], 10),
        questionText: cleanText(qMatch[2].replace(/^"|"$/g, '')),
        optionsMap: {},
      };
    } else if (hasOptions && current) {
      let m;
      optionPairRegex.lastIndex = 0;
      while ((m = optionPairRegex.exec(line)) !== null) {
        const letter = m[1].toLowerCase();
        current.optionsMap[letter] = cleanText(m[2]);
      }
    } else if (current && Object.keys(current.optionsMap).length === 0) {
      current.questionText = cleanText(current.questionText + ' ' + line);
    }
  }
  if (current) rawQuestions.push(current);

  const answerMap = {};
  const answerPairRegex = /(\d{1,3})\s*\(([a-dA-D])\)/g;
  let am;
  while ((am = answerPairRegex.exec(answerText)) !== null) {
    answerMap[parseInt(am[1], 10)] = am[2].toLowerCase();
  }

  const letters = ['a', 'b', 'c', 'd'];
  const questions = [];

  for (const rq of rawQuestions) {
    const presentLetters = letters.filter((l) => rq.optionsMap[l]);
    if (presentLetters.length < 2) continue;

    const correctLetter = answerMap[rq.num];
    if (!correctLetter) continue;

    const correctOptionIndex = presentLetters.indexOf(correctLetter);
    if (correctOptionIndex === -1) continue;

    questions.push({
      questionText: rq.questionText,
      options: presentLetters.map((l) => rq.optionsMap[l]),
      correctOptionIndex,
    });
  }

  return questions.map((q, idx) => ({ ...q, order: idx }));
}

// ৪. মডিউল এক্সপোর্ট (অবশ্যই নাম মিলিয়ে এক্সপোর্ট করা হয়েছে)
module.exports = {
  extractQuestionsFromPdf,
  extractQuestionsFromFile,
  docxHtmlToText,
  parseMcqText,
  parseShortQuestionText,
};
