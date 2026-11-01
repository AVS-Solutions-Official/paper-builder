// Data layer. Two interchangeable back-ends with the same API:
//   • Firebase (Auth + Firestore) when js/config.js has an apiKey
//   • Local demo mode (browser localStorage) otherwise
import * as CFG from './config.js';
const { FIREBASE_CONFIG, ALLOWED_DOMAIN, ADMIN_EMAILS } = CFG;
// Older config.js files have no AI section — fall back to defaults.
export const AI = { enabled: true, model: 'gemini-3.5-flash', recaptchaSiteKey: '', recaptchaType: 'enterprise', appCheckDebug: false, ...(CFG.AI || {}) };
import { defaultSettings } from './bloom.js';
import { drawChart } from './charts.js';

// ───── Pictures are stored as separate database documents ("images/{id}"),
// so a paper is never too large to save. Papers keep a short reference "img:<id>".
const MAX_IMG_CHARS = 900000;
async function sha(str) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(b)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}
function reencode(dataUrl, maxW, q) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}
async function fitImage(d) {
  if (d.length <= MAX_IMG_CHARS) return d;
  for (const [w, q] of [[1800, 0.82], [1500, 0.78], [1200, 0.72], [1000, 0.65]]) {
    d = await reencode(d, w, q);
    if (d.length <= MAX_IMG_CHARS) return d;
  }
  return d;
}
// Blocks of a paper or bank entry (bank stores one block).
const blocksOf = o => o.blocks || (o.block ? [o.block] : []);
// Charts are redrawn from their numbers, so their picture is never stored.
function redrawCharts(o) {
  for (const b of blocksOf(o)) if (b.chart && !String(b.image || '').startsWith('data:')) { try { b.image = drawChart(b.chart); } catch {} }
  return o;
}

export const isDemo = !FIREBASE_CONFIG.apiKey;
export const FB_VERSION = '12.19.0';
export const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
export let firebaseApp = null;

export function domainOk(email) {
  return String(email || '').trim().toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
}
export function isAdminEmail(email) {
  if (isDemo) return true;
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes(String(email || '').toLowerCase());
}
export function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '').slice(0, 20);
}
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') && k !== '__a') ? undefined : v)); // strips undefined + temporary _keys

// Firestore cannot store an array directly inside another array (e.g. table rows).
// Wrap inner arrays as { __a: [...] } when saving and unwrap them when reading.
export function packArrays(v, inArray = false) {
  if (Array.isArray(v)) { const a = v.map(x => packArrays(x, true)); return inArray ? { __a: a } : a; }
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = packArrays(v[k], false); return o; }
  return v;
}
export function unpackArrays(v) {
  if (Array.isArray(v)) return v.map(unpackArrays);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && Array.isArray(v.__a)) return v.__a.map(unpackArrays);
    const o = {}; for (const k in v) o[k] = unpackArrays(v[k]); return o;
  }
  return v;
}
const toDb = o => packArrays(clean(o));

export function mergeSettings(s) {
  const d = defaultSettings();
  if (!s) return d;
  return { subjects: s.subjects?.length ? s.subjects : d.subjects, mapping: { ...d.mapping, ...(s.mapping || {}) }, tolerance: s.tolerance ?? d.tolerance };
}

function domainError() {
  return new Error(`Only @${ALLOWED_DOMAIN} email addresses can be used.`);
}

// ───────────────────────── Local demo store ─────────────────────────
function createLocal() {
  const K = { users: 'kps_users', session: 'kps_session', papers: 'kps_papers', bank: 'kps_bank', settings: 'kps_settings' };
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { throw new Error('Browser storage is full or blocked. ' + e.message); } };
  const hash = async s => {
    if (crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return btoa(unescape(encodeURIComponent(s)));
  };
  let listener = null;
  const current = () => {
    const email = read(K.session, null);
    const u = email && read(K.users, {})[email];
    return u ? { uid: u.uid, email: u.email, name: u.name, title: u.title, prefs: u.prefs || {}, verified: true } : null;
  };
  const emit = () => listener && listener(current());

  return {
    mode: 'demo',
    onAuth(cb) { listener = cb; setTimeout(emit, 0); },
    async signUp({ email, password, name, title }) {
      email = email.trim().toLowerCase();
      if (!domainOk(email)) throw domainError();
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');
      const users = read(K.users, {});
      if (users[email]) throw new Error('An account with this email already exists. Please sign in.');
      users[email] = { uid: newId(), email, name, title, pass: await hash(password) };
      write(K.users, users); write(K.session, email); emit();
    },
    async signIn(email, password) {
      email = email.trim().toLowerCase();
      if (!domainOk(email)) throw domainError();
      const u = read(K.users, {})[email];
      if (!u || u.pass !== await hash(password)) throw new Error('Incorrect email or password.');
      write(K.session, email); emit();
    },
    async signOut() { localStorage.removeItem(K.session); emit(); },
    async resetPassword() { throw new Error('Password reset emails are only available once Firebase is connected.'); },
    async resendVerification() {},
    async reloadUser() { return current(); },
    async saveProfile(uid, p) {
      const users = read(K.users, {});
      const e = Object.keys(users).find(k => users[k].uid === uid);
      if (e) { Object.assign(users[e], { name: p.name, title: p.title, prefs: p.prefs || {} }); write(K.users, users); }
      return current();
    },
    async getProfile() { return current(); },

    async listPapers({ mine, uid, templates } = {}) {
      return Object.values(read(K.papers, {}))
        .filter(p => (mine ? p.ownerUid === uid : true) && (!!p.isTemplate === !!templates))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async getPaper(id) { return read(K.papers, {})[id] || null; },
    async savePaper(p) { const all = read(K.papers, {}); all[p.id] = clean(p); write(K.papers, all); return p; },
    async deletePaper(id) { const all = read(K.papers, {}); delete all[id]; write(K.papers, all); },

    async listBank() { return Object.values(read(K.bank, {})).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); },
    async addBank(e) { const all = read(K.bank, {}); all[e.id] = clean(e); write(K.bank, all); return e; },
    async deleteBank(id) { const all = read(K.bank, {}); delete all[id]; write(K.bank, all); },

    async getSettings() { return mergeSettings(read(K.settings, null)); },
    async saveSettings(s) { write(K.settings, clean(s)); }
  };
}

// ───────────────────────── Firebase store ─────────────────────────
async function createFirebase() {
  const base = FB_BASE;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  firebaseApp = app;
  // App Check (required by Firebase for AI Logic). Must start before any AI call.
  if (AI.enabled && AI.recaptchaSiteKey) {
    try {
      if (AI.appCheckDebug) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      const AC = await import(`${base}/firebase-app-check.js`);
      const Provider = AI.recaptchaType === 'v3' ? AC.ReCaptchaV3Provider : AC.ReCaptchaEnterpriseProvider;
      AC.initializeAppCheck(app, { provider: new Provider(AI.recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (e) { console.warn('App Check could not start:', e); }
  }
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  let profileCache = {};

  const mapUser = async u => {
    if (!u) return null;
    let prof = profileCache[u.uid];
    if (!prof) {
      try { const s = await F.getDoc(F.doc(db, 'users', u.uid)); prof = s.exists() ? s.data() : {}; } catch { prof = {}; }
      profileCache[u.uid] = prof;
    }
    return { uid: u.uid, email: u.email, name: prof.name || u.displayName || u.email, title: prof.title || '', prefs: prof.prefs || {}, verified: u.emailVerified };
  };
  const friendly = e => {
    const m = {
      'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/user-not-found': 'Incorrect email or password.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
      'auth/network-request-failed': 'Network error — check your internet connection.',
      'permission-denied': 'You do not have permission to do that. Make sure your email address is verified.'
    };
    return new Error(m[e.code] || e.message);
  };
  const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { throw friendly(e); } };
  const docs = snap => snap.docs.map(d => ({ id: d.id, ...unpackArrays(d.data()) }));
  const knownImgs = new Set();
  const imgCache = {};
  // Move pictures out of the document before saving.
  async function externalise(data, uid) {
    for (const b of blocksOf(data)) {
      if (b.chart) { delete b.image; continue; }
      if (!String(b.image || '').startsWith('data:')) continue;
      const d = await fitImage(b.image);
      const id = await sha(d);
      if (!knownImgs.has(id)) {
        try { await F.setDoc(F.doc(db, 'images', id), { data: d, ownerUid: uid, createdAt: Date.now() }); }
        catch (e) {
          if (e.code === 'permission-denied') throw new Error('Pictures could not be saved: the database rules need updating. Paste the latest firestore.rules into Firebase → Firestore → Rules → Publish.');
          throw e;
        }
        knownImgs.add(id); imgCache[id] = d;
      }
      b.image = 'img:' + id;
    }
    return data;
  }
  // Put the pictures back after loading.
  async function resolveImages(o) {
    if (!o) return o;
    await Promise.all(blocksOf(o).map(async b => {
      const m = String(b.image || '').match(/^img:(\w+)$/);
      if (!m) return;
      const id = m[1];
      if (!imgCache[id]) {
        try { const s = await F.getDoc(F.doc(db, 'images', id)); imgCache[id] = s.exists() ? s.data().data : ''; } catch { imgCache[id] = ''; }
        knownImgs.add(id);
      }
      b.image = imgCache[id];
    }));
    return redrawCharts(o);
  }

  return {
    mode: 'firebase',
    onAuth(cb) { A.onAuthStateChanged(auth, async u => cb(await mapUser(u))); },
    signUp: wrap(async ({ email, password, name, title }) => {
      email = email.trim().toLowerCase();
      if (!domainOk(email)) throw domainError();
      const c = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.updateProfile(c.user, { displayName: name });
      profileCache[c.user.uid] = { name, title, email };
      await F.setDoc(F.doc(db, 'users', c.user.uid), { name, title, email, createdAt: Date.now() });
      await A.sendEmailVerification(c.user);
    }),
    signIn: wrap(async (email, password) => {
      email = email.trim().toLowerCase();
      if (!domainOk(email)) throw domainError();
      await A.signInWithEmailAndPassword(auth, email, password);
    }),
    signOut: wrap(() => A.signOut(auth)),
    resetPassword: wrap(async email => {
      if (!domainOk(email)) throw domainError();
      await A.sendPasswordResetEmail(auth, email.trim());
    }),
    resendVerification: wrap(() => A.sendEmailVerification(auth.currentUser)),
    reloadUser: wrap(async () => {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      return mapUser(auth.currentUser);
    }),
    saveProfile: wrap(async (uid, p) => {
      await F.setDoc(F.doc(db, 'users', uid), clean({ name: p.name, title: p.title, prefs: p.prefs || {}, email: auth.currentUser.email }), { merge: true });
      await A.updateProfile(auth.currentUser, { displayName: p.name });
      profileCache[uid] = { ...profileCache[uid], name: p.name, title: p.title, prefs: p.prefs || {} };
      return mapUser(auth.currentUser);
    }),

    listPapers: wrap(async ({ mine, uid, templates } = {}) => {
      const col = F.collection(db, 'papers');
      const q = mine ? F.query(col, F.where('ownerUid', '==', uid)) : F.query(col, F.where('isTemplate', '==', !!templates));
      return docs(await F.getDocs(q))
        .filter(p => !!p.isTemplate === !!templates)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }),
    getPaper: wrap(async id => { const s = await F.getDoc(F.doc(db, 'papers', id)); return s.exists() ? resolveImages({ id: s.id, ...unpackArrays(s.data()) }) : null; }),
    savePaper: wrap(async p => {
      const data = await externalise(toDb(p), auth.currentUser?.uid || p.ownerUid);
      const size = new Blob([JSON.stringify(data)]).size;
      if (size > 1000000) throw new Error(`This paper has too much text to save in one go (${Math.round(size / 1024)} KB). Split it into two papers.`);
      await F.setDoc(F.doc(db, 'papers', p.id), data);
      return p;
    }),
    deletePaper: wrap(id => F.deleteDoc(F.doc(db, 'papers', id))),

    listBank: wrap(async () => { const l = docs(await F.getDocs(F.collection(db, 'bank'))); await Promise.all(l.map(resolveImages)); return l.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }),
    addBank: wrap(async e => { await F.setDoc(F.doc(db, 'bank', e.id), await externalise(toDb(e), auth.currentUser?.uid || e.ownerUid)); return e; }),
    deleteBank: wrap(id => F.deleteDoc(F.doc(db, 'bank', id))),

    getSettings: wrap(async () => { const s = await F.getDoc(F.doc(db, 'settings', 'school')); return mergeSettings(s.exists() ? s.data() : null); }),
    saveSettings: wrap(s => F.setDoc(F.doc(db, 'settings', 'school'), clean(s)))
  };
}

let impl = null;
export async function initStore() {
  impl = isDemo ? createLocal() : await createFirebase();
  return impl;
}
export const store = new Proxy({}, { get: (_, k) => impl[k] });
