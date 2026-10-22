// Compare several quotations side by side: cheapest supplier per item, totals with VAT,
// delivery and payment terms, and the cheapest "mix" across suppliers.

import * as db from './store.js';
import { similarity } from './match.js';
import { convertPrice, cleanUnit, unitRatio } from './units.js';
import { icon } from './icons.js';
import { $, $$, esc, S, money, toast, docForm, uploadWidget, shareSheet, confirmDialog } from './ui.js';

const session = { quotes: [] }; // [{header, items}]

export function renderMulti(body, top) {
  const draw = () => {
    if (!session.quotes.length) return addQuote();
    top.innerHTML = `<button class="btn" id="mqClear">${icon.trash} Start over</button>`;
    $('#mqClear').onclick = async () => { if (await confirmDialog('Clear these quotes?', '', 'Clear')) { session.quotes = []; draw(); } };
    body.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Quotes added</h2><span class="small muted">${session.quotes.length} of up to 6</span></div>
        <ul class="list-plain">${session.quotes.map((q, i) => `<li><span><b>${esc(q.header.supplier.name)}</b> <span class="small muted">${q.items.length} items${q.header.paymentTerms ? ' · ' + esc(q.header.paymentTerms) : ''}</span></span>
          <span class="btn-row"><button class="btn btn-ghost btn-sm" data-edit="${i}">${icon.edit}</button><button class="btn btn-ghost btn-sm btn-danger" data-rm="${i}">${icon.trash}</button></span></li>`).join('')}</ul>
        <div class="btn-row" style="margin-top:12px">
          ${session.quotes.length < 6 ? `<button class="btn" id="mqAdd">${icon.plus} Add another quote</button>` : ''}
        </div>
      </div>
      <div id="mqResult"></div>`;
    $('#mqAdd')?.addEventListener('click', addQuote);
    $$('[data-rm]').forEach(b => b.onclick = () => { session.quotes.splice(+b.dataset.rm, 1); draw(); });
    $$('[data-edit]').forEach(b => b.onclick = () => editQuote(+b.dataset.edit));
    if (session.quotes.length >= 2) drawMatrix($('#mqResult'));
    else $('#mqResult').innerHTML = `<div class="notice info" style="margin-top:14px">${icon.info}<div>Add at least one more quote to compare.</div></div>`;
  };

  function addQuote() {
    top.innerHTML = session.quotes.length ? `<button class="btn" id="mqBack">Back to comparison</button>` : '';
    $('#mqBack')?.addEventListener('click', draw);
    uploadWidget(body, {
      title: `Add quote ${session.quotes.length + 1}`,
      subtitle: 'Upload or paste each supplier\'s quotation. Add 2 to 6 quotes for the same job.',
      onResult: data => form({ ...data, docType: 'quotation' }, null),
    });
    const typeBtn = document.createElement('button');
    typeBtn.className = 'btn'; typeBtn.innerHTML = `${icon.edit} Type a quote`;
    typeBtn.onclick = () => form({ docType: 'quotation', items: session.quotes[0]?.items.map(i => ({ product: i.product, category: i.category, unit: i.unit, qty: i.qty, price: '', productId: i.productId })) }, null);
    top.appendChild(typeBtn);
  }

  function editQuote(i) { const q = session.quotes[i]; form({ ...q.header, items: q.items }, i); }

  function form(data, index) {
    top.innerHTML = '';
    docForm(body, data, {
      mode: 'compare', submitLabel: `${icon.plus} ${index == null ? 'Add to comparison' : 'Update quote'}`,
      onCancel: draw,
      onSubmit: (header, items) => {
        if (index == null) session.quotes.push({ header, items }); else session.quotes[index] = { header, items };
        toast(index == null ? `Added ${header.supplier.name}` : 'Quote updated');
        draw();
      },
    });
  }

  draw();
}

// ---------- The comparison ----------
function buildRows() {
  const rows = []; // {name, productId, unit, qty, cells: [ {price, raw} | null ] }
  session.quotes.forEach((q, qi) => q.items.forEach(it => {
    let row = it.productId ? rows.find(r => r.productId === it.productId) : null;
    if (!row) row = rows.find(r => similarity(r.name, it.product) >= 0.72);
    if (!row) { row = { name: it.product, productId: it.productId || null, unit: it.unit || '', qty: Number(it.qty) || 0, cells: [] }; rows.push(row); }
    if (!row.unit && it.unit) row.unit = it.unit;
    const product = row.productId ? db.getProduct(row.productId) : null;
    let price = Number(it.price), qty = Number(it.qty) || 0;
    if (cleanUnit(it.unit) && cleanUnit(row.unit) && cleanUnit(it.unit) !== cleanUnit(row.unit)) {
      // e.g. quoted per kg, row is per ton: convert both price and quantity
      const ratio = unitRatio(it.unit, row.unit, product);
      if (ratio != null) { price = price / ratio; qty = qty * ratio; }
    }
    row.qty = Math.max(row.qty, Math.round(qty * 1000) / 1000);
    row.cells[qi] = { price, raw: Number(it.price), unit: it.unit };
  }));
  rows.forEach(r => { r.best = Math.min(...r.cells.filter(Boolean).map(c => c.price)); });
  return rows;
}

function drawMatrix(el) {
  const cur = session.quotes[0].header.currency || S().settings.currency;
  const rows = buildRows();
  const n = session.quotes.length;
  const totals = session.quotes.map((q, qi) => {
    const quoted = rows.filter(r => r.cells[qi]);
    const sub = quoted.reduce((t, r) => t + r.cells[qi].price * (r.qty || 1), 0);
    const delivery = Number(q.header.delivery) || 0;
    const vat = Number(q.header.vatPct) || 0;
    const grand = (sub + delivery) * (1 + vat / 100);
    const sup = db.findSupplier(q.header.supplier.name);
    return { q, qi, quoted: quoted.length, sub, delivery, vat, grand, all: quoted.length === rows.length, cheapestCount: rows.filter(r => r.cells[qi] && r.cells[qi].price === r.best).length, rating: sup?.rating || 0 };
  });
  // Best mix: each row from its cheapest quote (VAT of that quote applied; delivery of each used supplier added)
  const used = new Set();
  let mix = 0;
  rows.forEach(r => {
    const qi = r.cells.findIndex(c => c && c.price === r.best);
    used.add(qi);
    mix += r.best * (r.qty || 1) * (1 + (Number(session.quotes[qi].header.vatPct) || 0) / 100);
  });
  used.forEach(qi => { mix += (Number(session.quotes[qi].header.delivery) || 0) * (1 + (Number(session.quotes[qi].header.vatPct) || 0) / 100); });
  const full = totals.filter(t => t.all).sort((a, b) => a.grand - b.grand);
  const bestSingle = full[0];
  const save = bestSingle ? bestSingle.grand - mix : 0;

  el.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Result</h2></div>
      ${bestSingle ? `<div class="callout-best">${icon.star}<div><b>Cheapest single supplier: ${esc(bestSingle.q.header.supplier.name)} — ${money(bestSingle.grand, cur)}</b> incl. VAT${bestSingle.delivery ? ' & delivery' : ''}
        ${full[1] ? `<div class="small" style="color:var(--text-2)">Next: ${esc(full[1].q.header.supplier.name)} at ${money(full[1].grand, cur)} (+${money(full[1].grand - bestSingle.grand, cur)})</div>` : ''}</div></div>`
        : `<div class="notice info">${icon.info}<div>No supplier quoted every item — see the best mix below.</div></div>`}
      ${used.size > 1 ? `<div class="advice" style="margin-top:12px"><b>Best mix:</b> buy each item from its cheapest supplier (${used.size} suppliers) — <b>${money(mix, cur)}</b> incl. VAT & delivery${bestSingle && save > 0.005 ? `, saving <b>${money(save, cur)}</b> vs ${esc(bestSingle.q.header.supplier.name)} alone.` : '.'}
        ${bestSingle && save <= 0.005 ? `<div class="small" style="margin-top:4px"><b>Buy everything from ${esc(bestSingle.q.header.supplier.name)}</b> — it is cheaper than splitting the order once delivery charges are included.</div>` : ''}
        ${bestSingle && save > 0.005 && save < bestSingle.grand * 0.02 ? '<div class="small" style="margin-top:4px">The saving is small — one supplier may be simpler.</div>' : ''}</div>` : ''}
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary" id="mqShare">${icon.whatsapp} Share result</button>
        <button class="btn" id="mqSave">${icon.check} Save all quotes to price history</button>
      </div>
    </div>

    <div class="section-title"><h2>Side by side</h2><span class="small muted">green = cheapest · prices per unit before VAT</span></div>
    <div class="card"><div class="table-wrap"><table class="mq-table">
      <thead><tr><th>Item</th><th class="r">Qty</th>${session.quotes.map(q => `<th class="r">${esc(q.header.supplier.name)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.name)}</b>${r.unit ? `<div class="small muted">per ${esc(r.unit)}</div>` : ''}</td><td class="r num">${r.qty || ''}</td>
          ${session.quotes.map((_, qi) => { const c = r.cells[qi]; return c ? `<td class="r num ${c.price === r.best ? 'cell-best' : ''}">${money(c.price)}${c.price !== r.best ? `<div class="small" style="color:var(--bad)">+${(((c.price - r.best) / r.best) * 100).toFixed(0)}%</div>` : ''}</td>` : '<td class="r muted">—</td>'; }).join('')}</tr>`).join('')}
        <tr class="mq-sum"><td>Subtotal</td><td></td>${totals.map(t => `<td class="r num">${money(t.sub)}</td>`).join('')}</tr>
        <tr class="mq-sum"><td>Delivery</td><td></td>${totals.map(t => `<td class="r num">${t.delivery ? money(t.delivery) : '—'}</td>`).join('')}</tr>
        <tr class="mq-sum"><td>VAT</td><td></td>${totals.map(t => `<td class="r num">${t.vat ? t.vat + '%' : '—'}</td>`).join('')}</tr>
        <tr class="mq-sum mq-grand"><td>Total</td><td></td>${totals.map(t => `<td class="r num ${bestSingle && t === bestSingle ? 'cell-best' : ''}">${money(t.grand)}${t.all ? '' : `<div class="small" style="color:var(--warn)">${t.quoted}/${rows.length} items</div>`}</td>`).join('')}</tr>
        <tr class="mq-sum"><td>Cheapest on</td><td></td>${totals.map(t => `<td class="r">${t.cheapestCount} item${t.cheapestCount === 1 ? '' : 's'}</td>`).join('')}</tr>
        <tr class="mq-sum"><td>Payment</td><td></td>${totals.map(t => `<td class="r small">${esc(t.q.header.paymentTerms || '—')}</td>`).join('')}</tr>
        <tr class="mq-sum"><td>Delivery time</td><td></td>${totals.map(t => `<td class="r small">${esc(t.q.header.deliveryTime || '—')}</td>`).join('')}</tr>
        <tr class="mq-sum"><td>Rating</td><td></td>${totals.map(t => `<td class="r" style="color:var(--warn)">${t.rating ? '★'.repeat(t.rating) : '<span class="muted">—</span>'}</td>`).join('')}</tr>
      </tbody></table></div></div>`;

  $('#mqShare').onclick = () => {
    const lines = ['*Quote comparison*', ''];
    rows.forEach(r => {
      const qi = r.cells.findIndex(c => c && c.price === r.best);
      lines.push(`• ${r.name}${r.qty ? ` × ${r.qty}` : ''}: best ${money(r.best, cur)} — ${session.quotes[qi].header.supplier.name}`);
    });
    lines.push('', '*Totals (incl. VAT & delivery):*');
    totals.slice().sort((a, b) => a.grand - b.grand).forEach(t => lines.push(`• ${t.q.header.supplier.name}: ${money(t.grand, cur)}${t.all ? '' : ` (${t.quoted}/${rows.length} items)`}${t.q.header.paymentTerms ? ` · ${t.q.header.paymentTerms}` : ''}`));
    if (used.size > 1) lines.push('', `Best mix (${used.size} suppliers): ${money(mix, cur)}${bestSingle && save > 0.005 ? ` (saves ${money(save, cur)})` : ''}`);
    if (bestSingle) lines.push(`Cheapest single supplier: ${bestSingle.q.header.supplier.name}`);
    shareSheet(lines.join('\n'), { title: 'Share comparison' });
  };
  $('#mqSave').onclick = () => {
    let added = 0;
    session.quotes.forEach(q => { added += db.savePriceDocument(q.header, q.items).added; });
    toast(added ? `Saved ${added} prices from ${session.quotes.length} quotes` : 'Already saved');
    $('#mqSave').disabled = true;
  };
}
