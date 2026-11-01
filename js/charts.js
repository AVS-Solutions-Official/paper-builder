// Draws data graphs for sources (climate graph, bar, line, pie) as print-friendly images.
// chart = { type: 'climate'|'bar'|'line'|'pie', title, xLabel, labels: [...],
//           series: [{ name, values: [...], unit, kind: 'bar'|'line', axis: 'left'|'right' }] }

const W = 1600, H = 1000;
const INK = '#111', GRID = '#c9c9c9';
const FILLS = ['#8fb3d9', '#e3a33b', '#6aa56a', '#c7795d', '#9a86c4', '#d1c34f'];
const LINES = ['#c0302b', '#1f4e8c', '#2f7d32', '#7a3d9a'];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };

export function normaliseChart(c) {
  if (!c) return null;
  const type = ['climate', 'bar', 'line', 'pie'].includes(c.type) ? c.type : 'bar';
  let labels = (c.labels || []).map(x => String(x ?? ''));
  let series = (c.series || []).map((s, i) => ({
    name: String(s.name || ''), unit: String(s.unit || ''),
    values: (s.values || []).map(num),
    kind: s.kind === 'line' ? 'line' : s.kind === 'bar' ? 'bar' : (type === 'line' ? 'line' : 'bar'),
    axis: s.axis === 'right' ? 'right' : 'left'
  })).filter(s => s.values.length);
  if (type === 'climate') {
    if (labels.length !== 12) labels = MONTHS.slice();
    const rain = series.find(s => /rain|reën|neerslag|precip|mm/i.test(s.name + s.unit)) || series.find(s => s.kind === 'bar') || series[0];
    const temp = series.find(s => s !== rain);
    series = [rain && { ...rain, kind: 'bar', axis: 'left', unit: rain.unit || 'mm' }, temp && { ...temp, kind: 'line', axis: 'right', unit: temp.unit || '°C' }].filter(Boolean);
  }
  const n = labels.length || Math.max(0, ...series.map(s => s.values.length));
  if (!labels.length) labels = Array.from({ length: n }, (_, i) => String(i + 1));
  series.forEach(s => { s.values = labels.map((_, i) => s.values[i] ?? 0); });
  return { type, title: String(c.title || ''), xLabel: String(c.xLabel || ''), labels, series };
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function niceMin(v) { return v >= 0 ? 0 : -niceMax(-v); }

export function drawChart(chart) {
  const c = normaliseChart(chart);
  if (!c || !c.series.length) return '';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = INK; g.textBaseline = 'middle';
  const font = (s, b = false) => { g.font = `${b ? 'bold ' : ''}${s}px Arial, Helvetica, sans-serif`; };
  let top = 40;
  if (c.title) { font(44, true); g.textAlign = 'center'; g.fillText(c.title, W / 2, top + 10); top += 70; }
  if (c.type === 'pie') { drawPie(g, c, top, font); return cv.toDataURL('image/png'); }

  const left = c.series.filter(s => s.axis === 'left'), right = c.series.filter(s => s.axis === 'right');
  const hasRight = right.length > 0;
  const L = 170, R = hasRight ? W - 170 : W - 60, T = top + 40, B = H - 190;
  const range = list => {
    const all = list.flatMap(s => s.values);
    const mx = niceMax(Math.max(0, ...all)), mn = niceMin(Math.min(0, ...all));
    return [mn, mx];
  };
  const [lmin, lmax] = range(left.length ? left : c.series), [rmin, rmax] = hasRight ? range(right) : [0, 1];
  const yL = v => B - (v - lmin) / (lmax - lmin) * (B - T);
  const yR = v => B - (v - rmin) / (rmax - rmin) * (B - T);
  const steps = 5;
  // grid + axes
  g.lineWidth = 2; font(30);
  for (let i = 0; i <= steps; i++) {
    const y = B - i * (B - T) / steps;
    g.strokeStyle = GRID; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
    g.fillStyle = INK; g.textAlign = 'right'; g.fillText(fmt(lmin + i * (lmax - lmin) / steps), L - 14, y);
    if (hasRight) { g.textAlign = 'left'; g.fillText(fmt(rmin + i * (rmax - rmin) / steps), R + 14, y); }
  }
  g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, B); g.lineTo(R, B); if (hasRight) g.lineTo(R, T); g.stroke();
  // axis titles
  font(30, true);
  const axisTitle = list => list.map(s => `${s.name}${s.unit ? ` (${s.unit})` : ''}`).join(' / ');
  g.save(); g.translate(45, (T + B) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(axisTitle(left.length ? left : c.series), 0, 0); g.restore();
  if (hasRight) { g.save(); g.translate(W - 40, (T + B) / 2); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText(axisTitle(right), 0, 0); g.restore(); }
  // categories
  const n = c.labels.length, slot = (R - L) / n;
  font(n > 12 ? 24 : 30); g.textAlign = 'center'; g.fillStyle = INK;
  c.labels.forEach((lab, i) => g.fillText(lab, L + slot * (i + 0.5), B + 32));
  if (c.xLabel) { font(30, true); g.fillText(c.xLabel, (L + R) / 2, B + 85); }
  // bars
  const bars = c.series.filter(s => s.kind === 'bar');
  const bw = slot * 0.7 / Math.max(1, bars.length);
  bars.forEach((s, k) => {
    const yf = s.axis === 'right' ? yR : yL;
    g.fillStyle = FILLS[k % FILLS.length]; g.strokeStyle = INK; g.lineWidth = 2;
    s.values.forEach((v, i) => {
      const x = L + slot * i + slot * 0.15 + k * bw;
      const y0 = yf(Math.max(0, s.axis === 'right' ? rmin : lmin)), y1 = yf(v);
      g.fillRect(x, Math.min(y0, y1), bw, Math.abs(y0 - y1)); g.strokeRect(x, Math.min(y0, y1), bw, Math.abs(y0 - y1));
    });
  });
  // lines
  c.series.filter(s => s.kind === 'line').forEach((s, k) => {
    const yf = s.axis === 'right' ? yR : yL;
    g.strokeStyle = LINES[k % LINES.length]; g.fillStyle = g.strokeStyle; g.lineWidth = 6;
    g.beginPath();
    s.values.forEach((v, i) => { const x = L + slot * (i + 0.5), y = yf(v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    s.values.forEach((v, i) => { g.beginPath(); g.arc(L + slot * (i + 0.5), yf(v), 10, 0, Math.PI * 2); g.fill(); });
  });
  // legend
  font(28); let lx = L; const ly = H - 45;
  c.series.forEach((s, k) => {
    const bi = bars.indexOf(s), li = c.series.filter(x => x.kind === 'line').indexOf(s);
    if (s.kind === 'bar') { g.fillStyle = FILLS[bi % FILLS.length]; g.fillRect(lx, ly - 14, 40, 28); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(lx, ly - 14, 40, 28); }
    else { g.strokeStyle = LINES[li % LINES.length]; g.lineWidth = 6; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 40, ly); g.stroke(); }
    g.fillStyle = INK; g.textAlign = 'left';
    const t = `${s.name}${s.unit ? ` (${s.unit})` : ''}`; g.fillText(t, lx + 52, ly);
    lx += 52 + g.measureText(t).width + 50;
  });
  return cv.toDataURL('image/png');
}

function drawPie(g, c, top, font) {
  const s = c.series[0], tot = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const cx = 560, cy = (top + H) / 2 + 10, r = Math.min(360, (H - top) / 2 - 40);
  let a = -Math.PI / 2;
  s.values.forEach((v, i) => {
    const da = Math.max(0, v) / tot * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a, a + da); g.closePath();
    g.fillStyle = FILLS[i % FILLS.length]; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    const pct = Math.round(v / tot * 100);
    if (pct >= 4) { const m = a + da / 2; font(32, true); g.fillStyle = INK; g.textAlign = 'center'; g.fillText(pct + '%', cx + Math.cos(m) * r * 0.65, cy + Math.sin(m) * r * 0.65); }
    a += da;
  });
  font(32); g.textAlign = 'left';
  c.labels.forEach((lab, i) => {
    const y = top + 80 + i * 60;
    g.fillStyle = FILLS[i % FILLS.length]; g.fillRect(1020, y - 18, 40, 36); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(1020, y - 18, 40, 36);
    g.fillStyle = INK; g.fillText(`${lab}: ${fmt(s.values[i])}${s.unit ? ' ' + s.unit : ''}`, 1075, y);
  });
}

function fmt(v) { return Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }
