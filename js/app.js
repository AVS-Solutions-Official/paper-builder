// Kathu Primary School Paper Builder — app shell, routing and pages.
import { initStore, store, isDemo, domainOk, isAdminEmail } from './store.js';
import { ALLOWED_DOMAIN } from './config.js';
import { esc, icon, toast, openModal, confirmBox, $, $$, fmtDate, initials } from './ui.js';
import { LEVELS, ORDERS, ORDER_LABEL, DEFAULT_MAPPING, paperStatus, analyse, subjectById, levelByN, paperItems } from './bloom.js';
import { TYPE_INFO, FORMS } from './i18n.js';
import { newPaper, clonePaper, cloneBlock, displayName } from './model.js';
import { renderQuestionPaper, renderMemo, renderAnalysis, renderAddendum, hasAddendum, subjectNames } from './render.js';
import { renderEditor, editorGuard } from './editor.js';
import { newId } from './store.js';

export const S = { user: null, settings: null, myPapers: [], route: null };
const app = () => $('#app');

// ───────────────────────────── boot ─────────────────────────────
(async function boot() {
  try {
    await initStore();
  } catch (e) {
    app().innerHTML = `<div class="boot"><img src="assets/emblem.png" width="72" alt=""><p><b>Could not connect to Firebase.</b><br>${esc(e.message)}</p></div>`;
    return;
  }
  store.onAuth(async user => {
    S.user = user;
    if (!user) return renderAuth('login');
    if (!user.verified) return renderVerify();
    try { S.settings = await store.getSettings(); } catch (e) { toast(e.message, 'err'); S.settings = (await import('./bloom.js')).defaultSettings(); }
    await refreshMyPapers();
    renderShell();
    route();
  });
  window.addEventListener('hashchange', onHash);
})();

export async function refreshMyPapers() {
  try { S.myPapers = await store.listPapers({ mine: true, uid: S.user.uid }); } catch { S.myPapers = []; }
  updateBell();
}

let skipHash = false;
async function onHash() {
  if (skipHash) { skipHash = false; return; }
  if (!S.user || !S.user.verified) return;
  const ok = await editorGuard();
  if (!ok) { skipHash = true; history.back(); return; }
  route();
}
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

// ───────────────────────────── auth ─────────────────────────────
function authLayout(inner) {
  return `<div class="auth">
    <div class="auth-side">
      <img src="assets/emblem.png" alt="Kathu Primary School emblem">
      <h1>Kathu Primary School<span>PAPER BUILDER</span></h1>
      <p>Compile neat, consistent question papers with a live Bloom's taxonomy check — so every test has the right mix of lower, middle and higher order questions for its subject.</p>
      <div class="auth-pyr">
        <div style="background:#e9c8df;width:50%">6 · Create</div>
        <div style="background:#eed6e6;width:60%">5 · Evaluate</div>
        <div style="background:#f4d991;width:70%">4 · Analyse</div>
        <div style="background:#f8e7b8;width:80%">3 · Apply</div>
        <div style="background:#b7d6f0;width:90%">2 · Understand</div>
        <div style="background:#d3e6f7;width:100%">1 · Remember</div>
      </div>
    </div>
    <div class="auth-main"><div class="auth-card">${isDemo ? `<div class="note note-gold" style="margin-bottom:18px"><b>Demo mode.</b> Firebase is not connected yet, so accounts and papers are saved only in this browser.</div>` : ''}${inner}</div></div>
  </div>`;
}

function renderAuth(mode) {
  const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Mnr.', 'Mev.', 'Me.', 'Juf.'];
  const login = `
    <h2>Welcome back</h2><p class="sub">Sign in with your school email address.</p>
    <div class="err hidden" id="aerr"></div>
    <form id="af">
      <label class="field"><span>School email</span><input class="input" type="email" name="email" placeholder="name@${ALLOWED_DOMAIN}" autocomplete="email" required autofocus></label>
      <label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn btn-navy btn-lg btn-block" type="submit">Sign in</button>
    </form>
    <div class="auth-switch"><button data-mode="forgot">Forgot password?</button></div>
    <div class="auth-switch">New to Paper Builder? <button data-mode="signup">Create an account</button></div>`;
  const signup = `
    <h2>Create your account</h2><p class="sub">Only <b>@${ALLOWED_DOMAIN}</b> email addresses can register.</p>
    <div class="err hidden" id="aerr"></div>
    <form id="af">
      <div class="grid-2" style="grid-template-columns:110px 1fr">
        <label class="field"><span>Title</span><select class="input" name="title">${titles.map(t => `<option>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Name as it should appear</span><input class="input" name="name" placeholder="e.g. J. Smith" required autofocus></label>
      </div>
      <label class="field"><span>School email</span><input class="input" type="email" name="email" placeholder="name@${ALLOWED_DOMAIN}" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" type="password" name="password" minlength="6" autocomplete="new-password" required><small>At least 6 characters.</small></label>
      <label class="field"><span>Confirm password</span><input class="input" type="password" name="password2" autocomplete="new-password" required></label>
      <button class="btn btn-gold btn-lg btn-block" type="submit">Create account</button>
    </form>
    <div class="auth-switch">Already registered? <button data-mode="login">Sign in</button></div>`;
  const forgot = `
    <h2>Reset your password</h2><p class="sub">We'll email you a link to choose a new password.</p>
    <div class="err hidden" id="aerr"></div>
    <form id="af">
      <label class="field"><span>School email</span><input class="input" type="email" name="email" placeholder="name@${ALLOWED_DOMAIN}" required autofocus></label>
      <button class="btn btn-navy btn-lg btn-block" type="submit">Send reset link</button>
    </form>
    <div class="auth-switch"><button data-mode="login">Back to sign in</button></div>`;
  app().innerHTML = authLayout({ login, signup, forgot }[mode]);
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => renderAuth(b.dataset.mode)));
  const form = $('#af');
  const err = m => { const e = $('#aerr'); e.textContent = m; e.classList.toggle('hidden', !m); };
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    err('');
    if (!domainOk(f.email)) return err(`Please use your @${ALLOWED_DOMAIN} school email address.`);
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      if (mode === 'login') await store.signIn(f.email, f.password);
      else if (mode === 'signup') {
        if (f.password !== f.password2) throw new Error('The passwords do not match.');
        if (!f.name.trim()) throw new Error('Please enter your name.');
        await store.signUp({ email: f.email, password: f.password, name: f.name.trim(), title: f.title });
      } else {
        await store.resetPassword(f.email);
        toast('Reset link sent — check your inbox.', 'ok', 5000);
        renderAuth('login');
      }
    } catch (e) { err(e.message); }
    btn.disabled = false;
  });
}

function renderVerify() {
  app().innerHTML = authLayout(`
    <h2>Verify your email</h2>
    <p class="sub">We sent a verification link to <b>${esc(S.user.email)}</b>. Click the link in that email, then come back and press the button below.</p>
    <div class="err hidden" id="aerr"></div>
    <button class="btn btn-navy btn-lg btn-block" id="vdone">I've verified my email</button>
    <div class="auth-switch"><button id="vresend">Resend the email</button> · <button id="vout">Sign out</button></div>
    <p class="small muted" style="margin-top:22px">Can't find it? Check your spam or junk folder.</p>`);
  $('#vdone').onclick = async () => {
    const u = await store.reloadUser();
    if (u?.verified) { location.reload(); } else { const e = $('#aerr'); e.textContent = 'Your email is not verified yet. Please click the link in the email first.'; e.classList.remove('hidden'); }
  };
  $('#vresend').onclick = async () => { try { await store.resendVerification(); toast('Verification email sent.'); } catch (e) { toast(e.message, 'err'); } };
  $('#vout').onclick = () => store.signOut();
}

// ───────────────────────────── shell ─────────────────────────────
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['create', 'Create Paper', 'file'],
  ['compile', 'Auto Compile', 'sparkle'],
  ['import', 'Import Paper', 'upload'],
  ['bank', 'Question Bank', 'layers'],
  ['papers', 'Saved Papers', 'file'],
  ['templates', 'My Templates', 'template'],
  ['settings', 'Settings', 'settings']
];

function renderShell() {
  app().innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar">
      <a class="brand" href="#/dashboard">
        <img src="assets/emblem.png" alt="">
        <div><div class="brand-name">KATHU PRIMARY SCHOOL</div><div class="brand-sub">PAPER BUILDER</div></div>
      </a>
      <nav class="nav">${NAV.map(([r, l, i]) => `<a href="#/${r}" data-nav="${r}">${icon(i, 22)}<span>${l}</span></a>`).join('')}</nav>
      <div class="side-foot">
        <div class="avatar">${esc(initials(S.user.name))}</div>
        <div class="who"><b>${esc(displayName(S.user))}</b><button data-logout>Logout</button></div>
        <button class="icon-btn" data-logout aria-label="Log out" title="Log out">${icon('logout', 22)}</button>
      </div>
    </aside>
    <div class="main">
      <div class="mobilebar"><button class="icon-btn" id="navtoggle" aria-label="Menu">${icon('menu')}</button><img src="assets/emblem.png" alt=""><b>Paper Builder</b></div>
      ${isDemo ? `<div class="demo-banner">${icon('info', 16)}<span><b>Demo mode</b> — data is saved only in this browser. Add your Firebase settings in <code>js/config.js</code> to go live.</span></div>` : ''}
      <header class="topbar">
        <div class="titles"><h1 id="ptitle"></h1><div class="meta" id="pmeta"></div></div>
        <div class="top-actions">
          <span id="pactions"></span>
          <a class="btn btn-outline hide-sm" href="#/dashboard">Dashboard</a>
          <a class="icon-btn" href="#/papers" title="Saved papers" aria-label="Saved papers">${icon('grid')}</a>
          <div class="rel"><button class="icon-btn" id="bell" aria-label="Notifications">${icon('bell')}<span class="badge hidden" id="belln"></span></button></div>
        </div>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`;
  $$('[data-logout]').forEach(b => b.onclick = async () => { if (await editorGuard()) store.signOut(); });
  $('#navtoggle').onclick = () => $('#shell').classList.toggle('nav-open');
  $('.sidebar').addEventListener('click', e => { if (e.target.closest('a')) $('#shell').classList.remove('nav-open'); });
  $('#bell').onclick = toggleBell;
  updateBell();
}

function bellItems() {
  return S.myPapers.filter(p => paperStatus(p, S.settings).key === 'warn');
}
function updateBell() {
  const n = $('#belln'); if (!n) return;
  const c = bellItems().length;
  n.textContent = c; n.classList.toggle('hidden', !c);
}
function toggleBell(e) {
  e.stopPropagation();
  const host = $('#bell').parentElement;
  const open = $('.dropdown', host);
  if (open) return open.remove();
  const items = bellItems();
  const dd = document.createElement('div');
  dd.className = 'dropdown';
  dd.innerHTML = `<div class="dd-h">Papers needing attention</div>` + (items.length
    ? items.slice(0, 8).map(p => `<a href="#/edit/${p.id}">${esc(paperTitle(p))}<small>${esc(paperStatus(p, S.settings).label)}</small></a>`).join('')
    : `<div style="padding:10px;color:var(--muted);font-size:14px">All your papers are Bloom's-balanced. 🎉</div>`);
  host.appendChild(dd);
  const close = ev => { if (!dd.contains(ev.target)) { dd.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
  dd.addEventListener('click', ev => { if (ev.target.closest('a')) dd.remove(); });
}

export function setTop(title, meta = '', actions = '') {
  $('#ptitle').textContent = title;
  $('#pmeta').innerHTML = meta;
  $('#pactions').innerHTML = actions;
  document.title = `${title} · Kathu Primary School Paper Builder`;
}

function setNav(r) {
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === r));
}

export function subjName(id) {
  const s = subjectById(S.settings, id);
  return s ? s.en : '—';
}
export function paperTitle(p) {
  return p.title || `Grade ${p.grade} – ${subjName(p.subject)}${p.taskNo ? ' – Task ' + p.taskNo : ''}`;
}
const statusPill = p => { const s = paperStatus(p, S.settings); return `<span class="pill pill-${s.key}">${s.key === 'ok' ? icon('check', 13) : s.key === 'warn' ? icon('warn', 13) : ''}${esc(s.label)}</span>`; };

// ───────────────────────────── router ─────────────────────────────
async function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, query] = h.split('?');
  const [r, id] = path.split('/');
  const params = new URLSearchParams(query || '');
  S.route = r;
  const old = $('#view');
  if (!old) return;
  const view = old.cloneNode(false); // fresh element = no stale listeners
  old.replaceWith(view);
  window.scrollTo(0, 0);
  setNav(r === 'edit' ? (params.get('t') ? 'templates' : 'create') : r === 'print' ? 'papers' : r);
  try {
    switch (r) {
      case 'dashboard': return await pageDashboard(view);
      case 'create': return await renderEditor(view, { template: params.get('template'), asTemplate: params.get('t') === '1', bank: params.get('bank'), draft: params.get('draft') });
      case 'compile': return await (await import('./auto.js')).pageCompile(view);
      case 'import': return await (await import('./auto.js')).pageImport(view);
      case 'edit': return await renderEditor(view, { id });
      case 'papers': return await pagePapers(view, params.get('tab') || 'mine');
      case 'templates': return await pageTemplates(view);
      case 'bank': return await pageBank(view);
      case 'settings': return await pageSettings(view);
      case 'print': return await pagePrint(view, id);
      default: go('#/dashboard');
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card card-pad"><b>Something went wrong.</b><p class="muted">${esc(e.message)}</p></div>`;
  }
}

// ───────────────────────────── dashboard ─────────────────────────────
async function pageDashboard(view) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  setTop(`${greet}, ${displayName(S.user)}`, 'Kathu Primary School · Paper Builder', `<a class="btn btn-gold" href="#/create">${icon('plus', 18)} Create Paper</a>`);
  const papers = S.myPapers;
  let bankCount = '—', tplCount = '—';
  try { bankCount = (await store.listBank()).length; } catch {}
  try { tplCount = (await store.listPapers({ templates: true })).length; } catch {}
  const ok = papers.filter(p => paperStatus(p, S.settings).key === 'ok').length;
  const warn = papers.filter(p => paperStatus(p, S.settings).key === 'warn').length;
  view.innerHTML = `
  <div class="stats">
    <div class="card stat">${icon('file', 24)}<div class="n">${papers.length}</div><div class="l">My papers</div></div>
    <div class="card stat">${icon('check', 24)}<div class="n">${ok}</div><div class="l">Bloom's-balanced</div></div>
    <div class="card stat">${icon('warn', 24)}<div class="n">${warn}</div><div class="l">Need attention</div></div>
    <div class="card stat">${icon('layers', 24)}<div class="n">${bankCount}</div><div class="l">Questions in bank · ${tplCount} templates</div></div>
  </div>
  <div class="dash-grid">
    <div class="card">
      <div class="card-pad" style="padding-bottom:6px;display:flex;align-items:center"><h3 style="margin:0">Recent papers</h3><a href="#/papers" class="small" style="margin-left:auto">View all</a></div>
      ${papers.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Paper</th><th>Marks</th><th>Bloom's</th><th>Updated</th></tr></thead><tbody>
        ${papers.slice(0, 6).map(p => `<tr class="clickable" data-href="#/edit/${p.id}"><td><b>${esc(paperTitle(p))}</b><div class="small muted">${esc(subjName(p.subject))} · Grade ${esc(p.grade)}</div></td><td>${analyse(p, S.settings).total}</td><td>${statusPill(p)}</td><td class="muted small">${fmtDate(p.updatedAt)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${icon('file', 44)}<div>You haven't created any papers yet.</div><a class="btn btn-gold" style="margin-top:14px" href="#/create">Create your first paper</a></div>`}
    </div>
    <div class="card card-pad">
      <h3>Bloom's taxonomy at a glance</h3>
      ${bloomRef()}
      <p class="small muted" style="margin:12px 0 0">Tag every question with a level while you build. The toolbar shows whether the paper meets the subject's lower / middle / higher order percentages.</p>
    </div>
  </div>`;
  $$('tr[data-href]', view).forEach(tr => tr.onclick = () => go(tr.dataset.href));
}

export function bloomRef(compact = false) {
  const m = S.settings?.mapping || DEFAULT_MAPPING;
  return `<div class="levels-ref">${[...LEVELS].reverse().map(l => `<div class="lvl"><div class="num o-${m[l.n]}">${l.n}</div><div><b>${l.en}</b> <span class="muted small">/ ${l.af} · ${ORDER_LABEL[m[l.n]]}</span>${compact ? '' : `<div>${esc(l.verbs.en.slice(0, 7).join(', '))} · <i>${esc(l.verbs.af.slice(0, 5).join(', '))}</i></div>`}</div></div>`).join('')}</div>`;
}

// ───────────────────────────── saved papers ─────────────────────────────
async function pagePapers(view, tab) {
  setTop('Saved Papers', 'Your papers and papers shared by colleagues', `<a class="btn btn-gold" href="#/create">${icon('plus', 18)} Create Paper</a>`);
  const list = tab === 'mine' ? S.myPapers : await store.listPapers({});
  view.innerHTML = `
    <div class="tabs"><button data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">My papers</button><button data-tab="all" class="${tab === 'all' ? 'on' : ''}">All school papers</button></div>
    <div class="filters"><div class="search">${icon('search', 16)}<input class="input" id="q" placeholder="Search papers…"></div>
      <select class="input" id="fs"><option value="">All subjects</option>${S.settings.subjects.map(s => `<option value="${s.id}">${esc(s.en)}</option>`).join('')}</select>
      <select class="input" id="fg"><option value="">All grades</option>${['R', 1, 2, 3, 4, 5, 6, 7].map(g => `<option>${g}</option>`).join('')}</select></div>
    <div class="card" id="plist"></div>`;
  $$('[data-tab]', view).forEach(b => b.onclick = () => go('#/papers?tab=' + b.dataset.tab));
  const draw = () => {
    const q = $('#q').value.toLowerCase(), fs = $('#fs').value, fg = $('#fg').value;
    const rows = list.filter(p => (!q || (paperTitle(p) + ' ' + p.ownerName).toLowerCase().includes(q)) && (!fs || p.subject === fs) && (!fg || String(p.grade) === fg));
    $('#plist').innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Paper</th>${tab === 'all' ? '<th>Teacher</th>' : ''}<th>Marks</th><th>Bloom's</th><th>Updated</th><th></th></tr></thead><tbody>
      ${rows.map(p => {
        const mine = p.ownerUid === S.user.uid;
        return `<tr><td><b>${esc(paperTitle(p))}</b><div class="small muted">${esc(subjName(p.subject))} · Grade ${esc(p.grade)}${p.taskNo ? ' · Task ' + esc(p.taskNo) : ''}</div></td>
        ${tab === 'all' ? `<td class="small">${esc(p.ownerName)}</td>` : ''}
        <td>${analyse(p, S.settings).total}</td><td>${statusPill(p)}</td><td class="muted small">${fmtDate(p.updatedAt)}</td>
        <td><div class="actions">
          ${mine ? `<a class="btn btn-sm btn-blue" href="#/edit/${p.id}">${icon('edit', 15)} Edit</a>` : ''}
          <a class="btn btn-sm btn-outline" href="#/print/${p.id}">${icon('print', 15)} Print</a>
          <button class="btn btn-sm btn-outline" data-dup="${p.id}" title="Make a copy you can edit">${icon('copy', 15)} Copy</button>
          <button class="btn btn-sm btn-outline" data-tpl="${p.id}" title="Save as a reusable template">${icon('template', 15)} Template</button>
          ${mine ? `<button class="btn btn-sm btn-ghost" data-del="${p.id}" title="Delete" aria-label="Delete">${icon('trash', 15)}</button>` : ''}
        </div></td></tr>`;
      }).join('')}</tbody></table></div>`
      : `<div class="empty">${icon('file', 44)}<div>${list.length ? 'No papers match your filters.' : tab === 'mine' ? 'No saved papers yet.' : 'No papers have been saved at school yet.'}</div></div>`;
    const byId = id => list.find(p => p.id === id);
    $$('[data-dup]', view).forEach(b => b.onclick = async () => {
      const src = byId(b.dataset.dup);
      const c = clonePaper(src, S.user, { title: (src.title || paperTitle(src)) + ' (copy)', isTemplate: false });
      await store.savePaper(c); await refreshMyPapers(); toast('Copy created.'); go('#/edit/' + c.id);
    });
    $$('[data-tpl]', view).forEach(b => b.onclick = async () => {
      const src = byId(b.dataset.tpl);
      const c = clonePaper(src, S.user, { title: src.title || paperTitle(src), isTemplate: true, date: '' });
      await store.savePaper(c); toast('Saved to templates.');
    });
    $$('[data-del]', view).forEach(b => b.onclick = async () => {
      const p = byId(b.dataset.del);
      if (!await confirmBox('Delete paper?', `"${paperTitle(p)}" will be permanently deleted.`)) return;
      await store.deletePaper(p.id); await refreshMyPapers(); toast('Paper deleted.');
      pagePapers(view, tab);
    });
  };
  ['q', 'fs', 'fg'].forEach(id => $('#' + id).addEventListener('input', draw));
  draw();
}

// ───────────────────────────── templates ─────────────────────────────
async function pageTemplates(view) {
  setTop('My Templates', 'Reusable paper layouts shared with all staff', `<a class="btn btn-gold" href="#/create?t=1">${icon('plus', 18)} New template</a>`);
  const list = await store.listPapers({ templates: true });
  view.innerHTML = `<div class="note" style="margin-bottom:16px">A template keeps a paper's header details, sections and questions. Use one to start a new paper quickly — e.g. a standard term test layout for your grade and subject.</div><div class="card" id="tl"></div>`;
  $('#tl').innerHTML = list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Template</th><th>By</th><th>Questions</th><th>Marks</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td><b>${esc(paperTitle(p))}</b><div class="small muted">${esc(subjName(p.subject))} · Grade ${esc(p.grade)}</div></td><td class="small">${esc(p.ownerName)}</td><td>${(p.blocks || []).filter(b => b.kind === 'question').length}</td><td>${analyse(p, S.settings).total}</td>
      <td><div class="actions"><a class="btn btn-sm btn-gold" href="#/create?template=${p.id}">Use template</a>
      ${p.ownerUid === S.user.uid ? `<a class="btn btn-sm btn-outline" href="#/edit/${p.id}?t=1">${icon('edit', 15)} Edit</a><button class="btn btn-sm btn-ghost" data-del="${p.id}" aria-label="Delete">${icon('trash', 15)}</button>` : ''}</div></td></tr>`).join('')}
  </tbody></table></div>` : `<div class="empty">${icon('template', 44)}<div>No templates yet. Save any paper as a template from <a href="#/papers">Saved Papers</a>, or create one.</div></div>`;
  $$('[data-del]', view).forEach(b => b.onclick = async () => {
    if (!await confirmBox('Delete template?', 'This template will be permanently deleted. Papers made from it are not affected.')) return;
    await store.deletePaper(b.dataset.del); toast('Template deleted.'); pageTemplates(view);
  });
}

// ───────────────────────────── question bank ─────────────────────────────
export function bankSummary(e) {
  const b = e.block;
  const marks = (b.items || []).reduce((s, i) => s + (Number(i.marks) || 0), 0);
  const levels = [...new Set((b.items || []).map(i => Number(i.bloom)).filter(Boolean))].sort();
  return { marks, levels, type: b.kind === 'source' ? 'Source' : (TYPE_INFO[b.type]?.label || 'Question') };
}
export function bankItemHtml(e, actions) {
  const b = e.block; const s = bankSummary(e);
  const first = b.kind === 'source' ? [esc((b.text || b.caption || (b.table ? 'Table' : '') || (b.image ? 'Picture' : '')).slice(0, 160))].filter(Boolean) : (b.items || []).slice(0, 3).map(i => esc(i.text || i.left || '')).filter(Boolean);
  return `<div class="bank-item"><div>
    <div class="t">${b.kind === 'source' ? `<span class="pill pill-navy">Source</span> ` : ''}${esc(e.title || b.instr?.en || b.instr?.af || s.type)}</div>
    <div class="d">${esc(subjName(e.subject))} · Grade ${esc(e.grade)} · ${s.type}${b.kind === 'source' ? '' : ` · ${(b.items || []).length} item(s) · ${s.marks} marks`} · by ${esc(e.ownerName)}</div>
    <div class="row" style="gap:5px;margin-top:6px">${s.levels.map(n => `<span class="pill pill-l${n}">${n}. ${levelByN(n).en}</span>`).join('')}</div>
    ${first.length ? `<div class="its">${first.map(t => '• ' + t).join('<br>')}${(b.items || []).length > 3 ? '<br>…' : ''}</div>` : ''}
  </div><div class="row" style="align-items:flex-start;flex-direction:column;gap:6px">${actions}</div></div>`;
}
export function bankFilters(prefix, d = {}) {
  return `<div class="filters">
    <div class="search">${icon('search', 16)}<input class="input" id="${prefix}q" placeholder="Search questions…"></div>
    <select class="input" id="${prefix}s"><option value="">All subjects</option>${S.settings.subjects.map(s => `<option value="${s.id}" ${d.subject === s.id ? 'selected' : ''}>${esc(s.en)}</option>`).join('')}</select>
    <select class="input" id="${prefix}g"><option value="">All grades</option>${['R', 1, 2, 3, 4, 5, 6, 7].map(g => `<option ${String(d.grade) === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <select class="input" id="${prefix}t"><option value="">All types</option>${Object.entries(TYPE_INFO).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}<option value="source">Sources (texts, tables, pictures)</option></select>
    <select class="input" id="${prefix}o"><option value="">Any order</option>${ORDERS.map(o => `<option value="${o}">${ORDER_LABEL[o]}</option>`).join('')}</select>
  </div>`;
}
export function bankFilter(list, prefix, root) {
  const v = id => $('#' + prefix + id, root).value;
  const q = v('q').toLowerCase(), s = v('s'), g = v('g'), t = v('t'), o = v('o');
  const m = S.settings.mapping;
  return list.filter(e => {
    const txt = JSON.stringify([e.title, e.block.instr, (e.block.items || []).map(i => [i.text, i.left, i.right])]).toLowerCase();
    return (!q || txt.includes(q)) && (!s || e.subject === s) && (!g || String(e.grade) === g) && (!t || (t === 'source' ? e.block.kind === 'source' : e.block.type === t)) &&
      (!o || (e.block.items || []).some(i => m[i.bloom] === o));
  });
}

async function pageBank(view) {
  setTop('Question Bank', 'Questions saved by staff, ready to reuse', '');
  let list = await store.listBank();
  view.innerHTML = `<div class="note" style="margin-bottom:16px">Add questions to the bank from the paper editor with the <b>Save to bank</b> button on any question. To use a bank question, open a paper and click <b>From Question Bank</b> in the toolbar, or use <b>Add to paper</b> below.</div>
    ${bankFilters('b')}<div id="bl"></div>`;
  const draw = () => {
    const rows = bankFilter(list, 'b', view);
    $('#bl').innerHTML = rows.length ? rows.map(e => bankItemHtml(e, `<button class="btn btn-sm btn-gold" data-add="${e.id}">Add to paper</button>${e.ownerUid === S.user.uid || isAdminEmail(S.user.email) ? `<button class="btn btn-sm btn-ghost" data-del="${e.id}">${icon('trash', 15)} Delete</button>` : ''}`)).join('')
      : `<div class="card empty">${icon('layers', 44)}<div>${list.length ? 'No questions match your filters.' : 'The question bank is empty.'}</div></div>`;
    $$('[data-del]', view).forEach(b => b.onclick = async () => {
      if (!await confirmBox('Remove from bank?', 'This question will be removed from the shared question bank.')) return;
      await store.deleteBank(b.dataset.del); list = list.filter(x => x.id !== b.dataset.del); draw(); toast('Removed from bank.');
    });
    $$('[data-add]', view).forEach(b => b.onclick = () => addBankToPaper(list.find(x => x.id === b.dataset.add)));
  };
  ['q', 's', 'g', 't', 'o'].forEach(id => $('#b' + id, view).addEventListener('input', draw));
  draw();
}

function addBankToPaper(entry) {
  const mine = S.myPapers;
  const m = openModal({
    title: 'Add question to a paper',
    body: `<label class="field"><span>Paper</span><select class="input" id="pp"><option value="__new">+ New paper</option>${mine.map(p => `<option value="${p.id}">${esc(paperTitle(p))}</option>`).join('')}</select></label>`,
    footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-gold" id="ppok">Add</button>`
  });
  $('#ppok', m.el).onclick = async () => {
    const id = $('#pp', m.el).value;
    m.close();
    if (id === '__new') return go('#/create?bank=' + entry.id);
    const p = await store.getPaper(id);
    p.blocks.push(cloneBlock(entry.block));
    p.updatedAt = Date.now();
    await store.savePaper(p); await refreshMyPapers();
    toast('Question added.'); go('#/edit/' + id);
  };
}

// ───────────────────────────── settings ─────────────────────────────
async function pageSettings(view) {
  setTop('Settings', 'Your profile and the school\'s Bloom\'s taxonomy targets');
  const admin = isAdminEmail(S.user.email);
  const st = JSON.parse(JSON.stringify(S.settings));
  const prefs = S.user.prefs || {};
  const ro = admin ? '' : 'disabled';
  view.innerHTML = `
  <div class="dash-grid" style="grid-template-columns:1fr 1.6fr">
    <div class="card card-pad">
      <h3>My profile</h3>
      <form id="prof">
        <div class="grid-2" style="grid-template-columns:100px 1fr"><label class="field"><span>Title</span><input class="input" name="title" value="${esc(S.user.title)}"></label>
        <label class="field"><span>Name</span><input class="input" name="name" value="${esc(S.user.name)}" required></label></div>
        <label class="field"><span>Email</span><input class="input" value="${esc(S.user.email)}" disabled></label>
        <div class="label" style="margin:8px 0 10px">Defaults for new papers</div>
        <label class="field"><span>Usual subject</span><select class="input" name="subject">${S.settings.subjects.map(s => `<option value="${s.id}" ${prefs.subject === s.id ? 'selected' : ''}>${esc(s.en)}</option>`).join('')}</select></label>
        <div class="grid-2"><label class="field"><span>Usual grade</span><select class="input" name="grade">${['R', 1, 2, 3, 4, 5, 6, 7].map(g => `<option ${String(prefs.grade || '5') === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Paper language</span><select class="input" name="lang">${[['bi', 'Bilingual (Afr / Eng)'], ['af', 'Afrikaans'], ['en', 'English']].map(([v, l]) => `<option value="${v}" ${(prefs.lang || 'bi') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <label class="field"><span>Educator(s) printed on papers</span><input class="input" name="educators" value="${esc(prefs.educators || displayName(S.user))}"></label>
        <label class="field"><span>Moderator</span><input class="input" name="moderator" value="${esc(prefs.moderator || '')}"></label>
        <button class="btn btn-navy" type="submit">Save profile</button>
      </form>
    </div>
    <div class="card card-pad">
      <h3>Bloom's taxonomy targets per subject</h3>
      ${admin ? `<div class="note note-gold" style="margin-bottom:14px">These are school defaults — please check them against your subject's CAPS / assessment policy and adjust. Each row must add up to 100%.</div>` : `<div class="note" style="margin-bottom:14px">Only administrators can change these targets. Ask your HOD if a subject's percentages need updating.</div>`}
      <div class="table-wrap"><table class="table set-table"><thead><tr><th>Subject (English / Afrikaans)</th><th class="c-lower">Lower %</th><th class="c-middle">Middle %</th><th class="c-higher">Higher %</th><th>Sum</th>${admin ? '<th></th>' : ''}</tr></thead><tbody id="subj"></tbody></table></div>
      ${admin ? `<button class="btn btn-outline btn-sm" id="addsub" style="margin-top:10px">${icon('plus', 15)} Add subject</button>` : ''}
      <h3 style="margin-top:24px">How the six levels are grouped</h3>
      <div class="map-grid">${LEVELS.map(l => `<label class="field"><span>${l.n}. ${l.en} <span class="muted">/ ${l.af}</span></span><select class="input" data-map="${l.n}" ${ro}>${ORDERS.map(o => `<option value="${o}" ${st.mapping[l.n] === o ? 'selected' : ''}>${ORDER_LABEL[o]}</option>`).join('')}</select></label>`).join('')}</div>
      <label class="field" style="max-width:280px"><span>Tolerance (± percentage points)</span><input class="input" type="number" min="0" max="20" id="tol" value="${st.tolerance}" ${ro}><small>A paper counts as balanced when each order is within this many points of its target.</small></label>
      ${admin ? `<button class="btn btn-gold" id="saveset">Save Bloom's settings</button>` : ''}
    </div>
  </div>`;
  const drawSubj = () => {
    $('#subj').innerHTML = st.subjects.map((s, i) => {
      const sum = s.t.reduce((a, b) => a + Number(b || 0), 0);
      return `<tr><td>${admin ? `<input class="input input-sm wide" data-s="${i}" data-k="en" value="${esc(s.en)}"><input class="input input-sm wide" style="margin-top:4px" data-s="${i}" data-k="af" value="${esc(s.af)}">` : `<b>${esc(s.en)}</b><div class="small muted">${esc(s.af)}</div>`}</td>
      ${[0, 1, 2].map(j => `<td><input class="input input-sm" type="number" min="0" max="100" data-s="${i}" data-t="${j}" value="${s.t[j]}" ${ro}></td>`).join('')}
      <td class="${sum === 100 ? 'sum-ok' : 'sum-bad'}" data-sum="${i}">${sum}%</td>
      ${admin ? `<td><button class="icon-btn" data-rm="${i}" aria-label="Remove subject" style="width:32px;height:32px">${icon('trash', 15)}</button></td>` : ''}</tr>`;
    }).join('');
  };
  drawSubj();
  view.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.s !== undefined) {
      const s = st.subjects[el.dataset.s];
      if (el.dataset.t !== undefined) {
        s.t[el.dataset.t] = Number(el.value);
        const sum = s.t.reduce((a, b) => a + Number(b || 0), 0);
        const c = $(`[data-sum="${el.dataset.s}"]`); c.textContent = sum + '%'; c.className = sum === 100 ? 'sum-ok' : 'sum-bad';
      } else s[el.dataset.k] = el.value;
    }
    if (el.dataset.map) st.mapping[el.dataset.map] = el.value;
    if (el.id === 'tol') st.tolerance = Number(el.value);
  });
  view.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { st.subjects.splice(Number(rm.dataset.rm), 1); drawSubj(); }
  });
  if (admin) {
    $('#addsub').onclick = () => { st.subjects.push({ id: 'sub-' + newId().slice(0, 6), en: 'New subject', af: 'Nuwe vak', t: [40, 40, 20] }); drawSubj(); };
    $('#saveset').onclick = async () => {
      const bad = st.subjects.find(s => s.t.reduce((a, b) => a + Number(b || 0), 0) !== 100);
      if (bad) return toast(`"${bad.en}" does not add up to 100%.`, 'err');
      try { await store.saveSettings(st); S.settings = st; updateBell(); toast("Bloom's settings saved."); } catch (err) { toast(err.message, 'err'); }
    };
  }
  $('#prof').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      S.user = { ...S.user, ...(await store.saveProfile(S.user.uid, { name: f.name.trim(), title: f.title.trim(), prefs: { subject: f.subject, grade: f.grade, lang: f.lang, educators: f.educators, moderator: f.moderator } })) };
      renderShell(); route(); toast('Profile saved.');
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ───────────────────────────── print preview ─────────────────────────────
async function pagePrint(view, id) {
  const p = await store.getPaper(id);
  if (!p) { view.innerHTML = `<div class="card empty">Paper not found.</div>`; return; }
  const mine = p.ownerUid === S.user.uid;
  setTop(paperTitle(p), `Print preview · ${esc(subjName(p.subject))} · Grade ${esc(p.grade)}`, mine ? `<a class="btn btn-outline" href="#/edit/${p.id}">${icon('edit', 16)} Back to editor</a>` : '');
  const opts = { paper: true, addendum: true, memo: true, analysis: true };
  const addOn = hasAddendum(p);
  view.innerHTML = `
    <div class="print-bar no-print">
      <label class="check"><input type="checkbox" data-o="paper" checked> Question paper</label>
      ${addOn ? `<label class="check"><input type="checkbox" data-o="addendum" checked> Sources addendum</label>` : ''}
      <label class="check"><input type="checkbox" data-o="memo" checked> Memorandum</label>
      <label class="check"><input type="checkbox" data-o="analysis" checked> Bloom's analysis grid</label>
      <span class="grow"></span>
      <button class="btn btn-red" id="doprint">${icon('print', 17)} Print / Save as PDF</button>
    </div>
    <p class="small muted no-print" style="text-align:center;margin:-8px 0 16px">In the print window choose <b>Save as PDF</b> as the destination to download a PDF. Each part starts on a new page.</p>
    <div class="preview-scroll"><div id="print-area"></div></div>`;
  const draw = () => {
    $('#print-area').innerHTML =
      (opts.paper ? renderQuestionPaper(p, S.settings) : '') +
      (opts.addendum && addOn ? renderAddendum(p, S.settings) : '') +
      (opts.memo ? renderMemo(p, S.settings) : '') +
      (opts.analysis ? renderAnalysis(p, S.settings, p.ownerName) : '');
  };
  $$('[data-o]', view).forEach(c => c.onchange = () => { opts[c.dataset.o] = c.checked; draw(); });
  $('#doprint').onclick = () => {
    const old = document.title;
    document.title = (paperTitle(p)).replace(/[\\/:*?"<>|]+/g, '-');
    window.print();
    setTimeout(() => document.title = old, 500);
  };
  draw();
}

export { route };
