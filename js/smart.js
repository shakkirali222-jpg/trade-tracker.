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

/* ---------- Wood price outlook ---------- */
function usedWoods() {
  return [...new Set(state.orders.map((o) => o.woodType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Forecast the price direction for the next 2–3 weeks:
// 70% from how the price moved at this time in earlier years, 30% from the last 4 weeks' trend.
function priceOutlook(wood) {
  const os = state.orders.filter((o) => o.woodType === wood && orderKg(o) > 0 && num(o.total) > 0);
  if (!os.length) return { ready: false, wood, reason: 'No orders with this wood yet.' };
  const first = os.reduce((m, o) => (o.date < m ? o.date : m), os[0].date);
  const today = startOf(new Date(), 'day');
  const days = Math.round((today - parseYmd(first)) / 864e5);
  if (days < 365) {
    const m = Math.max(0, Math.floor(days / 30.4));
    return { ready: false, wood, months: m, reason: `Price alerts start after 1 year of data – ${m} of 12 months so far.` };
  }
  const avg = (s, e) => {
    let t = 0; let kg = 0; let n = 0;
    for (const o of os) { const d = parseYmd(o.date); if (d >= s && d < e) { t += num(o.total); kg += orderKg(o); n++; } }
    return n ? { price: pricePer(t, kg), n } : null;
  };
  const seasonal = [];
  for (let y = 1; y <= 3; y++) {
    const ref = addUnit(today, 'year', -y);
    const now = avg(addUnit(ref, 'day', -21), addUnit(ref, 'day', 1));
    const ahead = avg(addUnit(ref, 'day', 10), addUnit(ref, 'day', 35));
    if (now && ahead) seasonal.push((ahead.price - now.price) / now.price);
  }
  const recent = avg(addUnit(today, 'day', -27), addUnit(today, 'day', 1));
  const before = avg(addUnit(today, 'day', -55), addUnit(today, 'day', -27));
  if (!recent) return { ready: false, wood, reason: 'No orders in the last 4 weeks to compare.' };
  if (!seasonal.length) return { ready: false, wood, reason: 'Not enough orders around this time last year.' };
  const s = seasonal.reduce((a, b) => a + b, 0) / seasonal.length;
  const tr = before ? (recent.price - before.price) / before.price : 0;
  const change = 0.7 * s + 0.3 * tr * 0.75;
  const direction = change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'flat';
  const agree = Math.sign(s) === Math.sign(tr) && Math.abs(tr) > 0.01;
  const confidence = seasonal.length >= 2 && agree ? 'High' : (agree || seasonal.length >= 2 ? 'Medium' : 'Low');
  return {
    ready: true, wood, direction, pct: change * 100, current: recent.price,
    predicted: round2(recent.price * (1 + change)), seasonalPct: s * 100, trendPct: tr * 100, confidence, years: seasonal.length,
  };
}

function outlookRow(o) {
  const arrow = o.direction === 'up' ? '▲' : o.direction === 'down' ? '▼' : '►';
  const cls = o.direction === 'up' ? 'up' : o.direction === 'down' ? 'down' : 'muted';
  const word = o.direction === 'up' ? 'may go up' : o.direction === 'down' ? 'may go down' : 'likely steady';
  return `<li>
    <div class="row"><span class="grow"><b>${esc(o.wood)}</b> <span class="${cls}">${arrow} ${word} ${o.direction === 'flat' ? '' : '~' + Math.abs(o.pct).toFixed(1) + '%'}</span></span>
      <span class="small muted">${o.confidence} confidence</span></div>
    <div class="small muted">Now ${money0(o.current)}${priceLabel()} → expected ${money0(o.predicted)}${priceLabel()} ·
      same time last year ${o.seasonalPct >= 0 ? '+' : ''}${o.seasonalPct.toFixed(1)}%, last 4 weeks ${o.trendPct >= 0 ? '+' : ''}${o.trendPct.toFixed(1)}%</div>
  </li>`;
}

function outlookCard(woods, { onlyMoves = false, title = 'Price outlook · next 2–3 weeks' } = {}) {
  const all = woods.map(priceOutlook);
  const ready = all.filter((o) => o.ready && (!onlyMoves || o.direction !== 'flat'));
  if (!ready.length) {
    if (onlyMoves && all.some((o) => o.ready)) return '';
    const waiting = all.filter((o) => o.months != null);
    const best = waiting.reduce((m, o) => Math.max(m, o.months), 0);
    const reason = all.length === 1 ? all[0].reason
      : !all.length ? 'Price alerts start after 1 year of data.'
      : waiting.length === all.length ? `Price alerts start after 1 year of data – ${best} of 12 months so far.`
      : 'Not enough orders yet around this time of year to predict prices.';
    return `<div class="card"><h3>${ICON.bell} ${title}</h3><p class="small muted" style="margin:0">${esc(reason)}</p>
      ${!all.length || !all.every((o) => o.months != null) ? '' : `<div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, (best / 12) * 100)}%"></i></div>`}</div>`;
  }
  return `<div class="card outlook"><h3>${ICON.bell} ${title}</h3>
    <ul class="rank">${ready.map(outlookRow).join('')}</ul>
    <p class="small muted" style="margin:8px 0 0">Based on your own orders: how prices moved at this time in earlier years, plus the last 4 weeks. A guide, not a guarantee.</p></div>`;
}

async function maybeNotifyOutlook() {
  if (!settings.priceAlerts || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayStr();
  if (settings.lastAlertDay === today) return;
  const moves = usedWoods().map(priceOutlook).filter((o) => o.ready && o.direction !== 'flat');
  settings.lastAlertDay = today; saveSettings();
  if (!moves.length) return;
  const body = moves.map((o) => `${o.wood}: ${o.direction === 'up' ? '▲ may rise' : '▼ may fall'} ~${Math.abs(o.pct).toFixed(1)}% (${money0(o.predicted)}${priceLabel()})`).join('\n');
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'price-outlook' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification('Wood price outlook – next 2–3 weeks', opts);
    else new Notification('Wood price outlook – next 2–3 weeks', opts);
  } catch { /* notifications not available */ }
}
