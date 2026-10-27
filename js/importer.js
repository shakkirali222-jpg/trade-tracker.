// Bulk import: a WhatsApp chat export (.zip) or many files at once.
// The .zip is opened on the phone (never uploaded); only the invoices / quotations /
// purchase orders inside it are read by Claude, one at a time, then shown for review.

import * as db from './store.js';
import { extractDocument, ACCEPT } from './extract.js';
import { icon } from './icons.js';
import { $, $$, esc, S, view, money, fmtDate, docLabel, toast, docForm, empty } from './ui.js';

const ZIPJS_URL = 'https://cdn.jsdelivr.net/npm/@zip.js/zip.js@2.22.1/index.min.js';
const DOC_EXT = /\.(pdf|xlsx|xls|csv)$/i;
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };

// One import run, kept while the app is open
const run = { files: [], results: [], running: false, stop: false, source: '' };

export function renderImport() {
  view().innerHTML = `
    <div class="page-head">
      <div><h1>Import many</h1><p>Bring in all the invoices, quotations and purchase orders from a WhatsApp group — or many files at once.</p></div>
    </div>
    <div id="imBody"></div>`;
  run.results.length || run.running ? drawRun() : drawStart();
}

// ---------- Step 1: choose ----------
function drawStart() {
  $('#imBody').innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2 style="margin-bottom:6px">${icon.whatsapp.replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-4px;margin-right:6px;color:var(--good)"')}WhatsApp group</h2>
        <ol class="small steps">
          <li>Open the purchase group → tap the group name at the top.</li>
          <li>Scroll down → <b>Export chat</b> → <b>Attach media</b>.</li>
          <li>Choose <b>Save to Files</b> (iPhone) or save it to your phone (Android).</li>
          <li>Tap the button below and pick the <b>.zip</b> file.</li>
        </ol>
        <p class="small muted">Big exports are fine — the file is opened on your phone, not uploaded. Only the invoices and orders inside are read.</p>
        <button class="btn btn-primary" id="imZip">${icon.upload} Choose WhatsApp export (.zip)</button>
      </div>
      <div class="card">
        <h2 style="margin-bottom:6px">${icon.file.replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-4px;margin-right:6px;color:var(--brand)"')}Many files at once</h2>
        <ol class="small steps">
          <li>In WhatsApp, open the group → group name → <b>Media, links and docs</b>.</li>
          <li>Select the PDFs or photos → <b>Share / Save</b> (to Files or Photos).</li>
          <li>Tap the button below and select them all.</li>
        </ol>
        <p class="small muted">PDF, photos, Excel — select as many as you like.</p>
        <button class="btn" id="imFiles">${icon.plus} Choose files</button>
      </div>
    </div>
    <input type="file" id="imZipIn" accept=".zip,application/zip,application/x-zip-compressed" hidden>
    <input type="file" id="imFilesIn" accept="${ACCEPT}" multiple hidden>
    <div id="imScan"></div>
    <div class="ai-notice" style="margin-top:12px"></div>`;
  $('#imZip').onclick = () => $('#imZipIn').click();
  $('#imFiles').onclick = () => $('#imFilesIn').click();
  $('#imZipIn').onchange = e => e.target.files[0] && scanZip(e.target.files[0]);
  $('#imFilesIn').onchange = e => e.target.files.length && scanFiles([...e.target.files]);
}

// ---------- Read the WhatsApp export ----------
async function scanZip(zipFile) {
  const box = $('#imScan');
  box.innerHTML = `<div class="card" style="text-align:center;margin-top:16px"><div class="spinner"></div><b>Opening ${esc(zipFile.name)}…</b><p class="small muted">${(zipFile.size / 1048576).toFixed(0)} MB — this stays on your phone.</p></div>`;
  try {
    const zip = await import(ZIPJS_URL);
    zip.configure({ useWebWorkers: false });
    const reader = new zip.ZipReader(new zip.BlobReader(zipFile));
    const entries = (await reader.getEntries()).filter(e => !e.directory);
    const chatEntry = entries.find(e => /\.txt$/i.test(e.filename) && /chat/i.test(e.filename)) || entries.find(e => /\.txt$/i.test(e.filename));
    const info = chatEntry ? parseChat(await chatEntry.getData(new zip.TextWriter())) : new Map();
    const files = entries
      .filter(e => DOC_EXT.test(e.filename) || IMG_EXT.test(e.filename))
      .map(e => {
        const name = e.filename.split('/').pop();
        const meta = info.get(name) || {};
        return {
          name, size: e.uncompressedSize, isDoc: DOC_EXT.test(name),
          date: meta.date || dateFromName(name) || (e.lastModDate ? e.lastModDate.toISOString().slice(0, 10) : ''),
          sender: meta.sender || '', caption: meta.caption || '',
          load: async () => { const ext = name.split('.').pop().toLowerCase(); return new File([await e.getData(new zip.BlobWriter(MIME[ext] || ''))], name, { type: MIME[ext] || '' }); },
        };
      });
    const skipped = entries.filter(e => /\.heic$/i.test(e.filename)).length;
    run.source = zipFile.name.replace(/\.zip$/i, '');
    showScan(files, skipped);
  } catch (err) {
    console.error(err);
    box.innerHTML = `<div class="notice" style="margin-top:16px">${icon.alert}<div>Could not open this file. Make sure it is the <b>.zip</b> from WhatsApp "Export chat". (${esc(err.message || err)})</div></div>`;
  }
}

function scanFiles(list) {
  const files = list.map(f => ({ name: f.name, size: f.size, isDoc: DOC_EXT.test(f.name) || f.type === 'application/pdf', date: dateFromName(f.name) || new Date(f.lastModified || Date.now()).toISOString().slice(0, 10), sender: '', caption: '', load: async () => f }));
  run.source = `${list.length} files`;
  showScan(files, 0, true);
}

/** WhatsApp chat text → Map(filename → {date, sender, caption}) for both iPhone and Android formats. */
export function parseChat(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/).map(l => l.replace(/[‎‏‪-‮]/g, ''));
  const HEAD = /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?[AP]M)?\]?\s*(?:-\s*)?([^:]{1,60}):\s?(.*)$/i;
  // Work out whether dates are day/month or month/day
  let dayFirst = true;
  for (const l of lines.slice(0, 2000)) { const m = l.match(HEAD); if (!m) continue; if (+m[1] > 12) { dayFirst = true; break; } if (+m[2] > 12) { dayFirst = false; break; } }
  let last = null;
  for (const l of lines) {
    const m = l.match(HEAD);
    if (m) {
      const [, a, b, y, , , sender, body] = m;
      const day = dayFirst ? a : b, mon = dayFirst ? b : a;
      const yr = y.length === 2 ? '20' + y : y;
      const date = `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const att = body.match(/<attached:\s*(.+?)>/i) || body.match(/^(.+?\.\w{2,5})\s*\((?:file attached|archivo adjunto|fichier joint)\)/i);
      last = null;
      if (att) {
        const name = att[1].trim();
        const cap = body.replace(att[0], '').replace(/•\s*\d+\s*pages?/i, '').trim();
        last = { date, sender: sender.trim(), caption: cap };
        map.set(name, last);
      }
    } else if (last && l.trim()) {
      last.caption = (last.caption ? last.caption + ' ' : '') + l.trim(); // caption on the next line
    }
  }
  return map;
}

function dateFromName(n) {
  let m = n.match(/(20\d{2})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = n.match(/(?:IMG|DOC|PHOTO|VID)-(20\d{2})(\d{2})(\d{2})/i); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

// ---------- Step 2: what to read ----------
function showScan(files, heic, picked = false) {
  const docs = files.filter(f => f.isDoc), photos = files.filter(f => !f.isDoc);
  const done = files.filter(f => db.isImported(key(f))).length;
  const last = S().settings.lastImport;
  $('#imScan').innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Found in ${esc(run.source)}</h2></div>
      <div class="grid grid-3">
        <div class="stat" style="padding:0"><div class="label">PDFs & documents</div><div class="value">${docs.length}</div></div>
        <div class="stat" style="padding:0"><div class="label">Photos</div><div class="value">${photos.length}</div></div>
        <div class="stat" style="padding:0"><div class="label">Already imported</div><div class="value">${done}</div></div>
      </div>
      ${heic ? `<p class="small muted">${heic} HEIC photo${heic > 1 ? 's' : ''} can't be read — on iPhone, set Camera → Formats → Most Compatible.</p>` : ''}
      <div class="grid grid-2" style="margin-top:12px">
        ${picked ? '' : `<div class="field"><label>Which messages</label><select id="imRange">
          ${last ? `<option value="last">Since last import (${fmtDate(last)})</option>` : ''}
          <option value="7">Last 7 days</option><option value="30" ${last ? '' : 'selected'}>Last 30 days</option><option value="90">Last 3 months</option><option value="all">Everything</option></select></div>`}
        <div class="field"><label>What to read</label><select id="imKind">
          <option value="all">PDFs, documents and photos</option><option value="docs">Only PDFs & documents</option></select></div>
      </div>
      <p class="small muted" id="imCount" style="margin:10px 0"></p>
      <p class="small muted" style="margin:0 0 12px">Each file is read by Claude (uses your Claude usage). Photos that aren't invoices — site photos, goods — are skipped automatically.</p>
      <button class="btn btn-primary" id="imGo">${icon.sparkle} Start reading</button>
    </div>`;
  const pick = () => {
    const range = $('#imRange')?.value || 'all';
    let from = '';
    if (range === 'last') from = last;
    else if (range !== 'all') from = new Date(Date.now() - Number(range) * 864e5).toISOString().slice(0, 10);
    const kind = $('#imKind').value;
    return files.filter(f => (!from || !f.date || f.date >= from) && (kind === 'all' || f.isDoc) && !db.isImported(key(f)))
      .sort((a, b) => (b.isDoc - a.isDoc) || (a.date || '').localeCompare(b.date || ''));
  };
  const count = () => { const n = pick().length; $('#imCount').textContent = n ? `${n} new file${n > 1 ? 's' : ''} will be read.` : 'Nothing new to read with these choices.'; $('#imGo').disabled = !n; };
  $('#imRange')?.addEventListener('change', count);
  $('#imKind').addEventListener('change', count);
  count();
  $('#imGo').onclick = () => {
    run.files = pick(); run.results = run.files.map(f => ({ f, status: 'waiting' }));
    if (!picked) db.updateSettings({ lastImport: db.today() });
    process();
  };
}

const key = f => `${f.name}|${f.size}`;

// ---------- Step 3: read one by one ----------
async function process() {
  run.running = true; run.stop = false;
  drawRun();
  for (const r of run.results) {
    if (run.stop) break;
    if (r.status !== 'waiting') continue;
    r.status = 'reading'; drawRun();
    try {
      const file = await r.f.load();
      const data = await extractDocument(file, () => {});
      if (!data.items.length || data.docType === 'other' && !data.items.some(i => Number(i.price) > 0)) {
        r.status = 'not-price';
        db.markImported([key(r.f)]);
      } else {
        if (!data.date) data.date = r.f.date;
        if (!data.supplier?.name && r.f.sender) data.supplier = { ...(data.supplier || {}), name: r.f.sender };
        if (!data.currency) data.currency = S().settings.currency;
        r.data = data; r.status = 'found';
      }
    } catch (e) {
      r.status = 'error'; r.error = e.message || 'Could not read';
      if (/usage limit|Too many requests/i.test(r.error)) { run.stop = true; toast('Stopped: Claude usage limit reached. Continue later — finished files are kept.', true); }
    }
    drawRun();
  }
  run.running = false;
  drawRun();
}

function totalOf(d) { return d.items.reduce((t, i) => t + (Number(i.qty) || 0) * (Number(i.price) || 0), 0); }

function saveResult(r) {
  const d = r.data;
  const header = { supplier: d.supplier, docType: d.docType === 'other' ? 'invoice' : d.docType, date: d.date, docRef: d.docRef || '', currency: d.currency,
    vatPct: d.vatPct ?? '', delivery: d.delivery ?? '', paymentTerms: d.paymentTerms || '', deliveryTime: d.deliveryTime || '', projectId: d.projectId || null };
  const items = d.items.filter(i => i.product && Number(i.price) > 0).map(i => ({ ...i, productId: i.productId !== undefined ? i.productId : (db.bestMatch(i.product)?.product.id || null), price: Number(i.price) }));
  const res = db.savePriceDocument(header, items);
  db.markImported([key(r.f)]);
  r.status = 'saved'; r.saved = res.added; r.alerts = res.alerts?.length || 0;
}

function drawRun() {
  const body = $('#imBody');
  if (!body) return;
  if ($('#imEdit')) return; // editing one document — don't redraw underneath
  const rs = run.results;
  const n = s => rs.filter(r => r.status === s).length;
  const doneCount = rs.length - n('waiting') - n('reading');
  const found = rs.filter(r => r.status === 'found');
  body.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>${run.running ? 'Reading…' : 'Import results'}</h2>
        <span class="btn-row">${run.running ? `<button class="btn" id="imStop">Stop</button>` : `<button class="btn" id="imNew">${icon.plus} New import</button>`}</span></div>
      <div class="progress"><div style="width:${rs.length ? (doneCount / rs.length) * 100 : 0}%"></div></div>
      <p class="small" style="margin:8px 0 0">${doneCount} of ${rs.length} read · <b style="color:var(--good)">${n('found')}</b> to review · ${n('saved')} saved · ${n('not-price')} not price documents${n('error') ? ` · <span style="color:var(--bad)">${n('error')} failed</span>` : ''}</p>
      ${found.length ? `<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="imSaveAll">${icon.check} Save all ${found.length} found</button></div>` : ''}
    </div>
    <div class="import-list">${rs.map((r, i) => itemCard(r, i)).join('')}</div>`;
  $('#imStop')?.addEventListener('click', () => { run.stop = true; toast('Stopping after this file…'); });
  $('#imNew')?.addEventListener('click', () => { run.results = []; run.files = []; drawStart(); });
  $('#imSaveAll')?.addEventListener('click', () => {
    let added = 0, alerts = 0;
    rs.filter(r => r.status === 'found').forEach(r => { saveResult(r); added += r.saved; alerts += r.alerts; });
    toast(`Saved ${added} prices${alerts ? ` · ${alerts} price alert${alerts > 1 ? 's' : ''} — see Home` : ''}`);
    drawRun();
  });
  $$('[data-save]').forEach(b => b.onclick = () => { const r = rs[+b.dataset.save]; saveResult(r); toast(`Saved ${r.saved} prices`); drawRun(); });
  $$('[data-skip]').forEach(b => b.onclick = () => { const r = rs[+b.dataset.skip]; r.status = 'skipped'; db.markImported([key(r.f)]); drawRun(); });
  $$('[data-retry]').forEach(b => b.onclick = () => { rs[+b.dataset.retry].status = 'waiting'; if (!run.running) process(); });
  $$('[data-edit]').forEach(b => b.onclick = () => editResult(+b.dataset.edit));
}

function itemCard(r, i) {
  const meta = `${esc(r.f.name)}${r.f.date ? ' · ' + fmtDate(r.f.date) : ''}${r.f.sender ? ' · from ' + esc(r.f.sender) : ''}`;
  if (r.status === 'found' || r.status === 'saved') {
    const d = r.data, t = totalOf(d);
    return `<div class="import-item ${r.status}">
      <div class="compare-top"><div style="min-width:0"><h3>${esc(d.supplier?.name || 'Unknown supplier')}</h3>
        <div class="small muted">${docLabel(d.docType)}${d.docRef ? ' ' + esc(d.docRef) : ''} · ${fmtDate(d.date)} · ${d.items.length} items${t ? ' · ' + money(t, d.currency) : ''}</div>
        <div class="small muted">${meta}</div></div>
        ${r.status === 'saved' ? `<span class="badge badge-good">${icon.check} Saved ${r.saved}</span>` : ''}</div>
      <div class="small" style="margin-top:6px">${d.items.slice(0, 4).map(it => `${esc(it.product)} — <b>${money(it.price)}</b>`).join(' · ')}${d.items.length > 4 ? ` · +${d.items.length - 4} more` : ''}</div>
      ${r.status === 'found' ? `<div class="btn-row" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-save="${i}">${icon.check} Save</button><button class="btn btn-sm" data-edit="${i}">${icon.edit} Check & edit</button><button class="btn btn-sm btn-ghost" data-skip="${i}">Skip</button></div>` : ''}
    </div>`;
  }
  const label = { waiting: 'Waiting', reading: 'Reading…', 'not-price': 'Not an invoice / quote — skipped', skipped: 'Skipped', error: r.error || 'Failed' }[r.status];
  return `<div class="import-item muted-item ${r.status}"><div class="compare-top"><div class="small" style="min-width:0">${meta}</div>
    <span class="small ${r.status === 'error' ? '' : 'muted'}" ${r.status === 'error' ? 'style="color:var(--bad)"' : ''}>${r.status === 'reading' ? '<span class="spinner spinner-sm"></span>' : ''}${esc(label)}</span></div>
    ${r.status === 'error' ? `<button class="btn btn-sm" data-retry="${i}" style="margin-top:8px">Try again</button>` : ''}</div>`;
}

function editResult(i) {
  const r = run.results[i];
  const body = $('#imBody');
  body.innerHTML = `<div id="imEdit"></div>`;
  docForm($('#imEdit'), { ...r.data, fromFile: r.f.name }, {
    mode: 'save',
    onCancel: () => { body.innerHTML = ''; drawRun(); },
    onSubmit: (header, items) => {
      const res = db.savePriceDocument(header, items);
      db.markImported([key(r.f)]);
      r.data = { ...r.data, ...header, items }; r.status = 'saved'; r.saved = res.added;
      toast(`Saved ${res.added} prices`);
      body.innerHTML = ''; drawRun();
    },
  });
  // A Back button above the form
  const back = document.createElement('button');
  back.className = 'btn'; back.style.marginBottom = '12px'; back.innerHTML = `${icon.arrowLeft} Back to the list`;
  back.onclick = () => { body.innerHTML = ''; drawRun(); };
  body.prepend(back);
}
