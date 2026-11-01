// Picture quality: find low-resolution pictures on a paper and replace them with
// clearer, freely licensed pictures from Wikimedia Commons (with credit), or sharpen them.
import { esc, icon, toast, openModal, $, $$, readImage } from './ui.js';

const PRINT_WIDTH_MM = 180;   // usable width of an A4 page
export const MIN_DPI = 150;   // below this a picture looks blurry when printed

export function imageSize(dataUrl) {
  return new Promise(res => {
    if (!dataUrl) return res(null);
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}

// Dots-per-inch the picture will have on paper at its chosen width (%).
export function printDpi(w, widthPct) {
  const mm = PRINT_WIDTH_MM * (Number(widthPct) || 100) / 100;
  return Math.round(w / (mm / 25.4));
}

// Every picture on the paper with its print quality.
export async function scanPictures(paper) {
  const out = [];
  for (const b of paper.blocks || []) {
    if (!b.image) continue;
    const s = await imageSize(b.image);
    if (!s) continue;
    const width = b.imgWidth || (b.kind === 'source' ? 100 : 80);
    const dpi = printDpi(s.w, width);
    out.push({ block: b, ...s, dpi, low: dpi < MIN_DPI || s.w < 500 });
  }
  return out;
}

// ───────────── Wikimedia Commons ─────────────
const stripHtml = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

export async function commonsSearch(term, limit = 12) {
  if (window.__KPS_COMMONS_MOCK__) return window.__KPS_COMMONS_MOCK__(term);
  const q = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search',
    gsrsearch: `${term} filetype:bitmap|drawing`, gsrnamespace: '6', gsrlimit: '30',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600'
  });
  const r = await fetch('https://commons.wikimedia.org/w/api.php?' + q);
  if (!r.ok) throw new Error('Could not reach Wikimedia Commons.');
  const j = await r.json();
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const res = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    if (!/^image\/(jpeg|png|svg\+xml|gif|tiff|webp)/.test(ii.mime || '')) continue;
    const isSvg = ii.mime === 'image/svg+xml';
    if (!isSvg && (ii.width || 0) < 900) continue;  // only clearly better pictures
    const m = ii.extmetadata || {};
    const license = stripHtml(m.LicenseShortName?.value) || 'see Wikimedia Commons';
    if (/non-?free|fair use/i.test(license)) continue;
    res.push({
      title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
      thumb: ii.thumburl || ii.url, full: ii.thumburl || ii.url,
      w: ii.width, h: ii.height, svg: isSvg,
      author: stripHtml(m.Artist?.value).slice(0, 80) || 'Unknown',
      license, page: ii.descriptionurl
    });
    if (res.length >= limit) break;
  }
  return res;
}

export function creditLine(r) {
  return `Picture: ${r.author}, ${r.license}, via Wikimedia Commons`;
}

// Download a picture into a compact JPEG data URL.
export async function urlToDataUrl(url, maxW = 1600) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error('Could not download the picture.');
  const blob = await r.blob();
  const src = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open the picture.')); i.src = src; });
    const s = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(src); }
}

// Best Commons match for a search, ready to put on the paper (used by Auto Compile).
export async function bestCommonsPicture(term) {
  const list = await commonsSearch(term, 5);
  for (const r of list) {
    try { return { dataUrl: await urlToDataUrl(r.full), credit: creditLine(r), result: r }; } catch {}
  }
  return null;
}

// Sharpen: upscale smoothly, then apply an unsharp mask and a little contrast.
export async function sharpen(dataUrl, targetW = 1400) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const scale = Math.max(1, Math.min(3, targetW / img.naturalWidth));
  const W = Math.round(img.naturalWidth * scale), H = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const src = ctx.getImageData(0, 0, W, H);
  const blur = document.createElement('canvas'); blur.width = W; blur.height = H;
  const bctx = blur.getContext('2d');
  bctx.filter = `blur(${Math.max(1, scale * 0.8).toFixed(1)}px)`;
  bctx.drawImage(c, 0, 0);
  const bl = bctx.getImageData(0, 0, W, H).data;
  const d = src.data, amount = 0.9, contrast = 1.08;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      let v = d[i + k] + amount * (d[i + k] - bl[i + k]);
      v = (v - 128) * contrast + 128;
      d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(src, 0, 0);
  return c.toDataURL('image/jpeg', 0.88);
}

// ───────────── Review dialog ─────────────
// onChange() is called after any picture on the paper changes.
export async function openPictureReview(paper, onChange, { onlyLow = false } = {}) {
  const m = openModal({ title: 'Pictures on this paper', wide: true, body: `<div class="prog"><div class="spinner"></div><b>Checking picture quality…</b></div>` });
  const draw = async () => {
    const all = await scanPictures(paper);
    const list = onlyLow ? all.filter(x => x.low) : all;
    if (!all.length) {
      m.body.innerHTML = `<div class="empty">${icon('image', 40)}<div>There are no pictures on this paper yet. Add one with <b>Add Image</b> or a <b>Source</b>, or search below.</div></div>`;
      return;
    }
    const lowN = all.filter(x => x.low).length;
    m.body.innerHTML = `
      <div class="note ${lowN ? 'note-gold' : ''}" style="margin-bottom:14px">${icon(lowN ? 'warn' : 'check', 15)} <span>${lowN ? `<b>${lowN} picture${lowN === 1 ? '' : 's'}</b> will look blurry when printed (below ${MIN_DPI} dpi). Replace them with a clearer picture, or sharpen them.` : 'All pictures are sharp enough to print well.'}</span></div>
      ${list.map((x, i) => `
        <div class="pic-row ${x.low ? 'pic-low' : ''}" data-i="${i}">
          <img src="${x.block.image}" alt="">
          <div class="pic-info">
            <b>${esc(x.block.title || x.block.caption || (x.block.kind === 'source' ? 'Source picture' : 'Question picture'))}</b>
            <div class="small muted">${x.w} × ${x.h} px · prints at about <b class="${x.low ? 'st-low' : 'st-ok'}">${x.dpi} dpi</b> ${x.low ? '— blurry' : '— sharp'}</div>
            ${x.block.picCredit ? `<div class="small muted">${esc(x.block.picCredit)}</div>` : ''}
            <div class="row" style="margin-top:8px;gap:6px">
              <button class="btn btn-sm btn-gold" data-find="${i}">${icon('search', 14)} Find a clearer picture</button>
              <button class="btn btn-sm btn-outline" data-sharp="${i}">${icon('sparkle', 14)} Sharpen</button>
              <label class="btn btn-sm btn-outline">${icon('upload', 14)} Upload my own<input type="file" accept="image/*" data-up="${i}" hidden></label>
              ${x.block._prevImage ? `<button class="btn btn-sm btn-ghost" data-undo="${i}">Undo</button>` : ''}
            </div>
            <div class="pic-results" id="pr${i}"></div>
          </div>
        </div>`).join('')}`;
    const setImg = (b, dataUrl, credit) => {
      b._prevImage = b._prevImage || { image: b.image, reference: b.reference, picCredit: b.picCredit };
      b.image = dataUrl;
      if (credit !== undefined) {
        const base = (b.reference || '').split(' · ').filter(t => !/via Wikimedia Commons/.test(t)).join(' · ');
        b.reference = [base, credit].filter(Boolean).join(' · ');
        b.picCredit = credit;
      }
      onChange && onChange(); draw();
    };
    $$('[data-find]', m.body).forEach(btn => btn.onclick = () => {
      const i = Number(btn.dataset.find), x = list[i], box = $('#pr' + i, m.body);
      const term = x.block.picSearch || x.block.title || x.block.caption || '';
      box.innerHTML = `<div class="row" style="margin:10px 0 8px"><input class="input input-sm" value="${esc(term)}" placeholder="What should the picture show? (English works best)" style="flex:1"><button class="btn btn-sm btn-navy">Search</button></div><div class="pic-grid"></div>`;
      const inp = $('input', box), grid = $('.pic-grid', box);
      const go = async () => {
        if (!inp.value.trim()) return;
        x.block.picSearch = inp.value.trim();
        grid.innerHTML = `<div class="small muted">Searching Wikimedia Commons…</div>`;
        try {
          const res = await commonsSearch(inp.value.trim());
          grid.innerHTML = res.length ? res.map((r, k) => `<button class="pic-pick" data-k="${k}" title="${esc(r.title)}"><img src="${r.thumb}" alt="" loading="lazy"><span>${esc(r.title.slice(0, 40))}</span><small>${r.svg ? 'drawing' : r.w + ' px'} · ${esc(r.license)}</small></button>`).join('')
            : `<div class="small muted">No clear pictures found. Try other words, e.g. a person's full name, or "map of …".</div>`;
          $$('.pic-pick', grid).forEach(pb => pb.onclick = async () => {
            const r = res[Number(pb.dataset.k)];
            pb.disabled = true; pb.classList.add('busy');
            try { setImg(x.block, await urlToDataUrl(r.full), creditLine(r)); toast('Picture replaced. The credit was added to the source reference.'); }
            catch (e) { toast(e.message, 'err'); pb.disabled = false; pb.classList.remove('busy'); }
          });
        } catch (e) { grid.innerHTML = `<div class="small st-low">${esc(e.message)}</div>`; }
      };
      $('button', box).onclick = go;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      go();
    });
    $$('[data-sharp]', m.body).forEach(btn => btn.onclick = async () => {
      const x = list[Number(btn.dataset.sharp)];
      btn.disabled = true;
      try { setImg(x.block, await sharpen(x.block.image)); toast('Picture sharpened.'); } catch { toast('Could not sharpen this picture.', 'err'); btn.disabled = false; }
    });
    $$('[data-up]', m.body).forEach(inp => inp.onchange = async () => {
      const x = list[Number(inp.dataset.up)];
      try { setImg(x.block, await readImage(inp.files[0]), ''); toast('Picture replaced.'); } catch (e) { toast(e.message, 'err'); }
    });
    $$('[data-undo]', m.body).forEach(btn => btn.onclick = () => {
      const b = list[Number(btn.dataset.undo)].block;
      Object.assign(b, b._prevImage); delete b._prevImage;
      onChange && onChange(); draw();
    });
  };
  await draw();
}
