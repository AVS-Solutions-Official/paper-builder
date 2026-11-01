// Turning study material / uploaded papers into Paper Builder blocks.
//  • specToBlocks   – converts the AI's JSON ("paper spec") into blocks
//  • basicGenerate  – rule-based paper from study material (no AI)
//  • basicImport    – rule-based reading of a text-based paper (no AI)
//  • prompts for the AI
import { newId } from './store.js';
import { newBlock, newItem, shuffleKeys } from './model.js';
import { DEFAULT_INSTR } from './i18n.js';
import { LEVELS, ORDERS, suggestLevel, subjectById } from './bloom.js';

const TYPES = ['mcq', 'tf', 'short', 'paragraph', 'matching', 'fill'];
const int = (v, d = 0) => { const n = parseInt(v, 10); return isNaN(n) ? d : Math.max(0, n); };
const str = v => (v == null ? '' : String(v)).trim();

// ───────────────────────── AI spec → blocks ─────────────────────────
// resolveFigure(fig) → Promise<dataUrl|''>
export async function specToBlocks(spec, { lang = 'bi', resolveFigure } = {}) {
  const blocks = [];
  const srcIds = {};
  const notes = [];
  for (const sb of spec?.blocks || []) {
    const kind = sb.kind === 'section' || sb.kind === 'source' ? sb.kind : 'question';
    if (kind === 'section') {
      const b = newBlock('section'); b.title = str(sb.title).replace(/^(afdeling|section)\s+[a-z]\s*[:.-]?\s*/i, ''); b.text = str(sb.text);
      blocks.push(b); continue;
    }
    if (kind === 'source') {
      const b = newBlock('source');
      b.title = str(sb.title).replace(/^(bron|source|bylaag|addendum)\s+[a-z0-9]+\s*[:.\-/]?\s*((bron|source)\s+[a-z0-9]+\s*[:.-]?\s*)?/i, '');
      b.text = str(sb.text); b.caption = str(sb.caption); b.reference = str(sb.reference);
      if (Array.isArray(sb.table) && sb.table.length) { b.sType = 'table'; b.table = { rows: sb.table.map(r => (Array.isArray(r) ? r : [r]).map(str)), header: true }; }
      if (sb.figure && resolveFigure) {
        try { b.image = await resolveFigure(sb.figure); } catch { b.image = ''; }
        if (b.image) { b.sType = b.sType === 'table' ? 'table' : 'image'; b.imgWidth = 90; }
      }
      if (sb.figure && !b.image) { b.text = (b.text ? b.text + '\n\n' : '') + `[Picture: ${str(sb.description) || 'see original paper'} — click edit to add the image]`; notes.push('missing-figure'); }
      if (!b.text && !b.image && !b.table) continue;
      if (sb.ref) srcIds[str(sb.ref).toUpperCase()] = b.id;
      blocks.push(b); continue;
    }
    const type = TYPES.includes(sb.type) ? sb.type : 'short';
    const b = newBlock('question', type);
    b.items = [];
    const ia = str(sb.instr_af), ie = str(sb.instr_en);
    if (ia || ie) b.instr = { af: ia, en: ie };
    if (lang === 'en' && !b.instr.en) b.instr.en = DEFAULT_INSTR[type]?.en || '';
    if (lang === 'af' && !b.instr.af) b.instr.af = DEFAULT_INSTR[type]?.af || '';
    if (type === 'tf') { b.style = sb.tfStyle === 'correct' ? 'correct' : 'tf'; }
    if (sb.sourceRef) b.sourceRef = srcIds[str(sb.sourceRef).toUpperCase()] || '';
    if (sb.figure && resolveFigure) { try { b.image = await resolveFigure(sb.figure); } catch {} }
    for (const si of sb.items || []) {
      const it = newItem(type);
      it.marks = int(si.marks, type === 'paragraph' ? 5 : 1);
      if (type === 'matching') {
        it.left = str(si.left); it.right = str(si.right); it.left2 = str(si.left_en); it.right2 = str(si.right_en);
        if (!it.left && !it.right) continue;
      } else {
        const tidy = v => str(v).replace(/^\(?\d+(?:\.\d+)*[.)]?\s+(?=\S)/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/\s*\[\d+\]\s*$/, '');
        it.text = tidy(si.text); it.text2 = lang === 'bi' ? tidy(si.text_en) : '';
        if (!it.text && it.text2) { it.text = it.text2; it.text2 = ''; }
        it.memo = str(si.memo);
        if (si.lines != null && type !== 'fill') it.lines = Math.min(40, int(si.lines, it.lines));
        if (type === 'mcq') {
          it.options = (si.options || []).map(o => str(o).replace(/^[A-Ea-e][.)]\s+/, '')).filter(Boolean).slice(0, 6);
          if (it.options.length < 2) it.options = [...it.options, '', ''].slice(0, Math.max(2, it.options.length));
          let a = si.answer;
          if (typeof a === 'string' && /^[A-Fa-f]$/.test(a.trim())) a = a.trim().toUpperCase().charCodeAt(0) - 65;
          it.answer = Math.min(it.options.length - 1, int(a, 0));
        }
        if (type === 'tf') {
          const v = si.tf ?? si.answer;
          it.answer = !(v === false || /^(false|onwaar|f|no)$/i.test(String(v)));
          it.lines = b.style === 'correct' ? int(si.lines, 2) : 2;
        }
        if (!it.text && type !== 'fill') continue;
      }
      const lv = int(si.bloom, 0);
      it.bloom = lv >= 1 && lv <= 6 ? lv : (suggestLevel([it.text, it.text2, it.left].filter(Boolean).join(' '))?.level || 0);
      b.items.push(it);
    }
    if (!b.items.length) continue;
    if (type === 'matching') { b.distractors = (sb.distractors || []).map(str).filter(Boolean).join('\n'); b.order = shuffleKeys(b); }
    if ((type === 'paragraph' || type === 'short') && sb.rubric?.rows?.length) {
      b.rubric = { cols: (sb.rubric.cols || ['2', '1', '0']).map(str), rows: sb.rubric.rows.map(r => ({ name: str(r.name), cells: (r.cells || []).map(str) })) };
    } else if (type === 'paragraph') b.rubric = { cols: ['2', '1', '0'], rows: [] };
    blocks.push(b);
  }
  return { blocks, notes };
}

export function specMeta(spec, settings) {
  const m = spec?.meta || {};
  const out = {};
  if (m.subject) {
    const s = String(m.subject).toLowerCase();
    const hit = settings.subjects.find(x => s.includes(x.en.toLowerCase()) || s.includes(x.af.toLowerCase()) || x.en.toLowerCase().includes(s) || x.af.toLowerCase().includes(s));
    if (hit) out.subject = hit.id;
  }
  const g = String(m.grade || '').match(/\bR\b|\d+/);
  if (g) out.grade = g[0];
  if (['af', 'en', 'bi'].includes(m.lang)) out.lang = m.lang;
  if (m.taskNo) out.taskNo = str(m.taskNo);
  if (int(m.duration)) out.duration = int(m.duration);
  if (int(m.totalMarks)) out.totalMarks = int(m.totalMarks);
  if (m.form_af || m.form_en) out.form = { af: str(m.form_af) || 'Toets', en: str(m.form_en) || 'Test' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')) out.date = m.date;
  if (m.educators) out.educators = str(m.educators);
  if (m.moderator) out.moderator = str(m.moderator);
  if (m.term) out.term = String(m.term).replace(/\D/g, '').slice(0, 1);
  if (m.title) out.title = str(m.title);
  return out;
}

// ───────────────────────── AI prompts ─────────────────────────
const SPEC_FORMAT = `Return ONLY a JSON object in exactly this format (omit fields you do not need):
{
  "meta": { "title": "", "subject": "", "grade": "", "lang": "af|en|bi", "taskNo": "", "term": "", "duration": 60, "totalMarks": 50,
            "form_af": "Toets", "form_en": "Test", "date": "YYYY-MM-DD", "educators": "", "moderator": "" },
  "blocks": [
    { "kind": "section", "title": "Comprehension", "text": "optional instruction for the section" },
    { "kind": "source", "ref": "A", "title": "optional heading", "text": "source text / passage",
      "table": [["header 1","header 2"],["row cell","row cell"]],
      "caption": "", "reference": "where the source comes from (book, website, page)",
      "figure": { "file": 1, "page": 1, "box": [ymin, xmin, ymax, xmax] }, "description": "what the picture shows" },
    { "kind": "question", "type": "mcq|tf|short|paragraph|matching|fill", "sourceRef": "A",
      "instr_af": "Afrikaans instruction", "instr_en": "English instruction", "tfStyle": "tf|correct",
      "items": [
        { "text": "question in the main language", "text_en": "English version (bilingual papers only)",
          "marks": 1, "bloom": 1, "memo": "model answer",
          "options": ["...","...","...","..."], "answer": 0,
          "tf": true, "lines": 2,
          "left": "Column A term", "right": "matching Column B description", "left_en": "", "right_en": "" }
      ],
      "distractors": ["extra Column B option"],
      "rubric": { "cols": ["2","1","0"], "rows": [ { "name": "criterion", "cells": ["descriptor for 2","for 1","for 0"] } ] }
    }
  ]
}
Rules for the JSON:
- One "question" block = one numbered question (VRAAG/QUESTION 1, 2, ...). Its items become 1.1, 1.2, ... Do NOT put numbers like "1.1" or marks like "(2)" inside the text.
- "bloom" is the revised Bloom's level of each item: 1 Remember, 2 Understand, 3 Apply, 4 Analyse, 5 Evaluate, 6 Create.
- mcq: "options" without letters, "answer" = index of the correct option (0 = A). tf: "tf" true/false. matching: one item per pair, "right" is the correct match for "left".
- fill: write each gap in "text" as ___ (three underscores); "memo" gives the missing word(s).
- short/paragraph: "lines" = number of answer lines to print. paragraph items may have a "rubric".
- "figure" only when a picture/map/diagram must be cut out of an uploaded page: "file" = number of the uploaded file (1-based), "page" = page number in that PDF (1 for photos), "box" = bounding box on a 0–1000 scale [ymin, xmin, ymax, xmax]. For Word files with [IMAGE n] markers use { "image": n } instead.`;

function langRule(lang) {
  return lang === 'bi'
    ? 'The paper is BILINGUAL: write every item "text" in Afrikaans and its English translation in "text_en"; give both "instr_af" and "instr_en". Matching: "left"/"right" in Afrikaans and "left_en"/"right_en" in English.'
    : lang === 'af' ? 'Write the whole paper in Afrikaans (use "instr_af"; leave English fields empty).'
      : 'Write the whole paper in English (use "instr_en"; leave Afrikaans fields empty).';
}

export function compilePrompt(o, settings) {
  const subj = subjectById(settings, o.subject);
  const m = settings.mapping;
  const lvls = ord => Object.keys(m).filter(k => m[k] === ord).map(k => `${k} ${LEVELS[k - 1].en}`).join(', ');
  const t = subj ? subj.t : [40, 40, 20];
  const mk = ORDERS.map((ord, i) => Math.round(o.totalMarks * t[i] / 100));
  mk[0] += o.totalMarks - mk.reduce((a, b) => a + b, 0);
  const typeNames = { mcq: 'multiple choice', tf: 'true/false', short: 'short answer', paragraph: 'paragraph / extended writing', matching: 'matching columns', fill: 'fill in the missing word' };
  return `You are an experienced South African primary school teacher at Kathu Primary School (Laerskool Kathu) setting a CAPS-aligned ${o.formEn || 'test'} for Grade ${o.grade}, subject: ${subj?.en || o.subject} (${subj?.af || ''}).
Write a complete question paper based ONLY on the study material provided below and in the attached files. Do not test facts that are not in the material.

Requirements:
- Total marks: EXACTLY ${o.totalMarks}. Time: ${o.duration} minutes. Pitch the language and difficulty at Grade ${o.grade} level.
- Bloom's taxonomy mark distribution (by marks, not by number of questions):
  • Lower order (${lvls('lower')}): ${t[0]}% = ${mk[0]} marks
  • Middle order (${lvls('middle')}): ${t[1]}% = ${mk[1]} marks
  • Higher order (${lvls('higher')}): ${t[2]}% = ${mk[2]} marks
  Tag every item with its true Bloom's level; the marks per order must add up to those numbers.
- Use these question types: ${o.types.map(x => typeNames[x]).join(', ')}.${o.sourceBased ? `
- Make it SOURCE-BASED: include ${o.sourceCount || 2} sources ("kind":"source", ref "A", "B", ...) taken or adapted from the material (a short text extract, or a "table" of facts/figures from the material). Put each source right before the questions about it, and set "sourceRef" on those questions. Ask the higher-order questions about the sources (e.g. what a source tells us, compare sources, usefulness, evaluate a viewpoint). Give each source a "reference".` : ''}
- Start each question with a clear instruction. Group questions in sections ("kind":"section") if the paper has more than one part.
- Provide a memo answer for every item, and a rubric for paragraph questions. Use realistic answer "lines" (about 1 line per mark for short answers).
- ${langRule(o.lang)}
${o.extra ? `- Teacher's extra instructions: ${o.extra}\n` : ''}
Set "meta" to: subject "${subj?.en || ''}", grade "${o.grade}", lang "${o.lang}", totalMarks ${o.totalMarks}, duration ${o.duration}, and a short title.

${SPEC_FORMAT}

STUDY MATERIAL:
${o.text || '(see attached files)'}`;
}

export function importPrompt(o, settings) {
  const subj = subjectById(settings, o.subject);
  const t = subj ? subj.t : null;
  const mode = {
    keep: 'Transcribe the paper FAITHFULLY. Keep the original wording, questions, marks and order exactly. Only fix obvious typing/scanning errors.',
    fix: 'Transcribe the paper, keeping every question and its meaning, but correct spelling, grammar and punctuation, make instructions clear and consistent, fix numbering, and make sure each question\'s marks add up correctly.',
    rebalance: `Transcribe the paper and IMPROVE it so that its Bloom's taxonomy balance meets the subject's targets${t ? ` (by marks: lower order ${t[0]}%, middle order ${t[1]}%, higher order ${t[2]}%)` : ''} while keeping the same topic, the same total marks and the overall structure. Keep good questions as they are; rewrite or replace only as many questions as needed (e.g. turn a recall question into an analysis or evaluation question). Also fix spelling and grammar.`
  }[o.mode];
  return `You are helping Kathu Primary School (South Africa) re-type an existing question paper into their paper-building app.
The uploaded file(s) contain the paper${o.hasMemo ? ' and its memorandum (use the memorandum for the "memo" answers)' : ''}.

Task: ${mode}

- Detect the header information for "meta" (subject, grade, task number, time, total marks, date, educators, moderator, term, form of assessment). Leave out anything not shown.
- Each VRAAG/QUESTION becomes one "question" block; its numbered sub-questions are the items. Choose the "type" that matches the layout (multiple choice → mcq, columns to match → matching, true/false → tf, gaps → fill, writing with a rubric → paragraph, everything else → short). If one question mixes styles, split it into several question blocks.
- Copy each item's marks from the paper. Tag every item with its Bloom's level (1 Remember … 6 Create).
- Passages, extracts, tables, maps, cartoons and pictures that questions refer to become "source" blocks (keep source letters such as BRON A / SOURCE A in "ref"). For pictures, maps and diagrams give a "figure" with the bounding box so the app can cut the picture out of the page, plus a short "description".
- Rubrics printed on the paper go into "rubric".
- Language: ${o.lang === 'auto' ? 'detect it — if headings/questions are given in both Afrikaans and English use "bi", otherwise "af" or "en" — and set meta.lang.' : `the paper must be "${o.lang}". ${langRule(o.lang)}`}
${o.extra ? `- Teacher's extra instructions: ${o.extra}\n` : ''}
${SPEC_FORMAT}
${o.text ? `\nTEXT EXTRACTED FROM THE UPLOADED WORD FILE(S):\n${o.text}` : ''}`;
}

// ───────────────────────── basic (no-AI) generator ─────────────────────────
const STOP = new Set(('the a an and or but of to in on at for with by from as is are was were be been being this that these those it its into than then there their they them he she his her we our you your i not no yes can could will would should may might must have has had do does did also which who whom what when where why how all any some more most such only very about after before over under between during while because so if each other many much one two three four five first second new used use make made process processes change changes called known ground every people part parts thing things example examples ' +
  'die ’n n en of maar van tot in op by vir met deur uit as is was word het sal kan moet nie dit hierdie daardie hul hulle hy sy ons jy julle ek wat wie wanneer waar waarom hoekom hoe al alle sommige meer meeste net baie oor na voor onder tussen gedurende terwyl omdat so as elke ander een twee drie vier vyf eerste tweede nuwe gebruik gemaak ook toe daar hier word is aan om te sowel proses verander genoem deel dinge voorbeeld mense').split(/\s+/));

function sentencesOf(text) {
  return String(text).replace(/\r/g, '').replace(/\n{2,}/g, '. ').replace(/\s*\n\s*/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý"“'0-9])/).map(s => s.trim().replace(/^[•\-–*]\s*/, ''))
    .filter(s => s.length >= 35 && s.length <= 240 && /[a-z]/i.test(s) && s.split(' ').length >= 6);
}

function keyTerms(text, sentences) {
  const counts = new Map();
  const add = (t, w) => { t = t.trim().replace(/[.,;:!?)("'“”]+$/g, '').replace(/^[("'“”]+/, ''); if (t.length < 3 || STOP.has(t.toLowerCase())) return; counts.set(t, (counts.get(t) || 0) + w); };
  for (const s of sentences) {
    const words = s.split(/\s+/);
    // Capitalised phrases (not the first word), years / big numbers
    let run = [];
    words.forEach((w, i) => {
      const clean = w.replace(/[.,;:!?)("'“”]/g, '');
      if (i > 0 && /^[A-ZÀ-Ý][\p{L}-]+$/u.test(clean) && !STOP.has(clean.toLowerCase())) run.push(clean);
      else { if (run.length) add(run.join(' '), 3); run = []; }
      if (/^\d{3,4}$/.test(clean)) add(clean, 2);
    });
    if (run.length) add(run.join(' '), 3);
  }
  // Defined terms: "... is called evaporation", "... known as ...", "... genoem", "staan bekend as ..."
  const defRe = /\b(?:is called|are called|called|known as|referred to as|is named|staan bekend as|bekend as|heet)\s+(?:the\s+|die\s+|a\s+|an\s+|'n\s+)?([\p{L}-]{4,}(?:\s[\p{Lu}][\p{L}-]+)?)/gu;
  let m;
  while ((m = defRe.exec(text))) add(m[1], 8);
  const afRe = /\b([\p{L}-]{5,})\s+genoem\b/giu;
  while ((m = afRe.exec(text))) add(m[1], 8);
  const lw = String(text).toLowerCase().match(/\p{L}{8,}/gu) || [];
  const f = new Map(); lw.forEach(w => { if (!STOP.has(w)) f.set(w, (f.get(w) || 0) + 1); });
  for (const [w, n] of f) if (n >= 3) add(w, n);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
    .filter((t, i, arr) => !arr.slice(0, i).some(o => o.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(o.toLowerCase())))
    .filter(t => sentences.some(s => s.includes(t))).slice(0, 30);
}

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const blankOut = (s, term) => s.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '___');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function basicGenerate(text, o, settings) {
  const sentences = sentencesOf(text);
  if (sentences.length < 4) throw new Error('There is not enough study material to build a paper. Paste or upload at least a few paragraphs (about 150 words or more).');
  const terms = keyTerms(text, sentences);
  if (terms.length < 3) throw new Error('Could not find enough key terms in the study material. Try adding more text.');
  const L = o.lang;
  const tx = (af, en) => L === 'en' ? { text: en, text2: '' } : L === 'af' ? { text: af, text2: '' } : { text: af, text2: en };
  const subj = subjectById(settings, o.subject);
  const t = subj ? subj.t : [40, 40, 20];
  const budget = ORDERS.map((_, i) => Math.round(o.totalMarks * t[i] / 100));
  budget[0] += o.totalMarks - budget.reduce((a, b) => a + b, 0);
  let [lowB, midB, highB] = budget;
  const allow = new Set(o.types);
  const termSentence = term => sentences.find(s => s.includes(term));
  const used = new Set();
  const blocks = [];
  let sourceId = '';

  if (o.sourceBased) {
    const src = newBlock('source');
    src.label = 'source';
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    src.text = words.slice(0, Math.min(140, words.length)).join(' ') + (words.length > 140 ? ' …' : '');
    src.reference = L === 'af' ? 'Aangepas uit die studiemateriaal' : 'Adapted from the study material';
    sourceId = src.id;
    blocks.push(src);
  }

  // ── Lower order
  const lowTerms = terms.filter(x => !used.has(x));
  if (allow.has('matching') && lowB >= 4 && lowTerms.length >= 5) {
    const b = newBlock('question', 'matching'); b.items = [];
    const n = Math.min(lowB >= 8 ? 5 : 4, lowTerms.length);
    for (const term of lowTerms.slice(0, n)) {
      const s = termSentence(term);
      let def = blankOut(s, term).replace(/\s+/g, ' ');
      if (def.length > 110) def = def.slice(0, 107).replace(/\s\S*$/, '') + '…';
      const it = newItem('matching'); it.left = term; it.right = def; it.bloom = 1; it.marks = 1;
      b.items.push(it); used.add(term);
    }
    b.order = shuffleKeys(b); blocks.push(b); lowB -= b.items.length;
  }
  if (allow.has('mcq') && lowB >= 3) {
    const b = newBlock('question', 'mcq'); b.items = [];
    for (const term of terms) {
      if (lowB - b.items.length <= (allow.has('tf') || allow.has('fill') ? 2 : 0) || b.items.length >= 5) break;
      if (used.has(term)) continue;
      const others = shuffle(terms.filter(x => x !== term)).slice(0, 3);
      if (others.length < 2) break;
      const opts = shuffle([term, ...others]);
      const it = newItem('mcq');
      Object.assign(it, tx(blankOut(termSentence(term), term), blankOut(termSentence(term), term)));
      if (L === 'bi') it.text2 = '';
      it.options = opts; it.answer = opts.indexOf(term); it.bloom = 1; it.marks = 1; it.memo = term;
      b.items.push(it); used.add(term);
    }
    if (b.items.length) { blocks.push(b); lowB -= b.items.length; }
  }
  if (allow.has('tf') && lowB >= 2) {
    const b = newBlock('question', 'tf'); b.items = []; b.style = 'tf';
    const pool = shuffle(sentences.filter(s => terms.some(x => s.includes(x))));
    for (const s of pool) {
      if (b.items.length >= Math.min(5, lowB - (allow.has('fill') ? 1 : 0))) break;
      const it = newItem('tf'); it.marks = 1; it.bloom = 2;
      const term = terms.find(x => s.includes(x));
      const makeFalse = b.items.length % 2 === 1;
      const other = terms.find(x => x !== term && !s.includes(x));
      if (makeFalse && other) { it.text = s.replace(term, other); it.answer = false; it.memo = s; }
      else { it.text = s; it.answer = true; }
      b.items.push(it);
    }
    if (b.items.length) { blocks.push(b); lowB -= b.items.length; }
  }
  if (lowB > 0) {
    const type = allow.has('fill') ? 'fill' : 'short';
    const b = newBlock('question', type); b.items = [];
    for (const term of terms) {
      if (lowB <= 0) break;
      if (used.has(term)) continue;
      const it = newItem(type); it.marks = 1; it.bloom = 1;
      if (type === 'fill') { it.text = blankOut(termSentence(term), term); it.memo = term; }
      else { Object.assign(it, tx(`Noem die term wat beskryf word: "${blankOut(termSentence(term), term)}"`, `Name the term that is described: "${blankOut(termSentence(term), term)}"`)); it.memo = term; it.lines = 1; }
      b.items.push(it); used.add(term); lowB--;
    }
    if (b.items.length) blocks.push(b);
  }

  // ── Middle order (apply / analyse)
  const mid = newBlock('question', 'short'); mid.items = [];
  if (sourceId) { mid.sourceRef = sourceId; mid.instr = { af: 'Bestudeer Bron A en beantwoord die volgende vrae.', en: 'Study Source A and answer the following questions.' }; }
  const T = shuffle(terms);
  let k = 0;
  const midTemplates = [
    (a, b) => ({ ...tx(`Vergelyk ${a} en ${b}. Noem een ooreenkoms en een verskil.`, `Compare ${a} and ${b}. Give one similarity and one difference.`), marks: 4, bloom: 4 }),
    (a) => ({ ...tx(`Verduidelik, met 'n voorbeeld uit die alledaagse lewe, hoe ${a} gebruik word of werk.`, `Use an example from everyday life to show how ${a} is used or works.`), marks: 2, bloom: 3 }),
    (a, b) => ({ ...tx(`Wat is die verband tussen ${a} en ${b}?`, `What is the relationship between ${a} and ${b}?`), marks: 2, bloom: 4 }),
    (a, b, c, d) => ({ ...tx(`Organiseer die volgende terme in twee groepe en gee elke groep 'n gepaste opskrif: ${[a, b, c, d].join(', ')}.`, `Organise the following terms into two groups and give each group a suitable heading: ${[a, b, c, d].join(', ')}.`), marks: 4, bloom: 4 }),
    (a) => ({ ...tx(`Pas jou kennis van ${a} toe: beskryf 'n situasie by die huis of skool waar dit belangrik is.`, `Apply your knowledge of ${a}: describe a situation at home or at school where it is important.`), marks: 2, bloom: 3 })
  ];
  let guard = 0;
  while (midB > 0 && guard++ < 20) {
    const tmpl = midTemplates[k % midTemplates.length];
    const args = [T[k % T.length], T[(k + 1) % T.length], T[(k + 2) % T.length], T[(k + 3) % T.length]];
    const it = { ...newItem('short'), ...tmpl(...args) };
    it.marks = Math.min(it.marks, midB); if (it.marks < 1) break;
    it.lines = Math.max(2, it.marks); it.memo = L === 'af' ? 'Aanvaar relevante antwoorde.' : 'Accept relevant answers.';
    mid.items.push(it); midB -= it.marks; k++;
  }
  if (mid.items.length) blocks.push(mid);

  // ── Higher order (evaluate / create)
  if (highB > 0) {
    const hi = newBlock('question', 'short'); hi.items = [];
    if (sourceId) hi.sourceRef = sourceId;
    const stmt = shuffle(sentences)[0];
    const evalMarks = allow.has('paragraph') && highB >= 6 ? Math.min(4, highB - 3) : highB;
    const ev = { ...newItem('short'), ...tx(`Stem jy saam met die volgende stelling? Gee redes vir jou antwoord: “${stmt}”`, `Do you agree with the following statement? Give reasons for your answer: “${stmt}”`), marks: evalMarks, bloom: 5 };
    ev.lines = evalMarks + 1; ev.memo = L === 'af' ? 'Eie mening, met relevante redes (1 punt per rede).' : 'Own opinion supported by relevant reasons (1 mark per reason).';
    hi.items.push(ev); highB -= evalMarks;
    blocks.push(hi);
    if (highB > 0) {
      const p = newBlock('question', 'paragraph');
      const topic = terms[0];
      p.items[0] = { ...p.items[0], ...tx(`Skryf 'n paragraaf van ten minste vyf sinne oor ${topic}. Onthou jou onderwerpsin en gevolgtrekking.`, `Write a paragraph of at least five sentences about ${topic}. Remember your topic sentence and conclusion.`), marks: highB, bloom: 6, lines: Math.max(6, highB * 2) };
      p.items[0].memo = L === 'af' ? 'Gebruik die rubriek.' : 'Use the rubric.';
      p.rubric = { cols: ['2', '1', '0'], rows: [
        { name: L === 'af' ? 'Onderwerpsin' : 'Topic sentence', cells: L === 'af' ? ['Duidelike onderwerpsin', 'Onderwerpsin nie duidelik nie', 'Geen onderwerpsin'] : ['Clear topic sentence', 'Topic sentence unclear', 'No topic sentence'] },
        { name: L === 'af' ? 'Inhoud' : 'Content', cells: L === 'af' ? ['Korrekte, relevante feite', 'Sommige feite korrek', 'Geen relevante feite'] : ['Correct, relevant facts', 'Some facts correct', 'No relevant facts'] },
        { name: L === 'af' ? 'Gevolgtrekking' : 'Conclusion', cells: L === 'af' ? ['Duidelike gevolgtrekking', 'Gevolgtrekking nie duidelik nie', 'Geen gevolgtrekking'] : ['Clear conclusion', 'Conclusion unclear', 'No conclusion'] }
      ] };
      const rmax = 6;
      if (highB !== rmax) p.rubric.rows = highB >= 4 ? p.rubric.rows.slice(0, Math.max(1, Math.round(highB / 2))) : [];
      if (p.rubric.rows.length * 2 !== highB) p.rubric = { cols: ['2', '1', '0'], rows: [] };
      blocks.push(p);
    }
  }
  // Ensure instructions exist in the right language
  for (const b of blocks) if (b.kind === 'question' && !b.instr) b.instr = { ...DEFAULT_INSTR[b.type] };
  return blocks;
}

// ───────────────────────── basic (no-AI) importer ─────────────────────────
export function basicImport(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').map(l => l.replace(/\t/g, ' ').replace(/\s+$/, ''));
  const blocks = [];
  const meta = {};
  let q = null, item = null, started = false, pendingIntro = [];
  const QH = /^\s*(vraag|question)\s+(\d+)\b\s*(?:[:/\-–]\s*(?:vraag|question)?\s*\d*)?\s*(.*)$/i;
  const SH = /^\s*(afdeling|section)\s+([A-Z])\b\s*[:.\-–]?\s*(.*)$/i;
  const IT = /^\s*(\d+(?:\.\d+)+)\.?\s+(.*)$/;
  const OPT = /^\s*([A-Ea-e])[.)]\s+(.*)$/;
  const MARK = /\((\d+)\)\s*$/;
  const finishItem = () => { item = null; };
  const finishQ = () => {
    if (!q) return;
    finishItem();
    if (!q.items.length && q._intro.length) {
      const it = newItem('short'); it.text = q._intro.join(' ').replace(MARK, '').trim(); const m = q._intro.join(' ').match(MARK); it.marks = m ? int(m[1], 1) : 1; q.items.push(it); q._intro = [];
    }
    q.type = q.items.some(i => (i.options || []).length >= 2) ? 'mcq' : 'short';
    if (q.type === 'mcq') q.items.forEach(i => { if (!i.options || i.options.length < 2) i.options = ['', '']; i.answer = 0; delete i.lines; });
    else q.items.forEach(i => { delete i.options; delete i.answer; });
    if (q._intro.length) { const t = q._intro.join('\n'); q.instr = { af: t, en: '' }; }
    q.items.forEach(i => { i.bloom = suggestLevel(i.text)?.level || 0; });
    delete q._intro;
    if (q.items.length) blocks.push(q);
    q = null;
  };
  for (let raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (/^(memorandum|memo|nasienriglyne?|marking guidelines?)\b/i.test(l)) break;
    const hdr = l.match(/^(?:graad|grade)\s*:?\s*(\d)/i); if (hdr && !started) meta.grade = hdr[1];
    const tot = l.match(/(?:totaal|total)\s*:?\s*(\d+)/i); if (tot) meta.totalMarks = int(tot[1]);
    const tk = l.match(/(?:taak\s*nr\.?|task\s*no\.?)\s*:?\s*([\d.]+)/i); if (tk && !started) meta.taskNo = tk[1];
    let m;
    if ((m = l.match(SH))) { finishQ(); started = true; const b = newBlock('section'); b.title = m[3].replace(/\[\d+\]\s*$/, '').trim(); blocks.push(b); continue; }
    if ((m = l.match(QH))) {
      finishQ(); started = true;
      q = { id: newId(), kind: 'question', type: 'short', instr: { af: '', en: '' }, items: [], image: '', caption: '', imgWidth: 80, _intro: [] };
      if (m[3] && !/^\[?\d+\]?$/.test(m[3])) q._intro.push(m[3]);
      continue;
    }
    if (!started) continue;
    if (/^\[\d+\]$/.test(l) || /^(totaal|total)\b/i.test(l)) continue;
    if (/^_{4,}[\s_]*(\(\d+\))?$/.test(l)) { if (item) { item.lines = (item.lines || 0) + 1; const mm = l.match(MARK); if (mm) item.marks = int(mm[1], 1); } continue; }
    if (!q) { pendingIntro.push(l); continue; }
    if ((m = l.match(IT))) {
      finishItem();
      item = newItem('short'); item.lines = 0;
      let t = m[2].replace(/\[\d+\]\s*$/, '').trim();
      const mm = t.match(MARK); if (mm) { item.marks = int(mm[1], 1); t = t.replace(MARK, '').trim(); }
      item.text = t; q.items.push(item); continue;
    }
    if (item && (m = l.match(OPT))) { (item.options = item.options || []).push(m[2].replace(MARK, '').trim()); continue; }
    if (item) {
      const mm = l.match(MARK);
      if (mm) { item.marks = int(mm[1], 1); }
      const clean = l.replace(MARK, '').replace(/\[\d+\]\s*$/, '').trim();
      if (clean && !/^_+$/.test(clean)) item.text += (item.text ? ' ' : '') + clean;
      continue;
    }
    q._intro.push(l.replace(/\[\d+\]\s*$/, '').trim());
  }
  finishQ();
  blocks.forEach(b => { if (b.kind === 'question') b.items.forEach(i => { if (i.lines === 0 && b.type === 'short') i.lines = Math.max(1, Math.min(6, i.marks)); }); });
  return { blocks, meta };
}
