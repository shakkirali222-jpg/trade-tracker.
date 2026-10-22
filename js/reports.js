// Monthly report and Projects / sites.

import * as db from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, S, view, money, fmtDate, pct, supplierName, docLabel, toast, askDialog, confirmDialog, empty, download, shareSheet } from './ui.js';

const monthKey = d => d.slice(0, 7);
const monthName = k => new Date(k + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const lineTotal = r => (r.qty ? r.qty * r.price : 0);
const isPurchase = r => r.docType === 'invoice';

function spendBy(rows, keyFn) {
  const m = new Map();
  rows.forEach(r => { const k = keyFn(r); if (k == null) return; m.set(k, (m.get(k) || 0) + lineTotal(r)); });
  return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

// ================= Monthly report =================
export function renderReports(arg) {
  const st = S();
  const cur = st.settings.currency;
  const months = [...new Set(st.prices.map(r => monthKey(r.date)))].sort().reverse();
  const nowKey = db.today().slice(0, 7);
  if (!months.includes(nowKey)) months.unshift(nowKey);
  const sel = arg && months.includes(arg) ? arg : months[0];

  const inMonth = st.prices.filter(r => monthKey(r.date) === sel && r.currency === cur);
  const bought = inMonth.filter(isPurchase);
  const spend = bought.reduce((t, r) => t + lineTotal(r), 0);
  const docs = st.docs.filter(d => monthKey(d.date) === sel);
  const quotes = new Set(inMonth.filter(r => r.docType === 'quotation').map(r => r.docId || `${r.supplierId}|${r.date}|${r.docRef || ''}`)).size;
  const docKey = r => r.docId || `${r.supplierId}|${r.date}|${r.docRef || ''}`;
  const invoices = new Set(inMonth.filter(isPurchase).map(docKey)).size;
  const newProducts = st.products.filter(p => p.createdAt && new Date(p.createdAt).toISOString().slice(0, 7) === sel).length;

  // Last 12 months of purchases for the chart
  const last12 = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); last12.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const series = last12.map(k => ({ k, v: st.prices.filter(r => monthKey(r.date) === k && isPurchase(r) && r.currency === cur).reduce((t, r) => t + lineTotal(r), 0) }));

  const topSup = spendBy(bought, r => r.supplierId).slice(0, 6);
  const topCat = spendBy(bought, r => db.getProduct(r.productId)?.category || 'Other').slice(0, 6);
  const byProj = spendBy(bought, r => db.getDoc(r.docId)?.projectId || null).slice(0, 6);

  // Price changes this month vs the latest price before this month
  const changes = [];
  const seen = new Set();
  inMonth.forEach(r => {
    if (seen.has(r.productId)) return; seen.add(r.productId);
    const product = db.getProduct(r.productId);
    const before = db.pricesFor(r.productId).filter(x => x.date < sel + '-01' && x.currency === cur);
    const nowRows = db.pricesFor(r.productId).filter(x => monthKey(x.date) === sel && x.currency === cur);
    if (!before.length || !nowRows.length) return;
    const a = db.normPrice(before[0], product), b = db.normPrice(nowRows[0], product);
    if (a && b && Math.abs(b - a) / a >= 0.01) changes.push({ product, a, b, ch: (b - a) / a });
  });
  changes.sort((x, y) => Math.abs(y.ch) - Math.abs(x.ch));

  const max = Math.max(1, ...series.map(s => s.v));
  view().innerHTML = `
    <div class="page-head">
      <div><h1>Monthly report</h1><p>What you bought, what you spent, and how prices moved.</p></div>
      <div class="btn-row">
        <select id="rpMonth" style="width:auto">${months.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select>
        <button class="btn btn-primary" id="rpShare">${icon.whatsapp} Share</button>
      </div>
    </div>
    <div class="grid grid-4">
      <div class="card stat"><div class="label">Purchases (invoices)</div><div class="value">${money(spend, cur)}</div><div class="sub">before VAT</div></div>
      <div class="card stat"><div class="label">Invoices</div><div class="value">${invoices}</div><div class="sub">${bought.length} lines</div></div>
      <div class="card stat"><div class="label">Quotes received</div><div class="value">${quotes}</div><div class="sub">&nbsp;</div></div>
      <div class="card stat"><div class="label">New products</div><div class="value">${newProducts}</div><div class="sub">&nbsp;</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Purchases per month</h2><span class="small muted">${cur}, invoices only</span></div>
      <div class="bars">${series.map(s => `<div class="bar-col ${s.k === sel ? 'sel' : ''}" title="${monthName(s.k)}: ${money(s.v, cur)}" data-m="${s.k}">
        <div class="bar-val">${s.v ? (s.v >= 10000 ? Math.round(s.v / 1000) + 'k' : Math.round(s.v).toLocaleString()) : ''}</div>
        <div class="bar" style="height:${Math.max(s.v ? 4 : 0, (s.v / max) * 140)}px"></div>
        <div class="bar-lbl">${new Date(s.k + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' })}</div></div>`).join('')}</div>
    </div>
    <div class="grid grid-3" style="margin-top:16px">
      ${listCard('Top suppliers', topSup.map(([id, v]) => [`<a href="#/supplier/${id}">${esc(supplierName(id))}</a>`, money(v, cur)]))}
      ${listCard('By category', topCat.map(([c, v]) => [esc(c), money(v, cur)]))}
      ${listCard('By project / site', byProj.map(([id, v]) => [`<a href="#/project/${id}">${esc(db.getProject(id)?.name || 'Project')}</a>`, money(v, cur)]), 'Tag invoices with a project to see this.')}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Price changes in ${monthName(sel)}</h2><span class="small muted">vs the last price before this month</span></div>
      ${changes.length ? `<ul class="list-plain">${changes.slice(0, 12).map(c => `<li><a href="#/product/${c.product.id}">${esc(c.product.name)}</a>
        <span class="num small">${money(c.a)} → <b>${money(c.b)}</b> <span class="${c.ch > 0 ? 'trend-up' : 'trend-down'}">${c.ch > 0 ? '▲' : '▼'} ${pct(c.ch)}</span></span></li>`).join('')}</ul>` : '<p class="muted small">No price changes recorded this month.</p>'}
    </div>
    <div class="btn-row" style="margin-top:16px"><button class="btn" id="rpCsv">${icon.download} Download month as Excel (CSV)</button></div>`;

  $('#rpMonth').onchange = e => { location.hash = '#/reports/' + e.target.value; };
  $$('.bar-col').forEach(b => b.onclick = () => { location.hash = '#/reports/' + b.dataset.m; });
  $('#rpShare').onclick = () => {
    const t = [`*Purchase report — ${monthName(sel)}*`, '', `Purchases: ${money(spend, cur)} (before VAT)`, `Invoices: ${invoices} · Quotes received: ${quotes}`];
    if (topSup.length) { t.push('', 'Top suppliers:'); topSup.forEach(([id, v]) => t.push(`• ${supplierName(id)}: ${money(v, cur)}`)); }
    if (topCat.length) { t.push('', 'By category:'); topCat.forEach(([c, v]) => t.push(`• ${c}: ${money(v, cur)}`)); }
    if (changes.length) { t.push('', 'Price changes:'); changes.slice(0, 8).forEach(c => t.push(`• ${c.product.name}: ${money(c.a)} → ${money(c.b)} (${pct(c.ch)})`)); }
    shareSheet(t.join('\n'), { title: 'Share report' });
  };
  $('#rpCsv').onclick = () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = inMonth.map(r => [r.date, db.getProduct(r.productId)?.name, supplierName(r.supplierId), docLabel(r.docType), r.qty ?? '', r.unit, r.price, r.currency, lineTotal(r) || '', db.getProject(db.getDoc(r.docId)?.projectId)?.name || ''].map(q).join(','));
    download(`price-book-${sel}.csv`, '﻿' + ['Date,Product,Supplier,Document,Qty,Unit,Unit price,Currency,Line total,Project', ...lines].join('\n'), 'text/csv');
  };
}

function listCard(title, rows, emptyText = 'No purchases this month.') {
  return `<div class="card"><h2 style="margin-bottom:8px">${title}</h2>${rows.length ? `<ul class="list-plain small">${rows.map(([a, b]) => `<li><span>${a}</span><b class="num">${b}</b></li>`).join('')}</ul>` : `<p class="muted small">${emptyText}</p>`}</div>`;
}

// ================= Projects / sites =================
function projectStats(id) {
  const docs = S().docs.filter(d => d.projectId === id);
  const ids = new Set(docs.map(d => d.id));
  const rows = S().prices.filter(r => ids.has(r.docId));
  const spend = rows.filter(isPurchase).reduce((t, r) => t + lineTotal(r), 0);
  const last = docs.reduce((m, d) => (d.date > m ? d.date : m), '');
  return { docs, rows, spend, last };
}

export function renderProjects() {
  const st = S();
  const cur = st.settings.currency;
  view().innerHTML = `
    <div class="page-head"><div><h1>Projects / sites</h1><p>Tag quotes and invoices with a project to see what each site costs.</p></div>
      <button class="btn btn-primary" id="pjAdd">${icon.plus} New project</button></div>
    <div class="product-list">${st.projects.length ? st.projects.map(p => {
      const s = projectStats(p.id);
      return `<a class="product-row" href="#/project/${p.id}"><div><div class="name">${icon.folder.replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"')}${esc(p.name)}</div>
        <div class="meta">${s.docs.length} documents${s.last ? ' · last ' + fmtDate(s.last) : ''}</div></div>
        <div class="price"><div class="small muted">Purchases</div><div class="big">${money(s.spend, cur)}</div></div></a>`;
    }).join('') : `<div class="card">${empty(icon.folder, 'No projects yet', 'Create a project, then pick it in the "Project / site" box when you add an invoice or quote.')}</div>`}</div>`;
  $('#pjAdd').onclick = async () => {
    const name = await askDialog({ title: 'New project / site', input: '', placeholder: 'e.g. Villa 12 – Al Barsha', okText: 'Add' });
    if (name) { db.addProject(name); toast('Project added'); renderProjects(); }
  };
}

export function renderProject(id) {
  const p = db.getProject(id);
  if (!p) { view().innerHTML = `<div class="card">${empty(icon.folder, 'Project not found', '', '<a class="btn" href="#/projects">All projects</a>')}</div>`; return; }
  const cur = S().settings.currency;
  const s = projectStats(id);
  const bought = s.rows.filter(isPurchase);
  const byCat = spendBy(bought, r => db.getProduct(r.productId)?.category || 'Other');
  const bySup = spendBy(bought, r => r.supplierId);
  view().innerHTML = `
    <a href="#/projects" class="small" style="display:inline-flex;gap:6px;align-items:center;margin-bottom:10px">${icon.arrowLeft.replace('<svg', '<svg style="width:16px;height:16px"')} All projects</a>
    <div class="page-head"><div><h1>${esc(p.name)}</h1><p>${s.docs.length} documents</p></div>
      <div class="btn-row"><button class="btn" id="pjRen">${icon.edit} Rename</button><button class="btn btn-danger" id="pjDel">${icon.trash}</button><button class="btn btn-primary" id="pjShare">${icon.whatsapp} Share</button></div></div>
    <div class="grid grid-3">
      <div class="card stat"><div class="label">Purchases (invoices)</div><div class="value">${money(s.spend, cur)}</div><div class="sub">before VAT</div></div>
      ${listCard('By category', byCat.map(([c, v]) => [esc(c), money(v, cur)]), 'No invoices yet.')}
      ${listCard('By supplier', bySup.map(([i, v]) => [`<a href="#/supplier/${i}">${esc(supplierName(i))}</a>`, money(v, cur)]), 'No invoices yet.')}
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Documents</h2></div>
      ${s.docs.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th>Type</th><th>Ref</th><th class="r">Lines</th><th class="r">Value</th></tr></thead><tbody>
      ${s.docs.sort((a, b) => b.date.localeCompare(a.date)).map(d => { const rs = s.rows.filter(r => r.docId === d.id); return `<tr><td>${fmtDate(d.date)}</td><td><a href="#/supplier/${d.supplierId}">${esc(supplierName(d.supplierId))}</a></td><td>${docLabel(d.docType)}</td><td>${esc(d.docRef)}</td><td class="r">${rs.length}</td><td class="r num">${money(rs.reduce((t, r) => t + lineTotal(r), 0))}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted small">Pick this project in "Terms & project" when adding a quote or invoice.</p>'}</div>`;
  $('#pjRen').onclick = async () => { const n = await askDialog({ title: 'Rename project', input: p.name, okText: 'Save' }); if (n) { db.renameProject(id, n); renderProject(id); } };
  $('#pjDel').onclick = async () => { if (await confirmDialog(`Delete project "${p.name}"?`, 'Documents stay; they are just no longer tagged.')) { db.deleteProject(id); location.hash = '#/projects'; } };
  $('#pjShare').onclick = () => shareSheet([`*${p.name}* — purchases`, '', `Total: ${money(s.spend, cur)} (before VAT)`, '', ...bySup.map(([i, v]) => `• ${supplierName(i)}: ${money(v, cur)}`), '', ...byCat.map(([c, v]) => `• ${c}: ${money(v, cur)}`)].join('\n'), { title: 'Share project' });
}
