// Bloom's taxonomy (revised 2001) — cognitive domain.
// Remember → Understand → Apply → Analyse → Evaluate → Create

export const LEVELS = [
  { n: 1, key: 'remember', en: 'Remember', af: 'Onthou', old: 'Knowledge',
    desc: 'Recognise or recall facts, terms and basic concepts.',
    verbs: {
      en: ['name', 'list', 'define', 'identify', 'label', 'state', 'recall', 'recognise', 'recognize', 'match', 'choose', 'select', 'who', 'what', 'when', 'where', 'which', 'circle', 'underline', 'fill in', 'complete', 'write down', 'copy', 'spell', 'repeat', 'memorise', 'tick'],
      af: ['noem', 'lys', 'definieer', 'identifiseer', 'benoem', 'merk', 'herroep', 'herken', 'pas', 'kies', 'wie', 'wat', 'wanneer', 'waar', 'watter', 'omkring', 'onderstreep', 'vul in', 'voltooi', 'skryf neer', 'kopieer', 'spel', 'herhaal', 'gee die naam', 'kleur']
    } },
  { n: 2, key: 'understand', en: 'Understand', af: 'Verstaan', old: 'Comprehension',
    desc: 'Show understanding by organising, summarising, explaining or describing.',
    verbs: {
      en: ['explain', 'describe', 'summarise', 'summarize', 'discuss', 'classify', 'give an example', 'give examples', 'interpret', 'paraphrase', 'retell', 'outline', 'illustrate', 'in your own words', 'why', 'how', 'distinguish between the meaning', 'convert', 'predict', 'rewrite'],
      af: ['verduidelik', 'beskryf', 'som op', 'opsomming', 'bespreek', 'klassifiseer', 'gee voorbeelde', "gee 'n voorbeeld", 'interpreteer', 'parafraseer', 'hervertel', 'skets', 'illustreer', 'in jou eie woorde', 'waarom', 'hoekom', 'hoe', 'voorspel', 'herskryf', 'skakel om']
    } },
  { n: 3, key: 'apply', en: 'Apply', af: 'Toepas', old: 'Application',
    desc: 'Use knowledge to solve problems in new or unfamiliar situations.',
    verbs: {
      en: ['apply', 'calculate', 'solve', 'use', 'demonstrate', 'show', 'construct', 'measure', 'draw', 'complete the table', 'determine', 'estimate', 'change', 'compute', 'convert', 'plot', 'sketch', 'operate', 'role-play', 'dramatise', 'put into practice', 'arrange in order', 'sort'],
      af: ['pas toe', 'bereken', 'los op', 'gebruik', 'demonstreer', 'toon', 'konstrueer', 'meet', 'teken', 'voltooi die tabel', 'bepaal', 'skat', 'verander', 'plot', 'rangskik', 'sorteer', 'speel rol', 'dramatiseer']
    } },
  { n: 4, key: 'analyse', en: 'Analyse', af: 'Ontleed', old: 'Analysis',
    desc: 'Break information into parts to explore relationships, motives or causes.',
    verbs: {
      en: ['analyse', 'analyze', 'compare', 'contrast', 'differentiate', 'distinguish', 'examine', 'organise', 'organize', 'categorise', 'categorize', 'infer', 'investigate', 'deduce', 'what is the relationship', 'what evidence', 'what conclusions', 'break down', 'differences', 'similarities', 'cause and effect', 'sequence'],
      af: ['ontleed', 'analiseer', 'vergelyk', 'kontrasteer', 'onderskei', 'ondersoek', 'organiseer', 'kategoriseer', 'aflei', 'lei af', 'wat is die verband', 'watter bewyse', 'verskille', 'ooreenkomste', 'oorsaak en gevolg', 'orden']
    } },
  { n: 5, key: 'evaluate', en: 'Evaluate', af: 'Evalueer', old: 'Evaluation',
    desc: 'Make and defend judgements based on criteria or standards.',
    verbs: {
      en: ['evaluate', 'judge', 'justify', 'assess', 'critique', 'criticise', 'criticize', 'defend', 'argue', 'recommend', 'do you agree', 'do you think', 'give your opinion', 'your opinion', 'motivate', 'prioritise', 'rate', 'decide', 'appraise', 'support your answer', 'was it fair', 'which is better', 'conclude'],
      af: ['evalueer', 'beoordeel', 'regverdig', 'kritiseer', 'verdedig', 'argumenteer', 'beveel aan', 'stem jy saam', 'dink jy', 'gee jou mening', 'jou mening', 'motiveer', 'prioritiseer', 'besluit', 'waardeer', 'ondersteun jou antwoord', 'was dit regverdig', 'kom tot die gevolgtrekking']
    } },
  { n: 6, key: 'create', en: 'Create', af: 'Skep', old: 'Synthesis',
    desc: 'Combine elements into a new whole; produce original work.',
    verbs: {
      en: ['create', 'design', 'compose', 'invent', 'plan', 'devise', 'develop', 'formulate', 'propose', 'construct a new', 'imagine', 'write a story', 'write a poem', 'write a paragraph', 'write an essay', 'write a letter', 'write a dialogue', 'write a diary', 'produce', 'generate', 'suggest a solution', 'what would happen if', 'make up'],
      af: ['skep', 'ontwerp', 'komponeer', 'stel saam', 'vind uit', 'beplan', 'ontwikkel', 'formuleer', 'stel voor', 'verbeel jou', "skryf 'n storie", "skryf 'n gedig", "skryf 'n paragraaf", "skryf 'n opstel", "skryf 'n brief", "skryf 'n dialoog", "skryf 'n dagboek", 'produseer', 'genereer', "stel 'n oplossing voor", 'wat sou gebeur as', 'dink uit']
    } }
];

export const ORDERS = ['lower', 'middle', 'higher'];
export const ORDER_LABEL = { lower: 'Lower order', middle: 'Middle order', higher: 'Higher order' };
export const ORDER_LABEL_AF = { lower: 'Laer orde', middle: 'Middel orde', higher: 'Hoër orde' };

export const DEFAULT_MAPPING = { 1: 'lower', 2: 'lower', 3: 'middle', 4: 'middle', 5: 'higher', 6: 'higher' };

// School defaults — editable by an admin in Settings.
export const DEFAULT_SUBJECTS = [
  { id: 'eng-hl',  en: 'English Home Language',              af: 'Engels Huistaal',                        t: [40, 40, 20] },
  { id: 'afr-hl',  en: 'Afrikaans Home Language',            af: 'Afrikaans Huistaal',                     t: [40, 40, 20] },
  { id: 'eng-fal', en: 'English First Additional Language',  af: 'Engels Eerste Addisionele Taal',         t: [40, 40, 20] },
  { id: 'afr-fal', en: 'Afrikaans First Additional Language',af: 'Afrikaans Eerste Addisionele Taal',      t: [40, 40, 20] },
  { id: 'maths',   en: 'Mathematics',                        af: 'Wiskunde',                               t: [25, 45, 30] },
  { id: 'nst',     en: 'Natural Sciences and Technology',    af: 'Natuurwetenskappe en Tegnologie',        t: [50, 35, 15] },
  { id: 'ns',      en: 'Natural Sciences',                   af: 'Natuurwetenskappe',                      t: [50, 35, 15] },
  { id: 'tech',    en: 'Technology',                         af: 'Tegnologie',                             t: [40, 40, 20] },
  { id: 'ss-hist', en: 'Social Sciences: History',           af: 'Sosiale Wetenskappe: Geskiedenis',       t: [30, 50, 20] },
  { id: 'ss-geo',  en: 'Social Sciences: Geography',         af: 'Sosiale Wetenskappe: Geografie',         t: [30, 50, 20] },
  { id: 'ems',     en: 'Economic and Management Sciences',   af: 'Ekonomiese en Bestuurswetenskappe',      t: [30, 50, 20] },
  { id: 'ls',      en: 'Life Skills',                        af: 'Lewensvaardighede',                      t: [40, 40, 20] },
  { id: 'lo',      en: 'Life Orientation',                   af: 'Lewensoriëntering',                      t: [40, 40, 20] },
  { id: 'ca',      en: 'Creative Arts',                      af: 'Skeppende Kunste',                       t: [40, 40, 20] }
];

export function defaultSettings() {
  return {
    subjects: DEFAULT_SUBJECTS.map(s => ({ ...s, t: [...s.t] })),
    mapping: { ...DEFAULT_MAPPING },
    tolerance: 5
  };
}

export const levelByN = n => LEVELS.find(l => l.n === Number(n));

// Suggest a Bloom level from the wording of a question.
// Returns the level of the verb that appears earliest in the text
// (questions usually lead with their command word).
export function suggestLevel(text) {
  if (!text) return null;
  const t = ' ' + text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ') + ' ';
  let best = null;
  for (const lv of LEVELS) {
    for (const v of [...lv.verbs.en, ...lv.verbs.af]) {
      const i = t.indexOf(' ' + v + ' ');
      if (i === -1) continue;
      // Prefer earliest; on tie prefer the longer phrase, then the higher level.
      if (!best || i < best.i || (i === best.i && (v.length > best.verb.length || (v.length === best.verb.length && lv.n > best.level)))) {
        best = { i, level: lv.n, verb: v };
      }
    }
  }
  return best ? { level: best.level, verb: best.verb } : null;
}

export function subjectById(settings, id) {
  return (settings?.subjects || []).find(s => s.id === id) || null;
}

// Flatten every mark-bearing item of a paper with its printed number.
export function paperItems(paper) {
  const out = [];
  let q = 0;
  for (const b of paper.blocks || []) {
    if (b.kind !== 'question') continue;
    q++;
    const items = b.items || [];
    items.forEach((it, i) => {
      out.push({ block: b, item: it, qNo: q, label: items.length > 1 ? `${q}.${i + 1}` : `${q}`, marks: Number(it.marks) || 0, bloom: Number(it.bloom) || 0 });
    });
  }
  return out;
}

export function blockMarks(b) {
  return (b.items || []).reduce((s, it) => s + (Number(it.marks) || 0), 0);
}

export function paperMarks(paper) {
  return (paper.blocks || []).filter(b => b.kind === 'question').reduce((s, b) => s + blockMarks(b), 0);
}

// Analyse a paper's Bloom balance against its subject's targets.
export function analyse(paper, settings) {
  const mapping = settings?.mapping || DEFAULT_MAPPING;
  const tol = Number(settings?.tolerance ?? 5);
  const items = paperItems(paper);
  const total = items.reduce((s, x) => s + x.marks, 0);
  const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const byOrder = { lower: 0, middle: 0, higher: 0 };
  let unassigned = 0;
  for (const x of items) {
    if (!x.bloom) { unassigned += x.marks; continue; }
    byLevel[x.bloom] += x.marks;
    byOrder[mapping[x.bloom] || 'lower'] += x.marks;
  }
  const subj = subjectById(settings, paper.subject);
  const target = subj ? { lower: subj.t[0], middle: subj.t[1], higher: subj.t[2] } : null;
  const pct = {}, status = {};
  for (const o of ORDERS) {
    pct[o] = total ? Math.round((byOrder[o] / total) * 1000) / 10 : 0;
    if (!target || !total) status[o] = 'none';
    else if (pct[o] < target[o] - tol) status[o] = 'low';
    else if (pct[o] > target[o] + tol) status[o] = 'high';
    else status[o] = 'ok';
  }
  const balanced = !!target && total > 0 && unassigned === 0 && ORDERS.every(o => status[o] === 'ok');
  const planned = Number(paper.totalMarks) || 0;
  return { total, planned, marksMatch: !planned || planned === total, byLevel, byOrder, pct, target, status, unassigned, tolerance: tol, balanced, items, subject: subj };
}

// Overall traffic-light for lists.
export function paperStatus(paper, settings) {
  const a = analyse(paper, settings);
  if (!a.total) return { key: 'empty', label: 'Empty' };
  if (a.balanced && a.marksMatch) return { key: 'ok', label: 'Balanced' };
  return { key: 'warn', label: a.unassigned ? 'Levels missing' : !a.marksMatch && a.balanced ? 'Marks ≠ total' : 'Out of balance' };
}
