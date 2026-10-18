'use strict';

/* =========================================================
   Log Broker — order book & sales analytics for a wood logs broker
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

/* ---------- Icons ---------- */
const ICON = {
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24"><path d="M3 21l1.7-4.9A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.3 1.6 1.8 3.6 4.3 4.6l1.2-1.2 2 1-.4 1.4c-3.8.4-7.6-3.3-7.6-7.1l1.4-.4 1 2z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h0"/></svg>',
  log: '<svg viewBox="0 0 24 24"><ellipse cx="7" cy="12" rx="4" ry="6"/><path d="M7 6h12a4 6 0 0 1 0 12H7"/><ellipse cx="7" cy="12" rx="1.5" ry="2.5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0"/></svg>',
};

/* ---------- Settings ---------- */
const DEFAULT_SETTINGS = {
  businessName: '',
  currency: '₹',
  commissionPct: 1,
  defaultUnit: 'ton',
  priceUnit: 'ton',
  voiceLang: 'en-IN',
  theme: 'auto',
  lastBackup: null,
  woodTypes: null,
  priceAlerts: false,
  lastAlertDay: '',
};
const DESIGNER = 'Shakkir Ali';
let settings = loadSettings();
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('lb-settings') || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  try { localStorage.setItem('lb-settings', JSON.stringify(settings)); } catch { /* ignore */ }
}

/* ---------- App state ---------- */
const state = {
  parties: [],
  orders: [],
  dash: { unit: 'month', offset: 0 },
  ordersFilter: { q: '', status: 'all', range: 'all', from: '', to: '' },
  partiesTab: 'supplier',
  partiesQ: '',
  report: { type: 'supplier', partyId: 'all', unit: 'month', range: '12m', from: '', to: '' },
};
let charts = [];
let objectUrls = [];

async function loadAll() {
  [state.parties, state.orders] = await Promise.all([DB.all('parties'), DB.all('orders')]);
  state.parties.sort((a, b) => a.name.localeCompare(b.name));
}
const partyById = (id) => state.parties.find((p) => p.id === id);
const partyName = (id) => partyById(id)?.name || 'Unknown';
const parties = (type) => state.parties.filter((p) => p.type === type);

/* ---------- Formatting ---------- */
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (n) => (n < 0 ? '-' : '') + settings.currency + nf.format(Math.abs(round2(n)));
const money0 = (n) => settings.currency + nf0.format(Math.round(n || 0));
function moneyShort(n) {
  const a = Math.abs(n);
  const c = settings.currency;
  if (a >= 1e7) return c + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (a >= 1e5) return c + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (a >= 1e3) return c + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return c + nf0.format(n);
}
const orderKg = (o) => (o.unit === 'ton' ? num(o.weight) * 1000 : num(o.weight));
function fmtWeight(kg) {
  if (!kg) return '0 kg';
  return kg >= 1000 ? nf.format(round2(kg / 1000)) + ' t' : nf.format(round2(kg)) + ' kg';
}
const priceLabel = () => (settings.priceUnit === 'ton' ? '/ton' : '/kg');
function pricePer(total, kg) {
  if (!kg) return null;
  return round2(settings.priceUnit === 'ton' ? total / (kg / 1000) : total / kg);
}
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ---------- Dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
function parseYmd(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function startOf(date, unit) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (unit === 'month') d.setDate(1);
  else if (unit === 'year') d.setMonth(0, 1);
  return d;
}
function addUnit(date, unit, n) {
  const d = new Date(date);
  if (unit === 'day') d.setDate(d.getDate() + n);
  else if (unit === 'week') d.setDate(d.getDate() + 7 * n);
  else if (unit === 'month') d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function bucketLabel(d, unit) {
  if (unit === 'day') return `${d.getDate()} ${MON[d.getMonth()]}`;
  if (unit === 'week') return `${d.getDate()} ${MON[d.getMonth()]}`;
  if (unit === 'month') return `${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return String(d.getFullYear());
}
function periodTitle(start, unit) {
  const today = startOf(new Date(), unit).getTime() === start.getTime();
  if (unit === 'day') return (today ? 'Today · ' : '') + `${DAY[start.getDay()]}, ${start.getDate()} ${MON[start.getMonth()]} ${start.getFullYear()}`;
  if (unit === 'week') {
    const end = addUnit(start, 'day', 6);
    return (today ? 'This week · ' : '') + `${start.getDate()} ${MON[start.getMonth()]} – ${end.getDate()} ${MON[end.getMonth()]}`;
  }
  if (unit === 'month') return `${MON[start.getMonth()]} ${start.getFullYear()}` + (today ? ' · This month' : '');
  return String(start.getFullYear()) + (today ? ' · This year' : '');
}
function fmtDate(s) { const d = parseYmd(s); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; }
function fmtDateLong(s) {
  const d = parseYmd(s);
  const diff = Math.round((startOf(new Date(), 'day') - d) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${DAY[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
const inRange = (o, start, end) => { const d = parseYmd(o.date); return d >= start && d < end; };

/* ---------- Aggregation ---------- */
function summarize(list) {
  const s = { total: 0, commission: 0, kg: 0, count: list.length, pending: 0, pendingCount: 0 };
  for (const o of list) {
    s.total += num(o.total);
    s.commission += num(o.commission);
    s.kg += orderKg(o);
    if (!o.commissionReceived) { s.pending += num(o.commission); s.pendingCount++; }
  }
  return s;
}
function bucketize(list, unit, start, count) {
  const out = [];
  const index = new Map();
  let d = new Date(start);
  for (let i = 0; i < count; i++) {
    out.push({ start: d, label: bucketLabel(d, unit), total: 0, commission: 0, kg: 0, count: 0 });
    index.set(d.getTime(), i);
    d = addUnit(d, unit, 1);
  }
  for (const o of list) {
    const i = index.get(startOf(parseYmd(o.date), unit).getTime());
    if (i === undefined) continue;
    const b = out[i];
    b.total += num(o.total); b.commission += num(o.commission); b.kg += orderKg(o); b.count++;
  }
  out.forEach((b) => { b.price = pricePer(b.total, b.kg); });
  return out;
}
function countBuckets(start, end, unit) {
  let n = 0; let d = new Date(start);
  while (d < end && n < 2000) { n++; d = addUnit(d, unit, 1); }
  return n;
}
function groupByParty(list, key) { return groupRows(list, (o) => o[key], partyName); }
function groupRows(list, keyFn, nameFn) {
  const m = new Map();
  for (const o of list) {
    const id = keyFn(o);
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(o);
  }
  return [...m.entries()].map(([id, os]) => ({ id, name: nameFn(id), ...summarize(os), orders: os }))
    .map((r) => ({ ...r, price: pricePer(r.total, r.kg) }))
    .sort((a, b) => b.total - a.total);
}

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function blobUrl(blob) { const u = URL.createObjectURL(blob); objectUrls.push(u); return u; }
function revokeUrls() { objectUrls.forEach((u) => URL.revokeObjectURL(u)); objectUrls = []; }

let sheetCleanup = null;
function openSheet(html, onClose) {
  const wrap = $('#sheet');
  $('#sheetBody').innerHTML = html;
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';
  sheetCleanup = onClose || null;
  $('.sheet', wrap).scrollTop = 0;
  return $('#sheetBody');
}
function closeSheet() {
  const wrap = $('#sheet');
  if (wrap.hidden) return;
  wrap.hidden = true;
  document.body.style.overflow = '';
  $('#sheetBody').innerHTML = '';
  if (sheetCleanup) { const f = sheetCleanup; sheetCleanup = null; f(); }
}
$('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
function openLightbox(url) { const lb = $('#lightbox'); $('img', lb).src = url; lb.hidden = false; }
$('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#lightbox').hidden) $('#lightbox').hidden = true; else closeSheet();
});

function download(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const telLink = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.length === 10) p = '91' + p;
  return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

/* ---------- Theme ---------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = dark ? '#221a13' : '#6b4423';
}
mq.addEventListener?.('change', () => { if (settings.theme === 'auto') { applyTheme(); route(); } });

/* ---------- Charts ---------- */
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const SERIES = ['#c0773a', '#2f8f5b', '#3b78c9', '#b8486b', '#8a6bd1', '#d4a017', '#1f9aa5', '#7a8b2e'];
function chartBase() {
  Chart.defaults.color = css('--muted');
  Chart.defaults.borderColor = css('--border');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}
function makeChart(canvas, config) {
  chartBase();
  const c = new Chart(canvas, config);
  charts.push(c);
  return c;
}
function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
const moneyTick = (v) => moneyShort(v);
const tooltipMoney = (ctx) => `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y2' ? (ctx.raw == null ? '-' : money0(ctx.raw) + priceLabel()) : money0(ctx.raw)}`;

/* =========================================================
   Router
   ========================================================= */
const ROUTES = {
  home: { title: () => settings.businessName || 'Log Broker', render: renderHome },
  orders: { title: () => 'Orders', render: renderOrders },
  new: { title: () => 'New order', render: renderOrderForm, back: true },
  edit: { title: () => 'Edit order', render: renderOrderForm, back: true },
  parties: { title: () => 'Suppliers & Buyers', render: renderParties },
  reports: { title: () => 'Reports', render: renderReports },
  settings: { title: () => 'Settings', render: renderSettings, back: true },
  price: { title: () => 'Price check', render: renderPriceCheck, back: true },
};
let currentRoute = '';
let leaveGuard = null;
function route() {
  const [name, arg] = (location.hash.slice(1) || 'home').split('/');
  const r = ROUTES[name] || ROUTES.home;
  if (leaveGuard) { const g = leaveGuard; leaveGuard = null; g(); }
  closeSheet();
  destroyCharts();
  revokeUrls();
  currentRoute = name;
  $('#title').textContent = r.title();
  $('#backBtn').hidden = !r.back;
  $$('.bottomnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  const view = $('#view');
  view.innerHTML = '';
  window.scrollTo(0, 0);
  r.render(view, arg && decodeURIComponent(arg));
  // Price outlook uses the rain forecast; redraw once when fresh weather arrives.
  if (name === 'home' || name === 'reports' || !ROUTES[name]) {
    ensureWeather().then((changed) => {
      if (!changed || currentRoute !== name || !$('#sheet').hidden) return;
      const y = window.scrollY; route(); window.scrollTo(0, y);
    });
  }
}
window.addEventListener('hashchange', route);
$('#backBtn').addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = '#home'; });

/* =========================================================
   Home / Dashboard
   ========================================================= */
function renderHome(view) {
  const { unit, offset } = state.dash;
  if (!state.orders.length) {
    view.innerHTML = `
      <div class="card empty">
        ${ICON.log}
        <h2>Welcome${settings.businessName ? ', ' + esc(settings.businessName) : ''}!</h2>
        <p>Record each deal between a wood supplier and a plywood company. Your brokerage (${nf.format(settings.commissionPct)}%) is calculated automatically.</p>
        <div class="btn-row" style="margin-top:14px">
          <a class="btn primary" href="#new">${ICON.plus} Add first order</a>
        </div>
        <p class="small" style="margin-top:16px">Want to look around first? <a href="#" id="demoLink">Load sample data</a> (you can delete it later in Settings).</p>
      </div>
      ${creditHtml()}`;
    $('#demoLink').onclick = async (e) => { e.preventDefault(); await loadDemoData(); route(); };
    return;
  }

  const cur = addUnit(startOf(new Date(), unit), unit, offset);
  const next = addUnit(cur, unit, 1);
  const prev = addUnit(cur, unit, -1);
  const curOrders = state.orders.filter((o) => inRange(o, cur, next));
  const s = summarize(curOrders);
  const p = summarize(state.orders.filter((o) => inRange(o, prev, cur)));
  const all = summarize(state.orders);
  const delta = (a, b) => {
    if (!b) return a ? '<span class="up">▲ new</span>' : '<span class="muted">—</span>';
    const d = ((a - b) / b) * 100;
    return `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span> <span class="muted">vs prev</span>`;
  };
  const span = { day: 14, week: 12, month: 12, year: 6 }[unit];
  const chartStart = addUnit(cur, unit, -(span - 1));
  const buckets = bucketize(state.orders, unit, chartStart, span);

  const backupDue = state.orders.length >= 5 && (!settings.lastBackup || Date.now() - settings.lastBackup > 7 * 864e5);
  const topS = groupByParty(curOrders, 'supplierId').slice(0, 5);
  const topB = groupByParty(curOrders, 'buyerId').slice(0, 5);
  const recent = [...state.orders].sort(sortOrdersDesc).slice(0, 5);

  view.innerHTML = `
    ${backupDue ? `<div class="banner">${ICON.alert}<div class="grow">Your data lives only on this phone. Take a backup regularly.</div><a class="btn sm" href="#settings">Backup</a></div>` : ''}
    <a class="card item quick" href="#price">
      <div class="avatar" style="background:var(--primary);color:var(--on-primary)">${ICON.camera}</div>
      <div class="main"><div class="title">Price check</div><div class="sub">Photo of the load → suggested price ${priceLabel()}</div></div>
      ${ICON.right}
    </a>
    <div class="seg" id="dashUnit">
      ${['day', 'week', 'month', 'year'].map((u) => `<button data-u="${u}" class="${u === unit ? 'active' : ''}">${u[0].toUpperCase() + u.slice(1)}</button>`).join('')}
    </div>
    <div class="period-nav">
      <button class="icon-btn" id="prevP" aria-label="Previous">${ICON.left}</button>
      <strong>${periodTitle(cur, unit)}</strong>
      <button class="icon-btn" id="nextP" aria-label="Next" ${offset >= 0 ? 'disabled' : ''}>${ICON.right}</button>
    </div>
    <div class="kpis">
      <div class="kpi primary"><div class="label">Total sales</div><div class="value">${moneyShort(s.total)}</div><div class="delta">${delta(s.total, p.total)}</div></div>
      <div class="kpi accent"><div class="label">My brokerage</div><div class="value">${money0(s.commission)}</div><div class="delta">${delta(s.commission, p.commission)}</div></div>
      <div class="kpi"><div class="label">Orders</div><div class="value">${s.count}</div><div class="delta">${delta(s.count, p.count)}</div></div>
      <div class="kpi"><div class="label">Wood moved</div><div class="value">${fmtWeight(s.kg)}</div><div class="delta muted">${s.kg ? 'avg ' + money0(pricePer(s.total, s.kg)) + priceLabel() : '—'}</div></div>
    </div>
    <div class="card">
      <h3>Sales & brokerage <small>${{ day: 'last 14 days', week: 'last 12 weeks', month: 'last 12 months', year: 'last 6 years' }[unit]}</small></h3>
      <div class="chart-box"><canvas id="dashChart"></canvas></div>
    </div>
    ${outlookCard(usedWoods(), { limit: 4 })}
    <a class="card item" href="#orders" id="pendingCard" style="text-decoration:none;color:inherit">
      <div class="avatar" style="color:var(--warn)">${ICON.alert}</div>
      <div class="main"><div class="title">Brokerage to collect</div><div class="sub">${all.pendingCount} order${all.pendingCount === 1 ? '' : 's'} not yet received · all time</div></div>
      <div class="amt" style="color:var(--warn)">${money0(all.pending)}</div>
    </a>
    <div class="card">
      <h3>Top suppliers <small>${periodTitle(cur, unit).split(' · ')[0]}</small></h3>
      ${rankList(topS, 'supplier')}
    </div>
    <div class="card">
      <h3>Top buyers <small>${periodTitle(cur, unit).split(' · ')[0]}</small></h3>
      ${rankList(topB, 'buyer')}
    </div>
    <div class="card">
      <h3>Recent orders <a class="small" href="#orders">See all</a></h3>
      ${recent.map(orderItem).join('')}
    </div>
    ${creditHtml()}`;

  $$('#dashUnit button').forEach((b) => b.onclick = () => { state.dash = { unit: b.dataset.u, offset: 0 }; route(); });
  $('#prevP').onclick = () => { state.dash.offset--; route(); };
  $('#nextP').onclick = () => { if (state.dash.offset < 0) { state.dash.offset++; route(); } };
  $('#pendingCard').onclick = () => { state.ordersFilter = { ...state.ordersFilter, status: 'pending', range: 'all' }; };
  bindOrderItems(view);
  $$('.rank li[data-party]', view).forEach((li) => li.onclick = () => openPartyReport(li.dataset.party, li.dataset.type));

  const primary = css('--primary-2');
  makeChart($('#dashChart'), {
    type: 'bar',
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          type: 'bar', label: 'Sales', data: buckets.map((b) => round2(b.total)), yAxisID: 'y',
          backgroundColor: buckets.map((b, i) => (i === buckets.length - 1 ? primary : primary + '88')), borderRadius: 6, order: 2,
        },
        {
          type: 'line', label: 'Brokerage', data: buckets.map((b) => round2(b.commission)), yAxisID: 'yc',
          borderColor: css('--accent'), backgroundColor: css('--accent'), tension: .35, pointRadius: 3, order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money0(c.raw)}` } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: moneyTick, maxTicksLimit: 5 } },
        yc: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: moneyTick, maxTicksLimit: 5 } },
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      },
      onClick: (_, els) => {
        if (!els.length) return;
        state.dash.offset = state.dash.offset - (buckets.length - 1 - els[0].index);
        route();
      },
    },
  });
}

function rankList(rows, type) {
  if (!rows.length) return '<p class="muted small">No orders in this period.</p>';
  const max = rows[0].total || 1;
  return `<ul class="rank">${rows.map((r) => `
    <li data-party="${esc(r.id)}" data-type="${type}" style="cursor:pointer">
      <div class="row"><span class="grow ellipsis"><b>${esc(r.name)}</b> <span class="muted small">· ${r.count} order${r.count === 1 ? '' : 's'}${r.price ? ' · ' + money0(r.price) + priceLabel() : ''}</span></span><b>${moneyShort(r.total)}</b></div>
      <div class="bar"><i style="width:${Math.max(3, (r.total / max) * 100)}%"></i></div>
    </li>`).join('')}</ul>`;
}

/* =========================================================
   Orders list
   ========================================================= */
const sortOrdersDesc = (a, b) => (b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

function orderItem(o) {
  const icons = [];
  if (o.slipIds?.length) icons.push(ICON.camera);
  if (o.audioId) icons.push(ICON.wave);
  return `
    <div class="item" data-order="${esc(o.id)}">
      <div class="main">
        <div class="title">${esc(partyName(o.supplierId))}<span class="arrow">→</span>${esc(partyName(o.buyerId))}</div>
        <div class="sub">${[o.woodType, o.weight ? nf.format(num(o.weight)) + ' ' + (o.unit === 'ton' ? 't' : 'kg') : '', o.vehicleNo].filter(Boolean).map(esc).join(' · ') || fmtDate(o.date)}
          ${icons.length ? `<span class="icons-inline">${icons.join('')}</span>` : ''}</div>
      </div>
      <div class="amt">${money0(o.total)}
        <div class="sub"><span class="badge ${o.commissionReceived ? 'paid' : 'pending'}">${money0(o.commission)}</span></div>
      </div>
    </div>`;
}
function bindOrderItems(root) {
  $$('[data-order]', root).forEach((el) => el.onclick = () => showOrder(el.dataset.order));
}

function filteredOrders() {
  const f = state.ordersFilter;
  const q = f.q.trim().toLowerCase();
  let start = null; let end = null;
  const now = new Date();
  if (f.range === 'today') { start = startOf(now, 'day'); end = addUnit(start, 'day', 1); }
  if (f.range === 'week') { start = startOf(now, 'week'); end = addUnit(start, 'week', 1); }
  if (f.range === 'month') { start = startOf(now, 'month'); end = addUnit(start, 'month', 1); }
  if (f.range === 'year') { start = startOf(now, 'year'); end = addUnit(start, 'year', 1); }
  if (f.range === 'custom') {
    start = f.from ? parseYmd(f.from) : null;
    end = f.to ? addUnit(parseYmd(f.to), 'day', 1) : null;
  }
  return state.orders.filter((o) => {
    if (f.status === 'pending' && o.commissionReceived) return false;
    if (f.status === 'received' && !o.commissionReceived) return false;
    const d = parseYmd(o.date);
    if (start && d < start) return false;
    if (end && d >= end) return false;
    if (q) {
      const hay = [partyName(o.supplierId), partyName(o.buyerId), o.woodType, o.vehicleNo, o.notes, o.slipNo, String(o.total)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort(sortOrdersDesc);
}

function renderOrders(view) {
  const f = state.ordersFilter;
  view.innerHTML = `
    <div class="search">${ICON.search}<input class="input" id="oq" type="search" placeholder="Search name, wood, vehicle, notes…" value="${esc(f.q)}"></div>
    <div class="chips" id="rangeChips">
      ${[['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']]
        .map(([k, l]) => `<button class="chip ${f.range === k ? 'active' : ''}" data-r="${k}">${l}</button>`).join('')}
    </div>
    <div class="grid2" id="customRange" ${f.range === 'custom' ? '' : 'hidden'} style="margin-bottom:10px">
      <input class="input" type="date" id="ofrom" value="${esc(f.from)}" aria-label="From">
      <input class="input" type="date" id="oto" value="${esc(f.to)}" aria-label="To">
    </div>
    <div class="seg" id="statusSeg">
      ${[['all', 'All'], ['pending', 'Brokerage due'], ['received', 'Received']].map(([k, l]) => `<button data-s="${k}" class="${f.status === k ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div id="orderList"></div>`;

  const draw = () => {
    const list = filteredOrders();
    const s = summarize(list);
    const box = $('#orderList');
    if (!list.length) {
      box.innerHTML = `<div class="empty">${ICON.file}<h2>No orders found</h2><p>${state.orders.length ? 'Try a different search or filter.' : 'Tap + to add your first order.'}</p></div>`;
      return;
    }
    let html = `<div class="summary-bar"><span><b>${s.count}</b> orders · ${fmtWeight(s.kg)}</span><span>Sales <b>${moneyShort(s.total)}</b></span><span>Brokerage <b>${money0(s.commission)}</b></span></div>`;
    let lastDate = '';
    const dayTotals = {};
    list.forEach((o) => { dayTotals[o.date] = (dayTotals[o.date] || 0) + num(o.total); });
    for (const o of list.slice(0, 300)) {
      if (o.date !== lastDate) { html += `<div class="list-date"><span>${fmtDateLong(o.date)}</span><span>${money0(dayTotals[o.date])}</span></div>`; lastDate = o.date; }
      html += orderItem(o);
    }
    if (list.length > 300) html += `<p class="muted small" style="text-align:center">Showing latest 300 of ${list.length}. Narrow the filter to see more.</p>`;
    box.innerHTML = html;
    bindOrderItems(box);
  };
  draw();

  $('#oq').oninput = (e) => { f.q = e.target.value; draw(); };
  $$('#rangeChips .chip').forEach((c) => c.onclick = () => {
    f.range = c.dataset.r;
    $$('#rangeChips .chip').forEach((x) => x.classList.toggle('active', x === c));
    $('#customRange').hidden = f.range !== 'custom';
    draw();
  });
  $('#ofrom').onchange = (e) => { f.from = e.target.value; draw(); };
  $('#oto').onchange = (e) => { f.to = e.target.value; draw(); };
  $$('#statusSeg button').forEach((b) => b.onclick = () => {
    f.status = b.dataset.s;
    $$('#statusSeg button').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  });
}

/* ---------- Order detail sheet ---------- */
async function showOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  const sup = partyById(o.supplierId); const buy = partyById(o.buyerId);
  const kg = orderKg(o);
  const body = openSheet(`
    <h2>${esc(fmtDateLong(o.date))}</h2>
    <div class="big-total"><div class="v">${money(o.total)}</div>
      <div class="c">Brokerage ${money(o.commission)} (${nf.format(num(o.commissionPct))}%)
        <span class="badge ${o.commissionReceived ? 'paid' : 'pending'}">${o.commissionReceived ? 'Received' : 'Pending'}</span></div></div>
    <dl class="detail-rows">
      <dt>Supplier</dt><dd>${esc(sup?.name || 'Unknown')}${sup?.phone ? ` · <a href="${telLink(sup.phone)}">${esc(sup.phone)}</a>` : ''}</dd>
      <dt>Buyer</dt><dd>${esc(buy?.name || 'Unknown')}${buy?.phone ? ` · <a href="${telLink(buy.phone)}">${esc(buy.phone)}</a>` : ''}</dd>
      ${o.woodType ? `<dt>Wood</dt><dd>${esc(o.woodType)}${o.logSize ? ` · ${sizeName(o.logSize)} logs` : ''}</dd>` : ''}
      ${num(o.logCount) ? `<dt>Logs</dt><dd>${o.logCount}${kg ? ` · avg ${nf.format(Math.round(kg / num(o.logCount)))} kg` : ''}${(() => { const m = o.logDots?.length === num(o.logCount) ? logMix(o.logDots, kg, o.logLength) : null; return m ? `<br><span class="small muted" style="font-weight:400">${mixText(m)}</span>${mixBar(m)}` : ''; })()}</dd>` : ''}
      ${o.logLength ? `<dt>Log length</dt><dd>${lengthName(o.logLength)}</dd>` : ''}
      ${o.weight ? `<dt>Weight</dt><dd>${nf.format(num(o.weight))} ${o.unit === 'ton' ? 'ton' : 'kg'}</dd>` : ''}
      ${o.rate ? `<dt>Rate</dt><dd>${money(o.rate)} / ${o.unit === 'ton' ? 'ton' : 'kg'}</dd>` : ''}
      ${kg ? `<dt>Avg price</dt><dd>${money0(pricePer(o.total, kg))}${priceLabel()}</dd>` : ''}
      ${o.vehicleNo ? `<dt>Vehicle</dt><dd>${esc(o.vehicleNo)}</dd>` : ''}
      ${o.slipNo ? `<dt>Slip no.</dt><dd>${esc(o.slipNo)}</dd>` : ''}
      ${o.notes ? `<dt>Notes</dt><dd style="text-align:left;font-weight:400;white-space:pre-wrap">${esc(o.notes)}</dd>` : ''}
    </dl>
    <div id="detailFiles"></div>
    <div class="btn-row" style="margin-top:6px">
      <button class="btn ${o.commissionReceived ? '' : 'accent'}" id="toggleRec">${ICON.check} ${o.commissionReceived ? 'Mark as pending' : 'Brokerage received'}</button>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <a class="btn" href="#edit/${encodeURIComponent(o.id)}">${ICON.edit} Edit</a>
      <button class="btn" id="shareOrder">${ICON.share} Share</button>
      <button class="btn danger" id="delOrder">${ICON.trash} Delete</button>
    </div>`, revokeUrls);

  // Attachments
  const filesBox = $('#detailFiles', body);
  let html = '';
  const slips = (await Promise.all((o.slipIds || []).map((fid) => DB.get('files', fid)))).filter(Boolean);
  const woodPics = (await Promise.all((o.woodPhotoIds || []).map((fid) => DB.get('files', fid)))).filter(Boolean);
  if (woodPics.length) {
    html += `<div class="section-title">Wood photos</div><div class="thumbs" style="margin-bottom:14px">`;
    woodPics.forEach((f) => {
      const u = blobUrl(f.blob);
      const side = (WOOD_SIDES.find((x) => x[0] === o.woodSides?.[f.id]) || [])[1];
      html += `<div class="side-slot"><div class="thumb" data-img="${u}"><img src="${u}" alt="Wood load"></div>${side ? `<span>${side}</span>` : ''}</div>`;
    });
    html += '</div>';
  }
  if (slips.length) {
    html += `<div class="section-title">Weight slip${slips.length > 1 ? 's' : ''}</div><div class="thumbs" style="margin-bottom:14px">`;
    slips.forEach((f) => {
      const u = blobUrl(f.blob);
      html += f.blob.type.startsWith('image/')
        ? `<div class="thumb" data-img="${u}"><img src="${u}" alt="Weight slip"></div>`
        : `<a class="thumb" href="${u}" target="_blank" rel="noopener">${ICON.file}<span>${esc(f.name || 'File')}</span></a>`;
    });
    html += '</div>';
  }
  if (o.audioId) {
    const a = await DB.get('files', o.audioId);
    if (a) html += `<div class="section-title">Voice note</div><div class="audio-box" style="margin-bottom:14px"><audio controls src="${blobUrl(a.blob)}"></audio></div>`;
  }
  filesBox.innerHTML = html;
  $$('[data-img]', filesBox).forEach((t) => t.onclick = () => openLightbox(t.dataset.img));

  $('#toggleRec', body).onclick = async () => {
    o.commissionReceived = !o.commissionReceived;
    o.updatedAt = Date.now();
    await DB.put('orders', o);
    closeSheet();
    toast(o.commissionReceived ? 'Marked as received' : 'Marked as pending');
    route();
  };
  $('#delOrder', body).onclick = async () => {
    if (!confirm('Delete this order? This cannot be undone.')) return;
    await deleteOrder(o);
    closeSheet();
    toast('Order deleted');
    route();
  };
  $('#shareOrder', body).onclick = () => shareOrder(o, slips);
}

function orderText(o) {
  const unit = o.unit === 'ton' ? 'ton' : 'kg';
  return [
    `*${settings.businessName || 'Log order'}* – ${fmtDate(o.date)}`,
    `Supplier: ${partyName(o.supplierId)}`,
    `Buyer: ${partyName(o.buyerId)}`,
    o.woodType && `Wood: ${o.woodType}`,
    o.weight && `Weight: ${nf.format(num(o.weight))} ${unit}`,
    o.rate && `Rate: ${money(o.rate)}/${unit}`,
    o.vehicleNo && `Vehicle: ${o.vehicleNo}`,
    `Total: ${money(o.total)}`,
    `Brokerage (${nf.format(num(o.commissionPct))}%): ${money(o.commission)}`,
  ].filter(Boolean).join('\n');
}
async function shareOrder(o, slips) {
  const text = orderText(o);
  const files = (slips || []).filter((f) => f.blob.type.startsWith('image/'))
    .map((f, i) => new File([f.blob], `weight-slip-${o.date}-${i + 1}.jpg`, { type: f.blob.type }));
  try {
    if (files.length && navigator.canShare?.({ files })) { await navigator.share({ text, files }); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  window.open(waLink('', text), '_blank');
}

async function deleteOrder(o) {
  for (const fid of [...(o.slipIds || []), ...(o.woodPhotoIds || []), o.audioId].filter(Boolean)) await DB.del('files', fid);
  await DB.del('orders', o.id);
  state.orders = state.orders.filter((x) => x.id !== o.id);
}

/* =========================================================
   Order form (new / edit)
   ========================================================= */
const WOOD_TYPES = ['Rubber', 'Eucalyptus', 'Acacia', 'Mango', 'Albizia', 'Silver oak', 'Jungle wood', 'Poplar', 'Teak', 'Casuarina', 'Matti'];

// Wood list = your saved list + any wood already used in orders.
function getWoods() {
  const seen = new Set(); const out = [];
  for (const w of [...(settings.woodTypes || WOOD_TYPES), ...state.orders.map((o) => o.woodType).filter(Boolean)]) {
    const k = w.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(w); }
  }
  return out;
}
const woodOpts = (sel) => '<option value="">Select wood…</option>' + getWoods().map((w) => `<option value="${esc(w)}" ${w === sel ? 'selected' : ''}>${esc(w)}</option>`).join('');
function saveWoodType(name) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  name = name[0].toUpperCase() + name.slice(1);
  const existing = getWoods().find((w) => w.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  settings.woodTypes = [...(settings.woodTypes || WOOD_TYPES), name];
  saveSettings();
  return name;
}
function addWoodType(onSaved) {
  const body = openSheet(`
    <h2>New wood type</h2>
    <form id="wform" novalidate autocomplete="off">
      <div class="field"><label for="wName">Wood name</label><input class="input" id="wName" placeholder="e.g. Maruthi, Anjili, Wild jack"></div>
      <button type="submit" class="btn primary block">${ICON.check} Add</button>
    </form>`);
  setTimeout(() => $('#wName', body)?.focus(), 250);
  $('#wform', body).onsubmit = (e) => {
    e.preventDefault();
    const name = saveWoodType($('#wName', body).value);
    if (!name) { toast('Enter a wood name'); return; }
    closeSheet();
    toast(`${name} added`);
    onSaved?.(name);
  };
}
const creditHtml = () => `<p class="credit">Designed &amp; developed by <b>${DESIGNER}</b></p>`;

function renderOrderForm(view, editId) {
  const existing = editId ? state.orders.find((o) => o.id === editId) : null;
  if (editId && !existing) { view.innerHTML = '<div class="empty"><h2>Order not found</h2></div>'; return; }
  const last = [...state.orders].sort(sortOrdersDesc)[0];
  const o = existing ? { ...existing } : {
    date: todayStr(), supplierId: '', buyerId: '', woodType: '', weight: '', unit: last?.unit || settings.defaultUnit,
    rate: '', total: '', commissionPct: settings.commissionPct, commissionReceived: false, vehicleNo: '', slipNo: '', notes: '',
    slipIds: [], audioId: null,
  };
  // Coming from Price check: start with its wood, size, weight, price and photo
  const pre = !existing && state.prefill;
  state.prefill = null;
  if (pre) Object.assign(o, { woodType: pre.woodType, logCount: pre.logCount, logDots: pre.logDots, logLength: pre.logLength, unit: pre.unit, weight: pre.weight, rate: pre.rate });
  const logSize = o.logSize || ''; // older orders only
  const logSt = { count: o.logCount || '', dots: o.logDots || null };
  let logLength = o.logLength ?? (existing ? '' : '8ft'); // normal cut is 8 ft
  // Attachment working state
  const slips = (o.slipIds || []).map((id) => ({ id }));
  // Wood photos: left side, right side, back. Older photos without a side go to "other".
  const woodSlots = {};
  const woodOther = [];
  for (const id of o.woodPhotoIds || []) {
    const side = o.woodSides?.[id];
    if (side && SIDE_WEIGHT[side] && !woodSlots[side]) woodSlots[side] = { id, feats: o.woodFeats?.[id] };
    else woodOther.push({ id, feats: o.woodFeats?.[id] });
  }
  if (pre?.woodPhotos) Object.assign(woodSlots, pre.woodPhotos);
  const removedFiles = [];
  let audio = o.audioId ? { id: o.audioId } : null;
  let totalManual = !!existing && !(num(o.weight) && num(o.rate));
  let dirty = false;

  const opt = (type, sel) => `<option value="">Select ${type}…</option>` + parties(type).map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}${p.place ? ' – ' + esc(p.place) : ''}</option>`).join('');
  const speechOK = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  view.innerHTML = `
    <form id="orderForm" novalidate autocomplete="off">
      <div class="voice-box">
        <div class="row"><div class="grow"><b>Scan weight slip</b><div class="small muted">Take a photo – weight, vehicle, date and party fill in automatically</div></div>
        <button type="button" class="btn sm primary" id="scanBtn">${ICON.scan} Scan</button></div>
        <input type="file" id="scanInput" accept="image/*" hidden>
      </div>
      ${speechOK && !existing ? `
      <div class="voice-box">
        <div class="row"><div class="grow"><b>Speak the order</b><div class="small muted">e.g. “Supplier Rahim, buyer Greenply, rubber 12 ton rate 6500”</div></div>
        <button type="button" class="btn sm primary" id="voiceFill">${ICON.mic} Speak</button></div>
        <div class="transcript" id="voiceText" hidden></div>
      </div>` : ''}

      <div class="field"><label for="fDate">Date</label><input class="input" type="date" id="fDate" value="${esc(o.date)}" required></div>

      <div class="field">
        <div class="label-row"><label for="fSupplier">Supplier (seller)</label><button type="button" class="btn sm ghost" data-addparty="supplier">${ICON.plus} New</button></div>
        <select class="input" id="fSupplier" required>${opt('supplier', o.supplierId)}</select>
      </div>
      <div class="field">
        <div class="label-row"><label for="fBuyer">Buyer (plywood company)</label><button type="button" class="btn sm ghost" data-addparty="buyer">${ICON.plus} New</button></div>
        <select class="input" id="fBuyer" required>${opt('buyer', o.buyerId)}</select>
      </div>

      <div class="field">
        <div class="label-row"><label for="fWood">Wood type</label><button type="button" class="btn sm ghost" id="addWood">${ICON.plus} New</button></div>
        <select class="input" id="fWood">${woodOpts(o.woodType)}</select>
      </div>
      <div class="field"><label>Log length</label>
        <div class="seg" id="fLen" style="margin:0">${LOG_LENGTHS.map(([k, l]) => `<button type="button" data-l="${k}" class="${logLength === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>

      <div class="grid2">
        <div class="field"><label for="fWeight">Weight</label>
          <div class="input-group">
            <input class="input" id="fWeight" type="number" inputmode="decimal" step="any" min="0" value="${esc(o.weight)}" placeholder="0">
            <select class="input unit" id="fUnit"><option value="ton" ${o.unit === 'ton' ? 'selected' : ''}>Ton</option><option value="kg" ${o.unit === 'kg' ? 'selected' : ''}>Kg</option></select>
          </div>
        </div>
        <div class="field"><label for="fRate">Rate per <span id="rateUnit">${o.unit === 'ton' ? 'ton' : 'kg'}</span></label>
          <input class="input" id="fRate" type="number" inputmode="decimal" step="any" min="0" value="${esc(o.rate)}" placeholder="${settings.currency}">
        </div>
      </div>

      <div class="field"><label for="fTotal">Total amount (${esc(settings.currency)})</label>
        <input class="input" id="fTotal" type="number" inputmode="decimal" step="any" min="0" value="${esc(o.total)}" placeholder="Auto = weight × rate, or type it" required>
        <div class="hint" id="totalHint"></div>
      </div>

      <div class="calc-box">
        <div class="grow">
          <label class="small muted" for="fComm">My brokerage (${esc(settings.currency)})</label>
          <input class="input big-input" id="fComm" type="number" inputmode="decimal" step="any" min="0" value="${esc(o.commission ?? '')}" placeholder="0">
        </div>
        <div style="width:100px">
          <label class="small muted" for="fPct">Percent %</label>
          <input class="input" id="fPct" type="number" inputmode="decimal" step="any" min="0" value="${esc(o.commissionPct)}">
        </div>
      </div>
      <div class="hint" id="commHint" style="margin:-6px 0 8px"></div>
      <div class="switch-row"><span>Brokerage already received</span>
        <label class="switch"><input type="checkbox" id="fRec" ${o.commissionReceived ? 'checked' : ''}><span></span></label>
      </div>

      <div class="grid2">
        <div class="field"><label for="fVehicle">Vehicle no.</label><input class="input" id="fVehicle" value="${esc(o.vehicleNo)}" placeholder="KL 10 AB 1234" autocapitalize="characters"></div>
        <div class="field"><label for="fSlipNo">Weight slip no.</label><input class="input" id="fSlipNo" value="${esc(o.slipNo)}" placeholder="Optional"></div>
      </div>

      <div class="field">
        <label>Wood photos (loaded vehicle)</label>
        <div id="woodSlots"></div>
        <div class="thumbs" id="woodThumbs" style="margin-top:8px"></div>
        <input type="file" id="woodInput" accept="image/*" multiple hidden>
        <input type="file" id="woodCamera" accept="image/*" capture="environment" hidden>
        <div class="hint">Left side, right side and back (cut ends). Price check compares future loads with these.</div>
      </div>
      <div class="field" id="fLogs"></div>

      <div class="field">
        <label>Weight slip photo</label>
        <div class="thumbs" id="slipThumbs"></div>
        <input type="file" id="slipInput" accept="image/*,application/pdf" multiple hidden>
        <input type="file" id="slipCamera" accept="image/*" capture="environment" hidden>
      </div>

      <div class="field">
        <label>Voice note</label>
        <div id="audioBox" class="audio-box"></div>
      </div>

      <div class="field">
        <div class="label-row"><label for="fNotes">Notes</label>${speechOK ? `<button type="button" class="btn sm ghost" id="dictate">${ICON.mic} Dictate</button>` : ''}</div>
        <textarea class="input" id="fNotes" placeholder="Quality, girth, payment terms…">${esc(o.notes)}</textarea>
      </div>

      <div class="btn-row" style="margin-top:6px">
        ${existing ? '' : '<button type="button" class="btn" id="saveAnother">Save & add another</button>'}
        <button type="submit" class="btn primary">${ICON.check} ${existing ? 'Save changes' : 'Save order'}</button>
      </div>
    </form>`;

  const f = $('#orderForm');
  const el = { date: $('#fDate'), sup: $('#fSupplier'), buy: $('#fBuyer'), wood: $('#fWood'), weight: $('#fWeight'), unit: $('#fUnit'), rate: $('#fRate'), total: $('#fTotal'), pct: $('#fPct'), comm: $('#fComm'), rec: $('#fRec'), vehicle: $('#fVehicle'), slipNo: $('#fSlipNo'), notes: $('#fNotes') };

  // Brokerage amount and % are linked: change one and the other follows.
  function recalc(source) {
    const w = num(el.weight.value); const r = num(el.rate.value);
    if (!totalManual && w && r) el.total.value = round2(w * r);
    const t = num(el.total.value);
    if (source === 'comm') {
      if (t > 0) el.pct.value = Math.round((num(el.comm.value) / t) * 100 * 1000) / 1000;
    } else if (!(source === 'init' && el.comm.value !== '')) {
      el.comm.value = t ? round2((t * num(el.pct.value)) / 100) : '';
    }
    $('#commHint').textContent = t ? `${nf.format(num(el.pct.value))}% of ${money(t)} = ${money(num(el.comm.value))}` : 'Enter the total amount to work out brokerage';
    $('#rateUnit').textContent = el.unit.value === 'ton' ? 'ton' : 'kg';
    $('#totalHint').textContent = w && r ? (totalManual ? `Weight × rate = ${money(w * r)} (you changed the total)` : `${nf.format(w)} × ${money(r)}`) : '';
  }
  [el.weight, el.rate].forEach((i) => i.addEventListener('input', () => { totalManual = false; recalc(); }));
  el.unit.addEventListener('change', () => recalc());
  el.total.addEventListener('input', () => { totalManual = true; recalc(); });
  el.pct.addEventListener('input', () => recalc());
  el.comm.addEventListener('input', () => recalc('comm'));
  f.addEventListener('input', () => { dirty = true; });
  f.addEventListener('change', () => { dirty = true; });
  recalc('init');

  $('#addWood').onclick = () => addWoodType((w) => { el.wood.innerHTML = woodOpts(w); dirty = true; });

  // ---- Scan weight slip ----
  $('#scanBtn').onclick = () => $('#scanInput').click();
  $('#scanInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const myRoute = location.hash;
    const blob = await compressImage(file, 2200, 0.85);
    slips.push({ blob, name: file.name || 'weight-slip.jpg' });
    dirty = true;
    drawSlips();
    const sheet = openSheet(`<h2>${ICON.scan} Reading weight slip…</h2>
      <p class="small muted" id="ocrStatus">Starting scanner…</p><div class="progress"><i id="ocrBar"></i></div>
      <p class="small muted">The photo is attached to this order.</p>`);
    let text = '';
    try {
      text = await ocrImage(blob, (p, msg) => {
        const st = $('#ocrStatus', sheet); if (st) st.textContent = msg;
        const bar = $('#ocrBar', sheet); if (bar && p != null) bar.style.width = Math.round(p * 100) + '%';
      });
    } catch (err) {
      if (location.hash !== myRoute) return;
      openSheet(`<h2>Couldn’t read the slip</h2><p>${esc(err.message || err)}</p><p class="small muted">The photo is still attached. Please fill the details by hand.</p><button class="btn block" data-close>OK</button>`);
      return;
    }
    if (location.hash !== myRoute) return;
    showScanResult(parseSlip(text), text);
  };
  function showScanResult(found, text) {
    const rows = [];
    if (found.date) rows.push(['date', 'Date', fmtDate(found.date)]);
    if (found.supplier) rows.push(['supplier', 'Supplier', found.supplier.name]);
    else if (found.newSupplier) rows.push(['newSupplier', 'Supplier (new – will be added)', found.newSupplier]);
    if (found.buyer) rows.push(['buyer', 'Buyer', found.buyer.name]);
    else if (found.newBuyer) rows.push(['newBuyer', 'Buyer (new – will be added)', found.newBuyer]);
    if (found.wood) rows.push(['wood', 'Wood', found.wood]);
    else if (found.newWood) rows.push(['newWood', 'Wood (new – will be added)', found.newWood]);
    if (found.weight) rows.push(['weight', 'Net weight', `${nf.format(found.weight)} ${found.unit}` + (found.gross && found.tare ? ` <span class="muted small">(gross ${nf.format(found.gross)} − tare ${nf.format(found.tare)})</span>` : '')]);
    if (found.rate) rows.push(['rate', 'Rate', money(found.rate)]);
    if (found.total) rows.push(['total', 'Total amount', money(found.total)]);
    if (found.vehicle) rows.push(['vehicle', 'Vehicle', found.vehicle]);
    if (found.slipNo) rows.push(['slipNo', 'Slip no.', found.slipNo]);
    const sheet = openSheet(`
      <h2>${rows.length ? 'Found on the slip' : 'Nothing found'}</h2>
      ${rows.length ? `<p class="small muted" style="margin-top:-6px">Untick anything that is wrong, then tap Fill.</p>
      <div class="scan-rows">${rows.map(([k, l, v]) => `<label class="scan-row"><input type="checkbox" data-k="${k}" checked><span class="grow"><span class="small muted">${esc(l)}</span><br><b>${k === 'weight' ? v : esc(v)}</b></span></label>`).join('')}</div>`
        : '<p>Couldn’t find the details. Try again with a straight, clear photo in good light. Handwritten slips are hard to read.</p>'}
      <details class="small muted" style="margin:10px 0"><summary>Text read from photo</summary><pre class="ocr-text">${esc(text.trim() || '(no text)')}</pre></details>
      <div class="btn-row">
        <button class="btn" data-close>${rows.length ? 'Cancel' : 'OK'}</button>
        ${rows.length ? `<button class="btn primary" id="scanApply">${ICON.check} Fill order</button>` : ''}
      </div>`);
    $('#scanApply', sheet)?.addEventListener('click', async () => {
      const on = new Set($$('input[data-k]:checked', sheet).map((c) => c.dataset.k));
      const addParty = async (type, name) => {
        const ex = parties(type).find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (ex) return ex;
        const rec = { id: uid(), type, name, phone: '', place: '', notes: 'Added from weight slip scan', createdAt: Date.now() };
        await DB.put('parties', rec);
        state.parties.push(rec);
        state.parties.sort((a, b) => a.name.localeCompare(b.name));
        return rec;
      };
      if (on.has('date')) el.date.value = found.date;
      if (on.has('supplier')) el.sup.value = found.supplier.id;
      if (on.has('newSupplier')) { const p = await addParty('supplier', found.newSupplier); el.sup.innerHTML = opt('supplier', p.id); }
      if (on.has('buyer')) el.buy.value = found.buyer.id;
      if (on.has('newBuyer')) { const p = await addParty('buyer', found.newBuyer); el.buy.innerHTML = opt('buyer', p.id); }
      if (on.has('wood')) el.wood.innerHTML = woodOpts(found.wood);
      if (on.has('newWood')) el.wood.innerHTML = woodOpts(saveWoodType(found.newWood));
      if (on.has('weight')) { el.weight.value = found.weight; el.unit.value = found.unit; totalManual = false; }
      if (on.has('rate')) { el.rate.value = found.rate; totalManual = false; }
      if (on.has('total')) { el.total.value = found.total; totalManual = true; }
      if (on.has('vehicle')) el.vehicle.value = found.vehicle;
      if (on.has('slipNo')) el.slipNo.value = found.slipNo;
      [el.sup, el.buy, el.total, el.date].forEach((i) => i.classList.remove('invalid'));
      recalc();
      dirty = true;
      closeSheet();
      toast(`Filled ${on.size} field${on.size === 1 ? '' : 's'} – please check`);
    });
  }

  // Add party inline
  $$('[data-addparty]', f).forEach((b) => b.onclick = () => editParty(null, b.dataset.addparty, (p) => {
    const sel = p.type === 'supplier' ? el.sup : el.buy;
    sel.innerHTML = opt(p.type, p.id);
    sel.classList.remove('invalid');
  }));

  $$('#fLen button').forEach((b) => b.onclick = () => {
    logLength = b.dataset.l;
    $$('#fLen button').forEach((x) => x.classList.toggle('active', x === b));
    dirty = true;
    logsField?.update();
  });
  // ---- Photo fields (weight slips, wood photos) ----
  function photoField({ list, box, cam, gal, alt }) {
    async function draw() {
      const host = $(box);
      if (!host) return;
      let html = '';
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.blob && s.id) { const rec = await DB.get('files', s.id); s.blob = rec?.blob; s.name = rec?.name; }
        if (!s.blob) continue;
        if (!s.url) s.url = blobUrl(s.blob);
        html += `<div class="thumb" data-i="${i}">${s.blob.type.startsWith('image/') ? `<img src="${s.url}" alt="${alt}">` : `${ICON.file}`}
          <button type="button" class="x" data-rm="${i}" aria-label="Remove">${ICON.x}</button></div>`;
      }
      html += `<button type="button" class="thumb add" data-add="cam">${ICON.camera}<span>Camera</span></button>`;
      html += `<button type="button" class="thumb add" data-add="gal">${ICON.upload}<span>Gallery</span></button>`;
      host.innerHTML = html;
      $('[data-add=cam]', host).onclick = () => $(cam).click();
      $('[data-add=gal]', host).onclick = () => $(gal).click();
      $$('[data-rm]', host).forEach((b) => b.onclick = (e) => {
        e.stopPropagation();
        const [s] = list.splice(Number(b.dataset.rm), 1);
        if (s.id) removedFiles.push(s.id);
        dirty = true;
        draw();
      });
      $$('.thumb[data-i]', host).forEach((t) => t.onclick = () => {
        const s = list[Number(t.dataset.i)];
        if (s.blob.type.startsWith('image/')) openLightbox(s.url); else window.open(s.url, '_blank');
      });
    }
    async function add(files) {
      for (const file of files) {
        const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
        list.push({ blob, name: file.name });
      }
      dirty = true;
      draw();
    }
    $(gal).onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
    $(cam).onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
    draw();
    return draw;
  }
  const drawSlips = photoField({ list: slips, box: '#slipThumbs', cam: '#slipCamera', gal: '#slipInput', alt: 'Weight slip' });
  const formKg = () => (el.unit.value === 'ton' ? num(el.weight.value) * 1000 : num(el.weight.value));
  const logsField = logCountField($('#fLogs'), logSt, { getBack: () => woodSlots.back, getKg: formKg, getLength: () => logLength, onChange: () => { dirty = true; } });
  [el.weight, el.unit].forEach((i) => i.addEventListener('input', () => logsField.update()));
  el.unit.addEventListener('change', () => logsField.update());
  let lastBack = woodSlots.back;
  sidePhotoSlots($('#woodSlots'), woodSlots, {
    onChange: () => {
      dirty = true;
      if (woodSlots.back && woodSlots.back !== lastBack) { logSt.count = ''; logSt.dots = null; logsField.autoCount(woodSlots.back.blob); }
      lastBack = woodSlots.back;
    },
    removed: removedFiles,
  });
  if (woodOther.length) photoField({ list: woodOther, box: '#woodThumbs', cam: '#woodCamera', gal: '#woodInput', alt: 'Wood load' });

  // ---- Voice note ----
  const recorder = createRecorder();
  async function drawAudio() {
    const box = $('#audioBox');
    if (recorder.active) {
      box.innerHTML = `<button type="button" class="btn recording" id="recStop">${ICON.stop} Stop</button><span class="rec-time" id="recTime">0:00</span><span class="muted small">Recording…</span>`;
      $('#recStop').onclick = async () => {
        const blob = await recorder.stop();
        if (blob) { if (audio?.id) removedFiles.push(audio.id); audio = { blob }; dirty = true; }
        drawAudio();
      };
      return;
    }
    if (audio) {
      if (!audio.blob && audio.id) audio.blob = (await DB.get('files', audio.id))?.blob;
      if (audio.blob) {
        if (!audio.url) audio.url = blobUrl(audio.blob);
        box.innerHTML = `<audio controls src="${audio.url}"></audio>
          <button type="button" class="btn sm" id="recAgain">${ICON.mic} Re-record</button>
          <button type="button" class="btn sm danger" id="recDel">${ICON.trash}</button>`;
        $('#recAgain').onclick = startRec;
        $('#recDel').onclick = () => { if (audio.id) removedFiles.push(audio.id); audio = null; dirty = true; drawAudio(); };
        return;
      }
    }
    box.innerHTML = `<button type="button" class="btn" id="recStart">${ICON.mic} Record voice note</button>`;
    $('#recStart').onclick = startRec;
  }
  async function startRec() {
    try {
      await recorder.start((sec) => { const t = $('#recTime'); if (t) t.textContent = `${Math.floor(sec / 60)}:${pad(sec % 60)}`; });
      drawAudio();
    } catch (e) {
      toast(e.message || 'Microphone not available');
    }
  }
  drawAudio();

  // ---- Voice typing for notes ----
  if ($('#dictate')) {
    const btn = $('#dictate');
    let session = null;
    btn.onclick = () => {
      if (session) { session.stop(); return; }
      const base = el.notes.value ? el.notes.value.replace(/\s*$/, ' ') : '';
      session = listen({
        onText: (txt) => { el.notes.value = base + txt; dirty = true; },
        onEnd: () => { session = null; btn.classList.remove('recording'); btn.innerHTML = `${ICON.mic} Dictate`; },
      });
      if (session) { btn.classList.add('recording'); btn.innerHTML = `${ICON.stop} Stop`; }
    };
  }

  // ---- Speak whole order ----
  if ($('#voiceFill')) {
    const btn = $('#voiceFill');
    let session = null;
    btn.onclick = () => {
      if (session) { session.stop(); return; }
      const out = $('#voiceText');
      out.hidden = false; out.textContent = 'Listening…';
      let finalText = '';
      session = listen({
        onText: (txt) => { finalText = txt; out.textContent = '“' + txt + '”'; },
        onEnd: () => {
          session = null; btn.classList.remove('recording'); btn.innerHTML = `${ICON.mic} Speak`;
          if (!finalText) { out.textContent = 'Didn’t catch that. Try again.'; return; }
          const filled = applyVoiceOrder(finalText, el);
          if (filled.weightOrRate) totalManual = false;
          if (filled.total) totalManual = true;
          recalc();
          dirty = true;
          out.textContent = `“${finalText}” → filled: ${filled.list.join(', ') || 'nothing recognised'}`;
          if (filled.missing.length) toast(filled.missing.join(' · '));
        },
      });
      if (session) { btn.classList.add('recording'); btn.innerHTML = `${ICON.stop} Done`; }
    };
  }

  // ---- Save ----
  async function save(again) {
    const errs = [];
    [el.sup, el.buy, el.total, el.date].forEach((i) => i.classList.remove('invalid'));
    if (!el.date.value) { errs.push('date'); el.date.classList.add('invalid'); }
    if (!el.sup.value) { errs.push('supplier'); el.sup.classList.add('invalid'); }
    if (!el.buy.value) { errs.push('buyer'); el.buy.classList.add('invalid'); }
    if (!(num(el.total.value) > 0)) { errs.push('total amount'); el.total.classList.add('invalid'); }
    if (errs.length) { toast('Please fill: ' + errs.join(', ')); $('.invalid', f)?.focus(); return; }
    if (recorder.active) { const blob = await recorder.stop(); if (blob) { if (audio?.id) removedFiles.push(audio.id); audio = { blob }; } }

    const now = Date.now();
    const order = {
      ...(existing || {}),
      id: existing?.id || uid(),
      date: el.date.value,
      supplierId: el.sup.value,
      buyerId: el.buy.value,
      woodType: el.wood.value.trim(),
      weight: el.weight.value === '' ? '' : num(el.weight.value),
      unit: el.unit.value,
      rate: el.rate.value === '' ? '' : num(el.rate.value),
      total: round2(num(el.total.value)),
      commissionPct: num(el.pct.value),
      commission: round2(num(el.comm.value)),
      commissionReceived: el.rec.checked,
      logSize,
      logCount: logSt.count === '' ? '' : num(logSt.count),
      logDots: logSt.dots || null,
      logLength,
      vehicleNo: el.vehicle.value.trim().toUpperCase(),
      slipNo: el.slipNo.value.trim(),
      notes: el.notes.value.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    order.slipIds = [];
    for (const s of slips) {
      if (s.id) { order.slipIds.push(s.id); continue; }
      const id = uid();
      await DB.put('files', { id, blob: s.blob, name: s.name || 'slip', orderId: order.id, createdAt: now });
      order.slipIds.push(id);
    }
    order.woodPhotoIds = [];
    order.woodFeats = {};
    order.woodSides = {};
    const woodAll = [...Object.entries(woodSlots).map(([side, w]) => ({ ...w, side })), ...woodOther];
    for (const w of woodAll) {
      let id = w.id;
      if (!id) {
        if (!w.blob) continue;
        id = uid();
        await DB.put('files', { id, blob: w.blob, name: w.name || 'wood-load', orderId: order.id, kind: 'wood', createdAt: now });
      }
      order.woodPhotoIds.push(id);
      if (w.side) order.woodSides[id] = w.side;
      let feats = w.feats;
      if (!feats && w.blob) { try { feats = await imageFeatures(w.blob); } catch { feats = null; } }
      if (feats) order.woodFeats[id] = feats;
    }
    order.audioId = null;
    if (audio) {
      if (audio.id) order.audioId = audio.id;
      else {
        const id = uid();
        await DB.put('files', { id, blob: audio.blob, name: 'voice-note', orderId: order.id, createdAt: now });
        order.audioId = id;
      }
    }
    for (const id of removedFiles) await DB.del('files', id);
    await DB.put('orders', order);
    const i = state.orders.findIndex((x) => x.id === order.id);
    if (i >= 0) state.orders[i] = order; else state.orders.push(order);
    settings.defaultUnit = order.unit; saveSettings();
    requestPersistence();
    dirty = false;
    toast(existing ? 'Changes saved' : `Order saved · brokerage ${money(order.commission)}`);
    if (again) { route(); return; }
    location.hash = existing ? '#orders' : '#home';
  }
  f.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  $('#saveAnother')?.addEventListener('click', () => save(true));

  leaveGuard = () => { if (recorder.active) recorder.stop(); };
  window.onbeforeunload = () => (dirty && currentRoute === (existing ? 'edit' : 'new') ? true : undefined);
}

/* ---------- Image compression ---------- */
async function compressImage(file, max = 1800, quality = 0.8) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900 * 1024) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

/* ---------- Audio recording ---------- */
function createRecorder() {
  let rec = null; let stream = null; let chunks = []; let timer = null; let resolveStop = null;
  const r = {
    active: false,
    async start(onTick) {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Voice recording is not supported on this browser');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { throw new Error('Microphone permission was denied'); });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t));
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer);
        r.active = false;
        const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }) : null;
        if (resolveStop) { resolveStop(blob); resolveStop = null; }
      };
      rec.start(250);
      r.active = true;
      const t0 = Date.now();
      timer = setInterval(() => onTick?.(Math.floor((Date.now() - t0) / 1000)), 500);
    },
    stop() {
      if (!rec || !r.active) return Promise.resolve(null);
      return new Promise((resolve) => { resolveStop = resolve; rec.stop(); });
    },
  };
  return r;
}

/* ---------- Speech to text ---------- */
function listen({ onText, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Voice typing is not supported here. Use the mic on your keyboard.'); return null; }
  const sr = new SR();
  sr.lang = settings.voiceLang;
  sr.interimResults = true;
  sr.continuous = true;
  let finalText = '';
  sr.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    onText((finalText + interim).trim());
  };
  sr.onerror = (e) => { if (e.error === 'not-allowed') toast('Microphone permission was denied'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Voice error: ' + e.error); };
  sr.onend = () => onEnd?.();
  try { sr.start(); } catch { return null; }
  return sr;
}

function applyVoiceOrder(raw, el) {
  let t = ' ' + raw.toLowerCase().replace(/(\d),(?=\d)/g, '$1').replace(/₹/g, ' rs ') + ' ';
  // "1.5 lakh" -> 150000, "20 thousand" -> 20000
  t = t.replace(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|thousand|k|crores?)\b/g, (_, n, w) => String(Math.round(parseFloat(n) * (w.startsWith('cr') ? 1e7 : w.startsWith('la') ? 1e5 : 1e3))));
  const list = []; const missing = []; const res = { list, missing, weightOrRate: false, total: false };

  const findParty = (type, keyword) => {
    const ps = parties(type).filter((p) => t.includes(' ' + p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length);
    if (ps.length) return ps[0];
    const m = t.match(new RegExp(`${keyword}\\s+(?:is\\s+)?([a-z][a-z .&]*?)(?=\\s+(?:supplier|seller|from|buyer|to|company|wood|weight|rate|price|total|amount|vehicle|lorry|\\d)|\\s*$)`));
    if (m) missing.push(`${type === 'supplier' ? 'Supplier' : 'Buyer'} “${m[1].trim()}” not found – tap New to add`);
    return null;
  };
  const sup = findParty('supplier', '(?:supplier|seller|from)');
  if (sup) { el.sup.value = sup.id; list.push('supplier'); }
  const buy = findParty('buyer', '(?:buyer|company|to)');
  if (buy) { el.buy.value = buy.id; list.push('buyer'); }

  const woods = getWoods();
  const wood = woods.find((w) => t.includes(w.toLowerCase()));
  if (wood) { el.wood.value = wood; list.push('wood'); }

  const w = t.match(/(\d+(?:\.\d+)?)\s*(tons?|tonnes?|t\b|kgs?|kilos?|kilograms?)/);
  if (w) { el.weight.value = w[1]; el.unit.value = w[2].startsWith('k') ? 'kg' : 'ton'; list.push('weight'); res.weightOrRate = true; }
  const r = t.match(/\b(?:rate|price|at)\b\s*(?:is\s*|of\s*)?(?:rs\.?\s*|rupees\s*)?(\d+(?:\.\d+)?)/);
  if (r) { el.rate.value = r[1]; list.push('rate'); res.weightOrRate = true; }
  const tot = t.match(/\b(?:total|amount)\b\s*(?:is\s*|of\s*)?(?:rs\.?\s*|rupees\s*)?(\d+(?:\.\d+)?)/);
  if (tot) { el.total.value = tot[1]; list.push('total'); res.total = true; }
  const v = t.match(/(?:vehicle|lorry|truck)\s*(?:number|no\.?)?\s*([a-z]{2}\s*\d{1,2}\s*[a-z]{0,3}\s*\d{1,4})/);
  if (v) { el.vehicle.value = v[1].replace(/\s+/g, ' ').toUpperCase(); list.push('vehicle'); }
  return res;
}

/* =========================================================
   Parties (suppliers & buyers)
   ========================================================= */
function renderParties(view) {
  const tab = state.partiesTab;
  view.innerHTML = `
    <div class="seg" id="ptab">
      <button data-t="supplier" class="${tab === 'supplier' ? 'active' : ''}">Suppliers (${parties('supplier').length})</button>
      <button data-t="buyer" class="${tab === 'buyer' ? 'active' : ''}">Buyers (${parties('buyer').length})</button>
    </div>
    <div class="row" style="margin-bottom:10px">
      <div class="search grow" style="margin:0">${ICON.search}<input class="input" id="pq" type="search" placeholder="Search ${tab === 'supplier' ? 'suppliers' : 'buyers'}…" value="${esc(state.partiesQ)}"></div>
      <button class="btn primary" id="addParty">${ICON.plus} Add</button>
    </div>
    <div id="plist"></div>`;

  const key = tab === 'supplier' ? 'supplierId' : 'buyerId';
  const stats = new Map(groupByParty(state.orders, key).map((r) => [r.id, r]));
  const draw = () => {
    const q = state.partiesQ.trim().toLowerCase();
    const list = parties(tab).filter((p) => !q || [p.name, p.place, p.phone].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (stats.get(b.id)?.total || 0) - (stats.get(a.id)?.total || 0) || a.name.localeCompare(b.name));
    const box = $('#plist');
    if (!list.length) {
      box.innerHTML = `<div class="empty">${ICON.log}<h2>No ${tab === 'supplier' ? 'suppliers' : 'buyers'} yet</h2><p>Add them here or while creating an order.</p></div>`;
      return;
    }
    box.innerHTML = list.map((p) => {
      const s = stats.get(p.id);
      const lastDate = s ? s.orders.map((o) => o.date).sort().pop() : null;
      return `<div class="item" data-pid="${esc(p.id)}">
        <div class="avatar">${esc(initials(p.name))}</div>
        <div class="main"><div class="title">${esc(p.name)}</div>
          <div class="sub">${[p.place, s ? `${s.count} order${s.count === 1 ? '' : 's'}` : 'No orders yet', lastDate && 'last ' + fmtDate(lastDate)].filter(Boolean).map(esc).join(' · ')}</div></div>
        <div class="amt">${s ? moneyShort(s.total) : ''}${s?.price ? `<div class="sub">${money0(s.price)}${priceLabel()}</div>` : ''}</div>
        ${p.phone ? `<a class="icon-btn" href="${telLink(p.phone)}" aria-label="Call" style="color:var(--accent)" data-stop>${ICON.phone}</a>` : ''}
      </div>`;
    }).join('');
    $$('[data-stop]', box).forEach((a) => a.onclick = (e) => e.stopPropagation());
    $$('[data-pid]', box).forEach((it) => it.onclick = () => openPartyReport(it.dataset.pid, tab));
  };
  draw();
  $$('#ptab button').forEach((b) => b.onclick = () => { state.partiesTab = b.dataset.t; route(); });
  $('#pq').oninput = (e) => { state.partiesQ = e.target.value; draw(); };
  $('#addParty').onclick = () => editParty(null, tab, () => route());
}

function openPartyReport(id, type) {
  state.report = { ...state.report, type, partyId: id };
  location.hash = '#reports';
}

function editParty(p, type, onSaved) {
  const isNew = !p;
  p = p || { type, name: '', phone: '', place: '', notes: '' };
  const label = p.type === 'supplier' ? 'supplier' : 'buyer';
  const body = openSheet(`
    <h2>${isNew ? 'New' : 'Edit'} ${label}</h2>
    <form id="pform" novalidate autocomplete="off">
      <div class="field"><label for="pName">Name</label><input class="input" id="pName" value="${esc(p.name)}" placeholder="${p.type === 'supplier' ? 'Supplier / farm owner' : 'Plywood company'}" required></div>
      <div class="field"><label for="pPhone">Phone</label><input class="input" id="pPhone" type="tel" inputmode="tel" value="${esc(p.phone)}" placeholder="Mobile number"></div>
      <div class="field"><label for="pPlace">Place</label><input class="input" id="pPlace" value="${esc(p.place)}" placeholder="Town / area"></div>
      <div class="field"><label for="pNotes">Notes</label><textarea class="input" id="pNotes" placeholder="GST no., bank details, preferred wood…">${esc(p.notes)}</textarea></div>
      <div class="btn-row">
        ${isNew ? '' : `<button type="button" class="btn danger" id="pDel">${ICON.trash} Delete</button>`}
        <button type="submit" class="btn primary">${ICON.check} Save</button>
      </div>
    </form>`);
  setTimeout(() => $('#pName', body)?.focus(), 250);
  $('#pform', body).onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#pName', body).value.trim().replace(/\s+/g, ' ');
    if (!name) { $('#pName', body).classList.add('invalid'); toast('Name is required'); return; }
    const dup = state.parties.find((x) => x.type === p.type && x.id !== p.id && x.name.toLowerCase() === name.toLowerCase());
    if (dup) { toast(`A ${label} named “${dup.name}” already exists`); return; }
    const rec = { ...p, id: p.id || uid(), name, phone: $('#pPhone', body).value.trim(), place: $('#pPlace', body).value.trim(), notes: $('#pNotes', body).value.trim(), createdAt: p.createdAt || Date.now() };
    await DB.put('parties', rec);
    const i = state.parties.findIndex((x) => x.id === rec.id);
    if (i >= 0) state.parties[i] = rec; else state.parties.push(rec);
    state.parties.sort((a, b) => a.name.localeCompare(b.name));
    closeSheet();
    toast(`${name} saved`);
    onSaved?.(rec);
  };
  $('#pDel', body)?.addEventListener('click', async () => {
    const used = state.orders.filter((o) => o.supplierId === p.id || o.buyerId === p.id).length;
    if (used) { toast(`Can't delete: ${used} order${used === 1 ? '' : 's'} use this ${label}`); return; }
    if (!confirm(`Delete ${p.name}?`)) return;
    await DB.del('parties', p.id);
    state.parties = state.parties.filter((x) => x.id !== p.id);
    closeSheet();
    toast('Deleted');
    if (currentRoute === 'reports') state.report.partyId = 'all';
    route();
  });
}

/* =========================================================
   Reports — per supplier / buyer over time with price
   ========================================================= */
function reportRange() {
  const r = state.report;
  const now = new Date();
  const tomorrow = addUnit(startOf(now, 'day'), 'day', 1);
  const earliest = state.orders.reduce((m, o) => (o.date < m ? o.date : m), todayStr());
  switch (r.range) {
    case '30d': return [addUnit(tomorrow, 'day', -30), tomorrow];
    case '3m': return [addUnit(startOf(now, 'month'), 'month', -2), tomorrow];
    case '6m': return [addUnit(startOf(now, 'month'), 'month', -5), tomorrow];
    case '12m': return [addUnit(startOf(now, 'month'), 'month', -11), tomorrow];
    case 'ty': return [startOf(now, 'year'), tomorrow];
    case 'ly': { const s = addUnit(startOf(now, 'year'), 'year', -1); return [s, startOf(now, 'year')]; }
    case 'custom': return [r.from ? parseYmd(r.from) : parseYmd(earliest), r.to ? addUnit(parseYmd(r.to), 'day', 1) : tomorrow];
    default: return [parseYmd(earliest), tomorrow];
  }
}

function renderReports(view) {
  const r = state.report;
  const isWood = r.type === 'wood';
  const list = parties(r.type);
  const woodList = usedWoods();
  if (isWood && !woodList.includes(r.partyId)) r.partyId = 'all';
  if (!isWood && r.partyId !== 'all' && !list.some((p) => p.id === r.partyId)) {
    const p = partyById(r.partyId);
    if (p) r.type = p.type; else r.partyId = 'all';
  }
  const plist = parties(r.type);
  const [start, end] = reportRange();
  let unit = r.unit;
  let note = '';
  const order = ['day', 'week', 'month', 'year'];
  while (countBuckets(startOf(start, unit), end, unit) > 120 && unit !== 'year') { unit = order[order.indexOf(unit) + 1]; note = `Grouped by ${unit} (range too long for ${r.unit}).`; }
  const bStart = startOf(start, unit);
  const nB = Math.max(1, countBuckets(bStart, end, unit));
  const key = r.type === 'supplier' ? 'supplierId' : 'buyerId';
  const otherKey = r.type === 'supplier' ? 'buyerId' : 'supplierId';
  const ranged = state.orders.filter((o) => inRange(o, start, end));

  view.innerHTML = `
    <div class="seg" id="rType">
      <button data-t="supplier" class="${r.type === 'supplier' ? 'active' : ''}">Suppliers</button>
      <button data-t="buyer" class="${r.type === 'buyer' ? 'active' : ''}">Buyers</button>
      <button data-t="wood" class="${isWood ? 'active' : ''}">Wood prices</button>
    </div>
    <div class="field">
      <select class="input" id="rParty" aria-label="${isWood ? 'Wood type' : r.type === 'supplier' ? 'Supplier' : 'Buyer'}">
        <option value="all">All ${isWood ? 'wood types' : r.type === 'supplier' ? 'suppliers' : 'buyers'} – compare</option>
        ${(isWood ? woodList.map((w) => ({ id: w, name: w })) : plist).map((p) => `<option value="${esc(p.id)}" ${p.id === r.partyId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="chips" id="rRange">
      ${[['30d', '30 days'], ['3m', '3 months'], ['6m', '6 months'], ['12m', '12 months'], ['ty', 'This year'], ['ly', 'Last year'], ['all', 'All time'], ['custom', 'Custom']]
        .map(([k, l]) => `<button class="chip ${r.range === k ? 'active' : ''}" data-r="${k}">${l}</button>`).join('')}
    </div>
    <div class="grid2" ${r.range === 'custom' ? '' : 'hidden'} style="margin-bottom:10px">
      <input class="input" type="date" id="rFrom" value="${esc(r.from)}" aria-label="From">
      <input class="input" type="date" id="rTo" value="${esc(r.to)}" aria-label="To">
    </div>
    <div class="seg" id="rUnit">
      ${order.map((u) => `<button data-u="${u}" class="${u === r.unit ? 'active' : ''}">${u === 'day' ? 'Daily' : u === 'week' ? 'Weekly' : u === 'month' ? 'Monthly' : 'Yearly'}</button>`).join('')}
    </div>
    ${note ? `<p class="small muted" style="margin-top:-6px">${note}</p>` : ''}
    <div id="rBody"></div>`;

  $$('#rType button').forEach((b) => b.onclick = () => { r.type = b.dataset.t; r.partyId = 'all'; route(); });
  $('#rParty').onchange = (e) => { r.partyId = e.target.value; route(); };
  $$('#rRange .chip').forEach((c) => c.onclick = () => { r.range = c.dataset.r; route(); });
  $('#rFrom').onchange = (e) => { r.from = e.target.value; route(); };
  $('#rTo').onchange = (e) => { r.to = e.target.value; route(); };
  $$('#rUnit button').forEach((b) => b.onclick = () => { r.unit = b.dataset.u; route(); });

  const body = $('#rBody');
  if (isWood) { renderWoodReport(body, unit, bStart, nB, ranged); return; }
  if (!plist.length) {
    body.innerHTML = `<div class="empty">${ICON.chart}<h2>No ${r.type === 'supplier' ? 'suppliers' : 'buyers'} yet</h2><p>Add orders to see charts here.</p></div>`;
    return;
  }

  if (r.partyId === 'all') {
    const rows = groupByParty(ranged, key);
    const s = summarize(ranged);
    body.innerHTML = `
      <div class="kpis">
        <div class="kpi primary"><div class="label">Total sales</div><div class="value">${moneyShort(s.total)}</div></div>
        <div class="kpi accent"><div class="label">Brokerage</div><div class="value">${money0(s.commission)}</div></div>
        <div class="kpi"><div class="label">Weight</div><div class="value">${fmtWeight(s.kg)}</div></div>
        <div class="kpi"><div class="label">Avg price</div><div class="value">${s.kg ? money0(pricePer(s.total, s.kg)) : '—'}</div><div class="delta muted">${priceLabel()}</div></div>
      </div>
      <div class="card"><h3>Price ${priceLabel()} by ${r.type} <small>top 6</small></h3><div class="chart-box tall"><canvas id="cPrice"></canvas></div></div>
      <div class="card"><h3>Sales by ${r.type} over time <small>top 6</small></h3><div class="chart-box tall"><canvas id="cStack"></canvas></div></div>
      <div class="card"><h3>Ranking <small>tap a name for details</small></h3>
        ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th class="num">Orders</th><th class="num">Weight</th><th class="num">Sales</th><th class="num">Avg ${priceLabel()}</th><th class="num">Share</th></tr></thead><tbody>
        ${rows.map((x) => `<tr data-party="${esc(x.id)}"><td><b>${esc(x.name)}</b></td><td class="num">${x.count}</td><td class="num">${fmtWeight(x.kg)}</td><td class="num">${money0(x.total)}</td><td class="num">${x.price ? money0(x.price) : '—'}</td><td class="num">${s.total ? ((x.total / s.total) * 100).toFixed(1) : 0}%</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">No orders in this range.</p>'}
      </div>`;
    $$('tr[data-party]', body).forEach((tr) => tr.onclick = () => { r.partyId = tr.dataset.party; route(); window.scrollTo(0, 0); });
    const top = rows.slice(0, 6);
    const labels = bucketize([], unit, bStart, nB).map((b) => b.label);
    const series = top.map((x, i) => ({ x, i, b: bucketize(x.orders, unit, bStart, nB) }));
    makeChart($('#cPrice'), {
      type: 'line',
      data: { labels, datasets: series.map(({ x, i, b }) => ({ label: x.name, data: b.map((v) => v.price), borderColor: SERIES[i], backgroundColor: SERIES[i], spanGaps: true, tension: .3, pointRadius: 3 })) },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'nearest', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw == null ? '-' : money0(c.raw) + priceLabel()}` } } },
        scales: { y: { ticks: { callback: moneyTick, maxTicksLimit: 6 } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } },
      },
    });
    makeChart($('#cStack'), {
      type: 'bar',
      data: { labels, datasets: series.map(({ x, i, b }) => ({ label: x.name, data: b.map((v) => round2(v.total)), backgroundColor: SERIES[i], borderRadius: 3 })) },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money0(c.raw)}` } } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, ticks: { callback: moneyTick, maxTicksLimit: 6 } } },
      },
    });
    return;
  }

  // Single party
  const p = partyById(r.partyId);
  const pOrders = ranged.filter((o) => o[key] === p.id).sort(sortOrdersDesc);
  const s = summarize(pOrders);
  const allTime = summarize(state.orders.filter((o) => o[key] === p.id));
  const b = bucketize(pOrders, unit, bStart, nB);
  const counterparts = groupByParty(pOrders, otherKey);
  body.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="avatar">${esc(initials(p.name))}</div>
        <div class="grow"><div style="font-weight:800;font-size:17px">${esc(p.name)}</div><div class="small muted">${[r.type === 'supplier' ? 'Supplier' : 'Buyer', p.place, p.phone].filter(Boolean).map(esc).join(' · ')}</div></div>
        <button class="icon-btn" id="pEdit" aria-label="Edit" style="color:var(--primary)">${ICON.edit}</button>
      </div>
      ${p.notes ? `<p class="small" style="white-space:pre-wrap;margin:10px 0 0">${esc(p.notes)}</p>` : ''}
      ${p.phone ? `<div class="btn-row" style="margin-top:12px"><a class="btn" href="${telLink(p.phone)}">${ICON.phone} Call</a><a class="btn" href="${waLink(p.phone)}" target="_blank" rel="noopener">${ICON.whatsapp} WhatsApp</a></div>` : ''}
      <p class="small muted" style="margin:10px 0 0">All time: ${allTime.count} orders · ${money0(allTime.total)} · brokerage ${money0(allTime.commission)}${allTime.pending ? ` (<span style="color:var(--warn)">${money0(allTime.pending)} due</span>)` : ''}</p>
    </div>
    <div class="kpis">
      <div class="kpi primary"><div class="label">Sales in range</div><div class="value">${moneyShort(s.total)}</div><div class="delta">${s.count} orders</div></div>
      <div class="kpi accent"><div class="label">Brokerage</div><div class="value">${money0(s.commission)}</div></div>
      <div class="kpi"><div class="label">Weight</div><div class="value">${fmtWeight(s.kg)}</div></div>
      <div class="kpi"><div class="label">Avg price</div><div class="value">${s.kg ? money0(pricePer(s.total, s.kg)) : '—'}</div><div class="delta muted">${priceLabel()}</div></div>
    </div>
    <div class="card"><h3>Sales & price over time</h3><div class="chart-box tall"><canvas id="cParty"></canvas></div></div>
    <div class="card"><h3>${r.type === 'supplier' ? 'Sold to' : 'Bought from'}</h3>${rankList(counterparts, r.type === 'supplier' ? 'buyer' : 'supplier')}</div>
    <div class="card"><h3>Orders <small>${pOrders.length} in range</small></h3>${pOrders.length ? pOrders.slice(0, 30).map((o) => orderItem(o).replace('<div class="sub">', `<div class="sub">${fmtDate(o.date)} · `)).join('') + (pOrders.length > 30 ? `<a class="btn block" href="#orders" id="allPartyOrders">See all ${pOrders.length} orders</a>` : '') : '<p class="muted small">No orders in this range.</p>'}</div>`;
  $('#pEdit').onclick = () => editParty(p, p.type, () => route());
  $('#allPartyOrders')?.addEventListener('click', () => { state.ordersFilter = { ...state.ordersFilter, q: p.name, status: 'all', range: 'all' }; });
  bindOrderItems(body);
  $$('.rank li[data-party]', body).forEach((li) => li.onclick = () => { state.report = { ...r, type: li.dataset.type, partyId: li.dataset.party }; route(); window.scrollTo(0, 0); });

  const pc = css('--primary-2');
  makeChart($('#cParty'), {
    type: 'bar',
    data: {
      labels: b.map((x) => x.label),
      datasets: [
        { type: 'bar', label: 'Sales', data: b.map((x) => round2(x.total)), backgroundColor: pc + 'aa', borderRadius: 5, yAxisID: 'y', order: 2 },
        { type: 'line', label: 'Avg price', data: b.map((x) => x.price), borderColor: css('--accent'), backgroundColor: css('--accent'), yAxisID: 'y2', spanGaps: true, tension: .3, pointRadius: 3, order: 1 },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: tooltipMoney } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: moneyTick, maxTicksLimit: 6 } },
        y2: { position: 'right', grid: { display: false }, ticks: { callback: (v) => moneyShort(v), maxTicksLimit: 6 }, title: { display: true, text: 'Price ' + priceLabel() } },
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      },
    },
  });
}

/* ---------- Wood price report ---------- */
function renderWoodReport(body, unit, bStart, nB, ranged) {
  const r = state.report;
  const withW = ranged.filter((o) => o.woodType && orderKg(o) > 0);
  const labels = bucketize([], unit, bStart, nB).map((b) => b.label);
  const lineOpts = (yTitle) => ({
    maintainAspectRatio: false, interaction: { mode: 'nearest', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw == null ? '-' : money0(c.raw) + priceLabel()}` } } },
    scales: { y: { ticks: { callback: moneyTick, maxTicksLimit: 6 }, title: { display: true, text: yTitle } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } },
  });

  if (r.partyId === 'all') {
    const rows = groupRows(withW, (o) => o.woodType, (w) => w);
    body.innerHTML = `
      ${outlookCard(usedWoods())}
      ${rows.length ? `
      <div class="card"><h3>Price ${priceLabel()} by wood type</h3><div class="chart-box tall"><canvas id="cWood"></canvas></div></div>
      <div class="card"><h3>Wood types <small>tap for details</small></h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Wood</th><th class="num">Orders</th><th class="num">Weight</th><th class="num">Avg ${priceLabel()}</th><th class="num">Low</th><th class="num">High</th></tr></thead><tbody>
        ${rows.map((x) => {
          const ps = x.orders.map((o) => pricePer(num(o.total), orderKg(o))).filter((v) => v);
          return `<tr data-party="${esc(x.id)}"><td><b>${esc(x.name)}</b></td><td class="num">${x.count}</td><td class="num">${fmtWeight(x.kg)}</td><td class="num">${money0(x.price)}</td><td class="num">${money0(Math.min(...ps))}</td><td class="num">${money0(Math.max(...ps))}</td></tr>`;
        }).join('')}
        </tbody></table></div></div>` : `<div class="empty">${ICON.chart}<h2>No wood prices in this range</h2><p>Choose a wood type and weight when adding orders.</p></div>`}`;
    $$('tr[data-party]', body).forEach((tr) => tr.onclick = () => { r.partyId = tr.dataset.party; route(); });
    if (!rows.length) return;
    makeChart($('#cWood'), {
      type: 'line',
      data: { labels, datasets: rows.slice(0, 8).map((x, i) => ({ label: x.name, data: bucketize(x.orders, unit, bStart, nB).map((b) => b.price), borderColor: SERIES[i], backgroundColor: SERIES[i], spanGaps: true, tension: .3, pointRadius: 3 })) },
      options: lineOpts('Price ' + priceLabel()),
    });
    return;
  }

  // One wood type
  const wood = r.partyId;
  const os = withW.filter((o) => o.woodType === wood).sort(sortOrdersDesc);
  const s = summarize(os);
  const ps = os.map((o) => pricePer(num(o.total), orderKg(o))).filter((v) => v);
  const b = bucketize(os, unit, bStart, nB);
  const bySup = groupByParty(os, 'supplierId').sort((a, c) => a.price - c.price);
  const byBuy = groupByParty(os, 'buyerId').sort((a, c) => c.price - a.price);
  const priceList = (rows, note) => rows.length ? `<ul class="rank">${rows.slice(0, 8).map((x) => `<li><div class="row"><span class="grow ellipsis"><b>${esc(x.name)}</b> <span class="muted small">· ${x.count} order${x.count === 1 ? '' : 's'} · ${fmtWeight(x.kg)}</span></span><b>${money0(x.price)}${priceLabel()}</b></div></li>`).join('')}</ul><p class="small muted" style="margin:6px 0 0">${note}</p>` : '<p class="muted small">No orders in this range.</p>';
  body.innerHTML = `
    <div class="kpis">
      <div class="kpi primary"><div class="label">Avg price</div><div class="value">${s.kg ? money0(pricePer(s.total, s.kg)) : '—'}</div><div class="delta">${priceLabel()} · ${s.count} orders</div></div>
      <div class="kpi"><div class="label">Weight</div><div class="value">${fmtWeight(s.kg)}</div></div>
      <div class="kpi"><div class="label">Lowest</div><div class="value">${ps.length ? money0(Math.min(...ps)) : '—'}</div></div>
      <div class="kpi"><div class="label">Highest</div><div class="value">${ps.length ? money0(Math.max(...ps)) : '—'}</div></div>
    </div>
    ${outlookCard([wood], { title: `${esc(wood)} · price outlook` })}
    <div class="card"><h3>${esc(wood)} price over time</h3><div class="chart-box tall"><canvas id="cWood1"></canvas></div></div>
    <div class="card"><h3>Suppliers <small>cheapest first</small></h3>${priceList(bySup, 'Average price you got this wood from each supplier.')}</div>
    <div class="card"><h3>Buyers <small>best paying first</small></h3>${priceList(byBuy, 'Average price each company paid for this wood.')}</div>`;
  makeChart($('#cWood1'), {
    type: 'bar',
    data: {
      labels: b.map((x) => x.label),
      datasets: [
        { type: 'line', label: 'Avg price', data: b.map((x) => x.price), borderColor: css('--accent'), backgroundColor: css('--accent'), yAxisID: 'y', spanGaps: true, tension: .3, pointRadius: 3, order: 1 },
        { type: 'bar', label: 'Weight (t)', data: b.map((x) => round2(x.kg / 1000)), backgroundColor: css('--primary-2') + '66', borderRadius: 5, yAxisID: 'yw', order: 2 },
      ],
    },
    options: {
      maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => (c.dataset.yAxisID === 'yw' ? `Weight: ${nf.format(c.raw)} t` : `Avg price: ${c.raw == null ? '-' : money0(c.raw) + priceLabel()}`) } } },
      scales: {
        y: { ticks: { callback: moneyTick, maxTicksLimit: 6 }, title: { display: true, text: 'Price ' + priceLabel() } },
        yw: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { maxTicksLimit: 5 }, title: { display: true, text: 'Tons' } },
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      },
    },
  });
}

/* =========================================================
   Settings, backup & restore
   ========================================================= */
function renderSettings(view) {
  const langs = [['en-IN', 'English (India)'], ['ml-IN', 'Malayalam'], ['ta-IN', 'Tamil'], ['kn-IN', 'Kannada'], ['hi-IN', 'Hindi'], ['te-IN', 'Telugu'], ['en-US', 'English (US)']];
  view.innerHTML = `
    <div class="card">
      <h3>Business</h3>
      <div class="field"><label for="sName">Your name / business name</label><input class="input" id="sName" value="${esc(settings.businessName)}" placeholder="e.g. Shakkir Timber Brokers"></div>
      <div class="grid2">
        <div class="field"><label for="sPct">Default brokerage %</label><input class="input" id="sPct" type="number" inputmode="decimal" step="any" min="0" value="${esc(settings.commissionPct)}"></div>
        <div class="field"><label for="sCur">Currency symbol</label><input class="input" id="sCur" value="${esc(settings.currency)}" maxlength="4"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="sPrice">Show prices per</label><select class="input" id="sPrice"><option value="ton" ${settings.priceUnit === 'ton' ? 'selected' : ''}>Ton</option><option value="kg" ${settings.priceUnit === 'kg' ? 'selected' : ''}>Kg</option></select></div>
        <div class="field"><label for="sTheme">Theme</label><select class="input" id="sTheme">${[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<option value="${k}" ${settings.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="sLang">Voice typing language</label><select class="input" id="sLang">${langs.map(([k, l]) => `<option value="${k}" ${settings.voiceLang === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="hint">Used by “Speak the order” and “Dictate”. For speaking the whole order, English works best.</div></div>
    </div>

    <div class="card">
      <h3>Backup & export</h3>
      <p class="small muted" style="margin-top:0">All data is stored only on this phone. Save a backup to Google Drive / WhatsApp regularly so you never lose it.
        ${settings.lastBackup ? `Last backup: <b>${fmtDate(ymd(new Date(settings.lastBackup)))}</b>.` : '<b>No backup yet.</b>'}</p>
      <div class="btn-row">
        <button class="btn primary" id="bBackup">${ICON.download} Backup</button>
        <button class="btn" id="bRestore">${ICON.upload} Restore</button>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn" id="bCsv">${ICON.file} Export to Excel (CSV)</button>
      </div>
      <input type="file" id="restoreFile" accept=".json,application/json" hidden>
      <p class="small muted" id="storageInfo"></p>
    </div>

    <div class="card">
      <h3>Wood types</h3>
      <div class="chips wrap" id="woodChips">${(settings.woodTypes || WOOD_TYPES).map((w) => `<span class="chip">${esc(w)}<button class="chip-x" data-rmwood="${esc(w)}" aria-label="Remove ${esc(w)}">${ICON.x}</button></span>`).join('')}</div>
      <button class="btn sm" id="sAddWood">${ICON.plus} Add wood type</button>
    </div>

    <div class="card">
      <h3>Price alerts</h3>
      <div class="field"><label for="sLoc">Your area (for rain forecast)</label>
        <div class="input-group"><input class="input" id="sLoc" value="${esc(myLoc().name)}" placeholder="Town name"><button class="btn" id="sLocFind">Set</button></div>
        <button class="btn sm ghost" id="sLocGps" style="margin-top:6px">📍 Use my current location</button>
        <div class="hint">Rain stops felling and transport, so it affects log prices. Forecast from Open-Meteo.</div></div>
      <div class="switch-row" style="padding-top:0"><span>Notify me when wood prices may go up or down<br><span class="small muted">Checked once a day when you open the app.</span></span>
        <label class="switch"><input type="checkbox" id="sAlerts" ${settings.priceAlerts ? 'checked' : ''}><span></span></label></div>
      ${'Notification' in window ? '' : '<p class="small muted" style="margin:0">On iPhone, phone notifications work only when the app is opened from its Home Screen icon. Alerts still show on the Home page.</p>'}
    </div>

    <div class="card">
      <h3>Data</h3>
      <div class="btn-row">
        <button class="btn" id="bDemo">Load sample data</button>
        <button class="btn danger" id="bWipe">${ICON.trash} Delete all data</button>
      </div>
    </div>

    <div class="card about">
      <div class="logo-big">${ICON.log}</div>
      <div style="font-weight:800;font-size:17px">Log Broker</div>
      <div class="small muted">Wood logs order book &amp; price tracker · works offline</div>
      <div class="designer">Designed &amp; developed by<br><b>${DESIGNER}</b></div>
      <div class="small muted">© ${new Date().getFullYear()} ${DESIGNER}. All rights reserved.</div>
    </div>`;

  const bind = (id, k, conv = (v) => v) => { $(id).onchange = (e) => { settings[k] = conv(e.target.value); saveSettings(); if (k === 'theme') applyTheme(); toast('Saved'); }; };
  bind('#sName', 'businessName', (v) => v.trim());
  bind('#sPct', 'commissionPct', (v) => num(v));
  bind('#sCur', 'currency', (v) => v.trim() || '₹');
  bind('#sPrice', 'priceUnit');
  bind('#sTheme', 'theme');
  bind('#sLang', 'voiceLang');

  $('#sAddWood').onclick = () => addWoodType(() => route());
  $$('[data-rmwood]').forEach((b) => b.onclick = () => {
    settings.woodTypes = (settings.woodTypes || WOOD_TYPES).filter((w) => w !== b.dataset.rmwood);
    saveSettings();
    toast(`${b.dataset.rmwood} removed from the list`);
    route();
  });
  const setLoc = (l) => {
    settings.location = l; saveSettings();
    ['lb-weather', 'lb-rainhist'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    ensureWeather(true);
    toast(`Area set to ${l.name}`);
    route();
  };
  $('#sLocFind').onclick = async () => {
    const q = $('#sLoc').value.trim();
    if (!q) return;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`);
      const j = await r.json();
      const hit = (j.results || []).sort((a, b) => (b.country_code === 'IN') - (a.country_code === 'IN'))[0];
      if (!hit) { toast('Place not found – try a nearby town'); return; }
      setLoc({ name: hit.name + (hit.admin1 ? ', ' + hit.admin1 : ''), lat: hit.latitude, lon: hit.longitude });
    } catch { toast('Needs internet to find the place'); }
  };
  $('#sLocGps').onclick = () => {
    if (!navigator.geolocation) { toast('Location not available'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLoc({ name: 'My area', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => toast('Location permission was denied'), { timeout: 15000 });
  };
  $('#sAlerts').onchange = async (e) => {
    const want = e.target.checked;
    if (want && 'Notification' in window && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission().catch(() => 'denied');
      if (res !== 'granted') toast('Notifications are blocked – alerts will show on the Home page only');
    }
    settings.priceAlerts = want;
    settings.lastAlertDay = '';
    saveSettings();
    if (want) maybeNotifyOutlook();
  };
  $('#bBackup').onclick = backup;
  $('#bRestore').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) restore(file); };
  $('#bCsv').onclick = exportCsv;
  $('#bDemo').onclick = async () => {
    if (state.orders.length && !confirm('Add sample suppliers, buyers and orders to your existing data?')) return;
    await loadDemoData();
    toast('Sample data loaded');
    location.hash = '#home';
  };
  $('#bWipe').onclick = async () => {
    if (!confirm('Delete ALL orders, suppliers, buyers, slips and voice notes from this phone?')) return;
    if (prompt('Type DELETE to confirm') !== 'DELETE') return;
    await Promise.all(['orders', 'parties', 'files'].map((s) => DB.clear(s)));
    await loadAll();
    toast('All data deleted');
    location.hash = '#home';
  };
  navigator.storage?.estimate?.().then((est) => {
    $('#storageInfo').textContent = `Storage used: ${(est.usage / 1048576).toFixed(1)} MB`;
  });
}

const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
const dataUrlToBlob = async (d) => (await fetch(d)).blob();

async function backup() {
  toast('Preparing backup…');
  const files = await DB.all('files');
  const data = {
    app: 'log-broker', version: 1, exportedAt: new Date().toISOString(),
    settings: { ...settings, lastBackup: null },
    parties: state.parties, orders: state.orders,
    files: await Promise.all(files.map(async (f) => ({ ...f, blob: undefined, data: await blobToDataUrl(f.blob) }))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `log-broker-backup-${todayStr()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  let done = false;
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Log Broker backup' }); done = true; }
  } catch (e) { if (e.name === 'AbortError') return; }
  if (!done) download(name, blob);
  settings.lastBackup = Date.now(); saveSettings();
  toast('Backup ready');
  if (currentRoute === 'settings') route();
}

async function restore(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('This is not a valid backup file'); return; }
  if (data.app !== 'log-broker' || !Array.isArray(data.orders) || !Array.isArray(data.parties)) { toast('This is not a Log Broker backup'); return; }
  if (!confirm(`Restore backup from ${data.exportedAt?.slice(0, 10) || 'file'}?\n${data.orders.length} orders, ${data.parties.length} parties.\n\nThis REPLACES the data on this phone.`)) return;
  toast('Restoring…');
  const files = await Promise.all((data.files || []).map(async (f) => ({ id: f.id, name: f.name, orderId: f.orderId, createdAt: f.createdAt, blob: await dataUrlToBlob(f.data) })));
  await Promise.all(['orders', 'parties', 'files'].map((s) => DB.clear(s)));
  await DB.putMany('parties', data.parties);
  await DB.putMany('orders', data.orders);
  if (files.length) await DB.putMany('files', files);
  if (data.settings) { settings = { ...DEFAULT_SETTINGS, ...data.settings, lastBackup: Date.now() }; saveSettings(); applyTheme(); }
  await loadAll();
  toast('Backup restored');
  location.hash = '#home';
}

function exportCsv() {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Date', 'Supplier', 'Supplier phone', 'Buyer', 'Buyer phone', 'Wood', 'Weight', 'Unit', 'Rate', 'Total', 'Brokerage %', 'Brokerage', 'Brokerage received', 'Vehicle', 'Slip no', 'Logs', 'Avg kg per log', 'Log length', 'Notes'];
  const rows = [...state.orders].sort((a, b) => a.date.localeCompare(b.date)).map((o) => {
    const s = partyById(o.supplierId); const b = partyById(o.buyerId);
    return [o.date, s?.name, s?.phone, b?.name, b?.phone, o.woodType, o.weight, o.unit, o.rate, o.total, o.commissionPct, o.commission, o.commissionReceived ? 'Yes' : 'No', o.vehicleNo, o.slipNo, o.logCount || '', num(o.logCount) && orderKg(o) ? Math.round(orderKg(o) / num(o.logCount)) : '', lengthName(o.logLength || ''), o.notes];
  });
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  download(`log-broker-orders-${todayStr()}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  toast('CSV exported');
}

/* ---------- Sample data ---------- */
async function loadDemoData() {
  const sup = [['Rahim Timbers', 'Perumbavoor'], ['Joseph Estate', 'Kothamangalam'], ['Anil Rubber Farm', 'Muvattupuzha'], ['Basheer Logs', 'Malappuram'], ['Thomas & Sons', 'Pala'], ['Kumar Wood Cutters', 'Thrissur']];
  const buy = [['Greenply Industries', 'Perumbavoor'], ['Kerala Ply Mills', 'Kalamassery'], ['Royal Plywoods', 'Perumbavoor'], ['Malabar Boards', 'Kozhikode'], ['Star Veneers', 'Aluva']];
  const mk = (type) => ([name, place], i) => ({ id: uid(), type, name, place, phone: '98' + String(46000000 + i * 1234567 + (type === 'buyer' ? 7 : 0)).slice(0, 8), notes: '', createdAt: Date.now() });
  const S = sup.map(mk('supplier')); const B = buy.map(mk('buyer'));
  const woods = [['Rubber', 6200], ['Eucalyptus', 5600], ['Acacia', 6800], ['Mango', 5200], ['Albizia', 4800]];
  const orders = [];
  const now = new Date();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let d = 420; d >= 0; d--) {
    const day = addUnit(startOf(now, 'day'), 'day', -d);
    const n = rnd() < 0.45 ? 0 : rnd() < 0.7 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const si = Math.floor(rnd() * S.length); const bi = Math.floor(rnd() * B.length);
      const [wood, base] = woods[(si + Math.floor(rnd() * 2)) % woods.length];
      const season = 1 + 0.08 * Math.sin((day.getMonth() / 12) * Math.PI * 2) + (420 - d) / 420 * 0.07;
      const rate = Math.round((base * season * (0.94 + rnd() * 0.12) + bi * 60) / 10) * 10;
      const weight = Math.round((6 + rnd() * 16) * 100) / 100;
      const total = round2(weight * rate);
      orders.push({
        id: uid(), date: ymd(day), supplierId: S[si].id, buyerId: B[bi].id, woodType: wood, weight, unit: 'ton', rate, total,
        commissionPct: 1, commission: round2(total / 100), commissionReceived: d > 20 || rnd() < 0.3,
        vehicleNo: `KL ${pad(10 + Math.floor(rnd() * 50))} ${'ABCDEFGH'[Math.floor(rnd() * 8)]}${'ABCDEFGH'[Math.floor(rnd() * 8)]} ${1000 + Math.floor(rnd() * 8999)}`,
        slipNo: String(10000 + Math.floor(rnd() * 89999)), notes: '', slipIds: [], audioId: null, createdAt: day.getTime() + k, updatedAt: Date.now(),
      });
    }
  }
  await DB.putMany('parties', [...S, ...B]);
  await DB.putMany('orders', orders);
  await loadAll();
}

/* ---------- Persistence & offline ---------- */
let persistAsked = false;
function requestPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- Boot ---------- */
(async function init() {
  applyTheme();
  try {
    await loadAll();
  } catch (e) {
    $('#view').innerHTML = `<div class="empty"><h2>Storage unavailable</h2><p>${esc(e.message || e)}</p><p>Private/incognito mode may block saving data.</p></div>`;
    return;
  }
  route();
  ensureWeather().finally(() => setTimeout(maybeNotifyOutlook, 500));
})();
