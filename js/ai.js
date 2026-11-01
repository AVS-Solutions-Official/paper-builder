// Google Gemini through Firebase AI Logic (no API key in the browser).
import { isDemo, FB_BASE, firebaseApp, AI } from './store.js';

let modelP = null;

export function aiStatus() {
  if (isDemo) return { ok: false, reason: 'demo', label: 'Basic generator (AI needs Firebase)' };
  if (!AI.enabled) return { ok: false, reason: 'off', label: 'Basic generator (AI switched off)' };
  return { ok: true, label: `AI · ${AI.model}` };
}

const models = {};
async function getModel(name) {
  if (!models[name]) {
    models[name] = (async () => {
      const M = await import(`${FB_BASE}/firebase-ai.js`);
      const ai = M.getAI(firebaseApp, { backend: new M.GoogleAIBackend() });
      return M.getGenerativeModel(ai, {
        model: name,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 32768 }
      });
    })().catch(e => { delete models[name]; throw e; });
  }
  return models[name];
}

// HTTP status of a Firebase AI error (e.g. 403, 404, 429), if known.
function statusOf(e) {
  const d = e?.customErrorData || {};
  if (d.status) return Number(d.status);
  const m = String(e?.message || '').match(/\[(\d{3})\b/);
  return m ? Number(m[1]) : 0;
}

function friendly(e) {
  const m = String(e?.message || e);
  const st = statusOf(e);
  const detail = (e?.customErrorData?.errorDetails?.[0]?.reason || e?.customErrorData?.statusText || '').toString();
  const raw = m.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
  const tech = ` (Technical detail: ${st || ''} ${detail} ${raw})`;
  if (/app.?check|attestation|recaptcha/i.test(m) || /APP_CHECK/i.test(detail)) return 'The AI service refused the request because the App Check visitor check failed. Check that the reCAPTCHA key is registered in Firebase → Security → App Check, then reload the page.' + tech;
  if (st === 429 || /RESOURCE_EXHAUSTED|quota exceeded|rate.?limit/i.test(m)) return 'The free AI limit was reached (too much material at once, or too many requests in a minute). Wait 1–2 minutes and try again with fewer files — e.g. only the English OR only the Afrikaans notes.' + tech;
  if (st === 403 || /SERVICE_DISABLED|has not been used|API_KEY_SERVICE_BLOCKED/i.test(m)) return 'Firebase AI Logic is not switched on for this project yet. In the Firebase console open AI services → AI Logic → Get started → Gemini Developer API.' + tech;
  if (st === 404) return `The AI model "${AI.model}" is not available. It may have been renamed — tell your app administrator.` + tech;
  if (st === 413 || /payload|too large/i.test(m)) return 'The files are too large to send in one go. Try fewer pages or smaller files.' + tech;
  if (/Failed to fetch|NetworkError|network-request-failed|Failed to load module/i.test(m)) return 'Could not reach the AI service — check your internet connection.' + tech;
  if (/SAFETY|blocked/i.test(m)) return 'The AI declined this content. Try different study material.' + tech;
  return 'AI error.' + tech;
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
export async function aiJson(parts, onStatus) {
  // Hook for automated tests / offline demos.
  if (window.__KPS_AI_MOCK__) return window.__KPS_AI_MOCK__(parts);
  const st = aiStatus();
  if (!st.ok) throw new Error('AI is not available: ' + st.label);
  // Try the chosen model; on a busy/limit error wait and retry, then fall back to a lighter model.
  const plan = [
    { model: AI.model, wait: 0 },
    { model: AI.model, wait: 20000, only: [429, 500, 503] },
    { model: AI.fallbackModel || 'gemini-3.1-flash-lite', wait: 5000, only: [429, 404, 500, 503] }
  ];
  let lastErr = null;
  for (const step of plan) {
    if (lastErr && step.only && !step.only.includes(statusOf(lastErr))) continue;
    if (step.wait) { onStatus && onStatus(`The AI is busy — trying again in ${Math.round(step.wait / 1000)} seconds…`); await new Promise(r => setTimeout(r, step.wait)); }
    try {
      const model = await getModel(step.model);
      const r = await model.generateContent(parts);
      return parseJson(r.response.text());
    } catch (e) {
      if (/could not be read/.test(e.message)) throw e;
      console.error('AI error', step.model, e, e?.customErrorData);
      lastErr = e;
    }
  }
  throw new Error(friendly(lastErr));
}
export const aiAvailable = () => !!window.__KPS_AI_MOCK__ || aiStatus().ok;
