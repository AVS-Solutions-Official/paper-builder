// Renders a paper as printable A4 HTML: question paper, memorandum and
// Bloom's analysis grid. Layout follows the school's existing test format.
import { esc, nl2br } from './ui.js';
import { t, th, formatDuration, PL } from './i18n.js';
import { SCHOOL } from './config.js';
import { analyse, blockMarks, levelByN, ORDERS, ORDER_LABEL, ORDER_LABEL_AF, subjectById } from './bloom.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Two-language text helper: af/en/bi
function dual(af, en, lang, { italicSecond = true, sep = ' / ' } = {}) {
  af = af || ''; en = en || '';
  if (lang === 'af') return esc(af || en);
  if (lang === 'en') return esc(en || af);
  if (!af) return esc(en);
  if (!en || af === en) return esc(af);
  return `${esc(af)}${sep}${italicSecond ? `<i>${esc(en)}</i>` : esc(en)}`;
}

export function subjectNames(paper, settings) {
  const s = subjectById(settings, paper.subject);
  return { af: s?.af || paper.subjectName || '', en: s?.en || paper.subjectName || '' };
}

function instr(b, lang) {
  const i = b.instr || {};
  if (lang === 'af') return i.af ? `<p class="p-instr">${nl2br(i.af)}</p>` : '';
  if (lang === 'en') return i.en ? `<p class="p-instr">${nl2br(i.en)}</p>` : '';
  return (i.af ? `<p class="p-instr">${nl2br(i.af)}</p>` : '') + (i.en ? `<p class="p-instr p-alt">${nl2br(i.en)}</p>` : '');
}

const itemText = (it, lang) =>
  `${nl2br(it.text)}${lang === 'bi' && it.text2 ? `<span class="p-alt-line">${nl2br(it.text2)}</span>` : ''}`;

const lines = n => n > 0 ? `<div class="p-lines">${'<div class="p-line"></div>'.repeat(n)}</div>` : '';

// Column B ordering for matching questions (stable shuffle stored on the block).
export function matchingColumnB(b) {
  const entries = [
    ...(b.items || []).map(it => ({ key: 'i:' + it.id, text: it.right || '', text2: it.right2 || '' })),
    ...((b.distractors || '').split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => ({ key: 'd:' + i + ':' + s, text: s, text2: '' })))
  ];
  const order = b.order || [];
  entries.sort((a, z) => {
    const ia = order.indexOf(a.key), iz = order.indexOf(z.key);
    return (ia === -1 ? 999 : ia) - (iz === -1 ? 999 : iz);
  });
  return entries;
}
export function matchingAnswer(b, it) {
  const i = matchingColumnB(b).findIndex(e => e.key === 'i:' + it.id);
  return i === -1 ? '?' : LETTERS[i];
}

function renderItem(b, it, label, lang) {
  const num = label ? `<span class="p-num">${esc(label)}.</span>` : '';
  const marks = `<span class="p-marks">(${Number(it.marks) || 0})</span>`;
  switch (b.type) {
    case 'mcq': {
      const opts = (it.options || []).filter(o => o !== '');
      const short = opts.every(o => o.length <= 22) && opts.length >= 3;
      return `<div class="p-item">
        <div class="p-row">${num}<span class="p-text">${itemText(it, lang)}</span>${marks}</div>
        <div class="p-opts ${short ? 'p-opts-grid' : ''}">${opts.map((o, i) => `<div class="p-opt"><span>${LETTERS[i]}.</span> ${esc(o)}</div>`).join('')}</div>
      </div>`;
    }
    case 'tf': {
      if (b.style === 'correct') {
        return `<div class="p-item"><div class="p-row">${num}<span class="p-text">${itemText(it, lang)}</span>${marks}</div>${lines(it.lines ?? 2)}</div>`;
      }
      return `<div class="p-item"><div class="p-row">${num}<span class="p-text">${itemText(it, lang)}</span><span class="p-blank">__________</span>${marks}</div></div>`;
    }
    case 'fill': {
      const txt = nl2br(it.text).replace(/_{3,}|\[\s*\]/g, '<span class="p-gap"></span>');
      const txt2 = lang === 'bi' && it.text2 ? `<span class="p-alt-line">${nl2br(it.text2).replace(/_{3,}|\[\s*\]/g, '<span class="p-gap"></span>')}</span>` : '';
      return `<div class="p-item"><div class="p-row">${num}<span class="p-text">${txt}${txt2}</span>${marks}</div></div>`;
    }
    case 'paragraph':
      return `<div class="p-item"><div class="p-row">${num}<span class="p-text">${itemText(it, lang)}</span>${marks}</div>${lines(it.lines ?? 10)}</div>`;
    case 'short':
    default:
      return `<div class="p-item"><div class="p-row">${num}<span class="p-text">${itemText(it, lang)}</span>${marks}</div>${lines(it.lines ?? 2)}</div>`;
  }
}

function renderMatching(b, qNo, lang) {
  const items = b.items || [];
  const colB = matchingColumnB(b);
  const rows = Math.max(items.length, colB.length);
  let body = '';
  for (let r = 0; r < rows; r++) {
    const it = items[r];
    const e = colB[r];
    body += `<tr>
      <td>${it ? `${qNo}.${r + 1}. ${esc(it.left)}${lang === 'bi' && it.left2 ? `<span class="p-alt-line">${esc(it.left2)}</span>` : ''}` : ''}</td>
      <td>${e ? `<span class="p-letter">${LETTERS[r]}.</span> ${esc(e.text)}${lang === 'bi' && e.text2 ? `<span class="p-alt-line">${esc(e.text2)}</span>` : ''}` : ''}</td>
      <td class="p-ans">${it ? `${qNo}.${r + 1}. ________ <span class="p-marks">(${Number(it.marks) || 0})</span>` : ''}</td>
    </tr>`;
  }
  return `<table class="p-table p-match"><thead><tr><th>${t('colA', lang)}</th><th>${t('colB', lang)}</th><th class="p-ans">${t('answer', lang)}</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderRubric(rub, lang) {
  if (!rub || !(rub.rows || []).length) return '';
  const cols = rub.cols || [];
  return `<div class="p-rubric-wrap"><p class="p-instr"><b>${dual('Die volgende rubriek sal gebruik word om jou antwoord na te sien:', 'The following rubric will be used to mark your answer:', lang)}</b></p>
  <table class="p-table p-rubric"><thead><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${rub.rows.map(r => `<tr><td><b>${esc(r.name)}</b></td>${cols.map((_, i) => `<td>${esc((r.cells || [])[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="${cols.length + 1}" class="p-center"><b>${t('mark', lang)}: ____ / ${rubricMax(rub)}</b></td></tr></tfoot></table></div>`;
}
export function rubricMax(rub) {
  const nums = (rub?.cols || []).map(c => parseFloat(c)).filter(n => !isNaN(n));
  const per = nums.length ? Math.max(...nums) : 0;
  return per * (rub?.rows || []).length;
}

// Numbered structure shared by editor + print.
// Questions → 1, 2, 3 · sections → A, B · labelled sources → A, B, C
export function numberBlocks(paper) {
  let q = 0, s = 0, src = 0;
  return (paper.blocks || []).map(b => {
    if (b.kind === 'question') return { b, qNo: ++q };
    if (b.kind === 'section') return { b, sLetter: LETTERS[s++] };
    if (b.kind === 'source' && b.label && b.label !== 'none') return { b, srcLetter: LETTERS[src++] };
    return { b };
  });
}
export function sourceLetters(paper) {
  const m = {};
  numberBlocks(paper).forEach(x => { if (x.srcLetter) m[x.b.id] = x.srcLetter; });
  return m;
}
export function sourceLabel(b, letter, lang) {
  if (!letter) return '';
  const key = b.label === 'text' ? 'text' : 'source';
  if (lang === 'bi') return `${PL[key].af} ${letter} / ${PL[key].en} ${letter}`;
  return `${(PL[key][lang] || PL[key].en)} ${letter}`;
}
function renderSource(b, letter, lang) {
  const label = sourceLabel(b, letter, lang);
  const tbl = b.sType === 'table' && b.table?.rows?.length
    ? `<table class="p-table p-srctable">${b.table.rows.map((r, i) => `<tr>${r.map(c => (i === 0 && b.table.header !== false) ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const ref = b.reference ? `<div class="p-srcref">${lang === 'en' ? 'Source' : lang === 'af' ? 'Bron' : 'Bron / <i>Source</i>'}: ${esc(b.reference)}</div>` : '';
  return `<div class="p-source ${b.boxed === false ? 'p-noborder' : ''}">
    ${label ? `<div class="p-source-title">${label}</div>` : ''}
    ${b.title ? `<div class="p-source-sub">${esc(b.title)}</div>` : ''}
    ${b.text ? `<div class="p-source-text">${nl2br(b.text)}</div>` : ''}
    ${tbl}
    ${b.image ? `<img class="p-img" src="${b.image}" alt="" style="max-width:${b.imgWidth || 100}%">` : ''}
    ${b.caption ? `<div class="p-caption">${esc(b.caption)}</div>` : ''}
    ${ref}
  </div>`;
}
function refLine(b, letters, srcBlock, lang, addendum) {
  const L = letters[b.sourceRef];
  if (!L || b.refLine === false) return '';
  const isText = srcBlock?.label === 'text';
  const af = `Verwys na ${isText ? 'TEKS' : 'BRON'} ${L}${addendum ? ' in die bylaag' : ''} en beantwoord die vrae wat volg.`;
  const en = `Refer to ${isText ? 'TEXT' : 'SOURCE'} ${L}${addendum ? ' in the addendum' : ''} and answer the questions that follow.`;
  if (lang === 'af') return `<p class="p-instr"><b>${af}</b></p>`;
  if (lang === 'en') return `<p class="p-instr"><b>${en}</b></p>`;
  return `<p class="p-instr"><b>${af}</b></p><p class="p-instr p-alt"><b>${en}</b></p>`;
}
export function sectionMarks(paper, idx) {
  let sum = 0;
  const bl = paper.blocks || [];
  for (let i = idx + 1; i < bl.length && bl[i].kind !== 'section'; i++) if (bl[i].kind === 'question') sum += blockMarks(bl[i]);
  return sum;
}

function header(paper, settings, lang, total, { memo = false } = {}) {
  const subj = subjectNames(paper, settings);
  const form = paper.form || {};
  const school = paper.showSchool !== false ? `<div class="ph-school">${esc(SCHOOL[lang] || SCHOOL.en)}</div>` : '';
  const gradeLine = lang === 'bi'
    ? `<b>Graad ${esc(paper.grade)}</b> / <b><i>Grade</i> ${esc(paper.grade)}</b>`
    : `<b>${t('grade', lang)} ${esc(paper.grade)}</b>`;
  const termTxt = paper.term ? ` &nbsp;·&nbsp; ${th('term', lang)} ${esc(paper.term)}` : '';
  const dateTxt = paper.date ? esc(paper.date.split('-').reverse().join(' / ')) : '____ / ____ / ______';
  const edu = (paper.educators || '').trim();
  const eduKey = edu.includes(',') ? 'educators' : 'educator';
  const formRows = lang === 'bi'
    ? `<div>${PLf('Vorm van Assessering')}: ${esc(form.af || '')}</div><div><i>Form of Assessment</i>: ${esc(form.en || '')}</div>`
    : `<div>${th('form', lang)}: ${esc(lang === 'af' ? form.af : form.en)}</div>`;
  const nameRows = memo ? '' : (lang === 'bi'
    ? `<div>Naam &amp; Van:</div><div><i>Name and Surname</i>: <span class="ph-fill"></span></div>`
    : `<div>${th('name', lang)}: <span class="ph-fill"></span></div>`);
  return `<div class="ph-box">
    <div class="ph-top">
      <img class="ph-emblem ${paper.emblemColour ? '' : 'ph-grey'}" src="assets/emblem.png" alt="">
      <div class="ph-title">
        ${school}
        <div class="ph-subject"><b>${dual(subj.af, subj.en, lang)}</b></div>
        <div class="ph-grade">${gradeLine} <span class="ph-class">____</span>${termTxt}</div>
        ${memo ? `<div class="ph-memo">${t('memo', lang === 'bi' ? 'af' : lang)}</div>` : ''}
      </div>
      <div class="ph-circle"><span></span><span class="ph-total">${total}</span></div>
    </div>
    <div class="ph-grid">
      <div class="ph-col">
        ${formRows}
        ${nameRows}
        ${edu ? `<div class="ph-edu">${th(eduKey, lang)}: <u>${esc(edu)}</u></div>` : ''}
      </div>
      <div class="ph-col">
        <div>${th('task', lang)} ${esc(paper.taskNo || '')}${lang === 'bi' ? '' : ''}</div>
        <div>${th('time', lang)}: ${esc(formatDuration(paper.duration, lang))}</div>
        <div>${th('date', lang)}: <u>${dateTxt}</u></div>
        ${paper.moderator ? `<div>${th('moderator', lang)}: <u>${esc(paper.moderator)}</u></div>` : ''}
      </div>
    </div>
  </div>`;
}
const PLf = s => s;

export function renderQuestionPaper(paper, settings) {
  const lang = paper.lang || 'en';
  const a = analyse(paper, settings);
  let html = header(paper, settings, lang, a.total);
  const nb = numberBlocks(paper);
  const letters = sourceLetters(paper);
  const addendum = !!paper.sourcesAddendum;
  nb.forEach(({ b, qNo, sLetter, srcLetter }, idx) => {
    if (b.kind === 'section') {
      const sm = sectionMarks(paper, idx);
      html += `<div class="p-section">${t('section', lang)} ${sLetter}${b.title ? ': ' + esc(b.title) : ''}${sm ? ` <span>[${sm}]</span>` : ''}</div>`;
      if (b.text) html += `<p class="p-instr">${nl2br(b.text)}</p>`;
    } else if (b.kind === 'source') {
      if (!addendum || b.label === 'none' || !b.label) html += renderSource(b, srcLetter, lang);
    } else if (b.kind === 'question') {
      const items = b.items || [];
      const single = items.length === 1;
      const srcBlock = (paper.blocks || []).find(x => x.id === b.sourceRef);
      let inner = `<div class="p-keep"><div class="p-qhead">${t('question', lang)} ${qNo}</div>${refLine(b, letters, srcBlock, lang, addendum && srcBlock && srcBlock.label && srcBlock.label !== 'none')}${instr(b, lang)}</div>`;
      if (b.image) inner += `<div class="p-center"><img class="p-img" src="${b.image}" alt="" style="max-width:${b.imgWidth || 80}%"></div>${b.caption ? `<div class="p-caption">${esc(b.caption)}</div>` : ''}`;
      if (b.type === 'matching') inner += renderMatching(b, qNo, lang);
      else inner += items.map((it, i) => renderItem(b, it, single ? '' : `${qNo}.${i + 1}`, lang)).join('');
      if (b.type === 'paragraph' || b.type === 'short') inner += renderRubric(b.rubric, lang);
      inner += `<div class="p-qtotal">[${blockMarks(b)}]</div>`;
      html += `<div class="p-question">${inner}</div>`;
    }
  });
  const totTxt = lang === 'bi' ? `TOTAAL: ${a.total} PUNTE / <i>TOTAL: ${a.total} MARKS</i>` : `${t('total', lang)}: ${a.total} ${t('marks', lang)}`;
  html += `<div class="p-end"><div class="p-endline"></div><b>${totTxt}</b></div>`;
  return `<section class="sheet sheet-paper">${html}</section>`;
}

function memoAnswer(b, it, lang) {
  switch (b.type) {
    case 'mcq': {
      const i = Number(it.answer);
      const o = (it.options || [])[i];
      return o !== undefined ? `<b>${LETTERS[i]}</b> – ${esc(o)}` : '<span class="p-missing">No answer set</span>';
    }
    case 'tf': {
      const v = it.answer === false || it.answer === 'false' ? t('false', lang) : t('true', lang);
      return b.style === 'correct' ? (it.memo ? nl2br(it.memo) : '<span class="p-missing">No answer set</span>') : `<b>${v}</b>${it.memo ? ' – ' + nl2br(it.memo) : ''}`;
    }
    case 'matching': return `<b>${matchingAnswer(b, it)}</b> – ${esc(it.right)}`;
    default:
      return it.memo ? nl2br(it.memo) : (b.rubric?.rows?.length ? dual('Gebruik rubriek', 'Use rubric', lang) : '<span class="p-missing">No answer set</span>');
  }
}

export function renderMemo(paper, settings) {
  const lang = paper.lang || 'en';
  const a = analyse(paper, settings);
  let html = header(paper, settings, lang, a.total, { memo: true });
  html += `<table class="p-table p-memo"><thead><tr><th style="width:12%">Nr.</th><th>${t('answer', lang)}</th><th style="width:9%">${dual('Punte', 'Marks', lang)}</th><th style="width:15%">Bloom</th></tr></thead><tbody>`;
  for (const { b, qNo } of numberBlocks(paper)) {
    if (b.kind !== 'question') continue;
    html += `<tr class="p-memo-q"><td colspan="4"><b>${t('question', lang)} ${qNo}</b> <span class="p-right">[${blockMarks(b)}]</span></td></tr>`;
    const items = b.items || [];
    items.forEach((it, i) => {
      const lv = levelByN(it.bloom);
      html += `<tr><td>${items.length > 1 ? `${qNo}.${i + 1}` : qNo}</td><td>${memoAnswer(b, it, lang)}</td><td class="p-center">${Number(it.marks) || 0}</td><td>${lv ? `${lv.n}. ${lang === 'af' ? lv.af : lv.en}` : '<span class="p-missing">—</span>'}</td></tr>`;
    });
    if (b.rubric?.rows?.length) html += `<tr><td></td><td colspan="3">${renderRubric(b.rubric, lang)}</td></tr>`;
  }
  html += `</tbody></table><div class="p-end"><div class="p-endline"></div><b>${t('total', lang)}: ${a.total}</b></div>`;
  return `<section class="sheet sheet-memo">${html}</section>`;
}

export function renderAnalysis(paper, settings, owner) {
  const lang = paper.lang || 'en';
  const af = lang === 'af';
  const a = analyse(paper, settings);
  const subj = subjectNames(paper, settings);
  const mapping = settings.mapping;
  const statusTxt = s => ({ ok: '✔ Within target', low: '▼ Below target', high: '▲ Above target', none: '—' }[s]);
  let html = `<div class="pa-head">
    <img class="ph-emblem ph-grey" src="assets/emblem.png" alt="">
    <div><div class="pa-title">${t('analysis', lang === 'bi' ? 'en' : lang)}</div>
    <div>${esc(af ? subj.af : subj.en)} · ${t('grade', lang === 'bi' ? 'en' : lang)} ${esc(paper.grade)} · ${t('task', lang === 'bi' ? 'en' : lang)} ${esc(paper.taskNo || '')} · ${esc((paper.form || {})[af ? 'af' : 'en'] || '')}</div></div>
  </div>
  <table class="p-table pa-sum"><thead><tr><th>Order</th><th>Bloom's levels</th><th>Target %</th><th>Target marks</th><th>Actual marks</th><th>Actual %</th><th>Status</th></tr></thead><tbody>`;
  for (const o of ORDERS) {
    const lvls = Object.keys(mapping).filter(k => mapping[k] === o).map(k => levelByN(k)[af ? 'af' : 'en']).join(', ');
    const tgt = a.target ? a.target[o] : null;
    html += `<tr><td><b>${af ? ORDER_LABEL_AF[o] : ORDER_LABEL[o]}</b></td><td>${lvls}</td><td class="p-center">${tgt ?? '—'}${tgt != null ? '%' : ''}</td><td class="p-center">${tgt != null ? Math.round(a.total * tgt / 10) / 10 : '—'}</td><td class="p-center">${a.byOrder[o]}</td><td class="p-center">${a.pct[o]}%</td><td class="pa-${a.status[o]}">${statusTxt(a.status[o])}</td></tr>`;
  }
  html += `<tr class="pa-total"><td colspan="4"><b>Total</b> (tolerance ±${a.tolerance}%)</td><td class="p-center"><b>${a.total}</b></td><td class="p-center">100%</td><td>${a.unassigned ? `<span class="p-missing">${a.unassigned} marks without a level</span>` : ''}</td></tr></tbody></table>`;

  html += `<table class="p-table pa-items"><thead><tr><th>Question</th><th>Marks</th>${[1, 2, 3, 4, 5, 6].map(n => `<th>${n}. ${levelByN(n)[af ? 'af' : 'en']}</th>`).join('')}</tr></thead><tbody>`;
  for (const x of a.items) {
    html += `<tr><td>${x.label}</td><td class="p-center">${x.marks}</td>${[1, 2, 3, 4, 5, 6].map(n => `<td class="p-center">${x.bloom === n ? x.marks : ''}</td>`).join('')}</tr>`;
  }
  html += `<tr class="pa-total"><td><b>Total</b></td><td class="p-center"><b>${a.total}</b></td>${[1, 2, 3, 4, 5, 6].map(n => `<td class="p-center"><b>${a.byLevel[n] || ''}</b></td>`).join('')}</tr></tbody></table>`;
  html += `<div class="pa-sign">
    <div>Educator: <span class="ph-fill">${esc(owner || '')}</span></div><div>Signature: <span class="ph-fill"></span></div><div>Date: <span class="ph-fill"></span></div>
    <div>HOD / Moderator: <span class="ph-fill">${esc(paper.moderator || '')}</span></div><div>Signature: <span class="ph-fill"></span></div><div>Date: <span class="ph-fill"></span></div>
  </div>`;
  return `<section class="sheet sheet-analysis">${html}</section>`;
}

// Sources printed separately as an addendum / source booklet (BYLAAG).
export function hasAddendum(paper) {
  return !!paper.sourcesAddendum && numberBlocks(paper).some(x => x.srcLetter);
}
export function renderAddendum(paper, settings) {
  const lang = paper.lang || 'en';
  const subj = subjectNames(paper, settings);
  const title = lang === 'bi' ? `${PL.addendum.af}: ${PL.sources.af} / <i>${PL.addendum.en}: ${PL.sources.en}</i>` : `${t('addendum', lang)}: ${t('sources', lang)}`;
  let html = `<div class="pa-head">
    <img class="ph-emblem ${paper.emblemColour ? '' : 'ph-grey'}" src="assets/emblem.png" alt="">
    <div><div class="pa-title">${title}</div>
    <div>${dual(subj.af, subj.en, lang)} · ${lang === 'bi' ? 'Graad / <i>Grade</i>' : t('grade', lang)} ${esc(paper.grade)}${paper.taskNo ? ` · ${th('task', lang)} ${esc(paper.taskNo)}` : ''}</div></div>
  </div>`;
  for (const x of numberBlocks(paper)) if (x.srcLetter) html += renderSource(x.b, x.srcLetter, lang);
  return `<section class="sheet sheet-addendum">${html}</section>`;
}
