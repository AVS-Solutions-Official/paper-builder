// Paper editor: canvas of blocks, question toolbar, Bloom's balance, block editor modal.
import { S, go, setTop, refreshMyPapers, subjName, paperTitle, bloomRef, bankFilters, bankFilter, bankItemHtml } from './app.js';
import { store, newId } from './store.js';
import { esc, nl2br, icon, toast, openModal, confirmBox, $, $$, readImage } from './ui.js';
import { LEVELS, ORDERS, ORDER_LABEL, analyse, blockMarks, levelByN, suggestLevel, subjectById } from './bloom.js';
import { t, TYPE_INFO, DEFAULT_INSTR, FORMS, formatDuration } from './i18n.js';
import { newPaper, newBlock, newItem, cloneBlock, clonePaper, shuffleKeys, displayName } from './model.js';
import { numberBlocks, sectionMarks, matchingColumnB, matchingAnswer, renderAnalysis, rubricMax, sourceLetters, sourceLabel } from './render.js';

let E = null; // editor state { paper, dirty, isNew }
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function editorGuard() {
  if (!E || !E.dirty) return true;
  const ok = await confirmBox('Unsaved changes', 'You have changes that are not saved yet. Leave this paper without saving?', 'Leave without saving');
  if (ok) E.dirty = false;
  return ok;
}
window.addEventListener('beforeunload', e => { if (E && E.dirty) { e.preventDefault(); e.returnValue = ''; } });

let pendingDraft = null;
// Open an unsaved, generated/imported paper in the editor.
export function openDraft(paper, banner) {
  pendingDraft = { paper, banner };
  try { sessionStorage.setItem('kps_draft', JSON.stringify(pendingDraft)); } catch {}
  go('#/create?draft=' + paper.id);
}

export async function renderEditor(view, { id, template, asTemplate, bank, draft } = {}) {
  let paper, isNew = false, banner = '', dirty = false;
  if (draft && (!pendingDraft || pendingDraft.paper.id !== draft)) {
    // Page was reloaded: recover the unsaved generated/imported paper.
    try { const d = JSON.parse(sessionStorage.getItem('kps_draft') || 'null'); if (d && d.paper.id === draft) pendingDraft = d; } catch {}
  }
  if (draft && pendingDraft && pendingDraft.paper.id === draft) {
    paper = pendingDraft.paper; banner = pendingDraft.banner; isNew = true; dirty = true;
  } else if (id) {
    paper = await store.getPaper(id);
    if (!paper) { view.innerHTML = `<div class="card empty">This paper could not be found.</div>`; return; }
    if (paper.ownerUid !== S.user.uid) { toast('This paper belongs to a colleague — opening print view. Use "Copy" to make your own version.', 'info', 5000); return go('#/print/' + id); }
  } else if (template) {
    const tp = await store.getPaper(template);
    if (!tp) { toast('Template not found.', 'err'); return go('#/templates'); }
    paper = clonePaper(tp, S.user, { isTemplate: false, title: '' });
    isNew = true; dirty = true;
  } else {
    paper = newPaper(S.user, S.settings, { isTemplate: !!asTemplate });
    isNew = true;
    if (bank) {
      const entry = (await store.listBank()).find(e => e.id === bank);
      if (entry) { paper.blocks.push(cloneBlock(entry.block)); paper.subject = entry.subject; paper.grade = entry.grade; dirty = true; }
    }
  }
  E = { paper, dirty, isNew };
  view.innerHTML = `
  <div class="editor">
    <div class="paper-card">
      ${banner ? `<div class="draft-banner">${icon('sparkle', 18)}<div>${banner}</div><button class="icon-btn" id="dbx" aria-label="Dismiss">${icon('x', 15)}</button></div>` : ''}
      <div class="pc-head" id="pchead"></div>
      <div class="blocks" id="blocks"></div>
      <div id="pempty"></div>
      <button class="dropzone" id="dz" type="button"><b>+ Add New Question</b><div>(Drag &amp; Drop here)</div></button>
    </div>
    <aside class="toolbar" aria-label="Question toolbar">
      <div class="toolbar-head">Question Toolbar</div>
      <div class="toolbar-scroll">
        <div class="tools">
          ${tool('mcq', 'Multiple Choice', 'mcq')}${tool('tf', 'True / False', 'tf')}
          ${tool('short', 'Short Answer', 'short')}${tool('paragraph', 'Paragraph', 'paragraph')}
          ${tool('matching', 'Matching', 'matching')}${tool('image', 'Add Image', 'image')}
        </div>
        <div class="tools-sub">More</div>
        <div class="tools-mini">
          ${tool('section', 'Section', 'section')}${tool('passage', 'Source', 'passage')}
          ${tool('fill', 'Fill in Blank', 'fill')}${tool('bank', 'From Bank', 'bank', false)}
          ${tool('pictures', 'Pictures', 'image', false)}${tool('report', 'Update report', 'info', false)}
        </div>
        <div class="balance" id="balance"></div>
      </div>
      <div class="toolbar-foot">
        <button class="btn btn-red btn-lg" id="gen">Generate &amp; Print PDF</button>
        <button class="btn btn-gold btn-lg" id="save">${paper.isTemplate ? 'Save Template' : 'Save Paper'}</button>
        <button class="link-btn" id="cancel">Cancel</button>
      </div>
    </aside>
  </div>`;

  drawHead(); drawBlocks(); drawBalance();
  $('#dbx')?.addEventListener('click', e => e.currentTarget.parentElement.remove());
  view.querySelector('[data-report]')?.addEventListener('click', () => import('./auto.js').then(m => m.openUpdateReport(E.paper)));
  const rt = view.querySelector('[data-tool="report"]'); if (rt && !paper.origin?.report) rt.style.display = 'none';
  // Warn about blurry pictures once when a paper opens.
  import('./pictures.js').then(async m => {
    const low = (await m.scanPictures(paper)).filter(x => x.low).length;
    const pt = view.querySelector('[data-tool="pictures"]');
    if (pt && low) { pt.classList.add('tool-warn'); pt.title = `${low} picture${low === 1 ? '' : 's'} may print blurry — click to improve`; }
  });
  wireToolbar(view); wireCanvas(view);
  $('#save').onclick = () => save();
  $('#gen').onclick = async () => { if (await save()) go('#/print/' + E.paper.id); };
  $('#cancel').onclick = () => go(E.paper.isTemplate ? '#/templates' : '#/papers');
  view.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
  if (isNew && !template && !bank && !banner) openDetails(true);
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && E && (S.route === 'edit' || S.route === 'create') && !document.querySelector('.modal-wrap')) { e.preventDefault(); save(); }
});

const tool = (key, label, ic, drag = true) =>
  `<button class="tool" type="button" data-tool="${key}" ${drag ? 'draggable="true"' : ''} title="${drag ? 'Click to add, or drag onto the paper' : 'Insert a saved question'}">${icon(ic, 26)}<span>${label}</span></button>`;

function markDirty() { E.dirty = true; drawHead(); drawBalance(); }

// ───────────── header / topbar ─────────────
function drawHead() {
  const p = E.paper;
  const subj = subjectById(S.settings, p.subject);
  const langLbl = { bi: 'Bilingual', af: 'Afrikaans', en: 'English' }[p.lang];
  const tot = analyse(p, S.settings).total;
  const kind = p.isTemplate ? 'Template' : E.isNew ? 'New Question Paper' : 'Edit Question Paper';
  setTop(`${kind}: Grade ${p.grade} - ${subj?.en || 'Subject'}`,
    `Time: ${esc(formatDuration(p.duration, 'en'))} | Total Marks: ${tot}${p.totalMarks && Number(p.totalMarks) !== tot ? ` of ${p.totalMarks} planned` : ''} | Kathu Primary School${E.dirty ? ' · <span style="color:var(--amber)">Unsaved changes</span>' : ''}`);
  $('#pchead').innerHTML = `
    <img src="assets/emblem.png" alt="">
    <div style="min-width:0">
      <h2>KATHU PRIMARY SCHOOL</h2>
      <div class="sub">${esc(subj?.en || '')} - Grade ${esc(p.grade)}</div>
      <div class="meta">${esc(p.form?.en || '')}${p.taskNo ? ' · Task ' + esc(p.taskNo) : ''} · ${esc(formatDuration(p.duration, 'en'))} · ${langLbl}${p.title ? ' · ' + esc(p.title) : ''}${p.isTemplate ? ' · <b>Template</b>' : ''}</div>
    </div>
    <button class="btn btn-outline btn-sm" id="details">${icon('sliders', 15)} Paper details</button>`;
  $('#details').onclick = () => openDetails(false);
}

function openDetails(first) {
  const p = E.paper;
  const formIdx = FORMS.findIndex(f => f.af === p.form?.af && f.en === p.form?.en);
  const m = openModal({
    title: first ? 'New paper — details' : 'Paper details',
    wide: true,
    body: `
      ${first ? `<p class="muted" style="margin-top:0">These details appear in the header box of the printed paper. You can change them at any time.</p>` : ''}
      <div class="grid-3">
        <label class="field"><span>Subject</span><select class="input" name="subject">${S.settings.subjects.map(s => `<option value="${s.id}" ${p.subject === s.id ? 'selected' : ''}>${esc(s.en)}</option>`).join('')}</select></label>
        <label class="field"><span>Grade</span><select class="input" name="grade">${['R', 1, 2, 3, 4, 5, 6, 7].map(g => `<option ${String(p.grade) === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Term</span><select class="input" name="term"><option value="">—</option>${[1, 2, 3, 4].map(g => `<option ${String(p.term) === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div>
      <div class="field"><span>Paper language</span><div class="seg" id="langseg">${[['bi', 'Bilingual (Afr / Eng)'], ['af', 'Afrikaans'], ['en', 'English']].map(([v, l]) => `<button type="button" data-lang="${v}" class="${p.lang === v ? 'on' : ''}">${l}</button>`).join('')}</div><small>Controls labels such as VRAAG / QUESTION and TOTAAL / TOTAL, and which instruction fields you fill in.</small></div>
      <div class="grid-3">
        <label class="field"><span>Form of assessment</span><select class="input" name="form">${FORMS.map((f, i) => `<option value="${i}" ${i === formIdx ? 'selected' : ''}>${f.af} / ${f.en}</option>`).join('')}${formIdx === -1 ? `<option value="custom" selected>${esc(p.form?.af)} / ${esc(p.form?.en)}</option>` : ''}</select></label>
        <label class="field"><span>Task no.</span><input class="input" name="taskNo" value="${esc(p.taskNo)}" placeholder="e.g. 3.2"></label>
        <label class="field"><span>Date</span><input class="input" type="date" name="date" value="${esc(p.date)}"></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Duration (minutes)</span><input class="input" type="number" min="5" step="5" name="duration" value="${esc(p.duration)}"></label>
        <label class="field"><span>Planned total marks</span><input class="input" type="number" min="0" name="totalMarks" value="${esc(p.totalMarks)}"><small>Used to warn you if the questions don't add up.</small></label>
        <label class="field"><span>Paper name (optional)</span><input class="input" name="title" value="${esc(p.title)}" placeholder="e.g. Term 3 Test"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Educator(s)</span><input class="input" name="educators" value="${esc(p.educators)}" placeholder="e.g. N. Erasmus, T. Whitehorn"></label>
        <label class="field"><span>Moderator</span><input class="input" name="moderator" value="${esc(p.moderator)}" placeholder="e.g. M. Wilson"></label>
      </div>
      <label class="check"><input type="checkbox" name="showSchool" ${p.showSchool !== false ? 'checked' : ''}> Print the school name in the header</label>
      <label class="check"><input type="checkbox" name="emblemColour" ${p.emblemColour ? 'checked' : ''}> Print the emblem in colour (default is light grey, which photocopies better)</label>
      <label class="check"><input type="checkbox" name="sourcesAddendum" ${p.sourcesAddendum ? 'checked' : ''}> Print labelled sources (BRON A, B…) in a separate addendum / source booklet (BYLAAG) instead of inside the paper</label>`,
    footer: `<button class="btn btn-ghost" data-close>${first ? 'Skip' : 'Cancel'}</button><button class="btn btn-gold" id="dok">${first ? 'Start building' : 'Apply'}</button>`
  });
  let lang = p.lang;
  $$('[data-lang]', m.el).forEach(b => b.onclick = () => { lang = b.dataset.lang; $$('[data-lang]', m.el).forEach(x => x.classList.toggle('on', x === b)); });
  $('#dok', m.el).onclick = () => {
    const v = n => $(`[name="${n}"]`, m.el);
    const fi = v('form').value;
    Object.assign(p, {
      subject: v('subject').value, grade: v('grade').value, term: v('term').value, lang,
      form: fi === 'custom' ? p.form : { ...FORMS[Number(fi)] },
      taskNo: v('taskNo').value.trim(), date: v('date').value, duration: Number(v('duration').value) || 60,
      totalMarks: Number(v('totalMarks').value) || 0, title: v('title').value.trim(),
      educators: v('educators').value.trim(), moderator: v('moderator').value.trim(),
      showSchool: v('showSchool').checked, emblemColour: v('emblemColour').checked, sourcesAddendum: v('sourcesAddendum').checked
    });
    m.close(); markDirty(); drawBlocks();
  };
}

// ───────────── canvas ─────────────
function itemSummary(b, it, lang) {
  const alt = lang === 'bi' && it.text2 ? `<span class="alt">${esc(it.text2)}</span>` : '';
  switch (b.type) {
    case 'mcq': return `${esc(it.text) || '<i class="muted">(no question text)</i>'}${alt}<div class="opts">${(it.options || []).filter(Boolean).map((o, i) => `${i === Number(it.answer) ? '<b>' : ''}${LET[i]}. ${esc(o)}${i === Number(it.answer) ? ' ✓</b>' : ''}`).join(' &nbsp; ')}</div>`;
    case 'tf': return `${esc(it.text) || '<i class="muted">(no statement)</i>'}${alt}<div class="opts">${b.style === 'correct' ? 'Correct the statement' : 'Answer: ' + (it.answer === false ? 'False' : 'True')}</div>`;
    case 'matching': return `${esc(it.left) || '<i class="muted">(term)</i>'} → <b>${matchingAnswer(b, it)}</b>. ${esc(it.right)}`;
    default: return (esc(it.text) || '<i class="muted">(no question text)</i>') + alt;
  }
}

function blockHtml({ b, qNo, sLetter, srcLetter }, idx) {
  const p = E.paper, lang = p.lang;
  const actions = (extra = '') => `<div class="blk-actions">
      <button class="act act-edit" data-edit="${b.id}">${icon('edit', 17)} edit</button>
      <button class="act act-move" data-move="${b.id}" draggable="true" title="Drag to move">${icon('move', 17)} move</button>
      <button class="act act-plain" data-up="${b.id}" title="Move up" aria-label="Move up">${icon('up', 16)}</button>
      <button class="act act-plain" data-down="${b.id}" title="Move down" aria-label="Move down">${icon('down', 16)}</button>
      ${extra}
      <button class="act act-del push" data-del="${b.id}">${icon('trash', 17)} Delete</button>
    </div>`;
  if (b.kind === 'section') {
    const sm = sectionMarks(p, idx);
    return `<div class="blk blk-section" data-id="${b.id}"><div class="blk-body"><div class="sec-title">${t('section', lang)} ${sLetter}${b.title ? ': ' + esc(b.title) : ''} ${sm ? `<span>[${sm} ${t('marks', lang)}]</span>` : ''}</div>${b.text ? `<div class="blk-instr">${nl2br(b.text)}</div>` : ''}</div>${actions()}</div>`;
  }
  if (b.kind === 'source') {
    const lbl = sourceLabel(b, srcLetter, lang);
    const used = p.blocks.filter(x => x.sourceRef === b.id).length;
    const tbl = b.sType === 'table' && b.table?.rows?.length ? `<div class="table-wrap"><table class="src-tbl">${b.table.rows.map((r, i) => `<tr>${r.map(c => i === 0 && b.table.header !== false ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
    return `<div class="blk" data-id="${b.id}"><div class="blk-body">
      <div class="passage-label"><b>${esc(lbl || 'Passage / Source')}</b>${b.title ? ' · ' + esc(b.title) : ''}${p.sourcesAddendum && lbl ? ' <span class="pill pill-navy">printed in addendum</span>' : ''}${used ? ` <span class="pill pill-grey">${used} question${used === 1 ? '' : 's'} linked</span>` : ''}</div>
      ${b.text ? `<div class="passage">${nl2br(b.text)}</div>` : ''}
      ${tbl}
      ${b.image ? `<img class="thumb" src="${b.image}" alt="">` : ''}
      ${b.reference ? `<div class="small muted" style="text-align:right;margin-top:4px"><i>${esc(b.reference)}</i></div>` : ''}
      ${!b.text && !b.image && !tbl ? '<div class="muted small">Empty — click edit to add text, a table or an image.</div>' : ''}
    </div>${actions(`<button class="act act-plain" data-bank="${b.id}" title="Save this source to the shared bank">${icon('bank', 15)} Save to bank</button>`)}</div>`;
  }
  const items = b.items || [];
  const instr = lang === 'en' ? esc(b.instr?.en) : lang === 'af' ? esc(b.instr?.af) : `${esc(b.instr?.af)}${b.instr?.en ? `<br><i>${esc(b.instr.en)}</i>` : ''}`;
  return `<div class="blk" data-id="${b.id}"><div class="blk-body">
    <div class="blk-title">${t('question', lang)} ${qNo} <span class="tag">${TYPE_INFO[b.type]?.label || ''}</span><span class="mk">[${blockMarks(b)}]</span></div>
    ${b.sourceRef && sourceLetters(p)[b.sourceRef] ? `<div class="src-link">${icon('passage', 14)} Refers to ${esc(sourceLabel(p.blocks.find(x => x.id === b.sourceRef), sourceLetters(p)[b.sourceRef], 'en'))}</div>` : ''}
    ${instr ? `<div class="blk-instr">${instr}</div>` : ''}
    ${b.image ? `<img class="thumb" src="${b.image}" alt="">` : ''}
    <div class="blk-items">${items.map((it, i) => {
      const lv = levelByN(it.bloom);
      return `<div class="bi"><span class="n">${items.length > 1 ? `${qNo}.${i + 1}` : ''}</span><div>${itemSummary(b, it, lang)}</div>
        <div class="meta"><span>(${Number(it.marks) || 0})</span>${lv ? `<span class="pill pill-l${lv.n}" title="${ORDER_LABEL[S.settings.mapping[lv.n]]}">${lv.n}. ${lv.en}</span>` : `<span class="pill pill-warn">${icon('warn', 12)} No level</span>`}</div></div>`;
    }).join('')}${!items.length ? '<div class="muted small">No items yet — click edit.</div>' : ''}</div>
  </div>${actions(`<button class="act act-plain" data-dup="${b.id}" title="Duplicate">${icon('copy', 15)}</button><button class="act act-plain" data-bank="${b.id}" title="Save to the shared question bank">${icon('bank', 15)} Save to bank</button>`)}</div>`;
}

function drawBlocks() {
  const nb = numberBlocks(E.paper);
  $('#blocks').innerHTML = nb.map((x, i) => blockHtml(x, i)).join('');
  $('#pempty').innerHTML = nb.length ? '' : `<div class="paper-empty">Your paper is empty. Click a question type in the toolbar — or drag one onto the box below — to add your first question.</div>`;
}

const idxOf = id => E.paper.blocks.findIndex(b => b.id === id);

function wireCanvas(view) {
  const blocks = $('#blocks');
  blocks.addEventListener('click', async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const d = btn.dataset; const bl = E.paper.blocks;
    if (d.edit) openBlockEditor(bl[idxOf(d.edit)]);
    else if (d.up || d.down) {
      const i = idxOf(d.up || d.down), j = d.up ? i - 1 : i + 1;
      if (j < 0 || j >= bl.length) return;
      [bl[i], bl[j]] = [bl[j], bl[i]]; drawBlocks(); markDirty();
    } else if (d.del) {
      const b = bl[idxOf(d.del)];
      const what = b.kind === 'question' ? `this question (${blockMarks(b)} marks)` : b.kind === 'section' ? 'this section heading' : 'this source';
      if (b.kind === 'source') bl.forEach(x => { if (x.sourceRef === b.id) x.sourceRef = ''; });
      if (!await confirmBox('Delete?', `Delete ${what} from the paper?`)) return;
      bl.splice(idxOf(d.del), 1); drawBlocks(); markDirty();
    } else if (d.dup) {
      bl.splice(idxOf(d.dup) + 1, 0, cloneBlock(bl[idxOf(d.dup)])); drawBlocks(); markDirty(); toast('Question duplicated.');
    } else if (d.bank) saveToBank(bl[idxOf(d.bank)]);
    else if (d.move) toast('Drag the move button to reposition, or use the arrows.', 'info');
  });

  // Drag & drop: reorder blocks, and drop toolbar tools onto the paper.
  let dragId = null;
  view.addEventListener('dragstart', e => {
    const mv = e.target.closest && e.target.closest('[data-move]');
    const tl = e.target.closest && e.target.closest('[data-tool]');
    if (mv) {
      dragId = mv.dataset.move;
      e.dataTransfer.setData('text/plain', 'block:' + dragId);
      const card = mv.closest('.blk'); card.classList.add('dragging');
      try { e.dataTransfer.setDragImage(card, 30, 20); } catch {}
    } else if (tl) {
      dragId = null;
      e.dataTransfer.setData('text/plain', 'tool:' + tl.dataset.tool);
    }
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  view.addEventListener('dragend', () => { clearDrop(); $$('.blk.dragging').forEach(x => x.classList.remove('dragging')); dragId = null; });
  const clearDrop = () => { $$('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); $('#dz')?.classList.remove('over'); };
  const target = e => {
    const cards = $$('.blk', blocks);
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return { el: c, before: true };
    }
    return cards.length ? { el: cards[cards.length - 1], before: false } : null;
  };
  const card = $('.paper-card', view);
  card.addEventListener('dragover', e => {
    e.preventDefault();
    clearDrop();
    if (e.target.closest('#dz')) { $('#dz').classList.add('over'); return; }
    const tg = target(e); if (tg) tg.el.classList.add(tg.before ? 'drop-before' : 'drop-after');
  });
  card.addEventListener('dragleave', e => { if (!card.contains(e.relatedTarget)) clearDrop(); });
  card.addEventListener('drop', e => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain') || '';
    let index = E.paper.blocks.length;
    if (!e.target.closest('#dz')) {
      const tg = target(e);
      if (tg) index = idxOf(tg.el.dataset.id) + (tg.before ? 0 : 1);
    }
    clearDrop();
    if (data.startsWith('block:')) {
      const from = idxOf(data.slice(6)); if (from < 0) return;
      const [b] = E.paper.blocks.splice(from, 1);
      if (from < index) index--;
      E.paper.blocks.splice(index, 0, b); drawBlocks(); markDirty();
    } else if (data.startsWith('tool:')) addFromTool(data.slice(5), index);
  });
  $('#dz').addEventListener('click', () => openTypePicker());
}

function wireToolbar(view) {
  $$('[data-tool]', view).forEach(b => b.addEventListener('click', () => addFromTool(b.dataset.tool)));
}

function addFromTool(key, index = E.paper.blocks.length) {
  if (key === 'bank') return openBankPicker();
  if (key === 'pictures') return import('./pictures.js').then(m => m.openPictureReview(E.paper, () => { drawBlocks(); markDirty(); }));
  if (key === 'report') return import('./auto.js').then(m => m.openUpdateReport(E.paper));
  let b;
  if (key === 'section') b = newBlock('section');
  else if (key === 'passage') b = newBlock('source');
  else if (key === 'image') { b = newBlock('source'); b.title = ''; b.label = 'none'; b.sType = 'image'; b._pickImage = true; }
  else b = newBlock('question', key);
  if (b.kind === 'question') {
    // Pre-fill the instruction language that matches the paper
    if (key === 'tf') b.instr = { ...DEFAULT_INSTR.tf };
  }
  openBlockEditor(b, { isNew: true, index });
}

function openTypePicker() {
  const types = [['mcq', 'Multiple Choice', 'mcq'], ['tf', 'True / False', 'tf'], ['short', 'Short Answer', 'short'], ['paragraph', 'Paragraph', 'paragraph'], ['matching', 'Matching', 'matching'], ['fill', 'Fill in Blank', 'fill'], ['section', 'Section heading', 'section'], ['passage', 'Source / Passage', 'passage'], ['image', 'Image', 'image']];
  const m = openModal({
    title: 'Add to paper',
    body: `<div class="type-grid">${types.map(([k, l, i]) => `<button class="tool" data-pick="${k}">${icon(i, 26)}<span>${l}</span></button>`).join('')}</div>
      <button class="btn btn-outline btn-block" style="margin-top:14px" data-pick="bank">${icon('bank', 17)} Insert from Question Bank</button>`
  });
  $$('[data-pick]', m.el).forEach(b => b.onclick = () => { m.close(); addFromTool(b.dataset.pick); });
}

// ───────────── Bloom's balance ─────────────
function drawBalance() {
  const a = analyse(E.paper, S.settings);
  const subj = subjectById(S.settings, E.paper.subject);
  const m = S.settings.mapping;
  const range = o => Object.keys(m).filter(k => m[k] === o).join('–');
  const col = { lower: '#3b82c4', middle: '#c99b1c', higher: '#a23b84' };
  let rows = '';
  for (const o of ORDERS) {
    const tg = a.target?.[o];
    const st = a.status[o];
    let msg = '—';
    if (st === 'ok') msg = `${icon('check', 13)} On target`;
    else if (st === 'low' || st === 'high') {
      const need = Math.round(Math.abs((tg / 100) * a.total - a.byOrder[o]));
      msg = st === 'low' ? `▼ ${Math.round(tg - a.pct[o])}% below · add ≈${need} mark${need === 1 ? '' : 's'}` : `▲ ${Math.round(a.pct[o] - tg)}% above · ≈${need} mark${need === 1 ? '' : 's'} too many`;
    } else if (!a.total) msg = 'No marks yet';
    rows += `<div class="bal-row"><div class="lbl"><span>${ORDER_LABEL[o]} <span class="muted">(${range(o)})</span></span><span>${a.pct[o]}% / ${tg ?? '–'}%</span></div>
      <div class="bar">${tg != null ? `<div class="band" style="left:${Math.max(0, tg - a.tolerance)}%;width:${Math.min(100, tg + a.tolerance) - Math.max(0, tg - a.tolerance)}%"></div>` : ''}<div class="fill" style="width:${Math.min(100, a.pct[o])}%;background:${col[o]}"></div></div>
      <div class="bal-status st-${st}">${msg}</div></div>`;
  }
  $('#balance').innerHTML = `
    <div class="balance-head"><b>Bloom's Balance</b>${a.balanced ? `<span class="pill pill-ok">${icon('check', 12)} Balanced</span>` : a.total ? `<span class="pill pill-warn">Check</span>` : ''}</div>
    <div class="small muted" style="margin:-4px 0 10px">${esc(subj?.en || 'No subject')} target: ${a.target ? `${a.target.lower} / ${a.target.middle} / ${a.target.higher}` : '—'}</div>
    ${rows}
    <div class="bal-foot">
      <span class="${a.marksMatch ? '' : 'warn'}">Total: <b>${a.total}</b>${a.planned ? ` of ${a.planned} planned marks` : ' marks'}</span>
      ${a.unassigned ? `<span class="warn">${icon('warn', 12)} ${a.unassigned} mark${a.unassigned === 1 ? '' : 's'} without a Bloom level</span>` : ''}
      <button class="link-btn small" id="baldetail" style="text-align:left;margin-top:4px">View full analysis</button>
    </div>`;
  $('#baldetail').onclick = () => openModal({ title: "Bloom's analysis", wide: true, body: `<div style="overflow-x:auto">${renderAnalysis(E.paper, S.settings, displayName(S.user))}</div>` });
}

// ───────────── save / bank ─────────────
async function save() {
  const p = E.paper;
  p.updatedAt = Date.now();
  p.ownerName = displayName(S.user);
  const btn = $('#save'); if (btn) btn.disabled = true;
  try {
    await store.savePaper(p);
    const wasNew = E.isNew;
    E.dirty = false; E.isNew = false;
    if (wasNew) history.replaceState(null, '', '#/edit/' + p.id + (p.isTemplate ? '?t=1' : ''));
    drawHead();
    await refreshMyPapers();
    toast(p.isTemplate ? 'Template saved.' : 'Paper saved.');
    return true;
  } catch (e) {
    toast(e.message, 'err', 6000);
    return false;
  } finally { if (btn) btn.disabled = false; }
}

function saveToBank(b) {
  const first = (b.items || [])[0];
  const guess = (b.kind === 'source' ? (b.title || b.text || b.caption || 'Source') : (first?.text || first?.left || b.instr?.en || b.instr?.af || '')).slice(0, 80);
  const m = openModal({
    title: 'Save to Question Bank',
    body: `<p class="muted" style="margin-top:0">Colleagues will be able to find and reuse this question.</p>
      <label class="field"><span>Short description</span><input class="input" id="bt" value="${esc(guess)}"></label>
      <div class="grid-2">
        <label class="field"><span>Subject</span><select class="input" id="bs">${S.settings.subjects.map(s => `<option value="${s.id}" ${E.paper.subject === s.id ? 'selected' : ''}>${esc(s.en)}</option>`).join('')}</select></label>
        <label class="field"><span>Grade</span><select class="input" id="bg">${['R', 1, 2, 3, 4, 5, 6, 7].map(g => `<option ${String(E.paper.grade) === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div>`,
    footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-gold" id="bok">Save to bank</button>`
  });
  $('#bok', m.el).onclick = async () => {
    try {
      await store.addBank({ id: newId(), ownerUid: S.user.uid, ownerName: displayName(S.user), subject: $('#bs', m.el).value, grade: $('#bg', m.el).value, title: $('#bt', m.el).value.trim(), block: cloneBlock(b), createdAt: Date.now() });
      m.close(); toast('Saved to the question bank.');
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openBankPicker() {
  const list = await store.listBank();
  const m = openModal({ title: 'Insert from Question Bank', wide: true, body: bankFilters('m', { subject: E.paper.subject, grade: E.paper.grade }) + '<div id="ml"></div>' });
  const draw = () => {
    const rows = bankFilter(list, 'm', m.el);
    $('#ml', m.el).innerHTML = rows.length ? rows.map(e => bankItemHtml(e, `<button class="btn btn-sm btn-gold" data-ins="${e.id}">Insert</button>`)).join('')
      : `<div class="empty">${icon('layers', 40)}<div>${list.length ? 'No questions match — try clearing the filters.' : 'The question bank is empty. Use "Save to bank" on any question to add it.'}</div></div>`;
    $$('[data-ins]', m.el).forEach(b => b.onclick = () => {
      const e = list.find(x => x.id === b.dataset.ins);
      E.paper.blocks.push(cloneBlock(e.block)); drawBlocks(); markDirty();
      toast('Question inserted.');
      b.textContent = 'Inserted ✓'; b.disabled = true;
    });
  };
  ['q', 's', 'g', 't', 'o'].forEach(id => $('#m' + id, m.el).addEventListener('input', draw));
  draw();
}

// ───────────── block editor modal ─────────────
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }

function bloomSelect(i, val) {
  const m = S.settings.mapping;
  return `<select class="input" data-f="items.${i}.bloom" data-num>
    <option value="0" ${!Number(val) ? 'selected' : ''}>— choose level —</option>
    ${LEVELS.map(l => `<option value="${l.n}" ${Number(val) === l.n ? 'selected' : ''}>${l.n} · ${l.en} / ${l.af} (${ORDER_LABEL[m[l.n]].split(' ')[0]})</option>`).join('')}
  </select>`;
}
function suggestChip(it, i) {
  const s = suggestLevel([it.text, it.text2].filter(Boolean).join(' '));
  if (!s || s.level === Number(it.bloom)) return '';
  const l = levelByN(s.level);
  return `<button type="button" class="suggest" data-a="sug" data-i="${i}" data-l="${s.level}" title="Based on the word “${esc(s.verb)}”">${icon('sparkle', 12)} Suggest: ${l.n} · ${l.en}</button>`;
}

function openBlockEditor(orig, { isNew = false, index } = {}) {
  const W = JSON.parse(JSON.stringify(orig)); // working copy
  const lang = E.paper.lang;
  const bi = lang === 'bi';
  const kindLabel = W.kind === 'section' ? 'Section heading' : W.kind === 'source' ? (W._pickImage ? 'Image' : 'Source / Passage') : TYPE_INFO[W.type]?.label;
  const m = openModal({
    title: `${isNew ? 'Add' : 'Edit'} — ${kindLabel}`,
    wide: true,
    body: '',
    footer: `<span class="small muted" id="wtot" style="margin-right:auto"></span><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-gold" id="wok">${isNew ? 'Add to paper' : 'Save changes'}</button>`
  });
  const body = m.body;

  const instrFields = () => {
    if (W.kind !== 'question') return '';
    const f = (k, l) => `<label class="field"><span>${l}</span><textarea class="input" rows="2" data-f="instr.${k}">${esc(W.instr?.[k])}</textarea></label>`;
    return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="label">Instruction</span><button type="button" class="link-btn small" data-a="resetInstr">Reset to default</button></div>
      ${bi ? `<div class="grid-2">${f('af', 'Afrikaans')}${f('en', 'English (printed in italics)')}</div>` : lang === 'af' ? f('af', 'Afrikaans') : f('en', 'English')}`;
  };
  const imageField = (label = 'Image (optional)') => `
    <div class="field"><span>${label}</span>
      ${W.image ? `<img class="img-prev" src="${W.image}" alt=""><div class="row"><label class="btn btn-outline btn-sm">Replace image<input type="file" accept="image/*" data-a="img" hidden></label><button type="button" class="btn btn-ghost btn-sm" data-a="rmImg">${icon('trash', 15)} Remove</button>
        <label class="row small" style="gap:8px">Width <input type="range" min="25" max="100" step="5" data-f="imgWidth" data-num value="${W.imgWidth || 80}"></label></div>`
      : `<label class="btn btn-outline btn-sm" style="align-self:flex-start">${icon('image', 16)} Choose image…<input type="file" accept="image/*" data-a="img" hidden></label><small>Maps, diagrams, pictures or a scanned source. Large photos are resized automatically.</small>`}
    </div>
    ${W.image ? `<label class="field"><span>Caption (optional)</span><input class="input" data-f="caption" value="${esc(W.caption)}"></label>` : ''}`;

  const itemCard = (it, i) => {
    const n = W.items.length;
    const head = `<div class="it-head"><b>${W.type === 'matching' ? 'Pair' : 'Item'} ${i + 1}</b><span class="grow"></span>
      <button type="button" class="icon-btn" data-a="upItem" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up', 15)}</button>
      <button type="button" class="icon-btn" data-a="downItem" data-i="${i}" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>${icon('down', 15)}</button>
      <button type="button" class="icon-btn" data-a="delItem" data-i="${i}" aria-label="Remove">${icon('trash', 15)}</button></div>`;
    const marksBloom = `<label class="field"><span>Marks</span><input class="input" type="number" min="0" step="1" data-f="items.${i}.marks" data-num value="${esc(it.marks)}"></label>
      <div class="field"><span>Bloom's level</span>${bloomSelect(i, it.bloom)}<div data-sug="${i}">${suggestChip(it, i)}</div></div>`;
    const txtLabel = { mcq: 'Question', tf: 'Statement', short: 'Question', paragraph: 'Topic / question', fill: 'Sentence — type ___ (3 underscores) for each gap' }[W.type] || 'Question';
    const alt = bi ? `<label class="field"><span>English line (optional, printed in italics below)</span><textarea class="input" rows="1" data-f="items.${i}.text2">${esc(it.text2)}</textarea></label>` : '';
    if (W.type === 'matching') {
      return `<div class="it-card">${head}<div class="it-grid">
        <div><label class="field"><span>Column A (term)</span><input class="input" data-f="items.${i}.left" value="${esc(it.left)}" ${i === 0 ? 'autofocus' : ''}></label>
        <label class="field"><span>Column B (matching description)</span><input class="input" data-f="items.${i}.right" value="${esc(it.right)}"></label>
        ${bi ? `<div class="grid-2"><label class="field"><span>Term – English</span><input class="input" data-f="items.${i}.left2" value="${esc(it.left2)}"></label><label class="field"><span>Description – English</span><input class="input" data-f="items.${i}.right2" value="${esc(it.right2)}"></label></div>` : ''}</div>
        ${marksBloom}</div></div>`;
    }
    let extra = '';
    if (W.type === 'mcq') {
      extra = `<div class="label" style="margin-bottom:6px">Options <span class="muted small">(select the correct one)</span></div>
        ${(it.options || []).map((o, j) => `<div class="opt-row"><input type="radio" name="ans${i}" data-f="items.${i}.answer" data-num value="${j}" ${Number(it.answer) === j ? 'checked' : ''} aria-label="Correct answer ${LET[j]}"><b>${LET[j]}.</b><input class="input input-sm" data-f="items.${i}.options.${j}" value="${esc(o)}"><button type="button" class="icon-btn" data-a="delOpt" data-i="${i}" data-j="${j}" aria-label="Remove option">${icon('x', 15)}</button></div>`).join('')}
        ${(it.options || []).length < 6 ? `<button type="button" class="btn btn-ghost btn-sm" data-a="addOpt" data-i="${i}">${icon('plus', 14)} Add option</button>` : ''}`;
    } else if (W.type === 'tf') {
      extra = W.style === 'correct'
        ? `<div class="grid-2"><label class="field"><span>Correct version (memo)</span><textarea class="input" rows="2" data-f="items.${i}.memo">${esc(it.memo)}</textarea></label><label class="field"><span>Answer lines</span><input class="input" type="number" min="0" max="20" data-f="items.${i}.lines" data-num value="${it.lines ?? 2}"></label></div>`
        : `<div class="grid-2"><label class="field"><span>Correct answer</span><select class="input" data-f="items.${i}.answer" data-bool><option value="true" ${it.answer !== false ? 'selected' : ''}>True / Waar</option><option value="false" ${it.answer === false ? 'selected' : ''}>False / Onwaar</option></select></label><label class="field"><span>Memo note (optional)</span><input class="input" data-f="items.${i}.memo" value="${esc(it.memo)}"></label></div>`;
    } else {
      extra = `<div class="grid-2"><label class="field"><span>Memo answer</span><textarea class="input" rows="2" data-f="items.${i}.memo" placeholder="Expected answer for the memorandum">${esc(it.memo)}</textarea></label>
        ${W.type !== 'fill' ? `<label class="field"><span>Answer lines</span><input class="input" type="number" min="0" max="40" data-f="items.${i}.lines" data-num value="${it.lines ?? (W.type === 'paragraph' ? 10 : 2)}"></label>` : '<div></div>'}</div>`;
    }
    return `<div class="it-card">${head}<div class="it-grid">
      <div><label class="field"><span>${txtLabel}</span><textarea class="input" rows="2" data-f="items.${i}.text" ${i === 0 ? 'autofocus' : ''}>${esc(it.text)}</textarea></label>${alt}</div>
      ${marksBloom}</div>${extra}</div>`;
  };

  const rubricEditor = () => {
    const r = W.rubric || (W.rubric = { cols: ['2', '1', '0'], rows: [] });
    return `<div class="label" style="margin:12px 0 6px">Marking rubric (optional) ${r.rows.length ? `<span class="muted small">· max ${rubricMax(r)} marks</span>` : ''}</div>
      ${r.rows.length ? `<div class="table-wrap"><table class="rub-table"><thead><tr><th style="width:22%">Criterion</th>${r.cols.map((c, j) => `<th><div class="row" style="gap:4px;flex-wrap:nowrap"><input class="input" data-f="rubric.cols.${j}" value="${esc(c)}" placeholder="Marks" style="text-align:center"><button type="button" class="icon-btn" style="width:26px;height:26px;border:0;box-shadow:none" data-a="delCol" data-j="${j}" aria-label="Remove column">${icon('x', 13)}</button></div></th>`).join('')}<th style="width:34px"></th></tr></thead>
      <tbody>${r.rows.map((row, i) => `<tr><td><textarea class="input" data-f="rubric.rows.${i}.name">${esc(row.name)}</textarea></td>${r.cols.map((_, j) => `<td><textarea class="input" data-f="rubric.rows.${i}.cells.${j}">${esc((row.cells || [])[j] || '')}</textarea></td>`).join('')}<td><button type="button" class="icon-btn" style="width:28px;height:28px;border:0;box-shadow:none" data-a="delRow" data-i="${i}" aria-label="Remove row">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="row" style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-a="addRow">${icon('plus', 14)} Add criterion</button>${r.rows.length ? `<button type="button" class="btn btn-ghost btn-sm" data-a="addCol">${icon('plus', 14)} Add mark column</button>` : ''}</div>`;
  };

  const tableEditor = () => {
    const tb = W.table;
    if (!tb || !tb.rows?.length) return `<button type="button" class="btn btn-outline btn-sm" data-a="addTable">${icon('plus', 15)} Add a table</button>`;
    return `<div class="table-wrap"><table class="rub-table"><tbody>${tb.rows.map((r, i) => `<tr>${r.map((c, j) => `<td><input class="input" data-f="table.rows.${i}.${j}" value="${esc(c)}" placeholder="${i === 0 && tb.header !== false ? 'Heading' : ''}" ${i === 0 && tb.header !== false ? 'style="font-weight:700"' : ''}></td>`).join('')}<td style="width:34px"><button type="button" class="icon-btn" style="width:28px;height:28px;border:0;box-shadow:none" data-a="tDelRow" data-i="${i}" aria-label="Remove row">${icon('x', 13)}</button></td></tr>`).join('')}
      <tr>${tb.rows[0].map((_, j) => `<td style="text-align:center"><button type="button" class="icon-btn" style="width:28px;height:28px;border:0;box-shadow:none" data-a="tDelCol" data-j="${j}" aria-label="Remove column">${icon('x', 13)}</button></td>`).join('')}<td></td></tr></tbody></table></div>
      <div class="row" style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-a="tAddRow">${icon('plus', 14)} Row</button><button type="button" class="btn btn-ghost btn-sm" data-a="tAddCol">${icon('plus', 14)} Column</button>
      <label class="check" style="margin:0"><input type="checkbox" data-f="table.header" data-bool-check ${tb.header !== false ? 'checked' : ''}> First row is a heading</label>
      <button type="button" class="btn btn-ghost btn-sm" data-a="tRemove">${icon('trash', 14)} Remove table</button></div>
      <small class="muted">Tip: you can paste rows copied from Excel or Word into the first cell.</small>`;
  };
  const sourceRefField = () => {
    const letters = sourceLetters(E.paper);
    const srcs = E.paper.blocks.filter(x => x.kind === 'source' && letters[x.id]);
    if (!srcs.length) return `<div class="note" style="margin-bottom:14px">${icon('info', 14)} Building a source-based question? Add a <b>Source</b> from the toolbar first, then link this question to it here.</div>`;
    return `<div class="grid-2"><label class="field"><span>Refers to source</span><select class="input" data-f="sourceRef" data-redraw><option value="">— none —</option>${srcs.map(x => `<option value="${x.id}" ${W.sourceRef === x.id ? 'selected' : ''}>${esc(sourceLabel(x, letters[x.id], 'en'))}${x.title ? ' – ' + esc(x.title.slice(0, 40)) : ''}</option>`).join('')}</select></label>
      ${W.sourceRef ? `<label class="check" style="align-self:end;margin-bottom:22px"><input type="checkbox" data-f="refLine" data-bool-check ${W.refLine !== false ? 'checked' : ''}> Print “Refer to ${esc(sourceLabel(srcs.find(x => x.id === W.sourceRef) || {}, letters[W.sourceRef], 'en'))} and answer…”</label>` : '<div></div>'}</div>`;
  };
  const colBPreview = () => matchingColumnB(W).map((e, i) => `<b>${LET[i]}.</b> ${esc(e.text) || '<i class="muted">(empty)</i>'}`).join('<br>');
  const draw = () => {
    const st = body.scrollTop;
    let h = '';
    if (W.kind === 'section') {
      h = `<label class="field"><span>Section title</span><input class="input" data-f="title" value="${esc(W.title)}" placeholder="e.g. Comprehension / Begrip" autofocus><small>Printed as “${t('section', lang)} A: …”. Letters and section marks are added automatically.</small></label>
        <label class="field"><span>Instruction (optional)</span><textarea class="input" rows="3" data-f="text" placeholder="e.g. Read the following passage and answer the questions that follow.">${esc(W.text)}</textarea></label>`;
    } else if (W.kind === 'source') {
      const letters = sourceLetters({ blocks: isNew ? [...E.paper.blocks.slice(0, index ?? E.paper.blocks.length), W, ...E.paper.blocks.slice(index ?? E.paper.blocks.length)] : E.paper.blocks.map(x => x.id === W.id ? W : x) });
      const preview = sourceLabel(W, letters[W.id], lang);
      h = `<div class="grid-2">
          <label class="field"><span>Label</span><select class="input" data-f="label" data-redraw>
            ${[['source', `${t('source', lang)} A, B, C … (source-based questions)`], ['text', `${t('text', lang)} A, B … (comprehension texts)`], ['none', 'No label (passage or picture)']].map(([v, l]) => `<option value="${v}" ${(W.label || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select><small>${preview ? `Printed as <b>${esc(preview)}</b> — letters follow the order on the paper.` : 'Printed without a heading label.'}</small></label>
          <label class="field"><span>Heading (optional)</span><input class="input" data-f="title" value="${esc(W.title)}" placeholder="e.g. South Africa's top 10 exports (2022)"></label>
        </div>
        ${W._pickImage ? '' : `<label class="field"><span>Text / extract</span><textarea class="input" rows="7" data-f="text" autofocus placeholder="Paste or type the passage, extract, diary entry, letter…">${esc(W.text)}</textarea></label>`}
        <details ${W.sType === 'table' ? 'open' : ''} style="margin-bottom:12px"><summary class="label" style="cursor:pointer">Table (statistics, timeline, comparison…)</summary><div style="margin-top:10px">${tableEditor()}</div></details>
        <details ${W.image || W._pickImage ? 'open' : ''} style="margin-bottom:12px"><summary class="label" style="cursor:pointer">Picture, map, cartoon or graph</summary><div style="margin-top:10px">${imageField(W._pickImage ? 'Image' : 'Image (optional)')}</div></details>
        <label class="field"><span>Reference / acknowledgement (optional)</span><input class="input" data-f="reference" value="${esc(W.reference)}" placeholder="e.g. Oxford Successful Social Sciences Gr 6, p. 45"><small>Printed small under the source, e.g. “Bron / Source: …”.</small></label>
        <label class="check"><input type="checkbox" data-f="boxed" data-bool-check ${W.boxed !== false ? 'checked' : ''}> Draw a border around it</label>`;
    } else {
      h = sourceRefField() + instrFields();
      if (W.type === 'tf') h += `<div class="field"><span>Answer style</span><div class="seg"><button type="button" data-a="style" data-v="tf" class="${W.style !== 'correct' ? 'on' : ''}">Write TRUE / FALSE</button><button type="button" data-a="style" data-v="correct" class="${W.style === 'correct' ? 'on' : ''}">Rewrite false statements</button></div></div>`;
      h += `<details ${W.image ? 'open' : ''} style="margin-bottom:14px"><summary class="label" style="cursor:pointer">Picture / diagram for this question</summary><div style="margin-top:10px">${imageField()}</div></details>`;
      h += `<div class="label" style="margin-bottom:8px">${W.type === 'matching' ? 'Pairs (Column B is shuffled automatically)' : 'Items'}</div>`;
      h += W.items.map(itemCard).join('');
      h += `<button type="button" class="btn btn-outline btn-sm" data-a="addItem">${icon('plus', 15)} Add ${W.type === 'matching' ? 'pair' : 'item'}</button>`;
      if (W.type === 'matching') {
        const colB = matchingColumnB(W);
        h += `<div class="grid-2" style="margin-top:14px"><label class="field"><span>Extra Column B options (distractors, one per line)</span><textarea class="input" rows="3" data-f="distractors" data-reshuffle>${esc(W.distractors)}</textarea></label>
          <div class="field"><span>Column B order on the paper</span><div class="small" style="line-height:1.6" data-colb>${colBPreview()}</div><button type="button" class="btn btn-ghost btn-sm" data-a="shuffle" style="align-self:flex-start">Shuffle again</button></div></div>`;
      }
      if (W.type === 'paragraph' || W.type === 'short') h += rubricEditor();
    }
    body.innerHTML = h;
    body.scrollTop = st;
    updTotal();
    if (W._pickImage && !W.image && !draw._picked) { draw._picked = true; setTimeout(() => $('input[type=file]', body)?.click(), 60); }
  };
  const updTotal = () => {
    const el = $('#wtot', m.el);
    if (W.kind !== 'question') { el.textContent = ''; return; }
    const tot = blockMarks(W);
    const unl = W.items.filter(i => !Number(i.bloom)).length;
    el.innerHTML = `Question total: <b>${tot}</b> mark${tot === 1 ? '' : 's'}${unl ? ` · <span style="color:#b42318">${unl} item${unl === 1 ? '' : 's'} without a Bloom level</span>` : ''}`;
  };

  body.addEventListener('input', e => {
    const el = e.target; const f = el.dataset.f; if (!f) return;
    let v = el.value;
    if (el.dataset.boolCheck !== undefined) v = el.checked;
    else if (el.dataset.bool !== undefined) v = v === 'true';
    else if (el.dataset.num !== undefined) v = Number(v) || 0;
    if (el.type === 'radio' && !el.checked) return;
    setPath(W, f, v);
    const mm = f.match(/^items\.(\d+)\.(text|text2|bloom)$/);
    if (mm) { const i = Number(mm[1]); const s = $(`[data-sug="${i}"]`, body); if (s) s.innerHTML = suggestChip(W.items[i], i); }
    if (/marks|bloom/.test(f)) updTotal();
    if (el.dataset.reshuffle !== undefined) { W.order = shuffleKeys(W); }
    // Update the Column B preview in place (never re-render while typing).
    if (W.type === 'matching' && (el.dataset.reshuffle !== undefined || /items\.\d+\.right$/.test(f))) {
      const c = $('[data-colb]', body); if (c) c.innerHTML = colBPreview();
    }
  });
  body.addEventListener('change', e => { if (e.target.dataset.redraw !== undefined) draw(); });
  body.addEventListener('paste', e => {
    const f = e.target.dataset?.f || '';
    const m = f.match(/^table\.rows\.(\d+)\.(\d+)$/);
    const txt = e.clipboardData?.getData('text/plain') || '';
    if (!m || !/[\t\n]/.test(txt.trim())) return;
    e.preventDefault();
    const r0 = Number(m[1]), c0 = Number(m[2]);
    txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, i) => line.split('\t').forEach((cell, j) => {
      while (W.table.rows.length <= r0 + i) W.table.rows.push(W.table.rows[0].map(() => ''));
      if (W.table.rows[0].length <= c0 + j) W.table.rows.forEach(r => { while (r.length <= c0 + j) r.push(''); });
      W.table.rows[r0 + i][c0 + j] = cell.trim();
    }));
    draw();
  });
  body.addEventListener('change', async e => {
    if (e.target.dataset.a !== 'img') return;
    const file = e.target.files[0]; if (!file) return;
    try { W.image = await readImage(file); if (W.kind === 'source' && W._pickImage) W.imgWidth = W.imgWidth || 100; draw(); }
    catch (err) { toast(err.message, 'err'); }
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b || b.dataset.a === 'img') return;
    const i = Number(b.dataset.i), j = Number(b.dataset.j);
    const a = b.dataset.a;
    if (a === 'addItem') { const it = newItem(W.type); const prev = W.items[W.items.length - 1]; if (prev && W.type !== 'matching') { it.marks = prev.marks; it.lines = prev.lines; } W.items.push(it); if (W.type === 'matching') W.order = shuffleKeys(W); }
    else if (a === 'delItem') { W.items.splice(i, 1); if (W.type === 'matching') W.order = shuffleKeys(W); }
    else if (a === 'upItem' && i > 0) [W.items[i - 1], W.items[i]] = [W.items[i], W.items[i - 1]];
    else if (a === 'downItem' && i < W.items.length - 1) [W.items[i + 1], W.items[i]] = [W.items[i], W.items[i + 1]];
    else if (a === 'addOpt') W.items[i].options.push('');
    else if (a === 'delOpt') { const it = W.items[i]; it.options.splice(j, 1); if (Number(it.answer) >= it.options.length) it.answer = 0; }
    else if (a === 'sug') { W.items[i].bloom = Number(b.dataset.l); }
    else if (a === 'shuffle') W.order = shuffleKeys(W);
    else if (a === 'rmImg') { W.image = ''; W.caption = ''; }
    else if (a === 'resetInstr') { const k = W.type === 'tf' && W.style === 'correct' ? 'tfcorrect' : W.type; W.instr = { ...DEFAULT_INSTR[k] }; }
    else if (a === 'style') { W.style = b.dataset.v; const def = DEFAULT_INSTR[W.style === 'correct' ? 'tf' : 'tfcorrect']; if (W.instr.af === def.af) W.instr = { ...DEFAULT_INSTR[W.style === 'correct' ? 'tfcorrect' : 'tf'] }; }
    else if (a === 'addTable') { W.table = { rows: [['', '', ''], ['', '', ''], ['', '', '']], header: true }; W.sType = 'table'; }
    else if (a === 'tAddRow') W.table.rows.push(W.table.rows[0].map(() => ''));
    else if (a === 'tAddCol') W.table.rows.forEach(r => r.push(''));
    else if (a === 'tDelRow') { W.table.rows.splice(i, 1); if (!W.table.rows.length) { W.table = null; W.sType = 'text'; } }
    else if (a === 'tDelCol') { W.table.rows.forEach(r => r.splice(j, 1)); if (!W.table.rows[0]?.length) { W.table = null; W.sType = 'text'; } }
    else if (a === 'tRemove') { W.table = null; W.sType = W.image ? 'image' : 'text'; }
    else if (a === 'addRow') W.rubric.rows.push({ name: '', cells: [] });
    else if (a === 'delRow') W.rubric.rows.splice(i, 1);
    else if (a === 'addCol') W.rubric.cols.push('');
    else if (a === 'delCol') { W.rubric.cols.splice(j, 1); W.rubric.rows.forEach(r => (r.cells || []).splice(j, 1)); }
    else return;
    draw();
  });

  $('#wok', m.el).onclick = () => {
    if (W.kind === 'question' && !W.items.length) return toast('Add at least one item first.', 'err');
    if (W.kind === 'source' && !W.text && !W.image && !W.title && !W.table?.rows?.length) return toast('Add some text, a table or an image first.', 'err');
    if (W.kind === 'source') W.sType = W.table?.rows?.length ? 'table' : W.image ? 'image' : 'text';
    delete W._pickImage;
    if (W.type === 'mcq') W.items.forEach(it => { it.options = it.options.map(o => o.trim()); });
    if (isNew) E.paper.blocks.splice(index ?? E.paper.blocks.length, 0, W);
    else E.paper.blocks[idxOf(orig.id)] = W;
    m.close(); drawBlocks(); markDirty();
    const unl = W.kind === 'question' ? W.items.filter(i => !Number(i.bloom)).length : 0;
    if (unl) toast(`Remember to set a Bloom's level for ${unl} item${unl === 1 ? '' : 's'}.`, 'info', 4500);
    setTimeout(() => $(`.blk[data-id="${W.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };
  draw();
}
