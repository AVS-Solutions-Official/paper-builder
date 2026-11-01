// Paper / block / item factories.
import { newId } from './store.js';
import { DEFAULT_INSTR } from './i18n.js';

export function newPaper(user, settings, overrides = {}) {
  const prefs = user?.prefs || {};
  const now = Date.now();
  return {
    id: newId(),
    ownerUid: user.uid,
    ownerName: displayName(user),
    ownerEmail: user.email,
    isTemplate: false,
    title: '',
    subject: prefs.subject || settings.subjects[0]?.id || '',
    grade: prefs.grade || '5',
    term: '',
    lang: prefs.lang || 'bi',
    form: { af: 'Toets', en: 'Test' },
    taskNo: '',
    duration: 60,
    totalMarks: 50,
    date: '',
    educators: prefs.educators || displayName(user),
    moderator: prefs.moderator || '',
    showSchool: true,
    emblemColour: false,
    blocks: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

export const displayName = u => [u?.title, u?.name].filter(Boolean).join(' ') || u?.email || '';

export function newItem(type) {
  const base = { id: newId(), text: '', text2: '', marks: 1, bloom: 0, memo: '' };
  switch (type) {
    case 'mcq': return { ...base, options: ['', '', '', ''], answer: 0 };
    case 'tf': return { ...base, answer: true, lines: 2 };
    case 'short': return { ...base, marks: 2, lines: 2 };
    case 'fill': return { ...base, text: '' };
    case 'paragraph': return { ...base, marks: 5, lines: 10 };
    case 'matching': return { id: newId(), left: '', left2: '', right: '', right2: '', marks: 1, bloom: 1 };
    default: return base;
  }
}

export function newBlock(kind, type) {
  if (kind === 'section') return { id: newId(), kind: 'section', title: '', text: '' };
  if (kind === 'source') return { id: newId(), kind: 'source', label: 'source', sType: 'text', title: '', text: '', image: '', caption: '', imgWidth: 100, boxed: true, reference: '', table: null };
  const b = {
    id: newId(), kind: 'question', type,
    instr: { ...(DEFAULT_INSTR[type] || DEFAULT_INSTR.short) },
    items: [], image: '', caption: '', imgWidth: 80
  };
  const n = type === 'matching' ? 5 : type === 'paragraph' ? 1 : type === 'mcq' ? 3 : 3;
  for (let i = 0; i < n; i++) b.items.push(newItem(type));
  if (type === 'matching') { b.distractors = ''; b.order = shuffleKeys(b); }
  if (type === 'tf') b.style = 'tf';
  if (type === 'paragraph') b.rubric = { cols: ['2', '1', '0'], rows: [] };
  return b;
}

// Matching: produce a fresh random order for column B.
export function shuffleKeys(b) {
  const keys = [
    ...(b.items || []).map(it => 'i:' + it.id),
    ...((b.distractors || '').split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => 'd:' + i + ':' + s))
  ];
  for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  // avoid leaving every answer on its own row
  if (keys.length > 2 && b.items?.length && b.items.every((it, i) => keys[i] === 'i:' + it.id)) keys.push(keys.shift());
  return keys;
}

// Deep copy with fresh ids (for duplicate / bank insert / templates).
export function cloneBlock(b) {
  const c = JSON.parse(JSON.stringify(b));
  c.id = newId();
  if (c.items) {
    const map = {};
    c.items.forEach(it => { const nid = newId(); map['i:' + it.id] = 'i:' + nid; it.id = nid; });
    if (c.order) c.order = c.order.map(k => map[k] || k);
  }
  return c;
}

export function clonePaper(p, user, overrides = {}) {
  const c = JSON.parse(JSON.stringify(p));
  return {
    ...c,
    id: newId(),
    ownerUid: user.uid,
    ownerName: displayName(user),
    ownerEmail: user.email,
    blocks: remapSources(c.blocks || []),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

// Clone blocks keeping question → source links intact.
export function remapSources(blocks) {
  const map = {};
  const out = blocks.map(b => { const n = cloneBlock(b); map[b.id] = n.id; return n; });
  out.forEach(b => { if (b.sourceRef) b.sourceRef = map[b.sourceRef] || ''; });
  return out;
}
