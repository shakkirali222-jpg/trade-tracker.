import * as db from './store.js';
import { extractDocument, extractText, guessCategory, aiMode, aiStatus, resetSample } from './extract.js';
import { renderAssistant } from './assistant.js';
import { initSync, onSyncChange, sync, setTeamMode } from './sync.js';
import { renderMaterials } from './materials.js';
import { renderImport } from './importer.js';
import { renderRequest } from './request.js';
import { renderMulti } from './multiquote.js';
import { renderReports, renderProjects, renderProject } from './reports.js';
import { convertPrice, cleanUnit } from './units.js';
import { priceChart } from './chart.js';
import { icon } from './icons.js';
import { normalize } from './match.js';
import { $, $$, esc, S, view, money, fmtDate, ago, pct, supplierName, docLabel, toast, modal, askDialog, confirmDialog, NEW_CAT, shareSheet, categoryOptions, createCategory, wireCategorySelect, whyNoAi, empty, download, docForm, uploadWidget } from './ui.js';

// ================= router =================
const routes = {
  '': renderDashboard,
  dashboard: renderDashboard,
  add: renderAdd,
  search: renderSearch,
  compare: renderCompare,
  product: renderProduct,
  suppliers: renderSuppliers,
  supplier: renderSupplier,
  settings: renderSettings,
  ask: () => renderAssistant(view(), toast),
  materials: renderMaterials,
  import: renderImport,
  request: renderRequest,
  reports: renderReports,
  projects: renderProjects,
  project: renderProject,
  more: renderMore,
};

function router() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const fn = routes[name] || renderDashboard;
  const navKey = { product: 'search', supplier: 'suppliers', project: 'projects' }[name] || name || 'dashboard';
  const inMore = ['import', 'settings', 'suppliers', 'ask', 'request', 'reports', 'projects', 'more'].includes(navKey);
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === navKey || (inMore && a.dataset.nav === 'more')));
  window.scrollTo(0, 0);
  fn(arg ? decodeURIComponent(arg) : undefined);
  fillAiNotices();
  if (typeof paintSync === 'function') paintSync();
}

async function fillAiNotices() {
  const slots = $$('.ai-notice');
  if (!slots.length) return;
  const m = await aiMode();
  const html = {
    claude: `<div class="notice info">${icon.sparkle}<div><b>Claude reads your documents</b> using your Claude account — no API key needed. Photos, scans and PDFs all work. The first time, claude.ai asks you to allow it.</div></div>`,
    key: '',
    offline: `<div class="notice">${icon.alert}<div><b>Claude reading is off</b> — the basic reader is used (works best on clear, computer-made PDFs).<div class="small" style="margin-top:6px">${whyNoAi(aiStatus.reason)}</div></div></div>`,
  }[m];
  slots.forEach(el => { if (el.isConnected) el.innerHTML = html; });
}

// ================= Dashboard =================
function renderDashboard() {
  const st = S();
  const cur = st.settings.currency;
  const recent = [...st.prices].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const lastDate = st.prices.reduce((m, r) => (r.date > m ? r.date : m), '');

  // Biggest price movements (latest vs previous from the same supplier)
  const moves = st.products.map(p => ({ p, s: db.productSummary(p.id) }))
    .filter(o => o.s && o.s.change != null && Math.abs(o.s.change) >= 0.03)
    .sort((a, b) => Math.abs(b.s.change) - Math.abs(a.s.change)).slice(0, 6);

  const lim = Number(st.settings.alertPct) || 10;
  const monthAgo = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const alerts = st.products.map(p => ({ p, s: db.productSummary(p.id) }))
    .filter(o => o.s && o.s.change != null && o.s.change * 100 >= lim && o.s.latest.date >= monthAgo)
    .sort((a, b) => b.s.change - a.s.change).slice(0, 5);
  const catCounts = st.categories.map(c => ({ c, n: st.products.filter(p => p.category === c).length })).filter(o => o.n).sort((a, b) => b.n - a.n);

  view().innerHTML = `
    <div class="page-head">
      <div><h1>Price Book</h1><p>Track supplier prices, search history and check quotes in seconds.</p><div data-sync class="sync-line"></div></div>
      <div class="btn-row">
        <a class="btn" href="#/add">${icon.plus} Add prices</a>
        <a class="btn" href="#/materials">${icon.list} Price a list</a>
        <a class="btn" href="#/ask">${icon.sparkle} Ask AI</a>
        <a class="btn btn-primary" href="#/compare">${icon.compare} Check a quote</a>
      </div>
    </div>

    <div class="search-box" style="margin-bottom:18px">${icon.search}
      <input id="dashSearch" type="search" placeholder="Search a product or supplier…" autocomplete="off">
    </div>

    <div class="grid grid-4">
      <div class="card stat"><div class="label">Products</div><div class="value">${st.products.length}</div><div class="sub">${catCounts.length} categories</div></div>
      <div class="card stat"><div class="label">Suppliers</div><div class="value">${st.suppliers.length}</div><div class="sub">&nbsp;</div></div>
      <div class="card stat"><div class="label">Price records</div><div class="value">${st.prices.length}</div><div class="sub">all dates</div></div>
      <div class="card stat"><div class="label">Last update</div><div class="value" style="font-size:18px;margin-top:6px">${lastDate ? fmtDate(lastDate) : '—'}</div><div class="sub">${lastDate ? ago(lastDate) : 'no data yet'}</div></div>
    </div>

    ${!st.prices.length ? `
      <div class="card" style="margin-top:16px">${empty(icon.file, 'Start your price book',
        'Upload an invoice or quotation (PDF or photo) and the app will read the products, prices, date and supplier for you. Or type prices in by hand.',
        `<div class="btn-row" style="justify-content:center;margin-top:12px"><a class="btn btn-primary" href="#/add">${icon.upload} Upload first invoice</a><a class="btn" href="#/add?manual">${icon.edit} Type manually</a></div>`)}
      <div class="ai-notice" style="margin-top:8px"></div>
      </div>` : `
    ${alerts.length ? `<div class="card alert-card" style="margin-top:16px">
      <div class="card-head"><h2>${icon.bell.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px"')}Price alerts</h2><span class="small muted">up ${lim}% or more</span></div>
      <ul class="list-plain">${alerts.map(({ p, s }) => `<li><div style="min-width:0"><a href="#/product/${p.id}"><b>${esc(p.name)}</b></a>
        <div class="small muted">${esc(supplierName(s.latest.supplierId))}: ${money(s.prev.price, s.prev.currency)} → ${money(s.latest.price, s.latest.currency)} · ${fmtDate(s.latest.date)}</div></div>
        <span class="trend-up num">▲ ${pct(s.change)}</span></li>`).join('')}</ul></div>` : ''}
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Recently added</h2><a class="small" href="#/search">View all</a></div>
        <ul class="list-plain">
          ${recent.map(r => {
            const p = db.getProduct(r.productId);
            return `<li><div style="min-width:0"><a href="#/product/${r.productId}"><b>${esc(p?.name)}</b></a>
              <div class="small muted">${esc(supplierName(r.supplierId))} · ${fmtDate(r.date)}</div></div>
              <b class="num">${money(r.price, r.currency)}</b></li>`;
          }).join('')}
        </ul>
      </div>
      <div class="card">
        <div class="card-head"><h2>Price changes</h2><span class="small muted">latest vs previous</span></div>
        ${moves.length ? `<ul class="list-plain">${moves.map(({ p, s }) => `
          <li><div style="min-width:0"><a href="#/product/${p.id}"><b>${esc(p.name)}</b></a>
            <div class="small muted">${esc(supplierName(s.latest.supplierId))}: ${money(s.prev.price, s.prev.currency)} → ${money(s.latest.price, s.latest.currency)}</div></div>
            <span class="${s.change > 0 ? 'trend-up' : 'trend-down'} num">${s.change > 0 ? '▲' : '▼'} ${pct(s.change)}</span></li>`).join('')}</ul>`
          : '<p class="muted small">No notable price changes yet. Changes appear when you have the same product on different dates.</p>'}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Tools</h2></div>
      <div class="more-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${toolTiles()}</div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Categories</h2><a class="small" href="#/settings">Manage</a></div>
      <div class="chips">${catCounts.map(o => `<a class="chip chip-filter" href="#/search?cat=${encodeURIComponent(o.c)}">${esc(o.c)} <span class="muted">${o.n}</span></a>`).join('') || '<span class="muted small">No products yet</span>'}</div>
    </div>`}
  `;
  $('#dashSearch').addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = '#/search?q=' + encodeURIComponent(e.target.value); });
}

// ================= Add prices =================
function renderAdd() {
  const manual = location.hash.includes('manual');
  view().innerHTML = `
    <div class="page-head">
      <div><h1>Add prices</h1><p>Upload an invoice or quotation, or type prices in yourself.</p></div>
    </div>
    <div class="tabs" style="margin-bottom:16px">
      <button class="${manual ? '' : 'active'}" data-tab="upload">${icon.upload} Upload document</button>
      <button class="${manual ? 'active' : ''}" data-tab="manual">${icon.edit} Type manually</button>
    </div>
    <a class="notice info" href="#/import" style="margin-bottom:16px;color:var(--text)">${icon.whatsapp}<div><b>Many files or a whole WhatsApp group?</b> Use <u>Import many</u> — pick a WhatsApp chat export or select lots of PDFs and photos at once.</div></a>
    <div id="addBody"></div>`;

  const body = $('#addBody');
  const save = (header, items) => {
    const { added, skipped, supplier, alerts } = db.savePriceDocument(header, items);
    toast(`Saved ${added} price${added === 1 ? '' : 's'} from ${supplier.name}${skipped ? ` · ${skipped} duplicate/empty skipped` : ''}`);
    location.hash = '#/supplier/' + supplier.id;
    showAlerts(alerts);
  };
  const showUpload = () => uploadWidget(body, {
    title: 'Upload invoice or quotation',
    subtitle: 'The app reads product names, prices, date and supplier details for you.',
    onResult: data => docForm(body, data, { mode: 'save', onSubmit: save, onCancel: showUpload }),
  });
  const showManual = () => docForm(body, { docType: 'manual' }, { mode: 'save', onSubmit: save });

  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    $$('.tabs button').forEach(x => x.classList.toggle('active', x === b));
    b.dataset.tab === 'upload' ? showUpload() : showManual();
  }));
  manual ? showManual() : showUpload();
}

// ================= Search =================
function renderSearch() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const st = S();
  const state = { q: params.get('q') || '', cat: params.get('cat') || '', sup: params.get('sup') || '', sort: 'recent' };

  view().innerHTML = `
    <div class="page-head"><div><h1>Search prices</h1><p>Find any product or supplier and see every price you've received.</p></div></div>
    <div class="search-box">${icon.search}<input id="q" type="search" placeholder="Type a product name or supplier…" value="${esc(state.q)}" autofocus autocomplete="off"></div>
    <div class="grid grid-3" style="margin:12px 0">
      <div class="field"><label>Category</label><select id="fCat"><option value="">All categories</option>${st.categories.map(c => `<option ${c === state.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>Supplier</label><select id="fSup"><option value="">All suppliers</option>${[...st.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.id}" ${s.id === state.sup ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Sort by</label><select id="fSort">
        <option value="recent">Recently updated</option><option value="name">Name A–Z</option><option value="cheap">Lowest price</option><option value="count">Most quotes</option>
      </select></div>
    </div>
    <div id="supHits"></div>
    <div class="section-title"><h2 id="resCount"></h2></div>
    <div id="results" class="product-list"></div>`;

  const draw = () => {
    const q = normalize(state.q);
    const words = q.split(' ').filter(Boolean);
    // Suppliers matching the query
    const supHits = q ? st.suppliers.filter(s => words.every(w => normalize(s.name).includes(w))) : [];
    $('#supHits').innerHTML = supHits.length ? `<div class="section-title"><h2>Suppliers</h2></div><div class="product-list">${supHits.map(s => {
      const n = new Set(st.prices.filter(r => r.supplierId === s.id).map(r => r.productId)).size;
      return `<a class="product-row" href="#/supplier/${s.id}"><div><div class="name">${icon.truck.replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"')}${esc(s.name)}</div><div class="meta">${n} products${s.phone ? ' · ' + esc(s.phone) : ''}</div></div><span class="muted small">View →</span></a>`;
    }).join('')}</div>` : '';

    let list = st.products.map(p => {
      const s = db.productSummary(p.id);
      return { p, s };
    }).filter(o => o.s);

    if (state.cat) list = list.filter(o => o.p.category === state.cat);
    if (state.sup) list = list.filter(o => o.s.rows.some(r => r.supplierId === state.sup));
    if (q) {
      const supIds = new Set(supHits.map(s => s.id));
      list = list.filter(o => {
        const name = normalize(o.p.name + ' ' + o.p.category);
        return words.every(w => name.includes(w)) || o.s.rows.some(r => supIds.has(r.supplierId));
      });
    }
    const sorts = {
      recent: (a, b) => b.s.latest.date.localeCompare(a.s.latest.date),
      name: (a, b) => a.p.name.localeCompare(b.p.name),
      cheap: (a, b) => a.s.best.price - b.s.best.price,
      count: (a, b) => b.s.count - a.s.count,
    };
    list.sort(sorts[state.sort]);

    $('#resCount').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
    $('#results').innerHTML = list.length ? list.map(({ p, s }) => {
      const trend = s.change == null ? '' : s.change > 0.005 ? `<span class="trend-up">▲ ${pct(s.change)}</span>` : s.change < -0.005 ? `<span class="trend-down">▼ ${pct(s.change)}</span>` : '<span>no change</span>';
      return `<a class="product-row" href="#/product/${p.id}">
        <div style="min-width:0"><div class="name">${esc(p.name)}</div>
          <div class="meta"><span class="chip">${esc(p.category)}</span>${s.count} price${s.count === 1 ? '' : 's'} · ${s.supplierCount} supplier${s.supplierCount === 1 ? '' : 's'} · ${ago(s.latest.date)} ${trend}</div></div>
        <div class="price"><div class="small muted">Best price</div><div class="big">${money(s.best.price, s.best.currency)}</div><div class="who">${esc(supplierName(s.best.supplierId))}${p.unit ? ' · per ' + esc(p.unit) : ''}</div></div>
      </a>`;
    }).join('') : `<div class="card">${empty(icon.search, st.products.length ? 'Nothing found' : 'No prices yet', st.products.length ? 'Try a shorter word, or clear the filters.' : 'Add your first invoice or quotation to start searching.', st.products.length ? '' : `<a class="btn btn-primary" href="#/add" style="margin-top:10px">${icon.plus} Add prices</a>`)}</div>`;
  };

  $('#q').addEventListener('input', e => { state.q = e.target.value; draw(); });
  $('#fCat').addEventListener('change', e => { state.cat = e.target.value; draw(); });
  $('#fSup').addEventListener('change', e => { state.sup = e.target.value; draw(); });
  $('#fSort').addEventListener('change', e => { state.sort = e.target.value; draw(); });
  draw();
}

// ================= Product detail =================
function renderProduct(id) {
  const p = db.getProduct(id);
  if (!p) { view().innerHTML = `<div class="card">${empty(icon.box, 'Product not found', 'It may have been deleted.', '<a class="btn" href="#/search">Back to search</a>')}</div>`; return; }
  const s = db.productSummary(id);
  const cur = s.latest.currency;
  const currencies = [...new Set(s.rows.map(r => r.currency))];
  const bySup = new Map();
  s.rows.forEach(r => { if (r.currency !== cur) return; if (!bySup.has(r.supplierId)) bySup.set(r.supplierId, []); bySup.get(r.supplierId).push({ date: r.date, price: r.price }); });
  const series = [...bySup.entries()].map(([sid, pts]) => ({ name: supplierName(sid), points: pts }))
    .sort((a, b) => Math.min(...a.points.map(x => x.price)) - Math.min(...b.points.map(x => x.price)));
  const others = s.latestPerSupplier.filter(r => r.id !== s.best.id && r.currency === s.best.currency).sort((a, b) => a.price - b.price);

  view().innerHTML = `
    <a href="#/search" class="small" style="display:inline-flex;gap:6px;align-items:center;margin-bottom:10px">${icon.arrowLeft.replace('<svg', '<svg style="width:16px;height:16px"')} Back to search</a>
    <div class="page-head">
      <div><h1>${esc(p.name)}</h1><p><span class="chip">${esc(p.category)}</span> ${p.unit ? `· per ${esc(p.unit)}` : ''}</p></div>
      <div class="btn-row"><button class="btn" id="editP">${icon.edit} Edit</button><button class="btn" id="mergeP">Merge</button></div>
    </div>

    <div class="callout-best">${icon.star}<div><b>Best current price: ${money(s.best.price, s.best.currency)}</b> from <a href="#/supplier/${s.best.supplierId}">${esc(supplierName(s.best.supplierId))}</a> on ${fmtDate(s.best.date)}
      ${others.length ? `<div class="small" style="color:var(--text-2)">Next best: ${esc(supplierName(others[0].supplierId))} at ${money(others[0].price, others[0].currency)} (${pct((others[0].price - s.best.price) / s.best.price)})</div>` : ''}</div></div>

    <div class="grid grid-4" style="margin-top:16px">
      <div class="card stat"><div class="label">Latest price</div><div class="value">${money(s.latest.price, cur)}</div><div class="sub">${esc(supplierName(s.latest.supplierId))} · ${fmtDate(s.latest.date)}</div></div>
      <div class="card stat"><div class="label">Lowest ever</div><div class="value">${money(s.lowest.price, s.lowest.currency)}</div><div class="sub">${esc(supplierName(s.lowest.supplierId))} · ${fmtDate(s.lowest.date)}</div></div>
      <div class="card stat"><div class="label">Highest</div><div class="value">${money(s.highest.price, s.highest.currency)}</div><div class="sub">${esc(supplierName(s.highest.supplierId))} · ${fmtDate(s.highest.date)}</div></div>
      <div class="card stat"><div class="label">Average</div><div class="value">${money(s.avg, currencies.length === 1 ? cur : '')}</div><div class="sub">${s.count} prices · ${s.supplierCount} suppliers</div></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Price trend</h2><span class="small muted">${cur} · one line per supplier</span></div>
      <div class="chart" id="chart"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Price history</h2><span class="small muted">Green = best current price</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Supplier</th><th class="r">Unit price</th><th>Unit</th><th class="r">Qty</th><th>Source</th><th></th></tr></thead>
        <tbody>${s.rows.map(r => `<tr class="${r.id === s.best.id ? 'best' : ''}">
          <td style="white-space:nowrap">${fmtDate(r.date)}</td>
          <td><a href="#/supplier/${r.supplierId}">${esc(supplierName(r.supplierId))}</a></td>
          <td class="r num"><b>${money(r.rawPrice ?? r.price, r.currency)}</b>${r.rawUnit && cleanUnit(r.rawUnit) !== cleanUnit(p.unit) && !r.unconverted ? `<div class="small muted">= ${money(r.price)} / ${esc(p.unit)}</div>` : ''}</td>
          <td>${esc(r.rawUnit || r.unit || p.unit)}${r.unconverted ? ' <span class="small" style="color:var(--warn)" title="Set the pack size to compare">≠</span>' : ''}</td>
          <td class="r num">${r.qty ?? ''}</td>
          <td class="small">${docLabel(r.docType)}${r.docRef ? ' · ' + esc(r.docRef) : ''}</td>
          <td class="r"><button class="btn btn-ghost btn-sm btn-danger" data-delp="${r.id}" title="Delete this price">${icon.trash}</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;

  priceChart($('#chart'), series, v => money(v, cur));

  $$('[data-delp]').forEach(b => b.addEventListener('click', async () => {
    if (!await confirmDialog('Delete this price entry?')) return;
    db.deletePrice(b.dataset.delp);
    toast('Price deleted');
    db.getProduct(id) ? renderProduct(id) : (location.hash = '#/search');
  }));

  $('#editP').addEventListener('click', () => modal(`
    <h2>Edit product</h2>
    <form id="pf" class="stack">
      <div class="field"><label>Name</label><input name="name" value="${esc(p.name)}" required></div>
      <div class="field"><label>Category</label><select name="category" data-catsel>${categoryOptions(p.category)}</select></div>
      <div class="field"><label>Unit</label><input name="unit" value="${esc(p.unit)}"></div>
      <div class="field"><label>Pack size (optional)</label>
        <div class="btn-row" style="flex-wrap:nowrap"><span class="small muted" style="white-space:nowrap">1 ${esc(p.unit || 'unit')} =</span>
        <input name="packQty" type="number" step="any" min="0" inputmode="decimal" value="${esc(p.pack?.qty ?? '')}" placeholder="50" style="width:90px">
        <input name="packUnit" value="${esc(p.pack?.unit ?? '')}" placeholder="kg" style="width:90px"></div>
        <span class="small muted">Lets the app compare e.g. a price per bag with a price per kg or ton.</span></div>
      <div class="btn-row" style="justify-content:space-between"><button type="button" class="btn btn-danger" id="delP">${icon.trash} Delete product</button>
        <span class="btn-row"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></span></div>
    </form>`, (m, close) => {
    wireCategorySelect($('[name=category]', m), m);
    $('#pf', m).addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      const pq = Number(f.get('packQty')), pu = f.get('packUnit').trim();
      db.updateProduct(id, { name: f.get('name').trim(), category: f.get('category'), unit: f.get('unit').trim(), pack: pq > 0 && pu ? { qty: pq, unit: pu } : null });
      close(); toast('Product updated'); renderProduct(id);
    });
    $('#delP', m).addEventListener('click', async () => {
      if (!await confirmDialog(`Delete "${p.name}"?`, `This also deletes all ${s.count} of its prices.`)) return;
      db.deleteProduct(id); close(); toast('Product deleted'); location.hash = '#/search';
    });
  }));

  $('#mergeP').addEventListener('click', () => {
    const cands = db.matchProducts(p.name, 8).filter(m => m.product.id !== id);
    modal(`<h2>Merge duplicate</h2>
      <p class="small muted">If the same product was saved under two names, move all of this product's prices into the other one.</p>
      <div class="field"><label>Move prices of "${esc(p.name)}" into:</label>
      <select id="mergeTo">${(cands.length ? cands.map(c => c.product) : S().products.filter(x => x.id !== id)).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      <div class="btn-row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="doMerge">Merge</button></div>`, (m, close) => {
      $('#doMerge', m).addEventListener('click', () => {
        const to = $('#mergeTo', m).value; if (!to) return;
        db.mergeProduct(id, to); close(); toast('Products merged'); location.hash = '#/product/' + to;
      });
    });
  });
}

// ================= Compare quote =================
let compareSession = null; // keeps the current quote while on the page

function renderCompare() {
  const multi = location.hash.includes('multi');
  view().innerHTML = `
    <div class="page-head">
      <div><h1>${multi ? 'Compare quotes' : 'Check a quote'}</h1><p>${multi ? 'Put 2–6 quotations side by side: cheapest supplier per item and the best total.' : 'Upload a new quotation and instantly see how it compares with prices you\'ve had before.'}</p></div>
      <div class="btn-row" id="cmpTop"></div>
    </div>
    <div class="tabs tabs-2" style="margin-bottom:16px">
      <a class="tabs-a ${multi ? '' : 'active'}" href="#/compare">${icon.compare} One quote</a>
      <a class="tabs-a ${multi ? 'active' : ''}" href="#/compare?multi">${icon.grid} Several quotes</a>
    </div>
    <div id="cmpBody"></div>`;
  const body = $('#cmpBody');
  if (multi) return renderMulti(body, $('#cmpTop'));

  const start = () => {
    compareSession = null;
    $('#cmpTop').innerHTML = `<button class="btn" id="cmpManual">${icon.edit} Type quote instead</button>`;
    $('#cmpManual').addEventListener('click', () => { $('#cmpTop').innerHTML = ''; showForm({ docType: 'quotation' }); });
    uploadWidget(body, {
      title: 'Upload the quotation to check',
      subtitle: 'PDF, photo, Excel or pasted text. Each item is compared against your saved prices from all suppliers.',
      onResult: data => showForm(data),
    });
  };
  const showForm = data => {
    $('#cmpTop').innerHTML = '';
    docForm(body, data, {
      mode: 'compare', onCancel: start,
      onSubmit: (header, items) => { compareSession = { header, items }; showResults(); },
    });
  };
  const showResults = () => {
    $('#cmpTop').innerHTML = `<button class="btn" id="cmpNew">${icon.upload} Check another quote</button>`;
    $('#cmpNew').addEventListener('click', start);
    drawComparison(body, compareSession, () => showForm({ ...compareSession.header, items: compareSession.items }));
  };
  compareSession ? showResults() : start();
}

function analyse(header, it) {
  const cur = header.currency;
  const quoteSup = db.findSupplier(header.supplier.name);
  const product = it.productId ? db.getProduct(it.productId) : null;
  // Compare per the product's own unit (e.g. a quote per kg vs history per ton)
  let q = it.price, unitNote = '';
  if (product && cleanUnit(it.unit) && cleanUnit(product.unit) && cleanUnit(it.unit) !== cleanUnit(product.unit)) {
    const c = convertPrice(it.price, it.unit, product.unit, product);
    if (c != null) { q = c; unitNote = `${money(it.price)} per ${it.unit} = ${money(c)} per ${product.unit}`; }
    else unitNote = `quoted per ${it.unit}, history is per ${product.unit} — set the pack size on the product page to compare`;
  }
  const res = { it, product, q, unitNote };
  if (!res.product) return { ...res, status: 'new' };
  let s = db.productSummary(res.product.id, cur);
  if (!s) return { ...res, status: 'new', otherCurrency: !!db.productSummary(res.product.id) };
  // Ignore this same quote if it was already saved, and prices in units we can't convert
  const rows = s.rows.filter(r => !r.unconverted && !(quoteSup && r.supplierId === quoteSup.id && r.date === header.date && Math.abs(r.rawPrice - it.price) < 1e-9));
  if (!rows.length) return { ...res, status: 'new' };
  const latestPer = new Map();
  rows.forEach(r => { if (!latestPer.has(r.supplierId)) latestPer.set(r.supplierId, r); });
  const best = [...latestPer.values()].reduce((a, b) => (b.price < a.price ? b : a));
  const lowest = rows.reduce((a, b) => (b.price < a.price ? b : a));
  const last = rows[0];
  const sameSup = quoteSup ? rows.find(r => r.supplierId === quoteSup.id) : null;
  const diff = (q - best.price) / best.price;
  const status = diff <= -0.02 ? 'cheaper' : diff < 0.02 ? 'same' : diff <= 0.10 ? 'higher' : 'much-higher';
  return { ...res, status, best, lowest, last, sameSup, diff, quoteSupId: quoteSup?.id, supplierCount: latestPer.size };
}

function drawComparison(body, { header, items }, onEdit) {
  const cur = header.currency;
  const results = items.map(it => analyse(header, it));
  const counts = { cheaper: 0, same: 0, higher: 0, 'much-higher': 0, new: 0 };
  results.forEach(r => counts[r.status]++);
  const known = results.filter(r => r.status !== 'new');
  const withQty = known.filter(r => Number(r.it.qty) > 0);
  // Totals in the quote's own units (r.q may be converted to the product's unit)
  const quoteTotal = withQty.reduce((s, r) => s + r.it.price * r.it.qty, 0);
  const bestTotal = withQty.reduce((s, r) => s + Math.min(r.q, r.best.price) * (r.it.price / r.q) * r.it.qty, 0);
  const saving = quoteTotal - bestTotal;
  const worse = counts.higher + counts['much-higher'];

  let verdictCls, verdictText, verdictIcon;
  if (!known.length) { verdictCls = 'badge-info'; verdictText = 'No history to compare yet'; verdictIcon = icon.info; }
  else if (worse === 0) { verdictCls = 'badge-good'; verdictText = 'Good quote — at or below your best prices'; verdictIcon = icon.check; }
  else if (counts['much-higher'] > 0 || worse > known.length / 2) { verdictCls = 'badge-bad'; verdictText = 'Expensive — negotiate before accepting'; verdictIcon = icon.alert; }
  else { verdictCls = 'badge-warn'; verdictText = 'Mostly fine — a few items are higher'; verdictIcon = icon.alert; }

  const advice = [];
  results.filter(r => r.status === 'much-higher' || r.status === 'higher').sort((a, b) => b.diff - a.diff).slice(0, 5).forEach(r => {
    advice.push(`<b>${esc(r.it.product)}</b>: quoted ${money(r.q, cur)}, but <a href="#/supplier/${r.best.supplierId}">${esc(supplierName(r.best.supplierId))}</a> gave ${money(r.best.price, cur)} on ${fmtDate(r.best.date)} — ask for ${pct(-r.diff).replace('-', '')} less.`);
  });
  if (counts.cheaper) advice.push(`${counts.cheaper} item${counts.cheaper > 1 ? 's are' : ' is'} <b>cheaper</b> than anything you've had before — good opportunity.`);
  if (counts.new) advice.push(`${counts.new} item${counts.new > 1 ? 's have' : ' has'} no price history. Save this quote so it becomes your reference next time.`);

  const stCls = { cheaper: 'good', same: 'good', higher: 'warn', 'much-higher': 'bad', new: 'new' };
  const stBadge = r => ({
    cheaper: `<span class="badge badge-good">${icon.down} ${pct(r.diff)} · Cheaper than before</span>`,
    same: `<span class="badge badge-good">${icon.check} Same as your best price</span>`,
    higher: `<span class="badge badge-warn">${icon.up} ${pct(r.diff)} · Slightly higher</span>`,
    'much-higher': `<span class="badge badge-bad">${icon.up} ${pct(r.diff)} · Much higher</span>`,
    new: `<span class="badge badge-info">${icon.info} New item${r.otherCurrency ? ' (history in another currency)' : ''}</span>`,
  }[r.status]);

  body.innerHTML = `
    <div class="card">
      <div class="card-head" style="margin-bottom:6px">
        <div><h2>${esc(header.supplier.name)}</h2><div class="small muted">${docLabel(header.docType)}${header.docRef ? ' ' + esc(header.docRef) : ''} · ${fmtDate(header.date)} · ${items.length} items${header.paymentTerms ? ' · ' + esc(header.paymentTerms) : ''}${header.deliveryTime ? ' · delivery ' + esc(header.deliveryTime) : ''}</div>
          ${(() => { const sub = items.reduce((t, i) => t + (Number(i.qty) || 0) * i.price, 0); if (!sub) return ''; const del = Number(header.delivery) || 0, vat = Number(header.vatPct) || 0; return `<div class="small" style="margin-top:4px">Quote total: <b>${money((sub + del) * (1 + vat / 100), cur)}</b> <span class="muted">(${money(sub)}${del ? ' + delivery ' + money(del) : ''}${vat ? ' + VAT ' + vat + '%' : ''})</span></div>`; })()}</div>
        <span class="badge ${verdictCls}" style="font-size:14px;padding:8px 12px">${verdictIcon} ${verdictText}</span>
      </div>
      <div class="grid grid-4" style="margin-top:14px">
        <div class="stat" style="padding:0"><div class="label">Cheaper / same</div><div class="value" style="color:var(--good)">${counts.cheaper + counts.same}</div></div>
        <div class="stat" style="padding:0"><div class="label">Higher than best</div><div class="value" style="color:${worse ? 'var(--bad)' : 'inherit'}">${worse}</div></div>
        <div class="stat" style="padding:0"><div class="label">New items</div><div class="value">${counts.new}</div></div>
        <div class="stat" style="padding:0"><div class="label">Possible saving</div><div class="value" style="color:${saving > 0 ? 'var(--bad)' : 'inherit'}">${withQty.length ? money(saving, cur) : '—'}</div>
          <div class="sub">${withQty.length ? `quote ${money(quoteTotal, cur)} vs best ${money(bestTotal, cur)}` : 'add quantities to see totals'}</div></div>
      </div>
      ${advice.length ? `<div class="advice" style="margin-top:16px"><b>What to do</b><ul>${advice.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-primary" id="saveQuote">${icon.check} Save this quote to price history</button>
        <button class="btn" id="editQuote">${icon.edit} Edit items</button>
      </div>
    </div>

    <div class="section-title"><h2>Item by item</h2><span class="small muted">compared with the latest price from each supplier</span></div>
    ${results.map(r => `
      <div class="compare-item ${stCls[r.status]}">
        <div class="compare-top">
          <div style="min-width:0"><h3>${esc(r.it.product)}</h3>
            <div class="small muted">${r.product && normalize(r.product.name) !== normalize(r.it.product) ? `matched to <a href="#/product/${r.product.id}">${esc(r.product.name)}</a> · ` : r.product ? `<a href="#/product/${r.product.id}">view history</a> · ` : ''}${r.it.qty ? `qty ${r.it.qty}${r.it.unit ? ' ' + esc(r.it.unit) : ''}` : esc(r.it.unit || '')}</div>${r.unitNote ? `<div class="small" style="color:var(--brand)">${esc(r.unitNote)}</div>` : ''}</div>
          ${stBadge(r)}
        </div>
        <div class="compare-grid">
          <div class="box"><div class="k">This quote</div><div class="v">${money(r.q, cur)}</div><div class="s">${esc(header.supplier.name)}</div></div>
          ${r.status === 'new' ? `<div class="box" style="grid-column:span 2"><div class="k">Previous prices</div><div class="s" style="margin-top:4px">None yet — this will be the first price on record.</div></div>` : `
          <div class="box"><div class="k">Your best price</div><div class="v">${money(r.best.price, cur)}</div><div class="s">${esc(supplierName(r.best.supplierId))} · ${fmtDate(r.best.date)}</div></div>
          <div class="box"><div class="k">${r.sameSup ? 'Same supplier last time' : 'Last price paid'}</div><div class="v">${money((r.sameSup || r.last).price, cur)}</div>
            <div class="s">${r.sameSup ? `${fmtDate(r.sameSup.date)} · ${pct((r.q - r.sameSup.price) / r.sameSup.price)} now` : `${esc(supplierName(r.last.supplierId))} · ${fmtDate(r.last.date)}`}</div></div>`}
        </div>
        ${r.status !== 'new' && r.lowest.price < r.best.price ? `<div class="small muted" style="margin-top:8px">Lowest ever: ${money(r.lowest.price, cur)} from ${esc(supplierName(r.lowest.supplierId))} (${fmtDate(r.lowest.date)})</div>` : ''}
      </div>`).join('')}`;

  $('#saveQuote').addEventListener('click', () => {
    const { added, skipped, supplier } = db.savePriceDocument(header, items);
    toast(added ? `Saved ${added} price${added === 1 ? '' : 's'} from ${supplier.name}` : 'Already saved — nothing new to add');
    if (skipped && added) toast(`${skipped} already in history`);
    $('#saveQuote').disabled = true;
    $('#saveQuote').innerHTML = `${icon.check} Saved`;
  });
  $('#editQuote').addEventListener('click', onEdit);
}

// ================= Suppliers =================
function renderSuppliers() {
  const st = S();
  const rows = st.suppliers.map(s => {
    const pr = st.prices.filter(r => r.supplierId === s.id);
    return { s, products: new Set(pr.map(r => r.productId)).size, last: pr.reduce((m, r) => (r.date > m ? r.date : m), ''), bestCount: 0 };
  });
  // How many products this supplier is currently cheapest for
  st.products.forEach(p => { const sm = db.productSummary(p.id); if (sm) { const r = rows.find(x => x.s.id === sm.best.supplierId); if (r) r.bestCount++; } });
  rows.sort((a, b) => b.last.localeCompare(a.last));

  view().innerHTML = `
    <div class="page-head"><div><h1>Suppliers</h1><p>Everyone you've received prices from.</p></div>
      <a class="btn" href="#/settings">${icon.settings} Settings</a></div>
    <div class="search-box" style="margin-bottom:14px">${icon.search}<input id="sq" type="search" placeholder="Search suppliers…"></div>
    <div id="supList" class="product-list"></div>`;
  const draw = q => {
    const n = normalize(q);
    const list = rows.filter(r => !n || normalize(r.s.name + ' ' + r.s.phone + ' ' + r.s.email).includes(n));
    $('#supList').innerHTML = list.length ? list.map(r => `
      <a class="product-row" href="#/supplier/${r.s.id}">
        <div style="min-width:0"><div class="name">${esc(r.s.name)}</div>
          <div class="meta">${r.s.rating ? `<span class="stars">${'★'.repeat(r.s.rating)}</span>` : ''}${r.products} products${r.s.phone ? ' · ' + esc(r.s.phone) : ''}${r.s.paymentTerms ? ' · ' + esc(r.s.paymentTerms) : ''}</div></div>
        <div class="price"><div class="small muted">Cheapest for</div><div class="big">${r.bestCount}</div><div class="who">${r.last ? 'last ' + ago(r.last) : ''}</div></div>
      </a>`).join('') : `<div class="card">${empty(icon.truck, 'No suppliers yet', 'Suppliers are added automatically when you save an invoice or quotation.')}</div>`;
  };
  $('#sq').addEventListener('input', e => draw(e.target.value));
  draw('');
}

function renderSupplier(id) {
  const s = db.getSupplier(id);
  if (!s) { view().innerHTML = `<div class="card">${empty(icon.truck, 'Supplier not found', '', '<a class="btn" href="#/suppliers">All suppliers</a>')}</div>`; return; }
  const st = S();
  const pr = st.prices.filter(r => r.supplierId === id);
  const latest = new Map();
  [...pr].sort((a, b) => b.date.localeCompare(a.date)).forEach(r => { if (!latest.has(r.productId)) latest.set(r.productId, r); });
  const items = [...latest.values()].map(r => {
    const p = db.getProduct(r.productId);
    const sm = db.productSummary(r.productId, r.currency);
    const isBest = sm && sm.best.supplierId === id;
    const vsBest = sm && !isBest ? (r.price - sm.best.price) / sm.best.price : 0;
    return { r, p, sm, isBest, vsBest };
  }).sort((a, b) => (a.p?.name || '').localeCompare(b.p?.name || ''));
  const bestCount = items.filter(i => i.isBest).length;

  view().innerHTML = `
    <a href="#/suppliers" class="small" style="display:inline-flex;gap:6px;align-items:center;margin-bottom:10px">${icon.arrowLeft.replace('<svg', '<svg style="width:16px;height:16px"')} All suppliers</a>
    <div class="page-head">
      <div><h1>${esc(s.name)}</h1><p>${items.length} products · cheapest for ${bestCount}</p></div>
      <div class="btn-row"><button class="btn" id="editS">${icon.edit} Edit details</button>
        <button class="btn" id="shareS">${icon.whatsapp} Share price list</button>
        ${s.phone ? `<a class="btn" href="${'https://wa.me/' + s.phone.replace(/[^\d]/g, '').replace(/^00/, '')}" target="_blank" rel="noopener">${icon.whatsapp} Chat</a>` : ''}</div>
    </div>
    <div class="grid grid-2">
      <div class="card"><h2 style="margin-bottom:10px">Contact</h2>
        <dl class="kv">
          <dt>Contact</dt><dd>${esc(s.contact) || '—'}</dd>
          <dt>Phone</dt><dd>${s.phone ? `<a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a>` : '—'}</dd>
          <dt>Email</dt><dd>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '—'}</dd>
          <dt>Address</dt><dd>${esc(s.address) || '—'}</dd>
          <dt>Tax / TRN</dt><dd>${esc(s.taxId) || '—'}</dd>
          <dt>Rating</dt><dd>${s.rating ? `<span class="stars">${'★'.repeat(s.rating)}${'☆'.repeat(5 - s.rating)}</span>` : '—'}</dd>
          <dt>Payment terms</dt><dd>${esc(s.paymentTerms) || '—'}</dd>
          <dt>Delivery time</dt><dd>${esc(s.deliveryTime) || '—'}</dd>
          ${s.notes ? `<dt>Notes</dt><dd>${esc(s.notes)}</dd>` : ''}
        </dl></div>
      <div class="card"><h2 style="margin-bottom:10px">Summary</h2>
        <dl class="kv">
          <dt>Price records</dt><dd>${pr.length}</dd>
          <dt>Documents</dt><dd>${new Set(pr.map(r => r.docRef || r.date)).size}</dd>
          <dt>First price</dt><dd>${fmtDate(pr.reduce((m, r) => (!m || r.date < m ? r.date : m), ''))}</dd>
          <dt>Latest price</dt><dd>${fmtDate(pr.reduce((m, r) => (r.date > m ? r.date : m), ''))}</dd>
        </dl></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Products & latest prices</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Product</th><th>Category</th><th class="r">Latest price</th><th>Date</th><th>vs best</th></tr></thead>
        <tbody>${items.map(({ r, p, sm, isBest, vsBest }) => `<tr class="clickable" data-go="#/product/${r.productId}">
          <td><b>${esc(p?.name)}</b></td><td><span class="chip">${esc(p?.category)}</span></td>
          <td class="r num"><b>${money(r.price, r.currency)}</b></td><td style="white-space:nowrap">${fmtDate(r.date)}</td>
          <td>${isBest ? (sm.supplierCount > 1 ? `<span class="badge badge-good">${icon.star} Best</span>` : '<span class="muted small">only supplier</span>') : `<span class="trend-up num">${pct(vsBest)}</span> <span class="small muted">vs ${esc(supplierName(sm.best.supplierId))}</span>`}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;

  $$('[data-go]').forEach(tr => tr.addEventListener('click', () => (location.hash = tr.dataset.go)));
  $('#shareS').addEventListener('click', () => shareSheet([`*${s.name}* — latest prices`, '', ...items.map(({ r, p }) => `• ${p?.name}: ${money(r.price, r.currency)}${r.unit ? ' / ' + r.unit : ''} (${fmtDate(r.date)})`)].join('\n'), { title: 'Share price list' }));
  $('#editS').addEventListener('click', () => modal(`
    <h2>Edit supplier</h2>
    <form id="sf" class="stack">
      ${[['name', 'Name'], ['contact', 'Contact person'], ['phone', 'Phone (with country code, e.g. +971…)'], ['email', 'Email'], ['address', 'Address'], ['taxId', 'Tax / TRN no.'], ['paymentTerms', 'Payment terms'], ['deliveryTime', 'Usual delivery time']].map(([k, l]) => `<div class="field"><label>${l}</label><input name="${k}" value="${esc(s[k] || '')}" ${k === 'name' ? 'required' : ''}></div>`).join('')}
      <div class="field"><label>Rating</label><select name="rating">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(s.rating || 0) === n ? 'selected' : ''}>${n ? '★'.repeat(n) + ' ' + ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][n] : 'Not rated'}</option>`).join('')}</select></div>
      <div class="field"><label>Notes</label><textarea name="notes" placeholder="Reliability, quality, contact tips…">${esc(s.notes || '')}</textarea></div>
      <div class="btn-row" style="justify-content:space-between"><button type="button" class="btn btn-danger" id="delS">${icon.trash} Delete</button>
        <span class="btn-row"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Save</button></span></div>
    </form>`, (m, close) => {
    $('#sf', m).addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      Object.keys(f).forEach(k => (f[k] = String(f[k]).trim()));
      f.rating = Number(f.rating) || 0;
      db.updateSupplier(id, f); close(); toast('Supplier updated'); renderSupplier(id);
    });
    $('#delS', m).addEventListener('click', async () => {
      if (!await confirmDialog(`Delete ${s.name}?`, `This also deletes all ${pr.length} of their prices.`)) return;
      db.deleteSupplier(id); close(); toast('Supplier deleted'); location.hash = '#/suppliers';
    });
  }));
}

// ================= Settings =================
function renderSettings() {
  const st = S();
  const key = db.getApiKey();
  view().innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>AI reading, currency, categories and backups.</p></div></div>

    <div class="card">
      <div class="card-head"><h2>${icon.sparkle.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px"')}AI document reading</h2>
        <span class="badge badge-info" id="aiBadge">Checking…</span></div>
      <div id="aiModeText" class="small" style="margin-bottom:12px"></div>
      <p class="small muted" style="margin-top:0">Optional: paste an Anthropic API key (from console.anthropic.com) to use AI outside claude.ai.
        The key is stored only in this browser. Documents are sent to Anthropic only for reading and are not saved by this app.</p>
      <div class="grid grid-2">
        <div class="field"><label>API key</label><input id="apiKey" type="password" placeholder="sk-ant-…" value="${esc(key)}" autocomplete="off"></div>
        <div class="field"><label>AI model</label><select id="model">
          <option value="claude-opus-5-5">Most accurate (Claude Opus 5.5)</option>
          <option value="claude-sonnet-5-5">Balanced (Claude Sonnet 5.5)</option>
          <option value="claude-haiku-5-5">Fastest & cheapest (Claude Haiku 5.5)</option>
        </select></div>
      </div>
      <div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="saveKey">Save</button>${key ? '<button class="btn btn-danger" id="clearKey">Remove key</button>' : ''}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>General</h2></div>
      <div class="grid grid-2">
        <div class="field"><label>Default currency</label><input id="currency" maxlength="3" value="${esc(st.settings.currency)}" style="text-transform:uppercase"></div>
        <div class="field"><label>Appearance</label><select id="theme">
          <option value="auto">Match my device</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
        <div class="field"><label>Default VAT %</label><input id="vatPct" type="number" step="any" min="0" value="${esc(st.settings.vatPct ?? '')}"></div>
        <div class="field"><label>Price alert when a price rises by (%)</label><input id="alertPct" type="number" step="any" min="1" value="${esc(st.settings.alertPct ?? 10)}"></div>
      </div>
    </div>

    <div class="card" id="teamCard">
      <div class="card-head"><h2>Team price book</h2><span class="badge ${sync.team ? 'badge-good' : 'badge-info'}">${sync.team ? 'Shared with team' : 'Private'}</span></div>
      ${!sync.available ? '<p class="small muted" style="margin:0">Open Price Book inside the Claude app or claude.ai to use a team price book.</p>'
        : sync.team ? `<p class="small" style="margin:0 0 10px">Everyone you share this page with (as <b>Contributor</b> or <b>Editor</b>) uses this same price book. Share it from the page's <b>Share</b> button at the top.${sync.canWrite ? '' : ' <b>You can only view it.</b>'}</p>
            ${sync.isOwner ? '<button class="btn" id="teamOff">Switch back to a private price book</button>' : ''}`
        : sync.isOwner ? `<p class="small" style="margin:0 0 10px">Let colleagues add and see prices in one shared book. Your current prices are copied into it. Then share this page with them from the <b>Share</b> button at the top (choose Contributor).</p>
            <button class="btn btn-primary" id="teamOn">Share my price book with my team</button>`
        : '<p class="small muted" style="margin:0">Only the owner of this page can turn on a team price book.</p>'}
    </div>

    <div class="card">
      <div class="card-head"><h2>Material categories</h2><span class="small muted">${st.categories.length} categories</span></div>
      <ul class="list-plain" id="catList">${st.categories.map(c => {
        const n = st.products.filter(p => p.category === c).length;
        return `<li><span>${esc(c)} <span class="muted small">· ${n} product${n === 1 ? '' : 's'}</span></span>
          <span class="btn-row">${c !== 'Other' ? `<button class="btn btn-ghost btn-sm" data-ren="${esc(c)}">${icon.edit}</button><button class="btn btn-ghost btn-sm btn-danger" data-delc="${esc(c)}">${icon.trash}</button>` : ''}</span></li>`;
      }).join('')}</ul>
      <form id="addCat" class="btn-row" style="margin-top:12px"><input name="c" placeholder="New category, e.g. Gypsum & Ceiling" style="flex:1;min-width:200px" required><button class="btn">${icon.plus} Add</button></form>
    </div>

    <div class="card">
      <div class="card-head"><h2>Where your data is saved</h2></div>
      <div data-sync class="sync-line" style="margin-bottom:8px"></div>
      <p class="small muted" style="margin-top:0">Inside the Claude app or claude.ai, your prices are saved privately to your Claude account, so they stay after you close the app and appear on your other devices. A backup file is still a good idea now and then.</p>
      <div class="btn-row">
        <button class="btn" id="expJson">${icon.download} Download backup</button>
        <button class="btn" id="impJson">${icon.upload} Restore backup</button>
        <button class="btn" id="expCsv">${icon.download} Export to Excel (CSV)</button>
        <input type="file" id="impFile" accept="application/json,.json" hidden>
      </div>
      <hr style="border:0;border-top:1px solid var(--border);margin:18px 0">
      <button class="btn btn-danger" id="wipe">${icon.trash} Delete all data</button>
    </div>`;

  aiMode().then(m => {
    const badge = $('#aiBadge'), txt = $('#aiModeText');
    if (!badge) return;
    const info = {
      claude: ['badge-good', 'Ready — using your Claude account', 'You are using the app inside claude.ai, so Claude reads your invoices and answers <a href="#/ask">Ask AI</a> questions using your own Claude account. <b>No API key needed.</b> The first time, claude.ai asks you to allow it.'],
      key: ['badge-good', 'Ready — using your API key', 'Claude reads invoices and answers <a href="#/ask">Ask AI</a> questions using your API key below.'],
      offline: ['badge-warn', 'Basic reader only', whyNoAi(aiStatus.reason)],
    }[m];
    badge.className = 'badge ' + info[0]; badge.textContent = info[1]; txt.innerHTML = info[2];
  });
  $('#model').value = st.settings.model;
  $('#theme').value = st.settings.theme;
  $('#saveKey').addEventListener('click', () => {
    db.setApiKey($('#apiKey').value);
    db.updateSettings({ model: $('#model').value });
    toast('AI settings saved'); renderSettings();
  });
  $('#clearKey')?.addEventListener('click', () => { db.setApiKey(''); toast('API key removed'); renderSettings(); });
  $('#model').addEventListener('change', e => db.updateSettings({ model: e.target.value }));
  $('#currency').addEventListener('change', e => { db.updateSettings({ currency: e.target.value.toUpperCase().trim() || 'AED', currencySet: true }); toast('Currency saved'); });
  $('#theme').addEventListener('change', e => { db.updateSettings({ theme: e.target.value }); applyTheme(); });
  $('#vatPct').addEventListener('change', e => { db.updateSettings({ vatPct: e.target.value === '' ? '' : Number(e.target.value) }); toast('Default VAT saved'); });
  $('#alertPct').addEventListener('change', e => { db.updateSettings({ alertPct: Number(e.target.value) || 10 }); toast('Alert level saved'); });
  $('#teamOn')?.addEventListener('click', async () => {
    if (!await askDialog({ title: 'Share with your team?', text: 'Your prices are copied into a shared team price book. Everyone you share this page with as Contributor or Editor can see and add prices.', okText: 'Turn on team book' })) return;
    try { await setTeamMode(true); toast('Team price book is on — now share this page with your team'); renderSettings(); } catch (e) { toast(e.message || 'Could not switch', true); }
  });
  $('#teamOff')?.addEventListener('click', async () => {
    if (!await askDialog({ title: 'Switch back to private?', text: 'You keep a private copy of all current prices. Your team will no longer see new prices you add.', okText: 'Switch to private' })) return;
    try { await setTeamMode(false); toast('Back to your private price book'); renderSettings(); } catch (e) { toast(e.message || 'Could not switch', true); }
  });

  $('#catList').addEventListener('click', async e => {
    const ren = e.target.closest('[data-ren]'), del = e.target.closest('[data-delc]');
    if (ren) { const n = await askDialog({ title: 'Rename category', input: ren.dataset.ren, okText: 'Save' }); if (n) { db.renameCategory(ren.dataset.ren, n); renderSettings(); } }
    if (del && await confirmDialog(`Delete category "${del.dataset.delc}"?`, 'Its products move to "Other".')) { db.deleteCategory(del.dataset.delc); renderSettings(); }
  });
  $('#addCat').addEventListener('submit', e => {
    e.preventDefault();
    db.addCategory(e.target.c.value) ? (toast('Category added'), renderSettings()) : toast('That category already exists', true);
  });

  $('#expJson').addEventListener('click', () => download(`price-book-backup-${db.today()}.json`, db.exportJSON(), 'application/json'));
  $('#impJson').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!await confirmDialog('Restore this backup?', 'It replaces all current data with the backup.', 'Restore')) { e.target.value = ''; return; }
    try { db.importJSON(await f.text()); toast('Backup restored'); applyTheme(); location.hash = '#/'; }
    catch (err) { toast(err.message, true); }
  });
  $('#expCsv').addEventListener('click', () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Date', 'Product', 'Category', 'Supplier', 'Unit price', 'Currency', 'Unit', 'Qty', 'Document', 'Reference'];
    const lines = [...st.prices].sort((a, b) => b.date.localeCompare(a.date)).map(r => {
      const p = db.getProduct(r.productId);
      return [r.date, p?.name, p?.category, supplierName(r.supplierId), r.price, r.currency, r.unit, r.qty ?? '', docLabel(r.docType), r.docRef].map(q).join(',');
    });
    download(`price-book-${db.today()}.csv`, '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv');
  });
  $('#wipe').addEventListener('click', async () => {
    const typed = await askDialog({ title: 'Delete all data?', text: 'All products, suppliers and prices will be deleted. This cannot be undone. Type DELETE to confirm.', input: '', placeholder: 'DELETE', okText: 'Delete everything', danger: true });
    if (typed !== 'DELETE') { if (typed !== null) toast('Not deleted — you must type DELETE', true); return; }
    db.clearAll(); toast('All data deleted'); location.hash = '#/';
  });
}

// ================= Price alerts, tools, More =================
function showAlerts(alerts) {
  if (!alerts || !alerts.length) return;
  const cur = S().settings.currency;
  modal(`<h2>${icon.bell.replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-3px;margin-right:6px;color:var(--bad)"')}Price alert</h2>
    <p class="small" style="margin:0 0 10px">${alerts.length === 1 ? 'This price is' : 'These prices are'} more than ${S().settings.alertPct || 10}% above your best price:</p>
    <ul class="list-plain">${alerts.map(a => `<li><div><a href="#/product/${a.productId}" data-close><b>${esc(a.product)}</b></a>
      <div class="small muted">Best: ${money(a.best.price, a.best.currency)} from ${esc(supplierName(a.best.supplierId))} (${fmtDate(a.best.date)})</div></div>
      <span class="trend-up num">${money(a.price, cur)}<br>▲ ${pct(a.change)}</span></li>`).join('')}</ul>
    <div class="btn-row" style="justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" data-close>OK</button></div>`);
}

const TOOLS = [
  ['#/import', 'whatsapp', 'Import from WhatsApp', 'A whole group or many files at once'],
  ['#/materials', 'list', 'Price a material list', 'Best price & supplier for every line'],
  ['#/compare?multi', 'grid', 'Compare quotes', '2–6 quotes side by side'],
  ['#/request', 'send', 'Request quotes', 'WhatsApp message to suppliers'],
  ['#/ask', 'sparkle', 'Ask AI', 'Questions about your prices'],
  ['#/reports', 'chart', 'Monthly report', 'Spend & price changes'],
  ['#/projects', 'folder', 'Projects / sites', 'Spend per project'],
  ['#/suppliers', 'truck', 'Suppliers', 'Contacts, ratings, terms'],
  ['#/settings', 'settings', 'Settings', 'Categories, team, backup'],
];
function toolTiles(skip = []) {
  return TOOLS.filter(t => !skip.includes(t[0])).map(([href, ic, t, d]) => `<a class="more-tile" href="${href}">${icon[ic]}<b>${t}</b><span>${d}</span></a>`).join('');
}
function renderMore() {
  view().innerHTML = `<div class="page-head"><div><h1>More</h1><p>All Price Book tools.</p></div></div>
    <div class="more-grid">${toolTiles()}</div>`;
}

// ================= boot =================
function applyTheme() {
  const t = S().settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ----- Saving to the Claude account -----
// If the default currency was only guessed and most saved prices use another one, follow the prices.
function fixCurrency() {
  const st = S();
  if (st.settings.currencySet || !st.prices.length) return;
  const count = {};
  st.prices.forEach(r => { if (r.currency) count[r.currency] = (count[r.currency] || 0) + 1; });
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] !== st.settings.currency) db.updateSettings({ currency: top[0] });
}

function syncText(st) {
  const t = {
    saved: ['ok', st.team ? 'Saved to the team price book' : 'Saved to your Claude account'],
    saving: ['busy', st.team ? 'Saving to the team price book…' : 'Saving to your Claude account…'],
    loading: ['busy', 'Loading your prices from your Claude account…'],
    error: ['warn', st.detail || 'Could not save to your Claude account'],
    local: ['warn', st.detail || 'Saved on this device only — open Price Book in the Claude app to keep it in your Claude account'],
  }[st.status] || ['warn', ''];
  return `<span class="sync-dot sync-${t[0]}"></span>${esc(t[1])}`;
}
function paintSync() { $$('[data-sync]').forEach(el => { el.innerHTML = syncText(sync); }); }
onSyncChange(paintSync);

applyTheme();
window.addEventListener('hashchange', router);
router();
paintSync();

fixCurrency();
initSync(reason => {
  applyTheme();
  fixCurrency();
  // Don't wipe a half-filled form; otherwise redraw with the loaded data
  const formOpen = !!$('#docForm') || !!$('.modal-back');
  if (!formOpen) router();
  if (reason === 'loaded' || reason === 'merged') toast('Your prices are loaded from your Claude account');
  if (reason === 'uploaded') toast('Your prices are now saved to your Claude account');
  if (reason === 'refreshed') toast('Updated with changes from your other device');
});
