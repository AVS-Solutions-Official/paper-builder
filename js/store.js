// Data layer. Two interchangeable back-ends with the same API:
//   • Firebase (Auth + Firestore) when js/config.js has an apiKey
//   • Local demo mode (browser localStorage) otherwise
import * as CFG from './config.js';
const { FIREBASE_CONFIG, ALLOWED_DOMAIN, ADMIN_EMAILS } = CFG;
// Older config.js files have no AI section — fall back to defaults.
export const AI = { enabled: true, model: 'gemini-3.5-flash', recaptchaSiteKey: '', appCheckDebug: false, ...(CFG.AI || {}) };
import { defaultSettings } from './bloom.js';

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
const clean = o => JSON.parse(JSON.stringify(o)); // strips undefined (Firestore rejects it)

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
      AC.initializeAppCheck(app, { provider: new AC.ReCaptchaV3Provider(AI.recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
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
  const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

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
    getPaper: wrap(async id => { const s = await F.getDoc(F.doc(db, 'papers', id)); return s.exists() ? { id: s.id, ...s.data() } : null; }),
    savePaper: wrap(async p => {
      const data = clean(p);
      const size = new Blob([JSON.stringify(data)]).size;
      if (size > 1000000) throw new Error(`This paper is too large to save (${Math.round(size / 1024)} KB, limit ≈ 1 000 KB). Remove or shrink some images.`);
      await F.setDoc(F.doc(db, 'papers', p.id), data);
      return p;
    }),
    deletePaper: wrap(id => F.deleteDoc(F.doc(db, 'papers', id))),

    listBank: wrap(async () => docs(await F.getDocs(F.collection(db, 'bank'))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))),
    addBank: wrap(async e => { await F.setDoc(F.doc(db, 'bank', e.id), clean(e)); return e; }),
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
