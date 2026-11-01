// Google Gemini through Firebase AI Logic (no API key in the browser).
import { isDemo, FB_BASE, firebaseApp, AI } from './store.js';

let modelP = null;

export function aiStatus() {
  if (isDemo) return { ok: false, reason: 'demo', label: 'Basic generator (AI needs Firebase)' };
  if (!AI.enabled) return { ok: false, reason: 'off', label: 'Basic generator (AI switched off)' };
  return { ok: true, label: `AI · ${AI.model}` };
}

async function getModel() {
  if (!modelP) {
    modelP = (async () => {
      const M = await import(`${FB_BASE}/firebase-ai.js`);
      const ai = M.getAI(firebaseApp, { backend: new M.GoogleAIBackend() });
      return M.getGenerativeModel(ai, {
        model: AI.model,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 32768 }
      });
    })().catch(e => { modelP = null; throw e; });
  }
  return modelP;
}

function friendly(e) {
  const m = String(e?.message || e);
  if (/app.?check|attestation|recaptcha/i.test(m)) return 'The AI service refused the request because App Check is not set up yet. See "AI features" in the README (reCAPTCHA site key in js/config.js).';
  if (/429|quota|resource.?exhausted|rate/i.test(m)) return 'The free AI quota has been used up for the moment. Please wait a minute and try again.';
  if (/api.?not.?enabled|has not been used|firebasevertexai|firebaseml|PERMISSION_DENIED|403/i.test(m)) return 'Firebase AI Logic is not enabled for this project yet. In the Firebase console open AI Services → AI Logic → Get started.';
  if (/not found|404|model/i.test(m) && /model/i.test(m)) return `The AI model "${AI.model}" is not available. Change AI.model in js/config.js to a current model (see README).`;
  if (/too large|payload|size|413/i.test(m)) return 'The files are too large to send in one go. Try fewer pages or smaller files (under ~15 MB in total).';
  if (/network|fetch|failed to load|import/i.test(m)) return 'Could not reach the AI service — check your internet connection.';
  if (/safety|blocked/i.test(m)) return 'The AI declined this content. Try different study material.';
  return 'AI error: ' + m;
}

// Robust JSON extraction (handles ```json fences or stray text).
export function parseJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new Error('The AI answer could not be read (it may have been cut off). Try again, or use fewer pages / fewer marks.');
}

// parts: array of strings and/or { inlineData: { mimeType, data(base64) } }
export async function aiJson(parts) {
  // Hook for automated tests / offline demos.
  if (window.__KPS_AI_MOCK__) return window.__KPS_AI_MOCK__(parts);
  const st = aiStatus();
  if (!st.ok) throw new Error('AI is not available: ' + st.label);
  try {
    const model = await getModel();
    const r = await model.generateContent(parts);
    return parseJson(r.response.text());
  } catch (e) {
    if (/could not be read/.test(e.message)) throw e;
    console.error(e);
    throw new Error(friendly(e));
  }
}
export const aiAvailable = () => !!window.__KPS_AI_MOCK__ || aiStatus().ok;
