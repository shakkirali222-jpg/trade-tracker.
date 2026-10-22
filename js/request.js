// Quote request: pick materials + quantities, pick suppliers, send a ready-made WhatsApp message.

import * as db from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, S, view, toast, shareSheet, projectOptions, wireProjectSelect } from './ui.js';

export function renderRequest() {
  let items = [];
  try { items = JSON.parse(sessionStorage.getItem('pb.requestItems') || '[]'); sessionStorage.removeItem('pb.requestItems'); } catch { /* none */ }
  if (!items.length) items = [{ name: '', qty: '', unit: '' }];
  const st = S();

  view().innerHTML = `
    <div class="page-head"><div><h1>Request quotes</h1><p>Make a price request and send it to your suppliers on WhatsApp.</p></div></div>
    <div class="card">
      <div class="card-head"><h2>1. Materials</h2></div>
      <div class="table-wrap"><table class="items-table">
        <thead><tr><th>Material</th><th class="r">Qty</th><th>Unit</th><th></th></tr></thead>
        <tbody id="rqRows"></tbody></table></div>
      <button type="button" class="btn btn-sm" id="rqAdd" style="margin-top:10px">${icon.plus} Add line</button>
      <datalist id="rqProd">${st.products.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
    </div>
    <div class="card">
      <div class="card-head"><h2>2. Details</h2></div>
      <div class="grid grid-3">
        <div class="field"><label>Project / delivery site</label><select id="rqProj">${projectOptions('')}</select></div>
        <div class="field"><label>Needed by</label><input id="rqDate" type="date"></div>
        <div class="field"><label>Your name / company</label><input id="rqFrom" value="${esc(st.settings.requester || '')}" placeholder="e.g. Shakkir – ABC Contracting"></div>
        <div class="field" style="grid-column:1/-1"><label>Notes</label><input id="rqNotes" placeholder="e.g. Please include delivery charge and payment terms"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>3. Suppliers</h2><span class="small muted">Suppliers who sold these items before are listed first</span></div>
      <div id="rqSup" class="product-list"></div>
    </div>
    <div class="btn-row" style="justify-content:flex-end;margin-top:14px"><button class="btn btn-primary" id="rqGo">${icon.whatsapp} Create message</button></div>`;

  wireProjectSelect($('#rqProj'));
  const rows = $('#rqRows');
  const draw = () => {
    rows.innerHTML = items.map((it, i) => `<tr data-i="${i}">
      <td class="col-product" data-label="Material"><input data-k="name" list="rqProd" value="${esc(it.name)}" placeholder="Material"></td>
      <td class="col-num" data-label="Qty"><input data-k="qty" type="number" step="any" min="0" inputmode="decimal" style="text-align:right" value="${esc(it.qty)}"></td>
      <td class="col-unit" data-label="Unit"><input data-k="unit" value="${esc(it.unit)}" placeholder="bag"></td>
      <td class="col-del"><button type="button" class="btn btn-ghost btn-sm btn-danger" data-del>${icon.trash}</button></td></tr>`).join('');
  };
  draw();
  rows.addEventListener('input', e => { const tr = e.target.closest('tr'); if (tr && e.target.dataset.k) items[+tr.dataset.i][e.target.dataset.k] = e.target.value; });
  rows.addEventListener('change', e => { if (e.target.dataset.k === 'name' || e.target.dataset.k === 'unit') drawSuppliers(); });
  rows.addEventListener('click', e => { if (e.target.closest('[data-del]')) { items.splice(+e.target.closest('tr').dataset.i, 1); if (!items.length) items.push({ name: '', qty: '', unit: '' }); draw(); drawSuppliers(); } });
  $('#rqAdd').addEventListener('click', () => { items.push({ name: '', qty: '', unit: '' }); draw(); $$('[data-k=name]', rows).at(-1).focus(); });

  const picked = new Set();
  function drawSuppliers() {
    const prodIds = new Set(items.map(i => db.bestMatch(i.name, 0.6)?.product.id).filter(Boolean));
    const score = s => S().prices.filter(r => r.supplierId === s.id && prodIds.has(r.productId)).length;
    const sups = [...S().suppliers].map(s => ({ s, n: score(s) })).sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name));
    if (!picked.size) sups.filter(x => x.n).slice(0, 3).forEach(x => picked.add(x.s.id));
    $('#rqSup').innerHTML = sups.length ? sups.map(({ s, n }) => `
      <label class="product-row" style="cursor:pointer;grid-template-columns:auto 1fr auto">
        <input type="checkbox" data-sup="${s.id}" ${picked.has(s.id) ? 'checked' : ''} style="width:20px;min-height:20px">
        <div><div class="name">${esc(s.name)} ${s.rating ? `<span class="small" style="color:var(--warn)">${'★'.repeat(s.rating)}</span>` : ''}</div>
          <div class="meta">${s.phone ? esc(s.phone) : '<span style="color:var(--warn)">no phone saved</span>'}${n ? ` · sold ${n} of these before` : ''}</div></div>
        <span></span></label>`).join('') : '<p class="muted small">No suppliers saved yet — you can still create the message and send it to anyone.</p>';
    $$('[data-sup]').forEach(cb => cb.addEventListener('change', () => { cb.checked ? picked.add(cb.dataset.sup) : picked.delete(cb.dataset.sup); }));
  }
  drawSuppliers();

  $('#rqGo').addEventListener('click', () => {
    const list = items.filter(i => String(i.name).trim());
    if (!list.length) return toast('Add at least one material.', true);
    const from = $('#rqFrom').value.trim();
    if (from !== (S().settings.requester || '')) db.updateSettings({ requester: from });
    const proj = db.getProject($('#rqProj').value);
    const date = $('#rqDate').value;
    const lines = [
      'Dear Sir,', '',
      'Please send your best price for the following:', '',
      ...list.map((i, n) => `${n + 1}. ${String(i.name).trim()}${i.qty ? ` — ${i.qty} ${i.unit || ''}`.trimEnd() : ''}`),
      '',
      proj ? `Delivery to: ${proj.name}` : '',
      date ? `Needed by: ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '',
      'Please mention VAT, delivery charge, payment terms and delivery time.',
      $('#rqNotes').value.trim(),
      '', 'Thank you.', from,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
    const recipients = [...picked].map(id => db.getSupplier(id)).filter(Boolean).map(s => ({ name: s.name, phone: s.phone }));
    const noPhone = [...picked].map(id => db.getSupplier(id)).filter(s => s && !s.phone);
    shareSheet(lines.join('\n').trim(), { title: 'Send quote request', recipients });
    if (noPhone.length) toast(`No phone number for ${noPhone.map(s => s.name).join(', ')} — use the WhatsApp button and pick the contact.`);
  });
}
