// ───────────────────────────────────────────────────────────────
//  Kathu Primary School Paper Builder — configuration
//  This is the ONLY file you need to edit to go live.
// ───────────────────────────────────────────────────────────────

// 1. Paste your Firebase web-app config here (Firebase Console →
//    Project settings → Your apps → Web app → "SDK setup and configuration").
//    While apiKey is empty the app runs in DEMO MODE: everything works,
//    but accounts and papers are stored only in the current browser.
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// 2. Only email addresses on this domain may create an account.
export const ALLOWED_DOMAIN = "kathuonline.com";

// 3. People who may change the school-wide Bloom's percentages and
//    subject list in Settings. Keep this list in sync with the
//    ADMIN list in firestore.rules.
export const ADMIN_EMAILS = [
  "admin@kathuonline.com"
];

// 4. AI features (Auto Compile from study material, smart Import of papers).
//    Uses Google Gemini through Firebase AI Logic — no API key goes in this file.
//    Set up in Firebase Console → AI Services → AI Logic (see README).
//    Firebase requires App Check for AI Logic: paste your reCAPTCHA v3 SITE key.
//    Without AI the app falls back to a basic built-in generator / importer.
export const AI = {
  enabled: true,
  model: "gemini-3.5-flash",     // free on the Gemini Developer API
  recaptchaSiteKey: "",          // reCAPTCHA v3 site key for App Check
  appCheckDebug: false           // true only while testing on localhost
};

// School names used on printed papers.
export const SCHOOL = {
  en: "Kathu Primary School",
  af: "Laerskool Kathu",
  bi: "Laerskool Kathu Primary"
};
