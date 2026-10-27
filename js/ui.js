// Shared helpers and building blocks used by every screen.
import * as db from './store.js';
import { extractDocument, extractText, guessCategory, ACCEPT, resetSample } from './extract.js';
import { icon } from './icons.js';

// ================= helpers =================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const S = () => db.getState();
export const view = () => $('#view');

export function money(v, cur) {
  if (v == null || v === '' || !isFinite(v)) return '—';
  const n = Number(v);
  const digits = Math.abs(n) < 1 && n !== 0 ? 3 : 2;
  const s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
  return cur ? `${cur} ${s}` : s;
}
export function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d + 'T00:00:00');
  return isNaN(x) ? d : x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function ago(d) {
  const days = Math.round((Date.now() - new Date(d + 'T00:00:00')) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 31) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}
export const pct = v => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
export const supplierName = id => db.getSupplier(id)?.name || 'Unknown';
export const docLabel = t => ({ invoice: 'Invoice', quotation: 'Quotation', purchase_order: 'Purchase order', manual: 'Manual entry', other: 'Document' }[t] || 'Document');

export function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

export function modal(html, onMount) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  onMount && onMount(back, close);
  return close;
}

/** In-app dialog (browser pop-ups can be blocked inside claude.ai). Resolves true/text, or null if cancelled. */
export function askDialog({ title, text = '', input = null, placeholder = '', okText = 'OK', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const close = modal(`
      <h2>${esc(title)}</h2>
      ${text ? `<p class="small" style="margin:0 0 12px;color:var(--text-2)">${esc(text)}</p>` : ''}
      <form id="askF" class="stack">
        ${input !== null ? `<input name="v" value="${esc(input)}" placeholder="${esc(placeholder)}" required autocomplete="off">` : ''}
        <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(okText)}</button></div>
      </form>`, (m, closeFn) => {
      const f = $('#askF', m);
      f.addEventListener('submit', e => { e.preventDefault(); finish(input !== null ? f.v.value.trim() : true); closeFn(); });
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) finish(null); });
      setTimeout(() => (f.v || f.querySelector('.btn-primary, .btn-danger'))?.focus(), 30);
    });
  });
}
export const confirmDialog = (title, text = '', okText = 'Delete') => askDialog({ title, text, okText, danger: true });

// ----- Categories: dropdown with "+ New category…" -----
export const NEW_CAT = '__new__';
export function categoryOptions(sel) {
  return S().categories.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('') +
    `<option value="${NEW_CAT}">＋ New category…</option>`;
}
/** Ask for a new category name, save it, and return it (or null). */
export async function createCategory(suggest = '') {
  const name = await askDialog({ title: 'New category', text: 'Give the material group a name, e.g. "Gypsum & Ceiling" or "Scaffolding".', input: suggest, placeholder: 'Category name', okText: 'Add category' });
  if (!name) return null;
  const existing = S().categories.find(c => c.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  db.addCategory(name);
  toast(`Category "${name}" added`);
  return S().categories.find(c => c.toLowerCase() === name.toLowerCase()) || null;
}
/** Make a category <select> open the "new category" dialog when its last option is picked. */
export function wireCategorySelect(select, root, onChange = () => {}) {
  select.dataset.prev = select.value;
  select.addEventListener('change', async () => {
    if (select.value !== NEW_CAT) { select.dataset.prev = select.value; onChange(select.value); return; }
    const name = await createCategory();
    // Refresh every category dropdown on screen so the new one appears everywhere
    $$('select[data-catsel]', root).forEach(s => { const v = s === select ? (name || s.dataset.prev) : s.value; s.innerHTML = categoryOptions(v); s.value = v; s.dataset.prev = v; });
    onChange(select.value);
  });
}

/** Plain explanation of why Claude isn't reading documents, and how to fix it. */
// ----- Projects / sites dropdown with "+ New project…" -----
export const NEW_PROJ = '__newproj__';
export function projectOptions(sel) {
  return `<option value="">— None —</option>` + S().projects.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('') +
    `<option value="${NEW_PROJ}">＋ New project / site…</option>`;
}
export function wireProjectSelect(select) {
  if (!select) return;
  select.dataset.prev = select.value;
  select.addEventListener('change', async () => {
    if (select.value !== NEW_PROJ) { select.dataset.prev = select.value; return; }
    const name = await askDialog({ title: 'New project / site', text: 'e.g. "Villa 12 – Al Barsha" or "Warehouse extension".', input: '', placeholder: 'Project name', okText: 'Add project' });
    const p = name ? db.addProject(name) : null;
    select.innerHTML = projectOptions(p ? p.id : select.dataset.prev);
    select.dataset.prev = select.value;
    if (p) toast(`Project "${p.name}" added`);
  });
}

export function whyNoAi(reason) {
  if (reason === 'not_granted') return `Claude was <b>not allowed</b> for this page. <button type="button" class="btn btn-sm" data-allow-claude>Allow Claude</button> then try again. (Or open the page menu → Permissions.)`;
  if (reason === 'outside') return `Claude reading only works when Price Book is opened <b>inside the Claude app or claude.ai</b> — this page was opened outside it (for example in Safari directly). Open the Price Book link from your Claude app, or add an API key in <a href="#/settings">Settings</a>.`;
  if (reason === 'unavailable') return `Claude is not available for this account right now. Try again later, or add an API key in <a href="#/settings">Settings</a>.`;
  return `For accurate AI reading, open Price Book inside the Claude app or claude.ai, or add an API key in <a href="#/settings">Settings</a>.`;
}

document.addEventListener('click', async e => {
  if (!e.target.closest('[data-allow-claude]')) return;
  try {
    const perms = await window.claude?.use?.('permissions');
    if (!perms) throw new Error('none');
    await perms.manage();
    resetSample();
    toast('Thanks — try reading the document again');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch {
    toast('Open the page menu (top right) → Permissions, and allow Claude.', true);
  }
});

export function empty(ic, title, text, action = '') {
  return `<div class="empty">${ic}<h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
}

export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ================= Document form (used by Add + Compare) =================
/**
 * Editable form for one invoice/quotation.
 * mode: 'save' | 'compare'
 */
export function docForm(container, data, { mode, onSubmit, onCancel, submitLabel }) {
  const st = S();
  const items = (data.items && data.items.length ? data.items : [{ product: '', category: 'Other', unit: '', qty: '', price: '' }])
    .map(it => ({ ...it, productId: it.productId !== undefined ? it.productId : (db.bestMatch(it.product)?.product.id || null) }));
  const sup = data.supplier || {};
  const supplierOptions = st.suppliers.map(s => `<option value="${esc(s.name)}">`).join('');
  const productOptions = st.products.map(p => `<option value="${esc(p.name)}">`).join('');
  const catOptions = categoryOptions;

  container.innerHTML = `
    ${data.offline ? `<div class="notice" style="margin-bottom:14px">${icon.alert}<div>Read with the basic offline reader — <b>please check every line</b> before saving.<div class="small" style="margin-top:6px">${whyNoAi(data.offlineReason)}</div></div></div>` : ''}
    ${data.fromFile ? `<div class="notice info" style="margin-bottom:14px">${icon.check}<div>Found <b>${items.length}</b> item${items.length === 1 ? '' : 's'} in <b>${esc(data.fromFile)}</b>. Check the details below, fix anything wrong, then ${mode === 'save' ? 'save' : 'compare'}. The file itself is not stored.</div></div>` : ''}
    <form id="docForm" autocomplete="off">
      <div class="card">
        <div class="card-head"><h2>Supplier & document</h2></div>
        <div class="grid grid-3">
          <div class="field"><label>Supplier name *</label><input name="supName" list="dlSup" required value="${esc(sup.name)}" placeholder="e.g. Al Noor Building Materials"></div>
          <div class="field"><label>Document type</label><select name="docType">
            ${['quotation', 'invoice', 'purchase_order', 'manual', 'other'].map(t => `<option value="${t}" ${t === (data.docType || (mode === 'compare' ? 'quotation' : 'manual')) ? 'selected' : ''}>${docLabel(t)}</option>`).join('')}
          </select></div>
          <div class="field"><label>Date *</label><input name="date" type="date" required value="${esc(data.date || db.today())}"></div>
          <div class="field"><label>Invoice / quote no.</label><input name="docRef" value="${esc(data.docRef)}"></div>
          <div class="field"><label>Currency</label><input name="currency" maxlength="3" value="${esc(data.currency || st.settings.currency)}" style="text-transform:uppercase"></div>
          <div class="field"><label>Phone</label><input name="supPhone" value="${esc(sup.phone)}"></div>
        </div>
        <details style="margin-top:12px"><summary class="small" style="cursor:pointer;color:var(--brand)">More supplier details</summary>
          <div class="grid grid-3" style="margin-top:10px">
            <div class="field"><label>Contact person</label><input name="supContact" value="${esc(sup.contact)}"></div>
            <div class="field"><label>Email</label><input name="supEmail" type="email" value="${esc(sup.email)}"></div>
            <div class="field"><label>Tax / TRN no.</label><input name="supTax" value="${esc(sup.taxId)}"></div>
            <div class="field" style="grid-column:1/-1"><label>Address</label><input name="supAddress" value="${esc(sup.address)}"></div>
          </div>
        </details>
      </div>

      <div class="card">
        <div class="card-head"><h2>Terms & project</h2><span class="small muted">Optional — used to compare the real total</span></div>
        <div class="grid grid-3">
          <div class="field"><label>VAT %</label><input name="vatPct" type="number" step="any" min="0" inputmode="decimal" value="${esc(data.vatPct ?? '')}" placeholder="${esc(st.settings.vatPct ?? '')}"></div>
          <div class="field"><label>Delivery charge</label><input name="delivery" type="number" step="any" min="0" inputmode="decimal" value="${esc(data.delivery ?? '')}" placeholder="0"></div>
          <div class="field"><label>Payment terms</label><input name="paymentTerms" list="dlTerms" value="${esc(data.paymentTerms || '')}" placeholder="e.g. 30 days credit"></div>
          <div class="field"><label>Delivery time</label><input name="deliveryTime" value="${esc(data.deliveryTime || '')}" placeholder="e.g. 2-3 days"></div>
          <div class="field"><label>Project / site</label><select name="projectId" data-projsel>${projectOptions(data.projectId)}</select></div>
        </div>
        <datalist id="dlTerms"><option value="Cash"><option value="Cash on delivery"><option value="30 days credit"><option value="60 days credit"><option value="90 days credit"><option value="50% advance"><option value="PDC"></datalist>
      </div>

      <div class="card">
        <div class="card-head"><h2>Items</h2><span class="small muted">Prices are per unit, before VAT</span></div>
        <div class="table-wrap">
          <table class="items-table">
            <thead><tr><th>Product</th><th>Category</th><th>Unit</th><th class="r">Qty</th><th class="r">Unit price</th><th></th></tr></thead>
            <tbody id="itemRows"></tbody>
          </table>
        </div>
        <button type="button" class="btn btn-sm" id="addRow" style="margin-top:10px">${icon.plus} Add line</button>
      </div>

      <div class="btn-row" style="margin-top:16px;justify-content:flex-end">
        ${onCancel ? '<button type="button" class="btn" id="cancelForm">Start over</button>' : ''}
        <button type="submit" class="btn btn-primary">${submitLabel || (mode === 'save' ? `${icon.check} Save prices` : `${icon.compare} Compare prices`)}</button>
      </div>
      <datalist id="dlSup">${supplierOptions}</datalist>
      <datalist id="dlProd">${productOptions}</datalist>
    </form>`;

  const tbody = $('#itemRows', container);

  function matchHint(it) {
    const cands = db.matchProducts(it.product, 5);
    if (!it.product.trim()) return '';
    if (!cands.length) return `<div class="match-hint">New product</div>`;
    return `<select class="match-select" data-match>
      <option value="">➕ Save as new product</option>
      ${cands.map(c => `<option value="${c.product.id}" ${c.product.id === it.productId ? 'selected' : ''}>= ${esc(c.product.name)} (${Math.round(c.score * 100)}% match)</option>`).join('')}
    </select>`;
  }

  function rowHtml(it, i) {
    return `<tr data-i="${i}">
      <td class="col-product" data-label="Product"><input data-k="product" list="dlProd" value="${esc(it.product)}" placeholder="Product name" required>
        <div class="hint-slot">${matchHint(it)}</div></td>
      <td class="col-cat" data-label="Category"><select data-k="category" data-catsel>${catOptions(it.category)}</select></td>
      <td class="col-unit" data-label="Unit"><input data-k="unit" value="${esc(it.unit)}" placeholder="bag"></td>
      <td class="col-num" data-label="Qty"><input data-k="qty" type="number" step="any" min="0" inputmode="decimal" class="num" style="text-align:right" value="${esc(it.qty)}"></td>
      <td class="col-num" data-label="Unit price *"><input data-k="price" type="number" step="any" min="0" inputmode="decimal" class="num" style="text-align:right" value="${esc(it.price)}" required></td>
      <td class="col-del"><button type="button" class="btn btn-ghost btn-sm btn-danger" data-del title="Remove line">${icon.trash}</button></td>
    </tr>`;
  }

  function draw() {
    tbody.innerHTML = items.map(rowHtml).join('');
    $$('select[data-catsel]', tbody).forEach(sel => {
      const i = +sel.closest('tr').dataset.i;
      wireCategorySelect(sel, container, v => { items[i].category = v; });
    });
  }
  draw();
  wireProjectSelect($('[name=projectId]', container));

  tbody.addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const it = items[+tr.dataset.i];
    const k = e.target.dataset.k;
    if (k && k !== 'category') it[k] = e.target.value;
  });
  tbody.addEventListener('change', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const it = items[+tr.dataset.i];
    if (e.target.dataset.k === 'product') {
      const m = db.bestMatch(it.product);
      it.productId = m?.product.id || null;
      if (m) {
        // Pre-fill from the matched product
        it.category = m.product.category;
        $('[data-k=category]', tr).value = m.product.category; $('[data-k=category]', tr).dataset.prev = m.product.category;
        if (!it.unit && m.product.unit) { it.unit = m.product.unit; $('[data-k=unit]', tr).value = it.unit; }
      } else if (!it.category || it.category === 'Other') {
        it.category = guessCategory(it.product, st.categories);
        $('[data-k=category]', tr).value = it.category; $('[data-k=category]', tr).dataset.prev = it.category;
      }
      $('.hint-slot', tr).innerHTML = matchHint(it);
    }
    if (e.target.hasAttribute('data-match')) {
      it.productId = e.target.value || null;
      const p = it.productId && db.getProduct(it.productId);
      if (p) { it.category = p.category; $('[data-k=category]', tr).value = p.category; $('[data-k=category]', tr).dataset.prev = p.category; }
    }
  });
  tbody.addEventListener('click', e => {
    if (!e.target.closest('[data-del]')) return;
    const i = +e.target.closest('tr').dataset.i;
    items.splice(i, 1);
    if (!items.length) items.push({ product: '', category: 'Other', unit: '', qty: '', price: '', productId: null });
    draw();
  });
  $('#addRow', container).addEventListener('click', () => {
    items.push({ product: '', category: 'Other', unit: '', qty: '', price: '', productId: null });
    draw();
    $$('[data-k=product]', tbody).at(-1).focus();
  });
  $('#cancelForm', container)?.addEventListener('click', onCancel);

  $('#docForm', container).addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const header = {
      supplier: { name: f.get('supName').trim(), phone: f.get('supPhone'), contact: f.get('supContact'), email: f.get('supEmail'), taxId: f.get('supTax'), address: f.get('supAddress') },
      docType: f.get('docType'), date: f.get('date'), docRef: f.get('docRef').trim(),
      currency: (f.get('currency') || st.settings.currency).toUpperCase().trim(),
      vatPct: f.get('vatPct') === '' ? (st.settings.vatPct ?? '') : Number(f.get('vatPct')),
      delivery: f.get('delivery') === '' ? '' : Number(f.get('delivery')),
      paymentTerms: f.get('paymentTerms').trim(), deliveryTime: f.get('deliveryTime').trim(),
      projectId: f.get('projectId') || null,
    };
    const clean = items.filter(it => it.product.trim() && Number(it.price) > 0)
      .map(it => ({ ...it, product: it.product.trim(), price: Number(it.price), qty: it.qty === '' ? '' : Number(it.qty) }));
    if (!clean.length) { toast('Add at least one product with a price.', true); return; }
    onSubmit(header, clean);
  });
}

// ================= Upload widget =================
export function uploadWidget(container, { title, subtitle, onResult, readFile = extractDocument, readText = extractText, pasteHint = 'a copied photo or the message text with prices', readLabel = 'Read pasted text' }) {
  container.innerHTML = `
    <div class="dropzone" id="dz" tabindex="0" role="button">
      <div class="icon">${icon.upload}</div>
      <strong>${title}</strong>
      <p class="muted small" style="margin:6px 0 14px">${subtitle}</p>
      <div class="btn-row" style="justify-content:center">
        <button type="button" class="btn btn-primary" id="pickFile">${icon.file} Choose file</button>
        <button type="button" class="btn" id="takePhoto">${icon.camera} Take photo</button>
        <button type="button" class="btn" id="pasteBtn">${icon.paste} Paste</button>
      </div>
      <p class="muted small" style="margin:12px 0 0">PDF, photo, Excel or text file · or paste from WhatsApp · files are read, never stored</p>
    </div>
    <div class="card paste-card" id="pasteCard">
      <div class="card-head" style="margin-bottom:8px"><h3>${icon.paste.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px"')}Paste from WhatsApp</h3></div>
      <p class="small muted" style="margin:0 0 10px">In WhatsApp, long-press the photo or message → <b>Copy</b>. Then come back, long-press the box below → <b>Paste</b>.</p>
      <textarea id="pasteBox" rows="4" placeholder="Long-press here and tap Paste — ${pasteHint}"></textarea>
      <div class="btn-row" style="margin-top:10px;justify-content:flex-end">
        <button type="button" class="btn btn-primary" id="readPaste" disabled>${icon.sparkle} ${readLabel}</button>
      </div>
    </div>
    <input type="file" id="fileIn" accept="${ACCEPT}" hidden>
    <input type="file" id="camIn" accept="image/*" capture="environment" hidden>
    <div id="readStatus" class="card hidden" style="text-align:center;padding:34px"><div class="spinner"></div><b id="statusText">Reading…</b><p class="muted small" style="margin:6px 0 0">Usually takes 10–30 seconds.</p></div>
    <div class="ai-notice" style="margin-top:12px"></div>`;

  const dz = $('#dz', container);
  const fileIn = $('#fileIn', container), camIn = $('#camIn', container);
  $('#pickFile', container).addEventListener('click', e => { e.stopPropagation(); fileIn.click(); });
  $('#takePhoto', container).addEventListener('click', e => { e.stopPropagation(); camIn.click(); });
  dz.addEventListener('click', () => fileIn.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handle(f); });

  // ---- Paste (copied photo / PDF / message text, e.g. from WhatsApp) ----
  const pasteBox = $('#pasteBox', container), readPaste = $('#readPaste', container);
  const pastedFile = cd => [...(cd?.files || [])].find(f => f.type.startsWith('image/') || f.type === 'application/pdf');
  pasteBox.addEventListener('input', () => { readPaste.disabled = !pasteBox.value.trim(); });
  pasteBox.addEventListener('paste', e => {
    const f = pastedFile(e.clipboardData);
    if (f) { e.preventDefault(); handle(f); }
    else setTimeout(() => { readPaste.disabled = !pasteBox.value.trim(); }, 0);
  });
  readPaste.addEventListener('click', () => handleText(pasteBox.value));
  // Ctrl+V / Cmd+V anywhere on the page (computer)
  const onDocPaste = e => {
    if (!container.isConnected) { document.removeEventListener('paste', onDocPaste); return; }
    if (e.target === pasteBox || e.target.closest?.('input, textarea, [contenteditable]')) return;
    const f = pastedFile(e.clipboardData);
    if (f) { e.preventDefault(); handle(f); return; }
    const t = e.clipboardData?.getData('text/plain');
    if (t && t.trim()) { e.preventDefault(); pasteBox.value = t; readPaste.disabled = false; handleText(t); }
  };
  document.addEventListener('paste', onDocPaste);
  $('#pasteBtn', container).addEventListener('click', async e => {
    e.stopPropagation();
    try {
      if (!navigator.clipboard?.read) throw new Error('no clipboard');
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/') || t === 'application/pdf');
        if (type) {
          const blob = await item.getType(type);
          const ext = type === 'application/pdf' ? 'pdf' : (type.split('/')[1] || 'png');
          return handle(new File([blob], `pasted.${ext}`, { type }));
        }
      }
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const t = await (await item.getType('text/plain')).text();
          if (t.trim()) { pasteBox.value = t; readPaste.disabled = false; return handleText(t); }
        }
      }
      toast('The clipboard is empty. Copy a photo or message in WhatsApp first.', true);
    } catch {
      // Browser didn't allow direct clipboard access: use the paste box instead
      $('#pasteCard', container).scrollIntoView({ behavior: 'smooth', block: 'center' });
      pasteBox.focus();
      toast('Long-press the box and tap Paste');
    }
  });
  fileIn.addEventListener('change', () => fileIn.files[0] && handle(fileIn.files[0]));
  camIn.addEventListener('change', () => camIn.files[0] && handle(camIn.files[0]));

  async function handleText(text) {
    if (!text.trim()) return;
    dz.classList.add('hidden'); $('#pasteCard', container).classList.add('hidden');
    const status = $('#readStatus', container);
    status.classList.remove('hidden');
    try {
      const data = await readText(text, msg => { $('#statusText', container).textContent = msg; });
      data.fromFile = 'the pasted text';
      if (!data.items.length) toast('Nothing was found in the text — please add the lines below.', true);
      onResult(data);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not read the pasted text.', true);
      status.classList.add('hidden');
      dz.classList.remove('hidden'); $('#pasteCard', container).classList.remove('hidden');
    }
  }

  async function handle(file) {
    dz.classList.add('hidden'); $('#pasteCard', container).classList.add('hidden');
    const status = $('#readStatus', container);
    status.classList.remove('hidden');
    try {
      const data = await readFile(file, msg => { $('#statusText', container).textContent = msg; });
      data.fromFile = file.name || 'photo';
      if (!data.items.length) toast('No lines were found — please add them below.', true);
      onResult(data);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not read this file.', true);
      status.classList.add('hidden');
      dz.classList.remove('hidden'); $('#pasteCard', container).classList.remove('hidden');
    } finally {
      fileIn.value = ''; camIn.value = '';
    }
  }
}


// ================= Sharing (WhatsApp, copy, phone share sheet) =================
export function waLink(text, phone = '') {
  const p = String(phone || '').replace(/[^\d]/g, '').replace(/^00/, '');
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

/** Show a message with WhatsApp / Share / Copy buttons. `recipients` = [{name, phone}] adds one WhatsApp button per supplier. */
export function shareSheet(text, { title = 'Share', recipients = [] } = {}) {
  modal(`
    <h2>${esc(title)}</h2>
    <textarea id="shareText" rows="10" style="font-size:13px">${esc(text)}</textarea>
    <p class="small muted" style="margin:6px 0 10px">You can edit the message before sending.</p>
    <div class="btn-row">
      ${recipients.filter(r => r.phone).map((r, i) => `<a class="btn btn-primary" data-wa="${i}" target="_blank" rel="noopener">${icon.whatsapp} ${esc(r.name)}</a>`).join('')}
      <a class="btn ${recipients.some(r => r.phone) ? '' : 'btn-primary'}" id="waAny" target="_blank" rel="noopener">${icon.whatsapp} WhatsApp</a>
      ${navigator.share ? `<button type="button" class="btn" id="shareNative">${icon.share} Share…</button>` : ''}
      <button type="button" class="btn" id="copyText">${icon.copy} Copy</button>
      <button type="button" class="btn btn-ghost" data-close>Close</button>
    </div>`, (m) => {
    const box = $('#shareText', m);
    const refresh = () => {
      $('#waAny', m).href = waLink(box.value);
      $$('[data-wa]', m).forEach(a => { a.href = waLink(box.value, recipients.filter(r => r.phone)[+a.dataset.wa].phone); });
    };
    box.addEventListener('input', refresh); refresh();
    $('#shareNative', m)?.addEventListener('click', () => navigator.share({ text: box.value }).catch(() => {}));
    $('#copyText', m).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(box.value); toast('Copied'); }
      catch { box.focus(); box.select(); toast('Selected — tap Copy on your keyboard menu'); }
    });
  });
}
