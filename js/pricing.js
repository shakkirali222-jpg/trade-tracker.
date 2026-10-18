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

function priceSuggestion({ wood, logLength, photos, kgPerLog, mix }) {
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

  // Log thickness: average weight per log (weight ÷ number of logs) vs past loads.
  let kplP = 0; let kplN = 0;
  if (kgPerLog) {
    const K = kplPremium(wood, kgPerLog);
    kplN = K.n;
    if (K.n && K.similar) {
      kplP = K.p;
      factors.push({ icon: '🪵', label: mix ? 'Log mix' : `${nf.format(Math.round(kgPerLog))} kg per log`, text: `${mix ? mixText(mix) + ' · ' : ''}${K.similar} past load${K.similar === 1 ? '' : 's'} with similar logs (${K.scope}) sold ${sgn(K.avg * 100)} vs market`, pct: kplP * 100 });
    } else if (K.n) {
      kplP = K.p;
      factors.push({ icon: '🪵', label: mix ? 'Log mix' : `${nf.format(Math.round(kgPerLog))} kg per log`, text: `${mix ? mixText(mix) + ' · ' : ''}${kgPerLog > K.typical ? 'Thicker' : 'Thinner'} than your usual loads – few loads like this yet`, pct: kplP * 100 });
    } else {
      factors.push({ icon: '🪵', label: mix ? 'Log mix' : `${nf.format(Math.round(kgPerLog))} kg per log`, text: `${mix ? mixText(mix) + ' · ' : ''}add log counts to your orders – the app learns how thick and thin logs change the price`, pct: 0 });
    }
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
  let photoP = 0; let similar = [];
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
      factors.push({ icon: '📷', label: 'Photos', text: `${nSides} side${nSides === 1 ? '' : 's'} compared · looks like ${use.length} past ${wood} load${use.length === 1 ? '' : 's'} that sold ${sgn((sp / sw) * 100)} vs market`, pct: photoP * 100 * (kplP ? 0.6 : 1) });
    } else {
      factors.push({ icon: '📷', label: 'Photos', text: cands.length ? `No close match among ${cands.length} past loads with photos yet` : 'No past load photos yet – add the 3 photos to your orders to learn', pct: 0 });
    }
  }

  const prem = clamp(kplP + lenP + (kplP ? 0.6 : 1) * photoP, -0.25, 0.25);
  const step = settings.priceUnit === 'ton' ? 10 : 0.1;
  const roundTo = (v) => Math.round(v / step) * step;
  const price = roundTo(base * (1 + prem));

  // Range from how much your recent prices for this wood vary.
  const recent = state.orders.filter((o) => o.woodType === wood && (today - parseYmd(o.date)) / 864e5 <= 120).map(orderPremium).filter((v) => v != null);
  const sd = recent.length >= 3 ? Math.sqrt(mean(recent.map((v) => v * v))) : 0.06;
  const spread = clamp(sd, 0.02, 0.15) * (kplP || photoP ? 0.8 : 1);
  factors.push({ icon: ol.direction === 'up' ? '▲' : ol.direction === 'down' ? '▼' : '►', label: 'Next 3 weeks', text: ol.direction === 'flat' ? 'Price likely steady' : `Price ${ol.direction === 'up' ? 'may go up' : 'may go down'} – see outlook`, pct: ol.pct });

  let score = (ol.bills >= 10 ? 2 : ol.bills >= 3 ? 1 : 0) + (kplN >= 3 ? 1 : 0) + (photoP ? 1 : 0);
  const confidence = score >= 3 ? 'High' : score >= 2 ? 'Medium' : 'Low';
  return {
    ready: true, wood, base, price, low: roundTo(price * (1 - spread)), high: roundTo(price * (1 + spread)),
    prem, factors, similar, outlook: ol, confidence, in3w: roundTo(price * (1 + ol.pct / 100)),
  };
}

// Current market rate: the latest bills for this wood.
function latestBillsCard(wood) {
  const os = state.orders.filter((o) => o.woodType === wood && billPrice(o)).sort(sortOrdersDesc).slice(0, 6);
  if (!os.length) return '';
  return `<div class="card"><h3>Latest ${esc(wood)} bills <small>market rate</small></h3>
    ${os.map((o) => {
      const kpl = num(o.logCount) && orderKg(o) ? Math.round(orderKg(o) / num(o.logCount)) : null;
      return `<div class="item" data-order="${esc(o.id)}"><div class="main"><div class="title">${money0(billPrice(o))}${priceLabel()}</div>
        <div class="sub">${fmtDate(o.date)} · ${esc(partyName(o.supplierId))} → ${esc(partyName(o.buyerId))}</div></div>
        <div class="amt small">${fmtWeight(orderKg(o))}<div class="sub">${kpl ? kpl + ' kg/log' : ''}</div></div></div>`;
    }).join('')}</div>`;
}

/* ---------- Price check screen ---------- */
function renderPriceCheck(view) {
  const woods = usedWoods();
  const pc = state.priceCheck || (state.priceCheck = { wood: woods[0] || '', logLength: '8ft', weight: '', unit: settings.defaultUnit, photos: {}, logs: {} });
  if (pc.logLength === undefined) pc.logLength = '8ft';
  if (!pc.photos) pc.photos = {};
  if (!pc.logs) pc.logs = {};
  view.innerHTML = `
    <div class="card">
      <p class="small muted" style="margin-top:0">Take 3 photos of the loaded lorry – left side, right side and back (cut ends) – and choose the wood. The app counts the logs, works out the average log weight and suggests a price from your past orders and today's market.</p>
      <div class="field"><label for="pcWood">Wood type</label><select class="input" id="pcWood">${woodOpts(pc.wood)}</select></div>
      <div class="field"><label>Photos of the load</label>
        <div id="pcPhotos"></div>
      </div>
      <div class="field"><label>Log length</label>
        <div class="seg" id="pcLen" style="margin:0">${LOG_LENGTHS.map(([k, l]) => `<button type="button" data-l="${k}" class="${pc.logLength === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
      <div class="field"><label for="pcWeight">Weight</label>
        <div class="input-group">
          <input class="input" id="pcWeight" type="number" inputmode="decimal" step="any" min="0" value="${esc(pc.weight)}" placeholder="0">
          <select class="input unit" id="pcUnit"><option value="ton" ${pc.unit === 'ton' ? 'selected' : ''}>Ton</option><option value="kg" ${pc.unit === 'kg' ? 'selected' : ''}>Kg</option></select>
        </div></div>
      <div class="field" style="margin-bottom:0" id="pcLogs"></div>
    </div>
    <div id="pcResult"></div>`;

  const pcKg = () => (pc.unit === 'ton' ? num(pc.weight) * 1000 : num(pc.weight));
  const logs = logCountField($('#pcLogs'), pc.logs, { getBack: () => pc.photos.back, getKg: pcKg, getLength: () => pc.logLength, onChange: () => compute() });
  let lastBack = pc.photos.back;
  sidePhotoSlots($('#pcPhotos'), pc.photos, {
    onChange: () => {
      if (pc.photos.back && pc.photos.back !== lastBack) { pc.logs.count = ''; pc.logs.dots = null; logs.autoCount(pc.photos.back.blob); }
      lastBack = pc.photos.back;
      compute();
    },
  });
  $('#pcWood').onchange = (e) => { pc.wood = e.target.value; compute(); };
  $$('#pcLen button').forEach((b) => b.onclick = () => {
    pc.logLength = b.dataset.l;
    $$('#pcLen button').forEach((x) => x.classList.toggle('active', x === b));
    logs.update();
    compute();
  });
  $('#pcWeight').oninput = (e) => { pc.weight = e.target.value; logs.update(); compute(); };
  $('#pcUnit').onchange = (e) => { pc.unit = e.target.value; logs.update(); compute(); };

  function compute() {
    const box = $('#pcResult');
    if (!box) return;
    const pcMix = num(pc.logs.count) && pc.logs.dots?.length === num(pc.logs.count) ? logMix(pc.logs.dots, pcKg(), pc.logLength) : null;
    const r = priceSuggestion({ wood: pc.wood, logLength: pc.logLength, photos: pc.photos, mix: pcMix, kgPerLog: pcMix ? pcMix.wavg : num(pc.logs.count) && pcKg() ? pcKg() / num(pc.logs.count) : null });
    if (!r.ready) { box.innerHTML = `<div class="card empty" style="padding:20px">${ICON.chart}<p>${esc(r.reason)}</p></div>`; return; }
    const kg = pc.unit === 'ton' ? num(pc.weight) * 1000 : num(pc.weight);
    const perKgPrice = settings.priceUnit === 'ton' ? r.price / 1000 : r.price;
    const total = kg ? round2(perKgPrice * kg) : 0;
    const comm = round2((total * settings.commissionPct) / 100);
    box.innerHTML = `
      <div class="card price-card">
        <div class="small muted">Suggested price · ${esc(r.wood)}${num(pc.logs.count) ? ' · ' + pc.logs.count + ' logs' : ''}${pc.logLength ? ' · ' + lengthName(pc.logLength) : ''}</div>
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
          <div class="sub">${fmtDate(c.o.date)} · ${esc(partyName(c.o.supplierId))} → ${esc(partyName(c.o.buyerId))}${orderLogKg(c.o) ? ' · ~' + Math.round(orderLogKg(c.o)) + ' kg logs' : ''}${c.o.logLength ? ' · ' + lengthName(c.o.logLength) : ''}</div></div>
          <div class="amt small">${Math.round(c.sim * 100)}%<div class="sub">alike</div></div></div>`;
      }).join('')}</div></div>` : ''}
      ${latestBillsCard(r.wood)}`;
    bindOrderItems(box);
    r.similar.forEach(async (c, i) => {
      const f = await DB.get('files', c.fileId);
      const t = $('#sim' + i, box);
      if (f && t) t.innerHTML = `<img src="${blobUrl(f.blob)}" alt="">`;
    });
    $('#pcUse').onclick = () => {
      const perTon = settings.priceUnit === 'ton' ? r.price : r.price * 1000;
      state.prefill = {
        woodType: r.wood, logCount: pc.logs.count, logDots: pc.logs.dots, logLength: pc.logLength, unit: pc.unit,
        weight: pc.weight === '' ? '' : num(pc.weight),
        rate: round2(pc.unit === 'ton' ? perTon : perTon / 1000),
        woodPhotos: Object.fromEntries(Object.entries(pc.photos).map(([k, v]) => [k, { blob: v.blob, feats: v.feats, name: v.name }])),
      };
      location.hash = '#new';
    };
  }
  compute();
}

/* =========================================================
   Log counting from the back photo (cut ends)
   Auto-detects round, light, warm-coloured cut ends; the user then
   taps to add missed logs or remove wrong dots.
   ========================================================= */
async function detectLogEnds(blob) {
  const bmp = await createImageBitmap(blob);
  const W = 360; const H = Math.max(1, Math.round((bmp.height * W) / bmp.width));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const N = W * H;
  const score = new Float32Array(N); const warm = new Uint8Array(N);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; p < N; i += 4, p++) {
    const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
    const v = (r + g + b) / 3 + 0.5 * Math.max(0, r - b);
    score[p] = v;
    warm[p] = r - b > 8 && r >= g * 0.9 ? 1 : 0;
    hist[Math.min(255, Math.round(v * 0.67))]++;
  }
  // Otsu threshold: split the picture into bright cut ends vs the rest.
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0; let wB = 0; let best = 0; let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = N - wB; if (!wF) break;
    sB += i * hist[i];
    const mB = sB / wB; const mF = (sum - sB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  const thr = t / 0.67;
  const mask = new Uint8Array(N);
  for (let p = 0; p < N; p++) mask[p] = score[p] > thr && warm[p] ? 1 : 0;
  // Distance to the nearest non-cut-end pixel (chamfer). Centres of logs are the peaks.
  const INF = 1e9; const dist = new Float32Array(N);
  for (let p = 0; p < N; p++) dist[p] = mask[p] ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (!dist[p]) continue;
    let m = dist[p];
    if (x > 0) m = Math.min(m, dist[p - 1] + 1);
    if (y > 0) { m = Math.min(m, dist[p - W] + 1); if (x > 0) m = Math.min(m, dist[p - W - 1] + 1.4); if (x < W - 1) m = Math.min(m, dist[p - W + 1] + 1.4); }
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) m = Math.min(m, 1);
    dist[p] = m;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const p = y * W + x; if (!dist[p]) continue;
    let m = dist[p];
    if (x < W - 1) m = Math.min(m, dist[p + 1] + 1);
    if (y < H - 1) { m = Math.min(m, dist[p + W] + 1); if (x < W - 1) m = Math.min(m, dist[p + W + 1] + 1.4); if (x > 0) m = Math.min(m, dist[p + W - 1] + 1.4); }
    dist[p] = m;
  }
  const peaks = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const p = y * W + x; const v = dist[p];
    if (v < 3) continue;
    let isMax = true;
    for (let dy = -2; dy <= 2 && isMax; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && dist[p + dy * W + dx] > v) { isMax = false; break; }
    if (isMax) peaks.push({ x, y, r: v });
  }
  peaks.sort((a, b) => b.r - a.r);
  const kept = [];
  for (const pk of peaks) if (!kept.some((k) => Math.hypot(k.x - pk.x, k.y - pk.y) < Math.max(k.r, pk.r) * 1.1)) kept.push(pk);
  if (!kept.length) { detectCache = { blob, W, H, dist, med: 8 }; return []; }
  const med = kept.map((k) => k.r).sort((a, b) => a - b)[Math.floor(kept.length / 2)];
  detectCache = { blob, W, H, dist, med };
  // r = radius of the cut end as a share of the photo width (log thickness on the photo)
  return kept.filter((k) => k.r >= med * 0.45 && k.r <= med * 3)
    .map((k) => ({ x: Math.round((k.x / W) * 1000) / 1000, y: Math.round((k.y / H) * 1000) / 1000, r: Math.round((k.r / W) * 10000) / 10000 }));
}
let detectCache = null;

// Size of a log end at a tapped point (for logs the user adds by hand).
async function radiusAt(blob, x, y, list) {
  if (!detectCache || detectCache.blob !== blob) { try { await detectLogEnds(blob); } catch { /* ignore */ } }
  const typical = list.filter((p) => p.r).map((p) => p.r).sort((a, b) => a - b)[Math.floor(list.length / 2)] || 0.03;
  if (!detectCache || detectCache.blob !== blob) return typical;
  const { W, H, dist, med } = detectCache;
  const px = Math.round(x * W); const py = Math.round(y * H);
  let best = 0;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const xx = px + dx; const yy = py + dy;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H) best = Math.max(best, dist[yy * W + xx]);
  }
  return best >= med * 0.35 ? Math.round((best / W) * 10000) / 10000 : typical;
}

// Logs in one load are different sizes. All logs have the same length, so each log's weight
// follows its cut-end area (radius²). Share the load weight out by area.
const LOG_BANDS = [['thin', 'Thin'], ['medium', 'Medium'], ['thick', 'Thick']];
function logMix(dots, kg, length) {
  if (!dots?.length || !kg || dots.some((p) => !p.r)) return null;
  const f = length === '2x4ft' ? 0.5 : 1; // 4 ft pieces weigh half
  const area = dots.map((p) => p.r * p.r);
  const total = area.reduce((a, b) => a + b, 0);
  const per = area.map((a) => (kg * a) / total);
  const bands = { thin: { n: 0, kg: 0 }, medium: { n: 0, kg: 0 }, thick: { n: 0, kg: 0 } };
  per.forEach((w) => { const b = w < 50 * f ? 'thin' : w > 120 * f ? 'thick' : 'medium'; bands[b].n++; bands[b].kg += w; });
  const sorted = [...per].sort((a, b) => a - b);
  return {
    n: per.length, avg: kg / per.length,
    // Tonnage-weighted log size: what most of the weight is made of.
    wavg: per.reduce((a, w) => a + w * w, 0) / kg,
    min: sorted[0], max: sorted[sorted.length - 1], bands, f,
  };
}
const mixText = (m) => LOG_BANDS.filter(([k]) => m.bands[k].n).map(([k, l]) => `${l} ${m.bands[k].n} (${Math.round((m.bands[k].kg / (m.avg * m.n)) * 100)}% of weight)`).join(' · ');
const mixBar = (m) => `<div class="mix-bar">${LOG_BANDS.map(([k]) => `<i class="mix-${k}" style="width:${(m.bands[k].kg / (m.avg * m.n)) * 100}%"></i>`).join('')}</div>`;
// Thickness measure used for pricing: tonnage-weighted log weight if sizes are known, else simple average.
function orderLogKg(o) {
  const kg = orderKg(o); const n = num(o.logCount);
  if (!kg || !n) return null;
  const m = n === o.logDots?.length ? logMix(o.logDots, kg, o.logLength) : null;
  return m ? m.wavg : kg / n;
}

// Full-screen counting sheet: dots on each log end, tap to add / remove.
function openLogCounter(blob, dots, onDone) {
  let list = (dots || []).map((p) => ({ ...p }));
  const url = blobUrl(blob);
  const body = openSheet(`
    <h2>Count logs</h2>
    <p class="small muted" style="margin-top:-6px">Each dot = one log; the ring shows its size. Tap a missed log end to add it; tap a wrong dot to remove it.</p>
    <div class="counter" id="cntBox"><img src="${url}" alt="Back of the load"><div class="dots" id="cntDots"></div></div>
    <div class="row" style="margin:12px 0">
      <div class="grow"><span class="count-big" id="cntN">0</span> <span class="muted">logs</span></div>
      <button type="button" class="btn sm" id="cntAuto">Auto-detect</button>
      <button type="button" class="btn sm" id="cntClear">Clear</button>
    </div>
    <button type="button" class="btn primary block" id="cntDone">${ICON.check} Done</button>`);
  const box = $('#cntBox', body); const layer = $('#cntDots', body);
  const draw = () => {
    layer.innerHTML = list.map((p, i) => `<span class="dot" data-i="${i}" style="left:${p.x * 100}%;top:${p.y * 100}%"></span>`
      + (p.r ? `<span class="ring" style="left:${p.x * 100}%;top:${p.y * 100}%;width:${p.r * 200}%"></span>` : '')).join('');
    $('#cntN', body).textContent = list.length;
  };
  box.onclick = async (e) => {
    const dot = e.target.closest('.dot');
    if (dot) { list.splice(Number(dot.dataset.i), 1); draw(); return; }
    const rc = $('img', box).getBoundingClientRect();
    const x = Math.round(((e.clientX - rc.left) / rc.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rc.top) / rc.height) * 1000) / 1000;
    const p = { x, y };
    list.push(p); draw();
    p.r = await radiusAt(blob, x, y, list); draw();
  };
  $('#cntAuto', body).onclick = async () => { list = await detectLogEnds(blob); draw(); toast(`Found ${list.length} logs – please check`); };
  $('#cntClear', body).onclick = () => { list = []; draw(); };
  $('#cntDone', body).onclick = () => { closeSheet(); onDone(list); };
  draw();
}

// Shared "Number of logs" field: input + Count button + avg kg per log hint.
// st = { count, dots }, getBack() -> back photo slot, getKg() -> load weight in kg
function logCountField(host, st, { getBack, getKg, getLength, onChange }) {
  host.innerHTML = `
    <label for="${host.id}In">Number of logs</label>
    <div class="input-group">
      <input class="input" id="${host.id}In" type="number" inputmode="numeric" min="0" step="1" value="${st.count || ''}" placeholder="0">
      <button type="button" class="btn" data-count>${ICON.scan} Count from photo</button>
    </div>
    <div class="hint" data-hint></div>`;
  const input = $('input', host); const hint = $('[data-hint]', host);
  const update = () => {
    const kg = getKg(); const n = num(st.count);
    const m = n && kg && st.dots?.length === n ? logMix(st.dots, kg, getLength?.()) : null;
    hint.innerHTML = m ? `<b>${n} logs</b> · average <b>${nf.format(Math.round(m.avg))} kg</b> · from ${nf.format(Math.round(m.min))} to ${nf.format(Math.round(m.max))} kg each${mixBar(m)}<span class="mix-legend">${mixText(m)}</span>`
      : n && kg ? `Average log weight <b>${nf.format(Math.round(kg / n))} kg</b> (${fmtWeight(kg)} ÷ ${n} logs). Use “Count from photo” to see thick and thin logs separately.`
      : n ? 'Enter the weight to see log weights' : 'Count the cut ends in the back photo – the app works out each log’s weight from its size';
  };
  input.oninput = () => { st.count = input.value === '' ? '' : Math.round(num(input.value)); st.dots = null; update(); onChange?.(); };
  $('[data-count]', host).onclick = () => {
    const back = getBack();
    if (!back?.blob) { toast('Add the back photo (cut ends) first'); return; }
    openLogCounter(back.blob, st.dots, (dots) => { st.dots = dots; st.count = dots.length; input.value = dots.length || ''; update(); onChange?.(); });
  };
  update();
  return {
    update,
    // Auto-count when a new back photo is added and no count was entered yet.
    async autoCount(blob) {
      if (num(st.count)) return;
      try {
        const dots = await detectLogEnds(blob);
        if (!dots.length || num(st.count)) return;
        st.dots = dots; st.count = dots.length; input.value = dots.length;
        update(); onChange?.();
        toast(`Auto-counted ${dots.length} logs – tap “Count from photo” to check`);
      } catch { /* ignore */ }
    },
  };
}

// Learn how average log weight affects price: past loads with similar kg/log (same wood first).
function kplPremium(wood, kpl) {
  let pts = state.orders.filter((o) => o.woodType === wood && orderLogKg(o));
  let scope = wood;
  if (pts.length < 3) { pts = state.orders.filter((o) => orderLogKg(o)); scope = 'all woods'; }
  const rows = pts.map((o) => ({ kpl: orderLogKg(o), prem: orderPremium(o) })).filter((x) => x.prem != null);
  if (!rows.length) return { n: 0, p: 0, scope };
  const typical = rows.map((x) => x.kpl).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  let sw = 0; let sp = 0; let similar = 0;
  for (const x of rows) {
    const dl = Math.log(x.kpl / kpl);
    const w = Math.exp(-(dl * dl) / (2 * 0.25 * 0.25));
    sw += w; sp += w * x.prem;
    if (Math.abs(dl) < 0.25) similar++;
  }
  if (sw < 0.05) return { n: rows.length, p: 0, scope, typical, similar: 0, avg: 0 };
  const avg = sp / sw;
  return { n: rows.length, p: avg * (sw / (sw + 2)), scope, typical, similar, avg };
}
