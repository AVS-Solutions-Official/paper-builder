// Auto Compile (paper from study material) and Import Paper (existing papers).
import { S, go, setTop, subjName, refreshMyPapers } from './app.js';
import { esc, icon, toast, openModal, $, $$ } from './ui.js';
import { subjectById, analyse, ORDERS, ORDER_LABEL, paperStatus } from './bloom.js';
import { FORMS } from './i18n.js';
import { newPaper, displayName } from './model.js';
import { store } from './store.js';
import { fileKind, fmtSize, fileToBase64, shrinkImageFile, dataUrlToBase64, readDocx, fileToText, renderPdfPage, cropImage } from './extract.js';
import { aiJson, aiAvailable, aiStatus, aiSearchText } from './ai.js';
import { scanPictures, bestCommonsPicture, sharpen, MIN_DPI } from './pictures.js';
import { specToBlocks, specMeta, compilePrompt, importPrompt, basicGenerate, basicImport, factCheckPrompt, parseCorrections } from './generate.js';
import { openDraft } from './editor.js';
import { renderAnalysis } from './render.js';

const GRADES = ['R', 1, 2, 3, 4, 5, 6, 7];
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;

function engineNote() {
  const st = aiStatus();
  if (aiAvailable()) return `<div class="note note-ai">${icon('sparkle', 15)} <span><b>AI is on</b> (${st.ok ? esc(st.label.replace('AI · ', 'Google Gemini · ')) : 'test mode'}). Files you add are sent to Google's Gemini service to be read. Always review the result before using it.</span></div>`;
  return `<div class="note note-gold">${icon('info', 15)} <span><b>Basic mode.</b> ${st.reason === 'demo' ? 'AI features switch on once Firebase and AI Logic are set up (see README).' : 'AI is switched off in js/config.js.'} The built-in generator works with typed or pasted text, Word files and text-based PDFs, but produces simpler questions and cannot read photos or scans.</span></div>`;
}

// ── shared file picker
function filePicker(root, files, { accept, hint }) {
  const draw = () => {
    $('.flist', root).innerHTML = files.map((f, i) => `<div class="fitem">${icon(fileKind(f) === 'image' ? 'image' : 'file', 18)}<span class="fname">${esc(f.name)}</span><span class="muted small">${fmtSize(f.size)}</span>
      ${files.length > 1 ? `<button type="button" class="icon-btn" data-fup="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up', 14)}</button>` : ''}
      <button type="button" class="icon-btn" data-frm="${i}" aria-label="Remove">${icon('x', 14)}</button></div>`).join('');
  };
  const add = list => {
    for (const f of list) {
      const k = fileKind(f);
      if (k === 'other') { toast(`${f.name}: unsupported file type.`, 'err'); continue; }
      if (k === 'doc') { toast(`${f.name} is an old .doc file — please save it as .docx or PDF first.`, 'err', 5000); continue; }
      files.push(f);
    }
    draw();
  };
  const dz = $('.drop', root);
  $('input[type=file]', root).addEventListener('change', e => { add([...e.target.files]); e.target.value = ''; });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); add([...e.dataTransfer.files]); });
  root.addEventListener('click', e => {
    const rm = e.target.closest('[data-frm]'), up = e.target.closest('[data-fup]');
    if (rm) { files.splice(Number(rm.dataset.frm), 1); draw(); }
    if (up) { const i = Number(up.dataset.fup); [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); }
  });
  draw();
}
const dropHtml = (accept, hint) => `<label class="drop">${icon('file', 30)}<b>Drop files here or click to browse</b><span class="muted small">${hint}</span><input type="file" multiple accept="${accept}" hidden></label><div class="flist"></div>`;

// Progress dialog
function progress(title) {
  const m = openModal({ title, body: `<div class="prog"><div class="spinner"></div><div><b id="pstep">Starting…</b><div class="muted small" id="psub">This can take up to a minute for long material.</div></div></div>` });
  $('[data-close]', m.el).style.display = 'none';
  m.el.addEventListener('click', e => e.stopPropagation(), true);
  return { step: (t, sub) => { $('#pstep', m.el).textContent = t; if (sub != null) $('#psub', m.el).textContent = sub; }, close: m.close };
}

// Build AI parts from files: PDFs & photos as inline data, Word as text.
async function filesToParts(files, step) {
  const parts = []; let text = ''; const docxImages = []; let bytes = 0;
  const shrunk = {};
  for (const [i, f] of files.entries()) {
    const k = fileKind(f);
    step(`Reading ${f.name}…`);
    if (k === 'pdf') { parts.push(`[File ${i + 1}: ${f.name} (PDF)]`); parts.push({ inlineData: { mimeType: 'application/pdf', data: await fileToBase64(f) } }); bytes += f.size; }
    else if (k === 'image') { const d = await shrinkImageFile(f); shrunk[i] = d; parts.push(`[File ${i + 1}: ${f.name} (photo, page ${i + 1})]`); parts.push({ inlineData: { mimeType: 'image/jpeg', data: dataUrlToBase64(d) } }); bytes += d.length * 0.75; }
    else if (k === 'docx') { const r = await readDocx(f); r.images.forEach(im => docxImages.push(im)); text += `\n\n[File ${i + 1}: ${f.name}]\n${r.text}`; }
    else if (k === 'text') text += `\n\n[File ${i + 1}: ${f.name}]\n${await f.text()}`;
  }
  if (bytes > MAX_TOTAL_BYTES) throw new Error(`The files are too large for one request (${fmtSize(bytes)}). Please upload fewer pages or smaller files (max about 18 MB).`);
  return { parts, text, docxImages, shrunk };
}

function figureResolver(files, shrunk, docxImages) {
  const pageCache = {};
  return async fig => {
    if (!fig) return '';
    if (fig.image) { const im = docxImages[Number(fig.image) - 1]; return im ? im.dataUrl : ''; }
    const fi = Math.max(1, Number(fig.file) || 1) - 1;
    const f = files[fi]; if (!f) return '';
    const k = fileKind(f);
    let page;
    if (k === 'image') page = shrunk[fi] || await shrinkImageFile(f);
    else if (k === 'pdf') { const key = fi + ':' + (fig.page || 1); page = pageCache[key] || (pageCache[key] = await renderPdfPage(f, Number(fig.page) || 1)); }
    else return '';
    const box = Array.isArray(fig.box) && fig.box.length === 4 ? fig.box : null;
    return box ? cropImage(page, box) : page;
  };
}


// ───────────────────────────── Quality checks (shared) ─────────────────────────────
function qualityChecksHtml(prefix, what) {
  return `<div class="label" style="margin:4px 0 8px">Quality checks</div>
    <label class="check"><input type="checkbox" id="${prefix}pics" checked> <span><b>Replace low-resolution pictures</b> <span class="muted small">— blurry pictures are swapped for clearer, freely licensed ones from Wikimedia Commons (credited), or sharpened</span></span></label>
    <label class="check ${aiAvailable() ? '' : 'mode-off'}"><input type="checkbox" id="${prefix}facts" ${aiAvailable() ? 'checked' : 'disabled'}> <span><b>Update outdated information</b> <span class="muted small">— checks facts, figures and names in ${what} with Google Search and uses the current information${aiAvailable() ? '' : ' (needs AI)'}</span></span></label>`;
}
const newReport = () => ({ facts: [], factSources: [], searchHtml: '', factsChecked: false, pictures: [], at: Date.now() });

async function runFactCheck(o, parts, report, pg) {
  pg.step('Checking for outdated information with Google Search…', 'This adds about 10–30 seconds.');
  try {
    const fc = await aiSearchText([factCheckPrompt(o.text, o, S.settings), ...parts], t => pg.step(t));
    report.facts = parseCorrections(fc.text);
    report.factSources = fc.sources.slice(0, 12);
    report.searchHtml = fc.searchHtml;
    report.factsChecked = true;
    return report.facts.length ? report.facts.map(f => `• "${f.old}" → ${f.new}`).join('\n') : '';
  } catch (e) { console.warn(e); report.factsError = e.message.split(' (Technical')[0]; return ''; }
}

const commonsResolver = report => async term => {
  const r = await bestCommonsPicture(term);
  if (r) report.pictures.push({ action: 'added', term, credit: r.credit, title: r.result.title, page: r.result.page });
  return r;
};

async function improvePictures(paper, report, pg) {
  for (const x of (await scanPictures(paper)).filter(x => x.low)) {
    pg.step('Replacing low-resolution pictures…');
    const b = x.block; let done = false;
    const prev = { image: b.image, reference: b.reference, picCredit: b.picCredit };
    if (b.picSearch) {
      try {
        const r = await bestCommonsPicture(b.picSearch);
        if (r) {
          b._prevImage = prev;
          b.image = r.dataUrl; b.picCredit = r.credit;
          b.reference = [b.reference, r.credit].filter(Boolean).join(' · ');
          report.pictures.push({ action: 'replaced', term: b.picSearch, credit: r.credit, title: r.result.title, page: r.result.page, fromDpi: x.dpi });
          done = true;
        }
      } catch {}
    }
    if (!done) {
      try { const sh = await sharpen(b.image); b._prevImage = prev; b.image = sh; report.pictures.push({ action: 'sharpened', term: b.picSearch || '', fromDpi: x.dpi }); } catch {}
    }
  }
}

function reportSummary(report) {
  const extras = [];
  if (report.factsChecked) extras.push(report.facts.length ? `${report.facts.length} outdated fact${report.facts.length === 1 ? '' : 's'} updated` : 'no outdated information found');
  if (report.factsError) extras.push('the fact check could not run');
  const np = report.pictures.length;
  if (np) extras.push(`${np} picture${np === 1 ? '' : 's'} added or improved`);
  return extras;
}
const hasReport = r => !!r && (r.factsChecked || r.factsError || r.pictures.length);

// ───────────────────────────── Auto Compile ─────────────────────────────
export async function pageCompile(view) {
  setTop('Auto Compile', 'Turn your study material into a Bloom\'s-balanced question paper');
  const prefs = S.user.prefs || {};
  const files = [];
  view.innerHTML = `
  ${engineNote()}
  <div class="ac-grid">
    <div class="card card-pad">
      <h3>1. Study material</h3>
      <p class="muted small" style="margin-top:-6px">Paste notes or a textbook section, and/or add files. The paper only tests what is in this material.</p>
      <label class="field"><span>Paste or type material</span><textarea class="input" id="mat" rows="11" placeholder="e.g. the chapter on the water cycle, a reading passage, your class notes…"></textarea></label>
      <div id="mfiles">${dropHtml('.pdf,.docx,.txt,image/*', 'PDF, Word (.docx), text files' + (aiAvailable() ? ', photos of textbook pages' : ''))}</div>
    </div>
    <div class="card card-pad">
      <h3>2. Paper set-up</h3>
      <div class="grid-2">
        <label class="field"><span>Subject</span><select class="input" id="csub">${S.settings.subjects.map(s => `<option value="${s.id}" ${prefs.subject === s.id ? 'selected' : ''}>${esc(s.en)}</option>`).join('')}</select></label>
        <label class="field"><span>Grade</span><select class="input" id="cgr">${GRADES.map(g => `<option ${String(prefs.grade || '5') === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Paper language</span><select class="input" id="clang">${[['bi', 'Bilingual (Afr / Eng)'], ['af', 'Afrikaans'], ['en', 'English']].map(([v, l]) => `<option value="${v}" ${(prefs.lang || 'bi') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Form of assessment</span><select class="input" id="cform">${FORMS.map((f, i) => `<option value="${i}">${f.af} / ${f.en}</option>`).join('')}</select></label>
        <label class="field"><span>Total marks</span><input class="input" type="number" id="ctot" min="5" max="150" value="40"></label>
        <label class="field"><span>Time (minutes)</span><input class="input" type="number" id="cdur" min="10" step="5" value="60"></label>
      </div>
      <div class="label" style="margin:4px 0 8px">3. Question types to use</div>
      <div class="chk-grid">${[['mcq', 'Multiple choice'], ['tf', 'True / False'], ['matching', 'Matching columns'], ['fill', 'Fill in the blank'], ['short', 'Short answer'], ['paragraph', 'Paragraph / writing']].map(([k, l]) => `<label class="check"><input type="checkbox" data-ty="${k}" ${k !== 'fill' ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="src-opt">
        <label class="check" style="margin:0"><input type="checkbox" id="csrc"> <b>Source-based questions</b></label>
        <select class="input input-sm" id="csrcn" style="width:auto">${[1, 2, 3].map(n => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n} source${n > 1 ? 's' : ''}</option>`).join('')}</select>
        <span class="muted small">Adds BRON / SOURCE extracts${aiAvailable() ? ' or tables' : ''} from the material with questions about them.</span>
      </div>
      <div id="ctarget" class="ctarget"></div>
      ${qualityChecksHtml('c', 'the study material')}
      ${aiAvailable() ? `<label class="field"><span>Extra instructions for the AI (optional)</span><textarea class="input" id="cextra" rows="2" placeholder="e.g. Focus on chapter 3 only. Include one question about the map. Keep sentences short."></textarea></label>` : ''}
      <button class="btn btn-gold btn-lg btn-block" id="cgo">${icon('sparkle', 18)} Compile paper</button>
    </div>
  </div>`;
  filePicker($('#mfiles', view), files, {});
  const drawTarget = () => {
    const s = subjectById(S.settings, $('#csub').value);
    const tot = Number($('#ctot').value) || 0;
    const t = s?.t || [40, 40, 20];
    $('#ctarget').innerHTML = `<b>Bloom's target for ${esc(s?.en || '')}:</b> ${ORDERS.map((o, i) => `<span class="pill o-pill-${o}">${ORDER_LABEL[o]} ${t[i]}% ≈ ${Math.round(tot * t[i] / 100)} marks</span>`).join(' ')}`;
    const ss = /^ss-|hist|geo/.test($('#csub').value);
    if (!$('#csrc').dataset.touched) $('#csrc').checked = ss;
  };
  $('#csrc').addEventListener('change', e => e.target.dataset.touched = '1');
  ['csub', 'ctot'].forEach(id => $('#' + id).addEventListener('input', drawTarget));
  drawTarget();

  const runCompile = async (forceBasic = false) => {
    const o = {
      subject: $('#csub').value, grade: $('#cgr').value, lang: $('#clang').value,
      form: FORMS[Number($('#cform').value)], formEn: FORMS[Number($('#cform').value)].en.toLowerCase(),
      totalMarks: Math.max(5, Number($('#ctot').value) || 40), duration: Number($('#cdur').value) || 60,
      types: $$('[data-ty]', view).filter(c => c.checked).map(c => c.dataset.ty),
      sourceBased: $('#csrc').checked, sourceCount: Number($('#csrcn').value),
      extra: $('#cextra')?.value.trim() || '', text: $('#mat').value.trim(),
      pictures: $('#cpics').checked, facts: $('#cfacts').checked
    };
    if (!o.types.length) return toast('Choose at least one question type.', 'err');
    if (!o.text && !files.length) return toast('Paste some study material or add a file first.', 'err');
    const pg = progress('Compiling your paper');
    try {
      let blocks, engine, meta = {};
      const report = newReport();
      if (aiAvailable() && !forceBasic) {
        const { parts, text, docxImages, shrunk } = await filesToParts(files, t => pg.step(t));
        o.text = [o.text, text].filter(Boolean).join('\n\n').slice(0, 250000);
        if (o.facts) o.corrections = await runFactCheck(o, parts, report, pg);
        pg.step('Gemini is writing the questions…', 'Usually 20–60 seconds.');
        const spec = await aiJson([compilePrompt(o, S.settings), ...parts], t => pg.step(t));
        pg.step(o.pictures ? 'Building the paper and finding clear pictures…' : 'Building the paper…');
        ({ blocks } = await specToBlocks(spec, {
          lang: o.lang,
          resolveFigure: figureResolver(files, shrunk, docxImages),
          resolvePicture: o.pictures ? commonsResolver(report) : null
        }));
        meta = specMeta(spec, S.settings);
        engine = 'ai';
      } else {
        let text = o.text; const skipped = [];
        for (const f of files) {
          pg.step(`Reading ${f.name}…`);
          try { text += '\n\n' + (await fileToText(f)).text; } catch (e) { skipped.push(e.message); }
        }
        if (skipped.length) toast(skipped[0], 'info', 6000);
        pg.step('Building questions…');
        blocks = basicGenerate(text, o, S.settings);
        engine = 'basic';
      }
      if (!blocks.length) throw new Error('No questions could be made from this material.');
      const paper = newPaper(S.user, S.settings, {
        subject: o.subject, grade: o.grade, lang: o.lang, form: { ...o.form }, totalMarks: o.totalMarks, duration: o.duration,
        title: meta.title || '', blocks, origin: { kind: 'compiled', engine, at: Date.now() }
      });
      if (o.pictures) await improvePictures(paper, report, pg);
      paper.origin.report = report;
      pg.close();
      const a = analyse(paper, S.settings);
      const extras = reportSummary(report);
      openDraft(paper, `${engine === 'ai' ? 'Compiled by AI' : 'Compiled by the basic generator'} from your study material — ${a.total} marks${a.total !== o.totalMarks ? ` (you asked for ${o.totalMarks})` : ''}${extras.length ? '; ' + extras.join(', ') : ''}. Check every question, answer and Bloom's level, then <b>Save Paper</b>.${hasReport(report) ? ' <button class="link-btn" data-report>View the update report</button>' : ''}`);
    } catch (e) {
      pg.close(); console.error(e);
      if (aiAvailable() && !forceBasic && /AI|Gemini|App Check|limit/i.test(e.message)) aiFailed(e.message, () => runCompile(true));
      else toast(e.message, 'err', 8000);
    }
  };
  $('#cgo').onclick = () => runCompile(false);
}

// ───────────────────────────── Import Paper ─────────────────────────────
export async function pageImport(view) {
  setTop('Import Paper', 'Bring in an existing test — give it the school layout, tidy it up, or edit it');
  const files = [];
  const ai = aiAvailable();
  view.innerHTML = `
  ${engineNote()}
  <div class="ac-grid">
    <div class="card card-pad">
      <h3>1. Upload the paper</h3>
      <div id="ifiles">${dropHtml(ai ? '.pdf,.docx,.txt,image/*' : '.pdf,.docx,.txt', ai ? 'PDF, Word (.docx) or photos/scans of the pages (in page order)' : 'Word (.docx) or PDF saved from Word / Google Docs')}</div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="imemo"> The file also contains the memorandum (import the answers)</label>
    </div>
    <div class="card card-pad">
      <h3>2. What would you like to do?</h3>
      <div class="mode-cards">
        ${[['keep', 'Improve the look', 'Keep the wording exactly, and re-set it in the school layout (header box, VRAAG numbering, marks, answer lines).', true],
           ['fix', 'Improve the look + tidy the language', 'Also correct spelling and grammar, make instructions clear and numbering consistent.', ai],
           ['rebalance', "Rebalance Bloom's levels", "Also rewrite some questions so the paper meets the subject's lower / middle / higher order targets.", ai],
           ['variant', 'Make a new version', 'Same knowledge, Bloom’s levels and marks — but different questions, examples and sources (e.g. a different climate graph). Ideal for a re-test or another class.', ai]]
          .map(([v, t, d, on], i) => `<label class="mode ${on ? '' : 'mode-off'}"><input type="radio" name="imode" value="${v}" ${i === 0 ? 'checked' : ''} ${on ? '' : 'disabled'}><div><b>${t}</b><div class="muted small">${d}${on ? '' : ' <i>(needs AI)</i>'}</div></div></label>`).join('')}
      </div>
      <div class="field hidden" id="ivarbox" style="margin-top:10px"><span>How different should the new version be?</span>
        <div class="seg" id="ivar"><button type="button" data-v="light" class="on">A little — same questions, new examples &amp; numbers</button><button type="button" data-v="more">Clearly — new questions on the same knowledge</button></div></div>
      <div class="grid-3" style="margin-top:12px">
        <label class="field"><span>Subject</span><select class="input" id="isub"><option value="">Detect from paper</option>${S.settings.subjects.map(s => `<option value="${s.id}">${esc(s.en)}</option>`).join('')}</select></label>
        <label class="field"><span>Grade</span><select class="input" id="igr"><option value="">Detect</option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Paper language</span><select class="input" id="ilang"><option value="auto">Detect</option><option value="bi">Bilingual</option><option value="af">Afrikaans</option><option value="en">English</option></select></label>
      </div>
      ${qualityChecksHtml('i', 'the paper and its memo')}
      ${ai ? `<label class="field"><span>Extra instructions (optional)</span><textarea class="input" id="iextra" rows="2" placeholder="e.g. Leave out Question 5. Make the matching question a multiple choice question."></textarea></label>` : ''}
      <button class="btn btn-gold btn-lg btn-block" id="igo">${icon('file', 18)} Import paper</button>
      <p class="muted small" style="margin-bottom:0">Afterwards you can edit everything, preview the new layout and print it, together with a memorandum and Bloom's analysis.</p>
    </div>
  </div>`;
  filePicker($('#ifiles', view), files, {});
  let variation = 'light';
  view.addEventListener('change', e => { if (e.target.name === 'imode') $('#ivarbox').classList.toggle('hidden', e.target.value !== 'variant'); });
  $$('#ivar button', view).forEach(b => b.onclick = () => { variation = b.dataset.v; $$('#ivar button', view).forEach(x => x.classList.toggle('on', x === b)); });

  const runImport = async (forceBasic = false) => {
    if (!files.length) return toast('Add the paper file(s) first.', 'err');
    const o = {
      mode: view.querySelector('[name=imode]:checked').value, subject: $('#isub').value, grade: $('#igr').value,
      lang: $('#ilang').value, hasMemo: $('#imemo').checked, extra: $('#iextra')?.value.trim() || '',
      pictures: $('#ipics').checked, facts: $('#ifacts').checked, kind: 'paper', variation
    };
    const pg = progress('Importing your paper');
    try {
      let blocks, meta = {}, notes = [], engine;
      const report = newReport();
      if (ai && !forceBasic) {
        const { parts, text, docxImages, shrunk } = await filesToParts(files, t => pg.step(t));
        o.text = text.slice(0, 250000);
        if (o.facts) o.corrections = await runFactCheck(o, parts, report, pg);
        pg.step(o.mode === 'keep' ? 'Gemini is reading the paper…' : o.mode === 'fix' ? 'Gemini is reading and tidying the paper…' : o.mode === 'variant' ? 'Gemini is writing a new version of the paper…' : 'Gemini is reading and rebalancing the paper…', 'Usually 20–90 seconds, depending on the number of pages.');
        const spec = await aiJson([importPrompt(o, S.settings), ...parts], t => pg.step(t));
        pg.step('Cutting out pictures and building the paper…');
        const lang = o.lang !== 'auto' ? o.lang : (['af', 'en', 'bi'].includes(spec?.meta?.lang) ? spec.meta.lang : 'bi');
        ({ blocks, notes } = await specToBlocks(spec, { lang, resolveFigure: figureResolver(files, shrunk, docxImages), resolvePicture: (o.pictures || o.mode === 'variant') ? commonsResolver(report) : null }));
        meta = specMeta(spec, S.settings); meta.lang = lang;
        engine = 'ai';
      } else {
        let text = ''; const imgs = [];
        for (const f of files) {
          pg.step(`Reading ${f.name}…`);
          const r = await fileToText(f);
          // renumber Word picture markers across files
          text += '\n' + r.text.replace(/\[IMAGE (\d+)\]/g, (_, n) => `[IMAGE ${imgs.length + Number(n)}]`);
          imgs.push(...(r.images || []));
        }
        pg.step('Finding the questions…');
        const r = basicImport(text);
        blocks = r.blocks; meta = r.meta;
        // Attach Word pictures to the question they appear in
        const MK = /\s*\[IMAGE (\d+)\]\s*/g;
        for (const b of blocks) {
          if (b.kind !== 'question') continue;
          const found = [];
          const strip = v => String(v || '').replace(MK, (_, n) => { found.push(Number(n)); return ' '; }).replace(/\s{2,}/g, ' ').trim();
          b.instr = { af: strip(b.instr?.af), en: strip(b.instr?.en) };
          b.items.forEach(it => { it.text = strip(it.text); });
          const im = found.map(n => imgs[n - 1]).find(Boolean);
          if (im) { b.image = im.dataUrl; b.imgWidth = 70; }
        }
        const lang = o.lang !== 'auto' ? o.lang : (/\b(vraag|beantwoord|punte)\b/i.test(text) ? (/\b(question|answer|marks)\b/i.test(text) ? 'bi' : 'af') : 'en');
        meta.lang = lang;
        blocks.forEach(b => { if (b.kind === 'question' && b.instr && lang === 'en') b.instr = { af: '', en: b.instr.af }; });
        engine = 'basic';
      }
      if (forceBasic) o.mode = 'keep';
      const qs = blocks.filter(b => b.kind === 'question');
      if (!qs.length) throw new Error(engine === 'basic'
        ? 'No questions were recognised. The basic importer looks for headings like "VRAAG 1" / "QUESTION 1" and numbers like 1.1 with marks in brackets (2). Scanned papers need the AI features.'
        : 'No questions were recognised in this file.');
      const paper = newPaper(S.user, S.settings, {
        ...meta,
        subject: o.subject || meta.subject || (S.user.prefs || {}).subject || S.settings.subjects[0].id,
        grade: o.grade || meta.grade || (S.user.prefs || {}).grade || '5',
        lang: meta.lang, blocks, origin: { kind: 'imported', engine, mode: o.mode, file: files.map(f => f.name).join(', '), at: Date.now() }
      });
      if (o.mode === 'variant' && engine === 'ai') { paper.title = (paper.title || 'Paper') + ' – new version'; paper.date = ''; }
      if (!meta.totalMarks) paper.totalMarks = analyse(paper, S.settings).total;
      if (!meta.educators) paper.educators = (S.user.prefs || {}).educators || displayName(S.user);
      if (o.pictures) await improvePictures(paper, report, pg);
      paper.origin.report = report;
      pg.close();
      importResult(paper, notes, engine);
    } catch (e) {
      pg.close(); console.error(e);
      if (ai && !forceBasic && /AI|Gemini|App Check|limit/i.test(e.message) && files.every(f => ['pdf', 'docx', 'text'].includes(fileKind(f)))) aiFailed(e.message, () => runImport(true));
      else toast(e.message, 'err', 9000);
    }
  };
  $('#igo').onclick = () => runImport(false);
}

function importResult(paper, notes, engine) {
  const a = analyse(paper, S.settings);
  const st = paperStatus(paper, S.settings);
  const nq = paper.blocks.filter(b => b.kind === 'question').length;
  const ns = paper.blocks.filter(b => b.kind === 'source').length;
  const missing = notes.filter(n => n === 'missing-figure').length;
  const m = openModal({
    title: paper.origin.mode === 'variant' && engine === 'ai' ? 'New version created' : 'Paper imported',
    body: `<div class="imp-sum">
      <div><b>${nq}</b><span>questions</span></div><div><b>${a.total}</b><span>marks</span></div><div><b>${ns}</b><span>sources</span></div>
      <div><b class="${st.key === 'ok' ? 'st-ok' : 'st-low'}">${st.key === 'ok' ? '✓' : '!'}</b><span>${esc(st.label)}</span></div>
    </div>
    <p class="muted small">${esc(subjName(paper.subject))} · Grade ${esc(paper.grade)} · ${ {bi: 'Bilingual', af: 'Afrikaans', en: 'English'}[paper.lang] } · read by ${engine === 'ai' ? 'AI' : 'the basic importer'}.</p>
    ${a.planned && a.planned !== a.total ? `<div class="note note-gold" style="margin-bottom:10px">The paper says ${a.planned} marks but the questions add up to ${a.total}. Please check the marks.</div>` : ''}
    ${missing ? `<div class="note note-gold" style="margin-bottom:10px">${missing} picture${missing === 1 ? '' : 's'} could not be cut out automatically — they are marked on the paper; use <b>edit</b> to upload them.</div>` : ''}
    ${hasReport(paper.origin.report) ? `<div class="note note-ai" style="margin-bottom:10px">${icon('sparkle', 15)} <span><b>Quality checks:</b> ${esc(reportSummary(paper.origin.report).join(', ') || 'nothing needed changing')}. <button class="link-btn" data-c="report">View the update report</button></span></div>` : ''}
    ${engine === 'basic' ? `<div class="note" style="margin-bottom:10px">The basic importer copies the question text and marks. Question types (e.g. matching), sources, pictures and memo answers may need to be set in the editor.</div>` : ''}
    <div class="choice-list">
      <button class="choice" data-c="edit">${icon('edit', 22)}<div><b>Edit the paper</b><span>Open it in the editor to change questions, marks and Bloom's levels.</span></div></button>
      <button class="choice" data-c="print">${icon('print', 22)}<div><b>Save &amp; see the new layout</b><span>Save it and open the print preview in the school format (paper, memo, Bloom's grid).</span></div></button>
      <button class="choice" data-c="bloom">${icon('sliders', 22)}<div><b>Check Bloom's balance</b><span>See the lower / middle / higher order analysis for this paper.</span></div></button>
    </div>`
  });
  $$('[data-c]', m.el).forEach(b => b.onclick = async () => {
    const c = b.dataset.c;
    if (c === 'edit') { m.close(); const ex = reportSummary(paper.origin.report || newReport()); openDraft(paper, `${paper.origin.mode === 'variant' && engine === 'ai' ? 'New version of' : 'Imported from'} <b>${esc(paper.origin.file)}</b>${ex.length ? ' — ' + ex.join(', ') : ''}. Check the questions and Bloom's levels, then <b>Save Paper</b>.${hasReport(paper.origin.report) ? ' <button class="link-btn" data-report>View the update report</button>' : ''}`); }
    else if (c === 'report') openUpdateReport(paper);
    else if (c === 'print') {
      try { paper.updatedAt = Date.now(); await store.savePaper(paper); await refreshMyPapers(); m.close(); toast('Paper saved.'); go('#/print/' + paper.id); }
      catch (e) { toast(e.message, 'err'); }
    } else if (c === 'bloom') openModal({ title: "Bloom's analysis", wide: true, body: `<div style="overflow-x:auto">${renderAnalysis(paper, S.settings, displayName(S.user))}</div>` });
  });
}

// When the AI service fails, explain and offer the built-in (no-AI) version.
function aiFailed(msg, retryBasic) {
  const [main, tech] = msg.split(' (Technical detail:');
  const m = openModal({
    title: 'The AI could not do this right now',
    body: `<p style="margin-top:0">${esc(main)}</p>
      ${tech ? `<details><summary class="small muted" style="cursor:pointer">Technical detail (for your administrator)</summary><p class="small muted">${esc(tech.replace(/\)$/, ''))}</p></details>` : ''}
      <div class="note" style="margin-top:12px">${icon('info', 15)} <span>You can still continue with the <b>built-in generator</b>. It works without AI, but writes simpler questions and can only read typed text, Word files and text-based PDFs.</span></div>`,
    footer: `<button class="btn btn-ghost" data-close>Close</button><button class="btn btn-gold" id="usebasic">Use the built-in generator</button>`
  });
  $('#usebasic', m.el).onclick = () => { m.close(); retryBasic(); };
}

// Report of what the quality checks changed (facts updated, pictures replaced).
export function openUpdateReport(paper) {
  const r = paper.origin?.report;
  if (!r) return toast('There is no update report for this paper.', 'info');
  const m = openModal({
    title: 'Update report', wide: true,
    body: `
      <h3 style="margin-bottom:8px">Outdated information</h3>
      ${!r.factsChecked ? `<p class="muted">${r.factsError ? 'The fact check could not run: ' + esc(r.factsError) : 'The fact check was not switched on for this paper.'}</p>`
        : r.facts.length ? `<table class="table rep-table"><thead><tr><th>In the study material</th><th>Used on the paper instead</th></tr></thead><tbody>
            ${r.facts.map(f => `<tr><td><s>${esc(f.old)}</s></td><td><b>${esc(f.new)}</b>${f.why ? `<div class="small muted">${esc(f.why)}</div>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">No outdated information was found in the study material.</p>'}
      ${r.factSources?.length ? `<div class="small" style="margin-top:10px"><b>Sources checked:</b><ol class="src-list">${r.factSources.map(s => `<li><a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ol></div>` : ''}
      ${r.searchHtml ? `<div class="small muted" style="margin:8px 0 4px">Google Search suggestions:</div><iframe class="gsearch" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Google Search suggestions"></iframe>` : ''}
      <p class="small muted">Please double-check updated facts before printing — the AI can make mistakes.</p>
      <h3 style="margin:18px 0 8px">Pictures</h3>
      ${r.pictures?.length ? `<ul class="rep-pics">${r.pictures.map(p => `<li>${p.action === 'sharpened' ? `A low-resolution picture (${p.fromDpi} dpi) was <b>sharpened</b>${p.term ? ` — no clearer copy of “${esc(p.term)}” was found` : ''}.` : `${p.action === 'replaced' ? `A low-resolution picture (${p.fromDpi} dpi) was <b>replaced</b>` : 'A picture was <b>added</b>'}: <a href="${esc(p.page || '#')}" target="_blank" rel="noopener">${esc(p.title || p.term)}</a><div class="small muted">${esc(p.credit || '')}</div>`}</li>`).join('')}</ul>`
        : '<p class="muted">No pictures needed replacing.</p>'}
      <p class="small muted">Use <b>Pictures</b> in the toolbar to choose a different picture, sharpen one, or upload your own.</p>`
  });
  const fr = $('.gsearch', m.el);
  if (fr) fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0">${r.searchHtml}</body></html>`;
}
