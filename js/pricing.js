'use strict';
/* =========================================================
   Price check: suggest a price for a load of logs.
   Learns from your past orders – their wood type, log size,
   load photos, weight and the price you agreed.
   Uses helpers from app.js and smart.js at call time.
   ========================================================= */

const LOG_SIZES = [['', 'Not set'], ['small', 'Small'], ['medium', 'Medium'], ['big', 'Big']];
const sizeName = (k) => (LOG_SIZES.find((s) => s[0] === k) || ['', ''])[1];
// Logs are normally cut 8 ft long; sometimes the 8 ft is cut into two 4 ft pieces.
const LOG_LENGTHS = [['8ft', '8 ft single'], ['2x4ft', '2 × 4 ft pieces']];
const lengthName = (k) => (LOG_LENGTHS.find((s) => s[0] === k) || ['', ''])[1];

// Three photos of the loaded vehicle. The back shows the cut ends (log thickness) best.
const WOOD_SIDES = [['left', 'Left side'], ['right', 'Right side'], ['back', 'Back (cut ends)']];
const SIDE_WEIGHT = { back: 0.5, left: 0.25, right: 0.25 };

// Photo slots UI. slots = { left: {blob, feats, id?}, ... }; removed collects replaced saved file ids.
async function sidePhotoSlots(host, slots, { onChange, removed } = {}) {
  for (const [side] of WOOD_SIDES) {
    const sl = slots[side];
    if (sl && !sl.blob && sl.id) sl.blob = (await DB.get('files', sl.id))?.blob;
  }
  if (!host.isConnected) return;
  host.innerHTML = `<div class="side-slots">${WOOD_SIDES.map(([side, label]) => {
    const sl = slots[side];
    if (sl?.blob) {
      sl.url = blobUrl(sl.blob);
      return `<div class="side-slot"><div class="thumb side-thumb" data-view="${side}"><img src="${sl.url}" alt="${label}">
        <button type="button" class="x" data-rm="${side}" aria-label="Remove">${ICON.x}</button></div><span>${label}</span></div>`;
    }
    return `<div class="side-slot"><button type="button" class="thumb side-thumb add" data-add="${side}">${ICON.camera}<span>Add photo</span></button><span>${label}</span></div>`;
  }).join('')}</div><input type="file" accept="image/*" hidden data-file>`;
  const input = $('[data-file]', host);
  let target = null;
  const again = () => sidePhotoSlots(host, slots, { onChange, removed });
  $$('[data-add]', host).forEach((b) => b.onclick = () => { target = b.dataset.add; input.click(); });
  $$('[data-view]', host).forEach((t) => t.onclick = () => openLightbox(slots[t.dataset.view].url));
  $$('[data-rm]', host).forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const sl = slots[b.dataset.rm];
    if (sl?.id) removed?.push(sl.id);
    delete slots[b.dataset.rm];
    onChange?.(); again();
  });
  input.onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !target) return;
    const blob = await compressImage(f);
    let feats = null;
    try { feats = await imageFeatures(blob); } catch { /* not an image */ }
    const old = slots[target];
    if (old?.id) removed?.push(old.id);
    slots[target] = { blob, feats, name: `wood-${target}.jpg` };
    onChange?.(); again();
  };
}

// Compare the new load's photos with a past order's photos, side by side.
function loadSim(query, o) {
  if (!o.woodFeats) return null;
  const pics = Object.entries(o.woodFeats).map(([id, f]) => ({ id, f, side: o.woodSides?.[id] || 'other' }));
  if (!pics.length) return null;
  let tw = 0; let ts = 0; let sides = 0;
  for (const [side, w] of Object.entries(SIDE_WEIGHT)) {
    const q = query[side];
    if (!q) continue;
    let best = 0;
    for (const p of pics) best = Math.max(best, photoSim(q, p.f) * (p.side === side ? 1 : p.side === 'other' ? 0.95 : 0.85));
    tw += w; ts += w * best; sides++;
  }
  if (!tw) return null;
  return { sim: ts / tw, sides, fileId: (pics.find((p) => p.side === 'back') || pics[0]).id };
}

// How past orders with the same value of a field sold compared with the market.
function learnPremium(field, value, wood) {
  let list = state.orders.filter((o) => o[field] === value && o.woodType === wood);
  let scope = wood;
  if (list.length < 3) { list = state.orders.filter((o) => o[field] === value); scope = 'all woods'; }
  const ps = list.map(orderPremium).filter((v) => v != null);
  if (!ps.length) return { p: 0, n: 0, scope, avg: 0 };
  return { p: mean(ps) * (ps.length / (ps.length + 3)), n: ps.length, scope, avg: mean(ps) };
}

/* ---------- Photo fingerprint ----------
   A small summary of a photo: colours (bark / cut-end colour), brightness,
   and edge patterns (thick logs vs many thin logs). Used to find past loads
   that look similar. */
async function imageFeatures(blob) {
  const bmp = await createImageBitmap(blob);
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const hue = new Array(12).fill(0); const sat = new Array(4).fill(0); const val = new Array(4).fill(0); const ori = new Array(8).fill(0);
  const g = new Float32Array(S * S);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i] / 255; const gr = d[i + 1] / 255; const b = d[i + 2] / 255;
    const mx = Math.max(r, gr, b); const mn = Math.min(r, gr, b); const dl = mx - mn;
    let h = 0;
    if (dl) {
      if (mx === r) h = ((gr - b) / dl) % 6; else if (mx === gr) h = (b - r) / dl + 2; else h = (r - gr) / dl + 4;
      h = (h * 60 + 360) % 360;
    }
    const s = mx ? dl / mx : 0;
    hue[Math.min(11, Math.floor(h / 30))] += s;
    sat[Math.min(3, Math.floor(s * 4))]++;
    val[Math.min(3, Math.floor(mx * 4))]++;
    g[p] = 0.299 * r + 0.587 * gr + 0.114 * b;
  }
  let edges = 0;
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const p = y * S + x;
      const gx = g[p + 1] - g[p - 1]; const gy = g[p + S] - g[p - S];
      const m = Math.hypot(gx, gy);
      if (m > 0.08) { edges++; ori[Math.floor(((Math.atan2(gy, gx) + Math.PI) / (2 * Math.PI)) * 8) % 8] += m; }
    }
  }
  const norm = (a) => { const t = a.reduce((x, y) => x + y, 0) || 1; return a.map((v) => Math.round((v / t) * 1000) / 1000); };
  return { h: norm(hue), s: norm(sat), v: norm(val), o: norm(ori), e: Math.round((edges / (S - 2) ** 2) * 1000) / 1000 };
}

// 0..1, how alike two photo fingerprints are.
function photoSim(a, b) {
  if (!a || !b) return 0;
  const inter = (x, y) => x.reduce((t, v, i) => t + Math.min(v, y[i] || 0), 0);
  return 0.35 * inter(a.h, b.h) + 0.15 * inter(a.s, b.s) + 0.15 * inter(a.v, b.v) + 0.2 * inter(a.o, b.o)
    + 0.15 * (1 - Math.min(1, Math.abs(a.e - b.e) * 4));
}

/* ---------- Learning from past orders ---------- */
// Market price of a wood around a date (±30 days, other bills only).
function marketPrice(wood, date, excludeId) {
  const d0 = parseYmd(date);
  let t = 0; let kg = 0; let n = 0;
  for (const o of state.orders) {
    if (o.id === excludeId || o.woodType !== wood) continue;
    if (Math.abs(parseYmd(o.date) - d0) / 864e5 > 30) continue;
    const k = orderKg(o);
    if (!k || !num(o.total)) continue;
    t += num(o.total); kg += k; n++;
  }
  return n >= 2 ? pricePer(t, kg) : null;
}
// How much above/below the market this order was priced (0.05 = 5% above).
function orderPremium(o) {
  const m = marketPrice(o.woodType, o.date, o.id);
  const p = billPrice(o);
  return m && p ? p / m - 1 : null;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

function priceSuggestion({ wood, logSize, logLength, photos }) {
  const query = {};
  for (const [side] of WOOD_SIDES) if (photos?.[side]?.feats) query[side] = photos[side].feats;
  const nSides = Object.keys(query).length;
  if (!wood) return { ready: false, reason: 'Choose the wood type.' };
  const ol = priceOutlook(wood);
  if (!ol.ready || !ol.current) return { ready: false, reason: `No bills with ${wood} yet. Add a few ${wood} orders with weight and price, and the app will start suggesting prices.` };
  const today = startOf(new Date(), 'day');
  const factors = [];
  const base = ol.current;
  factors.push({ icon: '🧾', label: 'Market now', text: `${wood} from your recent bills`, value: money0(base) + priceLabel() });

  // Log size: how did past loads of this size sell compared with the market?
  let sizeP = 0; let sizeN = 0;
  if (logSize) {
    const L = learnPremium('logSize', logSize, wood);
    sizeP = L.p; sizeN = L.n;
    factors.push(L.n
      ? { icon: '📏', label: `${sizeName(logSize)} logs`, text: `${L.n} past ${sizeName(logSize).toLowerCase()} load${L.n === 1 ? '' : 's'} (${L.scope}) sold ${sgn(L.avg * 100)} vs market`, pct: sizeP * 100 }
      : { icon: '📏', label: `${sizeName(logSize)} logs`, text: 'No past orders with this log size yet – mark log size on your orders to learn', pct: 0 });
  }
  // Log length: 8 ft single vs two 4 ft pieces.
  let lenP = 0;
  if (logLength) {
    const L = learnPremium('logLength', logLength, wood);
    lenP = L.p;
    factors.push(L.n
      ? { icon: '📐', label: lengthName(logLength), text: `${L.n} past load${L.n === 1 ? '' : 's'} (${L.scope}) sold ${sgn(L.avg * 100)} vs market`, pct: lenP * 100 }
      : { icon: '📐', label: lengthName(logLength), text: 'No past orders with this length yet – it learns as you mark length on orders', pct: 0 });
  }

  // Photos: find past loads that look similar, comparing each side with the same side.
  let photoP = 0; let similar = []; let sizeHint = null;
  if (nSides) {
    const cands = [];
    for (const o of state.orders) {
      const m = loadSim(query, o);
      if (!m) continue;
      cands.push({ o, sim: m.sim, rank: m.sim + (o.woodType === wood ? 0.05 : 0) + (logLength && o.logLength === logLength ? 0.03 : 0), fileId: m.fileId, prem: orderPremium(o) });
    }
    cands.sort((x, y) => y.rank - x.rank);
    similar = cands.slice(0, 3);
    const use = cands.filter((c) => c.prem != null && c.sim >= 0.6 && c.o.woodType === wood).slice(0, 5);
    if (use.length) {
      let sw = 0; let sp = 0;
      use.forEach((c) => { const w = (c.sim - 0.5) ** 2; sw += w; sp += w * c.prem; });
      photoP = (sp / sw) * (use.length / (use.length + 2)) * (0.7 + 0.1 * nSides);
      factors.push({ icon: '📷', label: 'Photos', text: `${nSides} side${nSides === 1 ? '' : 's'} compared · looks like ${use.length} past ${wood} load${use.length === 1 ? '' : 's'} that sold ${sgn((sp / sw) * 100)} vs market`, pct: photoP * 100 * (logSize ? 0.6 : 1) });
    } else {
      factors.push({ icon: '📷', label: 'Photos', text: cands.length ? `No close match among ${cands.length} past loads with photos yet` : 'No past load photos yet – add the 3 photos to your orders to learn', pct: 0 });
    }
    // Guess log size from the closest past loads that have a size marked.
    const voters = cands.filter((c) => c.o.logSize && c.sim >= 0.6).slice(0, 5);
    if (voters.length >= 2) {
      const tally = {};
      voters.forEach((c) => { tally[c.o.logSize] = (tally[c.o.logSize] || 0) + c.sim; });
      const [top, v] = Object.entries(tally).sort((x, y) => y[1] - x[1])[0];
      const total = Object.values(tally).reduce((x, y) => x + y, 0);
      if (v / total >= 0.6) sizeHint = top;
    }
  }

  const prem = clamp(sizeP + lenP + (logSize ? 0.6 : 1) * photoP, -0.25, 0.25);
  const step = settings.priceUnit === 'ton' ? 10 : 0.1;
  const roundTo = (v) => Math.round(v / step) * step;
  const price = roundTo(base * (1 + prem));

  // Range from how much your recent prices for this wood vary.
  const recent = state.orders.filter((o) => o.woodType === wood && (today - parseYmd(o.date)) / 864e5 <= 120).map(orderPremium).filter((v) => v != null);
  const sd = recent.length >= 3 ? Math.sqrt(mean(recent.map((v) => v * v))) : 0.06;
  const spread = clamp(sd, 0.02, 0.15) * (logSize || photoP ? 0.8 : 1);
  factors.push({ icon: ol.direction === 'up' ? '▲' : ol.direction === 'down' ? '▼' : '►', label: 'Next 3 weeks', text: ol.direction === 'flat' ? 'Price likely steady' : `Price ${ol.direction === 'up' ? 'may go up' : 'may go down'} – see outlook`, pct: ol.pct });

  let score = (ol.bills >= 10 ? 2 : ol.bills >= 3 ? 1 : 0) + (sizeN >= 3 ? 1 : 0) + (photoP ? 1 : 0);
  const confidence = score >= 3 ? 'High' : score >= 2 ? 'Medium' : 'Low';
  return {
    ready: true, wood, base, price, low: roundTo(price * (1 - spread)), high: roundTo(price * (1 + spread)),
    prem, factors, similar, sizeHint, outlook: ol, confidence, in3w: roundTo(price * (1 + ol.pct / 100)),
  };
}

/* ---------- Price check screen ---------- */
function renderPriceCheck(view) {
  const woods = usedWoods();
  const pc = state.priceCheck || (state.priceCheck = { wood: woods[0] || '', logSize: '', logLength: '8ft', weight: '', unit: settings.defaultUnit, photos: {} });
  if (pc.logLength === undefined) pc.logLength = '8ft';
  if (!pc.photos) pc.photos = {};
  view.innerHTML = `
    <div class="card">
      <p class="small muted" style="margin-top:0">Take 3 photos of the loaded lorry – left side, right side and back (cut ends) – and choose the wood. The app suggests a price from your past orders, the log size and today's market.</p>
      <div class="field"><label for="pcWood">Wood type</label><select class="input" id="pcWood">${woodOpts(pc.wood)}</select></div>
      <div class="field"><label>Photos of the load</label>
        <div id="pcPhotos"></div>
      </div>
      <div class="field"><label>Log size (girth)</label>
        <div class="seg" id="pcSize" style="margin:0">${LOG_SIZES.map(([k, l]) => `<button type="button" data-s="${k}" class="${pc.logSize === k ? 'active' : ''}">${k ? l : '—'}</button>`).join('')}</div></div>
        <div class="hint">Small = thin logs, Big = thick logs (girth). Thick logs usually sell higher per ton.</div></div>
      <div class="field"><label>Log length</label>
        <div class="seg" id="pcLen" style="margin:0">${LOG_LENGTHS.map(([k, l]) => `<button type="button" data-l="${k}" class="${pc.logLength === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field" style="margin-bottom:0"><label for="pcWeight">Weight (optional)</label>
        <div class="input-group">
          <input class="input" id="pcWeight" type="number" inputmode="decimal" step="any" min="0" value="${esc(pc.weight)}" placeholder="0">
          <select class="input unit" id="pcUnit"><option value="ton" ${pc.unit === 'ton' ? 'selected' : ''}>Ton</option><option value="kg" ${pc.unit === 'kg' ? 'selected' : ''}>Kg</option></select>
        </div></div>
    </div>
    <div id="pcResult"></div>`;

  sidePhotoSlots($('#pcPhotos'), pc.photos, { onChange: () => compute() });
  $('#pcWood').onchange = (e) => { pc.wood = e.target.value; compute(); };
  const setSize = (k) => {
    pc.logSize = k;
    $$('#pcSize button').forEach((x) => x.classList.toggle('active', x.dataset.s === k));
    compute();
  };
  $$('#pcSize button').forEach((b) => b.onclick = () => setSize(b.dataset.s));
  $$('#pcLen button').forEach((b) => b.onclick = () => {
    pc.logLength = b.dataset.l;
    $$('#pcLen button').forEach((x) => x.classList.toggle('active', x === b));
    compute();
  });
  $('#pcWeight').oninput = (e) => { pc.weight = e.target.value; compute(); };
  $('#pcUnit').onchange = (e) => { pc.unit = e.target.value; compute(); };

  function compute() {
    const box = $('#pcResult');
    if (!box) return;
    const r = priceSuggestion({ wood: pc.wood, logSize: pc.logSize, logLength: pc.logLength, photos: pc.photos });
    if (!r.ready) { box.innerHTML = `<div class="card empty" style="padding:20px">${ICON.chart}<p>${esc(r.reason)}</p></div>`; return; }
    const kg = pc.unit === 'ton' ? num(pc.weight) * 1000 : num(pc.weight);
    const perKgPrice = settings.priceUnit === 'ton' ? r.price / 1000 : r.price;
    const total = kg ? round2(perKgPrice * kg) : 0;
    const comm = round2((total * settings.commissionPct) / 100);
    box.innerHTML = `
      ${r.sizeHint && !pc.logSize ? `<div class="banner hint-banner">📏<div class="grow">Photos look like <b>${sizeName(r.sizeHint)} logs</b> (from similar past loads).</div><button class="btn sm" id="pcUseSize">Use</button></div>` : ''}
      <div class="card price-card">
        <div class="small muted">Suggested price · ${esc(r.wood)}${pc.logSize ? ' · ' + sizeName(pc.logSize) + ' logs' : ''}${pc.logLength ? ' · ' + lengthName(pc.logLength) : ''}</div>
        <div class="price-big">${money0(r.price)}<span>${priceLabel()}</span></div>
        <div class="small">Fair range <b>${money0(r.low)} – ${money0(r.high)}</b> <span class="conf conf-${r.confidence.toLowerCase()}">${r.confidence} confidence</span></div>
        ${kg ? `<div class="price-total"><div><span class="small muted">Load value (${fmtWeight(kg)})</span><b>${money0(total)}</b></div><div><span class="small muted">My brokerage ${nf.format(settings.commissionPct)}%</span><b style="color:var(--accent)">${money0(comm)}</b></div></div>` : ''}
        ${r.outlook.direction !== 'flat' ? `<div class="small muted" style="margin-top:8px">In 3 weeks: ~${money0(r.in3w)}${priceLabel()} (${r.outlook.direction === 'up' ? '▲' : '▼'} ${Math.abs(r.outlook.pct).toFixed(1)}%)</div>` : ''}
        <ul class="why-list">${r.factors.map((f) => `<li><span>${f.icon} <b>${esc(f.label)}</b> ${esc(f.text)}</span><b class="${f.value ? '' : f.pct > 0.05 ? 'up' : f.pct < -0.05 ? 'down' : 'muted'}">${f.value || sgn(f.pct)}</b></li>`).join('')}</ul>
        <button class="btn primary block" id="pcUse" style="margin-top:12px">${ICON.plus} Create order at this price</button>
      </div>
      ${r.similar.length ? `<div class="card"><h3>Similar past loads <small>by photo</small></h3><div id="pcSimilar">${r.similar.map((c, i) => {
        const p = billPrice(c.o);
        return `<div class="item" data-order="${esc(c.o.id)}"><div class="thumb sim-thumb" id="sim${i}"></div>
          <div class="main"><div class="title">${esc(c.o.woodType || 'Wood')} · ${p ? money0(p) + priceLabel() : '—'}</div>
          <div class="sub">${fmtDate(c.o.date)} · ${esc(partyName(c.o.supplierId))} → ${esc(partyName(c.o.buyerId))}${c.o.logSize ? ' · ' + sizeName(c.o.logSize) : ''}${c.o.logLength ? ' · ' + lengthName(c.o.logLength) : ''}</div></div>
          <div class="amt small">${Math.round(c.sim * 100)}%<div class="sub">alike</div></div></div>`;
      }).join('')}</div></div>` : ''}`;
    bindOrderItems(box);
    $('#pcUseSize', box)?.addEventListener('click', () => setSize(r.sizeHint));
    r.similar.forEach(async (c, i) => {
      const f = await DB.get('files', c.fileId);
      const t = $('#sim' + i, box);
      if (f && t) t.innerHTML = `<img src="${blobUrl(f.blob)}" alt="">`;
    });
    $('#pcUse').onclick = () => {
      const perTon = settings.priceUnit === 'ton' ? r.price : r.price * 1000;
      state.prefill = {
        woodType: r.wood, logSize: pc.logSize, logLength: pc.logLength, unit: pc.unit,
        weight: pc.weight === '' ? '' : num(pc.weight),
        rate: round2(pc.unit === 'ton' ? perTon : perTon / 1000),
        woodPhotos: Object.fromEntries(Object.entries(pc.photos).map(([k, v]) => [k, { blob: v.blob, feats: v.feats, name: v.name }])),
      };
      location.hash = '#new';
    };
  }
  compute();
}
