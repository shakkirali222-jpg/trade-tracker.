// Material list pricing: upload/paste a list of materials (text, Excel, photo, PDF)
// and get the best known price + supplier for every line, totals, and who to buy from.

import * as db from './store.js';
import { extractList } from './extract.js';
import { convertPrice, cleanUnit } from './units.js';
import { icon } from './icons.js';
import { $, $$, esc, S, view, money, fmtDate, ago, supplierName, toast, askDialog, confirmDialog, empty, download, uploadWidget, shareSheet } from './ui.js';

let current = null; // {id?, name, items:[{name, qty, unit, note, productId?}]}

export function renderMaterials(arg) {
  if (arg) {
    const saved = S().lists.find(l => l.id === arg);
    if (saved) current = JSON.parse(JSON.stringify(saved));
  }
  view().innerHTML = `
    <div class="page-head">
      <div><h1>Material list</h1><p>Add a list of materials — the app fills in the best price and supplier for each line.</p></div>
      <div class="btn-row" id="mlTop"></div>
    </div>
    <div id="mlBody"></div>`;
  current ? showPriced() : showStart();
}

function showStart() {
  current = null;
  const lists = S().lists;
  $('#mlTop').innerHTML = `<button class="btn" id="mlType">${icon.edit} Type a list</button>`;
  $('#mlType').addEventListener('click', () => editList({ name: '', items: [{ name: '', qty: '', unit: '' }] }));
  const body = $('#mlBody');
  body.innerHTML = `<div id="mlUpload"></div>
    ${lists.length ? `<div class="section-title"><h2>Saved lists</h2></div>
      <div class="product-list">${lists.map(l => `<a class="product-row" href="#/materials/${l.id}">
        <div><div class="name">${icon.list.replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:6px"')}${esc(l.name || 'Material list')}</div>
        <div class="meta">${l.items.length} items · ${l.createdAt ? ago(new Date(l.createdAt).toISOString().slice(0, 10)) : ''}</div></div>
        <span class="muted small">Open →</span></a>`).join('')}</div>` : ''}`;
  uploadWidget($('#mlUpload'), {
    title: 'Upload your material list',
    subtitle: 'Excel, PDF, photo, text file — or paste it from WhatsApp. Quantities are optional.',
    readFile: (f, st) => extractList(f, st),
    readText: (t, st) => extractList(t, st),
    pasteHint: 'your material list (one item per line)',
    readLabel: 'Price this list',
    onResult: data => {
      if (!data.items.length) { toast('No materials found in that — try typing the list.', true); return showStart(); }
      editList({ name: data.title || '', items: data.items, offline: data.offline, offlineReason: data.offlineReason, fromFile: data.fromFile });
    },
  });
}

// ---------- Step 1: check the list ----------
function editList(list) {
  $('#mlTop').innerHTML = '';
  const items = list.items.map(i => ({ ...i }));
  const body = $('#mlBody');
  body.innerHTML = `
    ${list.offline ? `<div class="notice" style="margin-bottom:12px">${icon.alert}<div>Read with the basic reader — please check the lines.</div></div>` : ''}
    <div class="card">
      <div class="card-head"><h2>Check the list</h2><span class="small muted">${items.length} lines</span></div>
      <div class="field" style="margin-bottom:12px"><label>List name</label><input id="mlName" value="${esc(list.name)}" placeholder="e.g. Villa 12 – foundation"></div>
      <div class="table-wrap"><table class="items-table">
        <thead><tr><th>Material</th><th class="r">Qty</th><th>Unit</th><th></th></tr></thead>
        <tbody id="mlRows"></tbody></table></div>
      <button type="button" class="btn btn-sm" id="mlAdd" style="margin-top:10px">${icon.plus} Add line</button>
    </div>
    <div class="btn-row" style="justify-content:flex-end;margin-top:14px">
      <button class="btn" id="mlBack">Start over</button>
      <button class="btn btn-primary" id="mlGo">${icon.tag} Find prices</button>
    </div>`;
  const rows = $('#mlRows');
  const draw = () => {
    rows.innerHTML = items.map((it, i) => `<tr data-i="${i}">
      <td class="col-product" data-label="Material"><input data-k="name" value="${esc(it.name)}" placeholder="Material name"></td>
      <td class="col-num" data-label="Qty"><input data-k="qty" type="number" step="any" min="0" inputmode="decimal" style="text-align:right" value="${esc(it.qty)}"></td>
      <td class="col-unit" data-label="Unit"><input data-k="unit" value="${esc(it.unit)}" placeholder="bag"></td>
      <td class="col-del"><button type="button" class="btn btn-ghost btn-sm btn-danger" data-del>${icon.trash}</button></td></tr>`).join('');
  };
  draw();
  rows.addEventListener('input', e => { const tr = e.target.closest('tr'); if (tr && e.target.dataset.k) items[+tr.dataset.i][e.target.dataset.k] = e.target.value; });
  rows.addEventListener('click', e => { if (e.target.closest('[data-del]')) { items.splice(+e.target.closest('tr').dataset.i, 1); draw(); } });
  $('#mlAdd').addEventListener('click', () => { items.push({ name: '', qty: '', unit: '' }); draw(); $$('[data-k=name]', rows).at(-1).focus(); });
  $('#mlBack').addEventListener('click', showStart);
  $('#mlGo').addEventListener('click', () => {
    const clean = items.filter(i => String(i.name).trim()).map(i => ({ name: String(i.name).trim(), qty: i.qty === '' ? '' : Number(i.qty), unit: String(i.unit || '').trim(), note: i.note || '' }));
    if (!clean.length) return toast('Add at least one material.', true);
    current = { id: list.id, name: $('#mlName').value.trim() || 'Material list', items: clean };
    showPriced();
  });
}

// ---------- Step 2: priced list ----------
function priceLine(it) {
  const cur = S().settings.currency;
  if (it.productId === undefined) it.productId = db.bestMatch(it.name, 0.6)?.product.id || null;
  const product = it.productId ? db.getProduct(it.productId) : null;
  if (!product) return { it, product: null };
  const s = db.productSummary(product.id, cur) || db.productSummary(product.id);
  if (!s) return { it, product: null };
  // Express prices in the unit the list asks for, when possible
  let listUnit = cleanUnit(it.unit) ? it.unit : product.unit;
  let mismatch = false;
  const needs = cleanUnit(listUnit) && cleanUnit(product.unit) && cleanUnit(listUnit) !== cleanUnit(product.unit);
  if (needs && convertPrice(1, product.unit, listUnit, product) == null) { mismatch = true; listUnit = product.unit; }
  const conv = p => (needs && !mismatch ? convertPrice(p, product.unit, listUnit, product) : p);
  const offers = s.latestPerSupplier.map(r => ({ supplierId: r.supplierId, date: r.date, price: conv(r.price), currency: r.currency }))
    .filter(o => o.price != null).sort((a, b) => a.price - b.price);
  if (!offers.length) return { it, product, s, offers: [], unitNote: 'No comparable price' };
  const best = offers[0];
  const qty = Number(it.qty) || 0;
  // When the list's unit can't be converted (e.g. "rolls" vs "m"), show the price but no line total
  return { it, product, s, offers, best, unit: listUnit, mismatch, total: qty && !mismatch ? best.price * qty : null };
}

function showPriced() {
  const cur = S().settings.currency;
  const lines = current.items.map(priceLine);
  const priced = lines.filter(l => l.best);
  const missing = lines.filter(l => !l.best);
  const total = priced.reduce((t, l) => t + (l.total || 0), 0);
  const noQty = priced.filter(l => l.total == null).length;

  // Group by cheapest supplier
  const bySup = new Map();
  priced.forEach(l => { const k = l.best.supplierId; if (!bySup.has(k)) bySup.set(k, []); bySup.get(k).push(l); });
  // What each supplier could supply on its own
  const single = new Map();
  priced.forEach(l => l.offers.forEach(o => {
    if (!single.has(o.supplierId)) single.set(o.supplierId, { count: 0, total: 0 });
    const x = single.get(o.supplierId); x.count++; x.total += (Number(l.it.qty) || 0) * o.price;
  }));
  const singles = [...single.entries()].sort((a, b) => b[1].count - a[1].count || a[1].total - b[1].total).slice(0, 5);

  $('#mlTop').innerHTML = `
    <button class="btn" id="mlEdit">${icon.edit} Edit list</button>
    <button class="btn" id="mlSave">${icon.check} ${current.id ? 'Update saved list' : 'Save list'}</button>
    <button class="btn btn-primary" id="mlShare">${icon.whatsapp} Share</button>`;

  $('#mlBody').innerHTML = `
    <div class="card">
      <div class="card-head" style="margin-bottom:4px"><div><h2>${esc(current.name)}</h2><div class="small muted">${lines.length} materials</div></div></div>
      <div class="grid grid-4" style="margin-top:12px">
        <div class="stat" style="padding:0"><div class="label">Priced</div><div class="value" style="color:var(--good)">${priced.length}</div></div>
        <div class="stat" style="padding:0"><div class="label">No price yet</div><div class="value" style="color:${missing.length ? 'var(--warn)' : 'inherit'}">${missing.length}</div></div>
        <div class="stat" style="padding:0"><div class="label">Suppliers needed</div><div class="value">${bySup.size}</div></div>
        <div class="stat" style="padding:0"><div class="label">Estimated total</div><div class="value">${total ? money(total, cur) : '—'}</div>
          <div class="sub">${noQty ? `${noQty} line${noQty > 1 ? 's' : ''} without quantity` : 'best prices, before VAT'}</div></div>
      </div>
      ${missing.length ? `<div class="btn-row" style="margin-top:14px"><button class="btn" id="mlRequest">${icon.send} Ask suppliers for the ${missing.length} missing price${missing.length > 1 ? 's' : ''}</button></div>` : ''}
    </div>

    ${bySup.size ? `<div class="section-title"><h2>Cheapest way to buy</h2><span class="small muted">each item from its cheapest supplier</span></div>
    <div class="grid grid-2">${[...bySup.entries()].map(([sid, ls]) => {
      const sup = db.getSupplier(sid);
      const t = ls.reduce((a, l) => a + (l.total || 0), 0);
      return `<div class="card"><div class="card-head" style="margin-bottom:6px"><h3><a href="#/supplier/${sid}">${esc(sup?.name || 'Unknown')}</a></h3>${t ? `<b class="num">${money(t, cur)}</b>` : ''}</div>
        <div class="small muted" style="margin-bottom:6px">${ls.length} item${ls.length > 1 ? 's' : ''}${sup?.phone ? ' · ' + esc(sup.phone) : ''}${sup?.paymentTerms ? ' · ' + esc(sup.paymentTerms) : ''}</div>
        <ul class="list-plain small">${ls.map(l => `<li><span>${esc(l.it.name)}${l.it.qty ? ` <span class="muted">× ${l.it.qty} ${esc(l.unit || '')}</span>` : ''}</span><b class="num">${money(l.best.price, l.best.currency)}</b></li>`).join('')}</ul></div>`;
    }).join('')}</div>` : ''}

    ${singles.length > 1 ? `<div class="card" style="margin-top:16px"><div class="card-head"><h2>If you buy from one supplier</h2></div>
      <ul class="list-plain">${singles.map(([sid, x]) => `<li><span><a href="#/supplier/${sid}">${esc(supplierName(sid))}</a> <span class="small muted">has ${x.count} of ${lines.length} items</span></span><b class="num">${x.total ? money(x.total, cur) : ''}</b></li>`).join('')}</ul></div>` : ''}

    <div class="section-title"><h2>Line by line</h2></div>
    <div class="card"><div class="table-wrap"><table class="ml-table">
      <thead><tr><th>Material</th><th class="r">Qty</th><th class="r">Best price</th><th>Supplier</th><th class="r">Line total</th><th>Other offers</th></tr></thead>
      <tbody>${lines.map((l, i) => `<tr>
        <td class="ml-name"><b>${esc(l.it.name)}</b>${l.product && l.product.name.toLowerCase() !== l.it.name.toLowerCase() ? `<div class="small muted">= <a href="#/product/${l.product.id}">${esc(l.product.name)}</a></div>` : ''}
          <div><select class="match-select" data-match="${i}" style="margin-top:4px">${matchOptions(l)}</select></div></td>
        <td class="r num" data-label="Qty">${l.it.qty || '—'} ${esc(l.it.unit || '')}</td>
        ${l.best ? `<td class="r num" data-label="Best price"><b>${money(l.best.price, l.best.currency)}</b><div class="small ${l.mismatch ? '' : 'muted'}" ${l.mismatch ? 'style="color:var(--warn)"' : ''}>per ${esc(l.unit || l.product.unit || 'unit')}${l.mismatch ? ` (list says ${esc(l.it.unit)})` : ''}</div></td>
          <td data-label="Supplier"><a href="#/supplier/${l.best.supplierId}">${esc(supplierName(l.best.supplierId))}</a><div class="small muted">${fmtDate(l.best.date)}</div></td>
          <td class="r num" data-label="Line total">${l.total != null ? money(l.total, l.best.currency) : '—'}</td>
          <td class="small" data-label="Other offers">${l.offers.slice(1, 3).map(o => `${esc(supplierName(o.supplierId))}: ${money(o.price)}`).join('<br>') || '<span class="muted">—</span>'}</td>`
        : `<td colspan="4" class="ml-none"><span class="badge badge-warn">${icon.info} ${l.product ? esc(l.unitNote || 'No comparable price') : 'No price saved yet'}</span></td>`}
      </tr>`).join('')}</tbody></table></div></div>`;

  $('#mlEdit').addEventListener('click', () => editList({ ...current }));
  $('#mlSave').addEventListener('click', async () => {
    const name = await askDialog({ title: 'Save list', input: current.name, okText: 'Save' });
    if (!name) return;
    current.name = name;
    const saved = db.saveList({ id: current.id, name, items: current.items.map(({ name, qty, unit, note, productId }) => ({ name, qty, unit, note, productId: productId ?? null })) });
    current.id = saved.id;
    toast('List saved'); showPriced();
  });
  $('#mlShare').addEventListener('click', () => shareSheet(listText(current, lines, total, cur, bySup), { title: 'Share priced list' }));
  $('#mlRequest')?.addEventListener('click', () => {
    sessionStorage.setItem('pb.requestItems', JSON.stringify(missing.map(l => ({ name: l.it.name, qty: l.it.qty, unit: l.it.unit }))));
    location.hash = '#/request';
  });
  $$('[data-match]').forEach(sel => sel.addEventListener('change', () => {
    current.items[+sel.dataset.match].productId = sel.value || null;
    showPriced();
  }));
  if (current.id) {
    const del = document.createElement('button');
    del.className = 'btn btn-ghost btn-danger'; del.innerHTML = `${icon.trash} Delete`;
    del.onclick = async () => { if (await confirmDialog('Delete this saved list?')) { db.deleteList(current.id); current = null; toast('List deleted'); location.hash = '#/materials'; } };
    $('#mlTop').prepend(del);
  }
}

function matchOptions(l) {
  const cands = db.matchProducts(l.it.name, 6);
  const sel = l.it.productId;
  const opts = cands.map(c => `<option value="${c.product.id}" ${c.product.id === sel ? 'selected' : ''}>= ${esc(c.product.name)} (${Math.round(c.score * 100)}%)</option>`);
  if (sel && !cands.some(c => c.product.id === sel)) { const p = db.getProduct(sel); if (p) opts.unshift(`<option value="${p.id}" selected>= ${esc(p.name)}</option>`); }
  return `<option value="" ${!sel ? 'selected' : ''}>${cands.length ? 'Not matched — pick a product' : 'No similar product saved'}</option>` + opts.join('');
}

function listText(list, lines, total, cur, bySup) {
  const out = [`*${list.name}* — prices`, ''];
  lines.forEach((l, i) => {
    const q = l.it.qty ? ` × ${l.it.qty} ${l.it.unit || ''}`.trimEnd() : '';
    out.push(l.best ? `${i + 1}. ${l.it.name}${q} — ${money(l.best.price, l.best.currency)} (${supplierName(l.best.supplierId)})${l.total != null ? ` = ${money(l.total, l.best.currency)}` : ''}` : `${i + 1}. ${l.it.name}${q} — no price yet`);
  });
  if (total) out.push('', `*Estimated total: ${money(total, cur)}* (before VAT)`);
  if (bySup.size > 1) { out.push('', 'Buy from:'); bySup.forEach((ls, sid) => out.push(`• ${supplierName(sid)}: ${ls.length} item${ls.length > 1 ? 's' : ''}`)); }
  return out.join('\n');
}
