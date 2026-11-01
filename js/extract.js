// Reading uploaded files in the browser: Word (.docx), PDF, images, text.
// No server involved — files never leave the teacher's computer unless
// they are sent to the AI service.

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build';

export function fileKind(file) {
  const n = (file.name || '').toLowerCase();
  const t = file.type || '';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx') || t.includes('wordprocessingml')) return 'docx';
  if (t.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif)$/.test(n)) return 'image';
  if (t.startsWith('text/') || /\.(txt|md|csv)$/.test(n)) return 'text';
  if (n.endsWith('.doc')) return 'doc';
  return 'other';
}

export const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Could not read ' + file.name));
    r.onload = () => res(String(r.result).split(',')[1]);
    r.readAsDataURL(file);
  });
}
export function dataUrlToBase64(d) { return String(d).split(',')[1]; }

// ───────────── minimal ZIP reader (for .docx) ─────────────
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid Word (.docx) document.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, off };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(files),
    async get(name) {
      const f = files[name]; if (!f) return null;
      const lnl = dv.getUint16(f.off + 26, true), lel = dv.getUint16(f.off + 28, true);
      const start = f.off + 30 + lnl + lel;
      const data = u8.subarray(start, start + f.csize);
      return f.method === 0 ? data.slice() : await inflateRaw(data);
    }
  };
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
// Returns { text, images:[{name, dataUrl}] }. Pictures are marked [IMAGE n] in the text.
export async function readDocx(file) {
  const zip = await readZip(await file.arrayBuffer());
  const docBytes = await zip.get('word/document.xml');
  if (!docBytes) throw new Error('Could not find the text inside this Word file.');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(docBytes), 'application/xml');
  const rels = {};
  const relBytes = await zip.get('word/_rels/document.xml.rels');
  if (relBytes) {
    const rx = new DOMParser().parseFromString(new TextDecoder().decode(relBytes), 'application/xml');
    for (const r of rx.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  }
  const images = [];
  const imgFor = async rid => {
    const target = rels[rid]; if (!target) return '';
    const path = 'word/' + target.replace(/^\.?\//, '').replace(/^\/word\//, '');
    const bytes = await zip.get(path); if (!bytes) return '';
    const ext = path.split('.').pop().toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' }[ext];
    if (!mime) return '';
    let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    images.push({ name: path.split('/').pop(), dataUrl: `data:${mime};base64,${btoa(bin)}` });
    return `[IMAGE ${images.length}]`;
  };
  const paraText = async p => {
    let s = '';
    const walk = async node => {
      for (const c of node.childNodes) {
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 't') s += c.textContent;
        else if (ln === 'tab') s += '\t';
        else if (ln === 'br' || ln === 'cr') s += '\n';
        else if (ln === 'blip') { const rid = c.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'); if (rid) s += ' ' + await imgFor(rid) + ' '; }
        else if (ln === 'imagedata') { const rid = c.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); if (rid) s += ' ' + await imgFor(rid) + ' '; }
        else await walk(c);
      }
    };
    await walk(p);
    return s;
  };
  const lines = [];
  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  const block = async node => {
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 'p') {
        const isList = c.getElementsByTagNameNS(W, 'numPr').length > 0;
        const t = await paraText(c);
        lines.push((isList && t.trim() ? '• ' : '') + t);
      } else if (c.localName === 'tbl') {
        for (const tr of c.getElementsByTagNameNS(W, 'tr')) {
          const cells = [];
          for (const tc of tr.childNodes) if (tc.localName === 'tc') {
            const ps = []; for (const p of tc.getElementsByTagNameNS(W, 'p')) ps.push((await paraText(p)).trim());
            cells.push(ps.filter(Boolean).join(' '));
          }
          lines.push('| ' + cells.join(' | ') + ' |');
        }
        lines.push('');
      } else if (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'customXml') await block(c);
    }
  };
  await block(body);
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), images };
}

// ───────────── PDF (pdf.js, loaded on demand) ─────────────
let pdfjsP = null;
export function loadPdfJs() {
  if (!pdfjsP) {
    pdfjsP = import(`${PDFJS}/pdf.min.mjs`).then(m => { m.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`; return m; })
      .catch(e => { pdfjsP = null; throw new Error('Could not load the PDF reader (check your internet connection). ' + e.message); });
  }
  return pdfjsP;
}
async function openPdf(file) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}
// Text with line breaks reconstructed from item positions.
export async function readPdfText(file) {
  const doc = await openPdf(file);
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]), x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map(r => {
      r.parts.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const p of r.parts) {
        if (end !== null && p.x - end > 18) s += '   ';
        else if (end !== null && p.x - end > 1.5 && !s.endsWith(' ') && !p.s.startsWith(' ')) s += ' ';
        s += p.s; end = p.x + p.w;
      }
      return s.replace(/\s+$/, '');
    });
    pages.push(lines.join('\n'));
  }
  return { text: pages.join('\n\n'), pages: doc.numPages };
}
export async function pdfPageCount(file) { return (await openPdf(file)).numPages; }
// Render one PDF page to a JPEG data URL (used to cut out maps/pictures).
export async function renderPdfPage(file, pageNo, scale = 3) {
  const doc = await openPdf(file);
  const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.9);
}

// Crop a region from an image. box = [ymin, xmin, ymax, xmax] on a 0–1000 scale.
export function cropImage(dataUrl, box, maxW = 1400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onerror = () => rej(new Error('Could not open image'));
    img.onload = () => {
      let [y0, x0, y1, x1] = (box || [0, 0, 1000, 1000]).map(Number);
      const pad = 8;
      y0 = Math.max(0, y0 - pad); x0 = Math.max(0, x0 - pad); y1 = Math.min(1000, y1 + pad); x1 = Math.min(1000, x1 + pad);
      const sx = img.width * x0 / 1000, sy = img.height * y0 / 1000;
      const sw = Math.max(10, img.width * (x1 - x0) / 1000), sh = Math.max(10, img.height * (y1 - y0) / 1000);
      const scale = Math.min(1, maxW / sw);
      const c = document.createElement('canvas');
      c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

// Shrink a photo before sending it to the AI (keeps requests fast).
export function shrinkImageFile(file, maxW = 2000) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('Could not read ' + file.name));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error(`${file.name} is not an image this browser can open (try JPG or PNG).`));
      img.onload = () => {
        const s = Math.min(1, maxW / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.88));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// Plain text from any supported file (for the non-AI paths).
export async function fileToText(file) {
  const k = fileKind(file);
  if (k === 'text') return { text: await file.text(), images: [] };
  if (k === 'docx') return readDocx(file);
  if (k === 'pdf') { const r = await readPdfText(file); return { text: r.text, images: [] }; }
  if (k === 'doc') throw new Error(`${file.name} is an old Word format (.doc). Open it in Word and "Save As" .docx or PDF first.`);
  if (k === 'image') throw new Error(`${file.name} is a photo/scan — reading photos needs the AI features to be switched on.`);
  throw new Error(`${file.name}: this file type is not supported.`);
}
