'use strict';
/* =========================================================
   Smart features: weight slip scanning (OCR) and wood price outlook.
   Uses helpers defined in app.js at call time.
   ========================================================= */

/* ---------- Weight slip scanner (Tesseract OCR, bundled in vendor/ocr) ---------- */
let tessLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tessLoading) {
    tessLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/ocr/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => { tessLoading = null; reject(new Error('Could not load the scanner. Check your internet and try again.')); };
      document.head.appendChild(s);
    });
  }
  return tessLoading;
}

// Grey-scale, boost contrast and resize so printed slips read better.
async function prepareForOcr(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(2, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.5 + 140));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function ocrImage(blob, onProgress) {
  await loadTesseract();
  const base = new URL('vendor/ocr/', location.href).href;
  onProgress?.(0, 'Starting scanner…');
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base + 'lang',
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress, 'Reading the slip…');
      else onProgress?.(null, 'Starting scanner…');
    },
  });
  try {
    const canvas = await prepareForOcr(blob);
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    worker.terminate();
  }
}

const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Score how well an OCR'd name matches a saved name (0..1).
function nameScore(a, b) {
  const A = normText(a).split(' ').filter((w) => w.length > 1);
  const B = normText(b).split(' ').filter((w) => w.length > 1);
  if (!A.length || !B.length) return 0;
  const near = (x, y) => x === y || (x.length > 3 && y.length > 3 && (x.startsWith(y) || y.startsWith(x)));
  const hits = B.filter((w) => A.some((x) => near(x, w))).length;
  return hits / Math.max(B.length, 1) * (hits / Math.max(A.length, 1)) ** 0.25;
}

function parseSlip(raw) {
  // Common OCR fixes: O/o read instead of 0 inside numbers, stray commas.
  const text = String(raw || '')
    .replace(/(?<=\d)[Oo](?=\d)|(?<=\d)[Oo]\b|\b[Oo](?=\d)/g, '0')
    .replace(/(\d),(?=\d{2,3}\b)/g, '$1');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = {};

  const numIn = (s) => { const m = String(s).replace(/(\d)\s(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const after = (re) => {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (!m) continue;
      const rest = lines[i].slice(m.index + m[0].length);
      let v = numIn(rest);
      if (v == null && lines[i + 1]) v = numIn(lines[i + 1]);
      if (v != null) return { v, line: lines[i] };
    }
    return null;
  };

  // ----- Weights -----
  const NET = /\bnet\b(?!\s*(amount|amt|payable|value|rs))\.?\s*(wt|weight|wgt)?/i;
  let net = after(NET);
  const gross = after(/\b(gross|grs|loaded)\b\.?\s*(wt|weight|wgt)?/i);
  const tare = after(/\b(tare|empty|unloaded)\b\.?\s*(wt|weight|wgt)?/i);
  // Table layout: "Gross  Tare  Net" header, numbers on the next line
  if (!net) {
    const hi = lines.findIndex((l) => /gross/i.test(l) && /tare/i.test(l) && /net/i.test(l) && !/\d{3}/.test(l));
    if (hi >= 0 && lines[hi + 1]) {
      const nums = (lines[hi + 1].match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n >= 10);
      if (nums.length >= 3) { net = { v: nums[2], line: lines[hi] }; out.gross = nums[0]; out.tare = nums[1]; }
    }
  }
  if (gross) out.gross = gross.v;
  if (tare) out.tare = tare.v;
  let netKg = null;
  if (net) {
    const isTon = /\b(mt|ton|tons|tonne|tonnes)\b/i.test(net.line) || (net.v < 100 && !Number.isInteger(net.v));
    netKg = isTon ? net.v * 1000 : net.v;
  } else if (out.gross && out.tare && out.gross > out.tare) {
    netKg = out.gross - out.tare;
    if (out.gross < 100) netKg *= 1000;
  }
  if (netKg && netKg >= 50 && netKg <= 200000) {
    out.weightKg = Math.round(netKg * 100) / 100;
    if (settings.defaultUnit === 'ton') { out.weight = round2(out.weightKg / 1000); out.unit = 'ton'; } else { out.weight = out.weightKg; out.unit = 'kg'; }
  }

  // ----- Money -----
  const rate = after(/\b(rate|price)\b/i);
  if (rate && rate.v >= 1) out.rate = rate.v;
  const amt = after(/\b(net\s*amount|total\s*amount|grand\s*total|amount|total|value)\b/i);
  if (amt && amt.v >= 1000) out.total = amt.v; // ignore small weighbridge fees

  // ----- Vehicle, slip number, date -----
  const up = text.toUpperCase();
  const veh = up.match(/\b([A-Z]{2})[\s\-.]*(\d{1,2})[\s\-.]*([A-Z]{1,3})?[\s\-.]*(\d{3,4})\b/);
  if (veh) out.vehicle = [veh[1], veh[2].padStart(2, '0'), veh[3], veh[4]].filter(Boolean).join(' ');
  const slip = after(/\b(ticket|slip|token|serial|sl|receipt|rst|bill|kata|weighment)\s*(no|number|#)?\b\.?/i);
  if (slip && Number.isInteger(slip.v) && slip.v > 0) out.slipNo = String(slip.v);
  const dm = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (dm) {
    let [, d, m, y] = dm.map(Number);
    if (y < 100) y += 2000;
    const dt = new Date(y, m - 1, d);
    const ok = m >= 1 && m <= 12 && d >= 1 && d <= 31 && dt.getMonth() === m - 1 && y >= 2015 && dt - Date.now() < 3 * 864e5;
    if (ok) out.date = ymd(dt);
  }

  // ----- Parties -----
  const whole = ' ' + normText(text) + ' ';
  const best = (type, candidate) => {
    let pick = null; let score = 0;
    for (const p of parties(type)) {
      const exact = whole.includes(' ' + normText(p.name) + ' ');
      const s = exact ? 1 + p.name.length / 100 : candidate ? nameScore(candidate, p.name) : 0;
      if (s > score) { score = s; pick = p; }
    }
    return score >= 0.6 ? pick : null;
  };
  const labelled = (re) => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) {
        const v = l.slice(m.index + m[0].length).replace(/^[\s:.\-–]+/, '').replace(/\s{2,}.*$/, '').trim();
        if (/[a-z]{3}/i.test(v)) return v.replace(/[^A-Za-z0-9 .&'-]/g, '').trim();
      }
    }
    return null;
  };
  const supName = labelled(/\b(supplier|seller|party|consignor|customer|from|name)\b\s*(name)?\s*[:\-.]/i);
  const buyName = labelled(/\b(buyer|consignee|company|deliver(?:y|ed)?\s*to|to)\b\s*(name)?\s*[:\-.]/i);
  out.supplier = best('supplier', supName);
  out.buyer = best('buyer', buyName);
  if (!out.supplier && supName) out.newSupplier = supName;
  if (!out.buyer && buyName && buyName !== supName) out.newBuyer = buyName;

  // ----- Wood -----
  const woods = getWoods();
  out.wood = woods.find((w) => whole.includes(' ' + normText(w) + ' ')) || null;
  if (!out.wood) {
    const mat = labelled(/\b(material|item|goods|commodity|product|wood)\b\s*(name)?\s*[:\-.]/i);
    if (mat) {
      const near = woods.find((w) => nameScore(mat, w) >= 0.6);
      if (near) out.wood = near; else out.newWood = mat.replace(/\b(wood|logs?)\b/ig, '').trim() || mat;
    }
  }
  return out;
}

/* =========================================================
   Wood price outlook
   Works from the first bill. Combines four things:
   1. Your bills  – the price trend in your recent bills (weighted by tonnage, newer bills count more)
   2. Season      – the usual Kerala log market cycle (and your own last-year pattern once you have it)
   3. Weather     – rain forecast for your area: rain stops felling & transport, so fewer logs and higher prices
   4. Yearly rise – the normal slow price rise over months (learned from your bills after ~6 months)
   ========================================================= */
function usedWoods() {
  const count = {};
  state.orders.forEach((o) => { if (o.woodType) count[o.woodType] = (count[o.woodType] || 0) + 1; });
  return Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
}

// Typical Kerala log market price level by month (mid-month, Jan..Dec).
// Dry Jan–Mar: peak felling, most logs, lowest prices. Jun–Sep monsoon: felling and transport stop,
// supply tight, prices highest. Oct–Nov north-east monsoon keeps supply tight. Dec: rains ease.
const SEASON_INDEX = [0.96, 0.95, 0.96, 0.98, 1.00, 1.04, 1.07, 1.08, 1.06, 1.03, 1.03, 1.00];
const SEASON_NOTE = [
  'Dry season – peak felling, more logs arriving',
  'Dry season – peak felling, more logs arriving',
  'Dry season – plenty of logs; year-end buying by mills',
  'Pre-monsoon – mills stock up before the rains',
  'Pre-monsoon – mills stock up before the rains',
  'Monsoon starts – felling and transport slow down',
  'Monsoon – felling stops, fewer logs arrive',
  'Monsoon – log supply is tight',
  'Monsoon ending – supply slowly returns',
  'North-east monsoon – supply still tight',
  'North-east monsoon – supply still tight',
  'Rains ease – felling restarts, more logs',
];
// Usual rainy days (≥10 mm) per month in central Kerala, used to judge "more rain than normal".
const NORMAL_RAINY_DAYS = [1, 1, 2, 6, 9, 21, 21, 17, 13, 14, 9, 3];
// How strongly each wood reacts to supply changes (rubber = 1).
const WOOD_SENS = { 'silver oak': 1.6, 'jungle wood': 1.4, matti: 1.3, albizia: 1.2, acacia: 1.1, mango: 1.1, poplar: 1.1, casuarina: 1.1 };
const woodSens = (w) => WOOD_SENS[String(w || '').toLowerCase()] || 1;
const DEFAULT_DRIFT = 5; // % per year – normal price rise when there is not enough history yet
const DEFAULT_LOC = { name: 'Perumbavoor', lat: 10.115, lon: 76.478 };
const HORIZON = 21; // days ahead (3 weeks)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function seasonIdx(d) {
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const pos = d.getMonth() + (d.getDate() - 0.5) / dim - 0.5; // months after mid-January
  const i = Math.floor(pos); const f = pos - i;
  const a = SEASON_INDEX[(i + 12) % 12]; const b = SEASON_INDEX[(i + 13) % 12];
  return a + (b - a) * f;
}
const seasonChangePct = (from, days) => (seasonIdx(addUnit(from, 'day', days)) / seasonIdx(from) - 1) * 100;

/* ---------- Weather (Open-Meteo, free, no key) ---------- */
const myLoc = () => settings.location || DEFAULT_LOC;
const locKey = () => { const l = myLoc(); return `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`; };
function readCache(k) {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && v.key === locKey() ? v : null; } catch { return null; }
}
function writeCache(k, v) { try { localStorage.setItem(k, JSON.stringify({ ...v, key: locKey() })); } catch { /* full */ } }

let weatherBusy = null;
// Returns true when new weather data arrived (so the page can redraw).
function ensureWeather(force) {
  if (weatherBusy) return weatherBusy;
  weatherBusy = (async () => {
    let changed = false;
    const L = myLoc();
    const fc = readCache('lb-weather');
    if (force || !fc || Date.now() - fc.at > 6 * 36e5) {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&daily=precipitation_sum&past_days=14&forecast_days=16&timezone=auto`);
        if (r.ok) {
          const j = await r.json();
          writeCache('lb-weather', { at: Date.now(), days: j.daily.time.map((t, i) => [t, j.daily.precipitation_sum[i] ?? 0]) });
          changed = true;
        }
      } catch { /* offline */ }
    }
    // Past rain for the period of your bills, to learn how rain affected your prices.
    const first = state.orders.reduce((m, o) => (o.date < m ? o.date : m), todayStr());
    const end = ymd(addUnit(startOf(new Date(), 'day'), 'day', -6));
    const hist = readCache('lb-rainhist');
    if (first < end && (force || !hist || hist.from > first || Date.now() - hist.at > 7 * 864e5)) {
      try {
        const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${L.lat}&longitude=${L.lon}&start_date=${first}&end_date=${end}&daily=precipitation_sum&timezone=auto`);
        if (r.ok) {
          const j = await r.json();
          writeCache('lb-rainhist', { at: Date.now(), from: first, days: j.daily.time.map((t, i) => [t, j.daily.precipitation_sum[i] ?? 0]) });
          changed = true;
        }
      } catch { /* offline */ }
    }
    return changed;
  })().finally(() => { weatherBusy = null; });
  return weatherBusy;
}

// Rain map: date -> mm, from history + forecast caches.
function rainMap() {
  const m = new Map();
  for (const k of ['lb-rainhist', 'lb-weather']) (readCache(k)?.days || []).forEach(([d, mm]) => m.set(d, mm));
  return m;
}

// Learn from your own bills: does more rain than usual in the 2 weeks before a bill mean a higher price?
// Returns % price change per extra rainy day, or null if not enough data.
let rainLearnCache = { sig: '', v: null };
function learnedRainEffect() {
  const rain = rainMap();
  const sig = state.orders.length + '|' + rain.size;
  if (rainLearnCache.sig === sig) return rainLearnCache.v;
  let v = null;
  if (rain.size > 60) {
    // Each bill's price relative to its wood's 60-day local average removes wood type and slow trends.
    const byWood = {};
    state.orders.forEach((o) => { if (o.woodType && orderKg(o) > 0 && num(o.total) > 0) (byWood[o.woodType] ||= []).push(o); });
    const xs = []; const ys = [];
    for (const os of Object.values(byWood)) {
      os.sort((a, b) => a.date.localeCompare(b.date));
      const t = os.map((o) => parseYmd(o.date).getTime());
      const p = os.map((o) => pricePer(num(o.total), orderKg(o)));
      for (let i = 0; i < os.length; i++) {
        let s = 0; let n = 0;
        for (let j = 0; j < os.length; j++) if (Math.abs(t[j] - t[i]) <= 30 * 864e5) { s += p[j]; n++; }
        if (n < 4) continue;
        const d = parseYmd(os[i].date);
        let rainy = 0; let known = 0;
        for (let k = 1; k <= 14; k++) {
          const mm = rain.get(ymd(addUnit(d, 'day', -k)));
          if (mm != null) { known++; if (mm >= 10) rainy++; }
        }
        if (known < 10) continue;
        xs.push(rainy - (NORMAL_RAINY_DAYS[d.getMonth()] * 14) / 30);
        ys.push((p[i] / (s / n) - 1) * 100);
      }
    }
    if (xs.length >= 15) {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let sxy = 0; let sxx = 0; let syy = 0;
      xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
      if (sxx > 0) v = { slope: sxy / sxx, r: syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0, n: xs.length };
    }
  }
  rainLearnCache = { sig, v };
  return v;
}

function weatherSignal(sens) {
  const fc = readCache('lb-weather');
  if (!fc) return null;
  const today = startOf(new Date(), 'day');
  const rain = new Map(fc.days);
  let rainyNext = 0; let mmNext = 0; let known = 0;
  for (let k = 1; k <= 14; k++) {
    const mm = rain.get(ymd(addUnit(today, 'day', k)));
    if (mm != null) { known++; mmNext += mm; if (mm >= 10) rainyNext++; }
  }
  if (known < 7) return null;
  rainyNext = Math.round((rainyNext * 14) / known);
  const normal = Math.round((NORMAL_RAINY_DAYS[addUnit(today, 'day', 7).getMonth()] * 14) / 30);
  const learned = learnedRainEffect();
  const base = 0.5; // % per extra rainy day (felling and transport stop)
  let perDay = base;
  if (learned) { const w = learned.n / (learned.n + 40); perDay = (1 - w) * base + w * clamp(learned.slope, -1, 3); }
  const pct = clamp((rainyNext - normal) * perDay * sens, -3, 6);
  return { pct, rainyNext, normal, mm: Math.round(mmNext), place: myLoc().name, learned, at: fc.at };
}

/* ---------- From your bills ---------- */
const billPrice = (o) => pricePer(num(o.total), orderKg(o));

function billTrend(os, today) {
  const pts = os.map((o) => ({ x: (parseYmd(o.date) - today) / 864e5, y: billPrice(o), t: Math.max(orderKg(o) / 1000, 0.5) }))
    .filter((p) => p.x >= -90 && p.y);
  if (pts.length < 3) return null;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 7) return null;
  let sw = 0; let sx = 0; let sy = 0;
  pts.forEach((p) => { p.w = p.t * Math.exp(p.x / 45); sw += p.w; sx += p.w * p.x; sy += p.w * p.y; });
  const mx = sx / sw; const my = sy / sw;
  let sxy = 0; let sxx = 0;
  pts.forEach((p) => { sxy += p.w * (p.x - mx) * (p.y - my); sxx += p.w * (p.x - mx) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const ys = pts.map((p) => p.y);
  const now = clamp(my - slope * mx, Math.min(...ys), Math.max(...ys));
  const shrink = pts.length / (pts.length + 4);
  return { pct: clamp(((slope * HORIZON) / now) * 100 * shrink, -8, 8), n: pts.length, current: now, perWeek: ((slope * 7) / now) * 100 };
}

// Long-term yearly rise from your bills (season removed). Needs ~6 months.
function yearlyDrift(os, today) {
  const pts = os.map((o) => ({ x: (parseYmd(o.date) - today) / 864e5, y: billPrice(o) / seasonIdx(parseYmd(o.date)) })).filter((p) => p.y);
  if (pts.length < 8) return { pct: DEFAULT_DRIFT, learned: false };
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < 180) return { pct: DEFAULT_DRIFT, learned: false };
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length; const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let sxy = 0; let sxx = 0;
  pts.forEach((p) => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; });
  const yearly = clamp(((sxx ? sxy / sxx : 0) * 365 / my) * 100, -10, 20);
  const w = Math.min(1, span / 365);
  return { pct: w * yearly + (1 - w) * DEFAULT_DRIFT, learned: true };
}

// Your own seasonal pattern: how price moved over the same 3 weeks in earlier years.
function ownSeason(os, today) {
  const avg = (s, e) => {
    let t = 0; let kg = 0; let n = 0;
    for (const o of os) { const d = parseYmd(o.date); if (d >= s && d < e) { t += num(o.total); kg += orderKg(o); n++; } }
    return n ? pricePer(t, kg) : null;
  };
  const out = [];
  for (let y = 1; y <= 3; y++) {
    const ref = addUnit(today, 'year', -y);
    const now = avg(addUnit(ref, 'day', -21), addUnit(ref, 'day', 1));
    const ahead = avg(addUnit(ref, 'day', 10), addUnit(ref, 'day', 35));
    if (now && ahead) out.push((ahead / now - 1) * 100);
  }
  return out.length ? { pct: out.reduce((a, b) => a + b, 0) / out.length, years: out.length } : null;
}

function priceOutlook(wood) {
  const today = startOf(new Date(), 'day');
  const os = wood ? state.orders.filter((o) => o.woodType === wood && orderKg(o) > 0 && num(o.total) > 0) : [];
  if (wood && !os.length) return { ready: false, wood, reason: 'No bills with this wood yet.' };
  const sens = woodSens(wood);
  const factors = [];

  const trend = os.length ? billTrend(os, today) : null;
  if (trend) factors.push({ icon: '🧾', label: 'Your bills', pct: trend.pct * 0.4, text: `${trend.n} bills in the last 3 months: ${trend.perWeek >= 0 ? 'rising' : 'falling'} ${Math.abs(trend.perWeek).toFixed(1)}% a week` });
  else if (os.length) factors.push({ icon: '🧾', label: 'Your bills', pct: 0, text: `${os.length} bill${os.length === 1 ? '' : 's'} so far – need 3 bills over a week or more to see a trend` });

  const prior = seasonChangePct(today, HORIZON) * sens;
  const own = os.length ? ownSeason(os, today) : null;
  const seasonPct = (own ? 0.5 * prior + 0.5 * own.pct : prior) * (trend ? 0.6 : 1);
  const note = SEASON_NOTE[addUnit(today, 'day', 10).getMonth()];
  factors.push({ icon: '📅', label: 'Season', pct: seasonPct, text: note + (own ? ` · your bills last year: ${own.pct >= 0 ? '+' : ''}${own.pct.toFixed(1)}% at this time` : '') });

  const w = weatherSignal(sens);
  if (w) {
    const diff = w.rainyNext - w.normal;
    factors.push({
      icon: '🌧️', label: 'Weather', pct: w.pct,
      text: `${w.place}: ${w.rainyNext} rainy days expected in next 2 weeks (usual ${w.normal})${diff > 1 && w.pct > 0.3 ? ' – felling & transport slow, fewer logs' : diff < -1 && w.pct < -0.3 ? ' – dry, more logs can move' : diff > 1 || diff < -1 ? ' – small effect on your prices so far' : ' – normal for the season'}`
        + (w.learned ? ` · in your bills, each extra rainy day meant ${w.learned.slope >= 0 ? '+' : ''}${w.learned.slope.toFixed(1)}%` : ''),
    });
  } else {
    factors.push({ icon: '🌧️', label: 'Weather', pct: 0, text: 'Rain forecast not loaded – open the app with internet' });
  }

  const drift = yearlyDrift(os, today);
  const driftPct = (drift.pct * HORIZON) / 365;
  factors.push({ icon: '📈', label: 'Yearly rise', pct: driftPct, text: `${drift.pct >= 0 ? '+' : ''}${drift.pct.toFixed(1)}% a year ${drift.learned ? 'from your bills' : '(normal rise; learns from your bills after 6 months)'}` });

  const pct = factors.reduce((a, f) => a + f.pct, 0);
  const direction = pct > 1.5 ? 'up' : pct < -1.5 ? 'down' : 'flat';

  let current = trend?.current;
  if (!current && os.length) {
    const recent = os.filter((o) => (today - parseYmd(o.date)) / 864e5 <= 60);
    const use = recent.length ? recent : [...os].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const s = summarize(use); current = pricePer(s.total, s.kg);
  }
  let score = (os.length >= 10 ? 2 : os.length >= 3 ? 1 : 0) + (w ? 1 : 0) + (own ? 1 : 0);
  const signs = factors.filter((f) => Math.abs(f.pct) > 0.3).map((f) => Math.sign(f.pct));
  if (signs.length >= 2 && signs.every((s) => s === signs[0])) score++;
  const confidence = score >= 4 ? 'High' : score >= 2 ? 'Medium' : 'Low';

  const longPct = (months) => (seasonIdx(addUnit(today, 'month', months)) / seasonIdx(today) - 1) * 100 * sens + (drift.pct * months) / 12;
  return {
    ready: true, wood, direction, pct, current, predicted: current ? round2(current * (1 + pct / 100)) : null,
    confidence, factors, m6: longPct(6), m10: longPct(10), bills: os.length,
  };
}

const sgn = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%';

function outlookRow(o) {
  const arrow = o.direction === 'up' ? '▲' : o.direction === 'down' ? '▼' : '►';
  const cls = o.direction === 'up' ? 'up' : o.direction === 'down' ? 'down' : 'muted';
  const word = o.direction === 'up' ? 'may go up' : o.direction === 'down' ? 'may go down' : 'likely steady';
  return `<li>
    <div class="row"><span class="grow"><b>${esc(o.wood || 'Wood market (general)')}</b> <span class="${cls}">${arrow} ${word} ${o.direction === 'flat' ? '' : '~' + Math.abs(o.pct).toFixed(1) + '%'}</span></span>
      <span class="conf conf-${o.confidence.toLowerCase()}">${o.confidence}</span></div>
    ${o.current ? `<div class="small muted">Now ${money0(o.current)}${priceLabel()} → in 3 weeks ~${money0(o.predicted)}${priceLabel()}</div>` : ''}
    <div class="small muted">Later: 6 months ${sgn(o.m6)} · 10 months ${sgn(o.m10)}</div>
    <details class="why"><summary>Why?</summary><ul>${o.factors.map((f) => `<li><span>${f.icon} <b>${f.label}</b> ${esc(f.text)}</span><b class="${f.pct > 0.05 ? 'up' : f.pct < -0.05 ? 'down' : 'muted'}">${sgn(f.pct)}</b></li>`).join('')}</ul></details>
  </li>`;
}

function outlookCard(woods, { title = 'Price outlook · next 3 weeks', limit = 8 } = {}) {
  let rows = woods.map(priceOutlook).filter((o) => o.ready).slice(0, limit);
  if (!rows.length) rows = [priceOutlook(null)];
  return `<div class="card outlook"><h3>${ICON.bell} ${title}</h3>
    <ul class="rank">${rows.map(outlookRow).join('')}</ul>
    <p class="small muted" style="margin:8px 0 0">Uses your bills, the Kerala log season, the rain forecast for ${esc(myLoc().name)} and the normal yearly price rise. More bills = better forecast. A guide, not a guarantee.</p></div>`;
}

async function maybeNotifyOutlook() {
  if (!settings.priceAlerts || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayStr();
  if (settings.lastAlertDay === today) return;
  const moves = usedWoods().map(priceOutlook).filter((o) => o.ready && o.direction !== 'flat' && o.confidence !== 'Low');
  settings.lastAlertDay = today; saveSettings();
  if (!moves.length) return;
  const body = moves.map((o) => `${o.wood}: ${o.direction === 'up' ? '▲ may rise' : '▼ may fall'} ~${Math.abs(o.pct).toFixed(1)}%${o.predicted ? ` (${money0(o.predicted)}${priceLabel()})` : ''}`).join('\n');
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'price-outlook' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification('Wood price outlook – next 3 weeks', opts);
    else new Notification('Wood price outlook – next 3 weeks', opts);
  } catch { /* notifications not available */ }
}
