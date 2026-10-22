// Reads an invoice / quotation (PDF or image) and returns structured data.
// 1) Opened inside claude.ai: Claude reads it through the viewer's own Claude account (no key needed).
// 2) With an Anthropic API key: Claude reads it through the API.
// 3) Otherwise: basic offline reading (PDF text layer or on-device OCR) + simple rules.
// The file itself is only held in memory while reading; it is never saved.

import { getApiKey, getState } from './store.js';

// iPhone/iPad Safari can't loop over a ReadableStream with "for await" yet; the PDF reader needs it.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.130.0/+esm';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/pdf.worker.min.mjs';
const num = v => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

// ---------- Which AI is available? ----------
let samplePromise = null;
/** Why Claude (no-key) reading is not in use: '' | 'outside' | 'not_granted' | 'unavailable'. */
export const aiStatus = { reason: '' };
const outsideViewer = () => { try { return window.top === window; } catch { return false; } };
/** The claude.ai "ask Claude" function, or null when the page is not opened inside claude.ai. */
export function getSample() {
  if (!samplePromise) {
    samplePromise = (window.claude && typeof window.claude.use === 'function')
      ? window.claude.use('sample').catch(() => null)
      : Promise.resolve(null);
    samplePromise.then(s => { if (!s) aiStatus.reason = (!window.claude || outsideViewer()) ? 'outside' : 'unavailable'; });
  }
  return samplePromise;
}
let sampleBlocked = false; // the viewer declined, or Claude is unavailable for this account
export function markSampleBlocked(code) {
  sampleBlocked = true;
  aiStatus.reason = code === 'not_granted' ? 'not_granted' : 'unavailable';
}
/** Let the viewer try Claude again (e.g. after allowing it in Permissions). */
export function resetSample() { sampleBlocked = false; aiStatus.reason = ''; }

/** 'claude' (built-in, no key), 'key' (own API key), or 'offline'. */
export async function aiMode() {
  if (!sampleBlocked && await getSample()) return 'claude';
  if (getApiKey()) return 'key';
  return 'offline';
}

// ---------- File types ----------
export const ACCEPT = 'application/pdf,image/*,.xlsx,.xls,.csv,.txt,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
const isSheetFile = f => /\.(xlsx|xlsm|xls|csv|ods)$/i.test(f.name || '') || /spreadsheet|excel|csv/.test(f.type || '');
const isTextFile = f => /\.txt$/i.test(f.name || '') || f.type === 'text/plain';

/** Turn an Excel / CSV / text file into plain text (one row per line, cells separated by " | "). */
export async function fileToText(file) {
  if (isTextFile(file) && !isSheetFile(file)) return await file.text();
  if (/\.csv$/i.test(file.name || '') || file.type === 'text/csv') return (await file.text()).replace(/,/g, ' | ');
  await loadScript(XLSX_URL);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = [];
  for (const name of wb.SheetNames.slice(0, 10)) {
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, raw: false });
    if (!rows.length) continue;
    if (wb.SheetNames.length > 1) out.push(`### Sheet: ${name}`);
    for (const r of rows) {
      const cells = r.map(c => String(c ?? '').trim());
      if (cells.some(Boolean)) out.push(cells.join(' | '));
    }
  }
  return out.join('\n');
}

export async function extractDocument(file, onStatus = () => {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/');
  if (isSheetFile(file) || isTextFile(file)) {
    onStatus('Opening file…');
    const text = await fileToText(file);
    return await extractText(text, onStatus);
  }
  if (!isPdf && !isImage) throw new Error('Please upload a PDF, a photo (JPG / PNG), an Excel file or a text file.');

  const mode = await aiMode();
  if (mode === 'claude') {
    try {
      return await extractWithSample(file, isPdf, onStatus);
    } catch (e) {
      if (!e.fallback) throw e;
      markSampleBlocked(e.code);
      onStatus('Claude is not available here — trying another way…');
    }
  }
  if (getApiKey()) {
    onStatus('AI is reading your document…');
    return await extractWithClaude(file, isPdf, onStatus);
  }
  onStatus(isPdf ? 'Reading PDF text…' : 'Reading image text (this can take ~20 seconds)…');
  const text = isPdf ? await pdfText(file) : await imageText(file, onStatus);
  if (!text.trim()) throw new Error('No readable text found. Open the app in claude.ai or add an API key in Settings for AI reading, or type the prices manually.');
  const result = parseText(text);
  result.offline = true;
  result.offlineReason = aiStatus.reason;
  return result;
}

/** Read prices from copied text (a WhatsApp message, an email, a pasted quotation). */
export async function extractText(text, onStatus = () => {}) {
  text = String(text || '').trim();
  if (!text) throw new Error('Nothing to read — the pasted text is empty.');
  if (await aiMode() === 'claude') {
    try {
      return await extractWithSample(null, false, onStatus, text);
    } catch (e) {
      if (!e.fallback) throw e;
      markSampleBlocked(e.code);
    }
  }
  if (getApiKey()) {
    onStatus('AI is reading the text…');
    return await extractWithClaude(null, false, onStatus, text);
  }
  const result = parseText(text);
  result.offline = true;
  result.offlineReason = aiStatus.reason;
  return result;
}

// ---------------- Claude inside claude.ai (no key) ----------------

function jsonInstructions(categories) {
  return `${PROMPT}

Allowed categories: ${categories.join(' | ')}

Reply with ONLY one JSON object in exactly this shape (use null where a value is not shown):
{"document_type":"invoice|quotation|other","supplier":{"name":"","contact_person":null,"phone":null,"email":null,"address":null,"tax_id":null},"document_number":null,"date":"YYYY-MM-DD","currency":"AED","vat_percent":null,"delivery_charge":null,"payment_terms":null,"delivery_time":null,"items":[{"product":"","category":"","unit":null,"quantity":null,"unit_price":0,"line_total":null}]}`;
}

async function extractWithSample(file, isPdf, onStatus, pastedText = '') {
  const sample = await getSample();
  const limits = await sample.limits().catch(() => null);
  const canImages = !!limits?.images;
  const { categories } = getState();
  let images = [];
  let docText = '';

  if (pastedText) {
    docText = pastedText;
  } else if (isPdf) {
    onStatus('Opening PDF…');
    const pdf = await openPdf(file);
    docText = await pdfTextFrom(pdf).catch(err => { console.warn('PDF text failed', err); return ''; });
    if (canImages) {
      onStatus('Preparing pages…');
      images = await renderPdfPages(pdf, Math.min(limits.images.maxCount || 5, 5)).catch(() => []);
    }
    if (!docText.trim() && !images.length) throw new Error('This PDF has no readable text. Take a photo of it instead, or type the prices manually.');
  } else {
    if (!canImages) { const e = new Error('Photos cannot be read here'); e.fallback = true; throw e; }
    images = [file];
  }

  const what = pastedText
    ? 'Below is a supplier quotation, invoice or price message the user copied (for example from WhatsApp or an email). It may be informal, with prices written in a sentence or list.'
    : images.length
      ? `The attached image${images.length > 1 ? 's are the pages' : ' is'} of a supplier document.`
      : 'Below is the text of a supplier document.';
  const label = pastedText ? 'Copied text' : 'Text layer of the document (may be incomplete or out of order)';
  const prompt = `${what}\n\n${jsonInstructions(categories)}` +
    (docText.trim() ? `\n\n${label}:\n"""\n${docText.slice(0, 60000)}\n"""` : '');

  onStatus('Claude is reading your document… (first time: allow Claude when asked)');
  let data;
  try {
    data = await sample.json(prompt, { images: images.length ? images : undefined, modelTier: 'default' });
  } catch (e) {
    const code = e?.code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'].includes(code)) {
      const err = new Error('Claude is not allowed on this page'); err.fallback = true; err.code = code; throw err;
    }
    const msg = {
      rate_limited: 'Too many requests, or your Claude usage limit was reached. Please try again later.',
      session_expired: 'Please sign in to claude.ai again.',
      image_rejected: 'This image could not be used. Try a clearer JPG or PNG photo.',
      refused: 'Claude could not read this document. Please type the prices manually.',
      invalid_json: 'Claude\'s reply could not be understood. Please try again.',
      prompt_too_large: 'This document is too long. Try uploading fewer pages.',
      cancelled: 'Reading was cancelled.',
    }[code] || 'Claude could not read the document right now. Please try again.';
    throw new Error(msg);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) throw new Error('Claude\'s reply could not be understood. Please try again.');
  return fromAiJson(data, categories);
}

// ---------------- Claude ----------------

function schema(categories) {
  const str = { type: 'string' };
  const strOrNull = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  const numOrNull = { anyOf: [{ type: 'number' }, { type: 'null' }] };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['document_type', 'supplier', 'document_number', 'date', 'currency', 'vat_percent', 'delivery_charge', 'payment_terms', 'delivery_time', 'items'],
    properties: {
      document_type: { type: 'string', enum: ['invoice', 'quotation', 'other'] },
      supplier: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'contact_person', 'phone', 'email', 'address', 'tax_id'],
        properties: { name: str, contact_person: strOrNull, phone: strOrNull, email: strOrNull, address: strOrNull, tax_id: strOrNull },
      },
      document_number: strOrNull,
      date: { ...strOrNull, description: 'Document date as YYYY-MM-DD' },
      currency: { ...strOrNull, description: 'ISO 4217 code, e.g. AED, USD, INR' },
      vat_percent: { ...numOrNull, description: 'VAT / tax rate in percent, e.g. 5' },
      delivery_charge: { ...numOrNull, description: 'Delivery / transport charge for the whole document, if separate' },
      payment_terms: { ...strOrNull, description: 'e.g. "Cash", "30 days credit", "50% advance"' },
      delivery_time: { ...strOrNull, description: 'e.g. "Immediate", "3-5 days"' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['product', 'category', 'unit', 'quantity', 'unit_price', 'line_total'],
          properties: {
            product: str,
            category: { type: 'string', enum: categories },
            unit: strOrNull,
            quantity: numOrNull,
            unit_price: numOrNull,
            line_total: numOrNull,
          },
        },
      },
    },
  };
}

const PROMPT = `Extract the purchase details from this supplier invoice or quotation.

- supplier: the company SELLING the goods (the issuer of the document), not the customer it is addressed to.
- product: a clear, complete product name including brand, size, grade and specification (e.g. "OPC Cement 50kg bag", "Steel Rebar 12mm Grade 60"). Keep it as written but readable; fix obvious OCR mistakes.
- unit_price: price per single unit BEFORE tax/VAT, as a plain number. If only a line total and quantity are given, divide. If a discount is shown per line, use the discounted unit price.
- unit: unit of measure as written (bag, pcs, ton, m, kg, ltr, box, roll, sqm...).
- category: pick the closest category from the list.
- Skip non-product lines (subtotals, VAT, delivery notes, bank details) — but include delivery/transport charges only if they are a priced line item.
- date: the document date in YYYY-MM-DD. Use null for anything not shown.
- vat_percent: the VAT/tax rate shown (e.g. 5). delivery_charge: a separate delivery/transport charge for the whole order, if any.
- payment_terms (e.g. "30 days credit", "Cash", "50% advance") and delivery_time (e.g. "Immediate", "2-3 days"), if mentioned.`;

async function extractWithClaude(file, isPdf, onStatus, pastedText = '') {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  const { categories, settings } = getState();

  let block;
  if (pastedText) {
    block = { type: 'text', text: `Supplier quotation, invoice or price message copied by the user (e.g. from WhatsApp; may be informal):\n"""\n${pastedText.slice(0, 60000)}\n"""` };
  } else if (isPdf) {
    if (file.size > 30 * 1024 * 1024) throw new Error('PDF is too large (max 30 MB).');
    block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await toBase64(file) } };
  } else {
    onStatus('Preparing image…');
    const { data, mediaType } = await shrinkImage(file);
    block = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  }
  onStatus('AI is reading your document…');

  let response;
  try {
    response = await client.beta.messages.create({
      model: settings.model || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema(categories) } },
      messages: [{ role: 'user', content: [block, { type: 'text', text: PROMPT }] }],
    });
  } catch (err) {
    throw new Error(friendlyApiError(err, Anthropic));
  }

  if (response.stop_reason === 'refusal') throw new Error('The AI could not read this document. Please type the prices manually.');
  if (response.stop_reason === 'max_tokens') throw new Error('The document is too long to read in one go. Try uploading fewer pages.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The AI reply could not be understood. Please try again.'); }

  return fromAiJson(data, categories);
}

function fromAiJson(data, categories) {
  return {
    docType: data.document_type === 'quotation' ? 'quotation' : data.document_type === 'invoice' ? 'invoice' : 'other',
    supplier: {
      name: data.supplier?.name || '',
      contact: data.supplier?.contact_person || '',
      phone: data.supplier?.phone || '',
      email: data.supplier?.email || '',
      address: data.supplier?.address || '',
      taxId: data.supplier?.tax_id || '',
    },
    docRef: data.document_number || '',
    vatPct: num(data.vat_percent) ?? '',
    delivery: num(data.delivery_charge) ?? '',
    paymentTerms: data.payment_terms || '',
    deliveryTime: data.delivery_time || '',
    date: validDate(data.date),
    currency: String(data.currency || '').toUpperCase().slice(0, 3),
    items: (data.items || []).filter(i => i && i.product).map(i => {
      let price = num(i.unit_price);
      const qty = num(i.quantity), total = num(i.line_total);
      if ((price == null || price === 0) && total && qty) price = total / qty;
      return {
        product: String(i.product),
        category: categories.includes(i.category) ? i.category : guessCategory(String(i.product), categories),
        unit: i.unit || '',
        qty: qty ?? '',
        price: price != null ? round(price) : '',
      };
    }),
  };
}

function friendlyApiError(err, Anthropic) {
  if (err instanceof Anthropic.AuthenticationError) return 'Your API key was not accepted. Please check it in Settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Your API key does not have permission for this model. Try another model in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Too many requests right now. Please wait a minute and try again.';
  if (err instanceof Anthropic.BadRequestError) return 'The document could not be processed: ' + (err.message || 'bad request');
  if (err instanceof Anthropic.APIConnectionError) return 'Could not connect to the AI service. Check your internet connection.';
  if (err instanceof Anthropic.APIError) return 'AI service error: ' + (err.message || 'unknown');
  return err?.message || String(err);
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Phone photos are big; scale down to keep uploads fast and under API limits.
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This image format is not supported. Please use JPG or PNG.'));
      i.src = url;
    });
    const max = 2200;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.88);
    return { data: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------- Offline fallback ----------------

let pdfjsPromise = null;
async function openPdf(file) {
  pdfjsPromise ??= import(PDFJS_URL).then(m => { m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; });
  const pdfjs = await pdfjsPromise.catch(() => { pdfjsPromise = null; throw new Error('Could not load the PDF reader. Check your internet connection.'); });
  return await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}

async function pdfText(file) { return pdfTextFrom(await openPdf(file)); }

async function pdfTextFrom(pdf) {
  const lines = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 20); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group text pieces into lines by their vertical position
    const rows = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, parts]) => {
      lines.push(parts.sort((a, b) => a.x - b.x).map(p => p.s).join('  '));
    });
  }
  return lines.join('\n');
}

/** Render the first pages of a PDF as JPEG images (for scanned PDFs). */
async function renderPdfPages(pdf, max) {
  const out = [];
  for (let p = 1; p <= Math.min(pdf.numPages, max); p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / base.width) });
    const c = document.createElement('canvas');
    c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, canvas: c, viewport }).promise;
    out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)));
  }
  return out.filter(Boolean);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the text reader. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

async function imageText(file, onStatus) {
  await loadScript(TESSERACT_URL);
  const { data } = await window.Tesseract.recognize(file, 'eng', {
    logger: m => { if (m.status === 'recognizing text') onStatus(`Reading image text… ${Math.round(m.progress * 100)}%`); },
  });
  return data.text || '';
}

const NUM = /(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])\d+(?:\.\d+)?/g;
const SKIP = /\b(sub\s*total|total|vat|tax|grand|discount|balance|amount\s+due|bank|iban|account|tel|phone|fax|email|p\.?o\.?\s*box|trn|invoice\s*(no|#)|quotation\s*(no|#)|date|page|signature|terms)\b/i;

/** Very simple rule-based reader. Results are shown for the user to check before saving. */
export function parseText(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const { categories } = getState();
  const out = { docType: /quot/i.test(text) ? 'quotation' : /invoice/i.test(text) ? 'invoice' : 'other', supplier: { name: '' }, docRef: '', date: '', currency: '', items: [] };

  out.supplier.name = (lines.find(l => /[a-z]{3}/i.test(l) && !/invoice|quotation|tax|date/i.test(l)) || '').slice(0, 80);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/); if (email) out.supplier.email = email[0];
  const phone = text.match(/(?:\+?\d[\d\s-]{7,}\d)/); if (phone) out.supplier.phone = phone[0].trim();
  const ref = text.match(/\b(?:invoice|quotation|quote|inv|qtn|ref)[ \t]*(?:no\.?|number|#)?[ \t]*[:\-]?[ \t]*([A-Z0-9\/-]*\d[A-Z0-9\/-]*)/i); if (ref) out.docRef = ref[1];
  out.date = findDate(text);
  const cur = text.match(/\b(AED|SAR|QAR|OMR|KWD|BHD|INR|USD|EUR|GBP|PKR|EGP)\b/); if (cur) out.currency = cur[1];

  for (const line of lines) {
    if (SKIP.test(line)) continue;
    const nums = [...line.matchAll(NUM)].map(m => ({ v: Number(m[0].replace(/,/g, '')), i: m.index, raw: m[0] }));
    if (!nums.length) continue;
    // Product text = the part before the first trailing number group
    const firstPriceIdx = nums.length >= 2 ? nums[nums.length - Math.min(nums.length, 3)].i : nums[0].i;
    let name = line.slice(0, firstPriceIdx).replace(/^\s*\d{1,3}[.)]?\s+/, '').replace(/[-–:|]+$/, '').trim();
    if (!/[a-z]{3}/i.test(name) || name.length < 3) continue;
    let qty = '', price = '';
    const tail = nums.filter(n => n.i >= firstPriceIdx).map(n => n.v);
    if (tail.length >= 3) { qty = tail[tail.length - 3]; price = tail[tail.length - 2]; }
    else if (tail.length === 2) { qty = tail[0]; price = tail[1]; if (qty > price) [qty, price] = ['', tail[1]]; }
    else price = tail[0];
    if (!price || price <= 0) continue;
    const unitM = name.match(/\b(bags?|pcs|nos|tons?|kg|ltrs?|rolls?|boxes|box|sqm|mtrs?|m|sets?|drums?|sheets?|lengths?)\b\.?$/i);
    out.items.push({ product: name, category: guessCategory(name, categories), unit: unitM ? unitM[1].toLowerCase() : '', qty, price: round(price) });
  }
  return out;
}

function findDate(text) {
  let m = text.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (m) return validDate(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
  m = text.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2}|\d{2})\b/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return validDate(`${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`); }
  const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  m = text.match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(20\d{2})\b/i);
  if (m) return validDate(`${m[3]}-${String(months.indexOf(m[2].toLowerCase()) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  return '';
}

const KEYWORDS = {
  'Cement & Concrete': /cement|concrete|ready ?mix|grout|mortar|opc|src\b/i,
  'Steel & Metal': /steel|rebar|\bbar\b|tmt|angle|channel|beam|pipe ms|gi sheet|mesh|wire|metal|ms plate/i,
  'Blocks & Bricks': /block|brick|hollow|solid block|kerb/i,
  'Sand & Aggregates': /sand|aggregate|gravel|gabbro|crushed|stone dust/i,
  'Wood & Timber': /wood|timber|plywood|mdf|board|shuttering/i,
  'Electrical': /cable|wire|switch|socket|breaker|mcb|light|lamp|led|conduit|db box|electrical/i,
  'Plumbing & Pipes': /pvc|upvc|ppr|pipe|elbow|tee|valve|fitting|plumb|tap/i,
  'Sanitary Ware': /wc|basin|toilet|sink|mixer|shower|sanitary/i,
  'Paint & Coatings': /paint|primer|emulsion|enamel|coat|putty|varnish/i,
  'Tiles & Flooring': /tile|porcelain|ceramic|marble|granite|floor/i,
  'Glass & Aluminium': /glass|alumin|mirror/i,
  'Insulation & Waterproofing': /insulat|waterproof|membrane|bitumen|foam|rockwool/i,
  'Hardware & Fasteners': /screw|bolt|nut|nail|anchor|hinge|lock|washer|rivet/i,
  'Tools & Equipment': /drill|grinder|hammer|tool|blade|disc|ladder|machine/i,
  'Safety & PPE': /helmet|glove|boot|vest|goggle|mask|harness|safety/i,
  'Chemicals & Adhesives': /adhesive|sealant|silicone|epoxy|chemical|glue|admixture/i,
};

export function guessCategory(name, categories) {
  for (const [cat, re] of Object.entries(KEYWORDS)) if (categories.includes(cat) && re.test(name)) return cat;
  return categories.includes('Other') ? 'Other' : categories[0];
}

function validDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? '' : s;
}

const round = n => Math.round(Number(n) * 10000) / 10000;

// ================= Material lists =================
// A material list / BOQ / requirement list: names + quantities, usually no prices.

const LIST_PROMPT = `This is a material list (a list of building materials or supplies someone needs to buy — it may be a BOQ, a requirement list, a WhatsApp message or a handwritten note).
Extract every material line.
- name: the full material name with size/spec/grade/brand as written (e.g. "OPC Cement 50kg", "Steel Rebar 12mm Grade 60", "PVC Pipe 4 inch Class B").
- qty: the quantity as a number (null if not given). unit: the unit (bag, ton, pcs, m, sqm, ltr, roll…), null if not given.
- note: anything else on that line worth keeping (brand preference, location, remarks), else null.
Skip headings, totals, signatures and lines that are not materials.
title: a short name for the list (e.g. project or site name if shown), else null.`;

const LIST_SHAPE = '{"title":null,"items":[{"name":"","qty":null,"unit":null,"note":null}]}';

const listSchema = () => ({
  type: 'object', additionalProperties: false, required: ['title', 'items'],
  properties: {
    title: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'qty', 'unit', 'note'],
      properties: { name: { type: 'string' }, qty: { anyOf: [{ type: 'number' }, { type: 'null' }] }, unit: { anyOf: [{ type: 'string' }, { type: 'null' }] }, note: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } },
  },
});

function mapList(data) {
  return {
    title: data?.title || '',
    items: (data?.items || []).filter(i => i && i.name).map(i => ({ name: String(i.name).trim(), qty: num(i.qty) ?? '', unit: i.unit || '', note: i.note || '' })),
  };
}

/** Read a material list from a file (PDF, photo, Excel, CSV, text) or from pasted text. */
export async function extractList(fileOrText, onStatus = () => {}) {
  let file = null, text = '';
  if (typeof fileOrText === 'string') text = fileOrText.trim();
  else {
    file = fileOrText;
    if (isSheetFile(file) || isTextFile(file)) { onStatus('Opening file…'); text = await fileToText(file); file = null; }
  }
  if (!file && !text) throw new Error('The list is empty.');
  const isPdf = !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (file && !isPdf && !file.type.startsWith('image/')) throw new Error('Please use a PDF, photo, Excel, CSV or text file.');

  // 1) Claude inside claude.ai
  if (await aiMode() === 'claude') {
    try {
      const sample = await getSample();
      const limits = await sample.limits().catch(() => null);
      let images = [], docText = text;
      if (file && isPdf) {
        onStatus('Opening PDF…');
        const pdf = await openPdf(file);
        docText = await pdfTextFrom(pdf).catch(() => '');
        if (limits?.images) images = await renderPdfPages(pdf, Math.min(limits.images.maxCount || 5, 5)).catch(() => []);
      } else if (file) {
        if (!limits?.images) { const e = new Error('no images'); e.fallback = true; e.code = 'images_unavailable'; throw e; }
        images = [file];
      }
      onStatus('Claude is reading your list…');
      const prompt = `${LIST_PROMPT}\n\nReply with ONLY one JSON object in exactly this shape:\n${LIST_SHAPE}` +
        (docText.trim() ? `\n\nThe list text:\n"""\n${docText.slice(0, 60000)}\n"""` : '\n\nThe list is in the attached image(s).');
      let data;
      try {
        data = await sample.json(prompt, { images: images.length ? images : undefined, modelTier: 'default' });
      } catch (e) {
        if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'].includes(e?.code)) { const err = new Error('blocked'); err.fallback = true; err.code = e.code; throw err; }
        throw new Error({ rate_limited: 'Too many requests, or your Claude usage limit was reached. Try again later.', refused: 'Claude could not read this list.', invalid_json: 'Claude\'s reply could not be understood. Please try again.' }[e?.code] || 'Claude could not read the list right now. Please try again.');
      }
      return mapList(data);
    } catch (e) {
      if (!e.fallback) throw e;
      markSampleBlocked(e.code);
    }
  }
  // 2) Own API key
  if (getApiKey()) {
    onStatus('AI is reading your list…');
    const { default: Anthropic } = await import(SDK_URL);
    const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true, maxRetries: 2 });
    let block;
    if (text) block = { type: 'text', text: `The list:\n"""\n${text.slice(0, 60000)}\n"""` };
    else if (isPdf) block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await toBase64(file) } };
    else { const { data, mediaType } = await shrinkImage(file); block = { type: 'image', source: { type: 'base64', media_type: mediaType, data } }; }
    let res;
    try {
      res = await client.beta.messages.create({
        model: getState().settings.model || 'claude-opus-5-5', max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: listSchema() } },
        messages: [{ role: 'user', content: [block, { type: 'text', text: LIST_PROMPT }] }],
      });
    } catch (err) { throw new Error(friendlyApiError(err, Anthropic)); }
    if (res.stop_reason === 'refusal') throw new Error('The AI could not read this list.');
    return mapList(JSON.parse(res.content.filter(b => b.type === 'text').map(b => b.text).join('')));
  }
  // 3) Offline
  if (file) {
    onStatus(isPdf ? 'Reading PDF text…' : 'Reading image text…');
    text = isPdf ? await pdfText(file) : await imageText(file, onStatus);
  }
  const out = parseListText(text);
  out.offline = true;
  out.offlineReason = aiStatus.reason;
  return out;
}

/** Simple rule-based list reader: "OPC Cement 50kg - 100 bags" -> {name, qty: 100, unit: 'bags'} */
export function parseListText(text) {
  const items = [];
  const UNIT = /^(bags?|pcs|nos?|tons?|kgs?|ltrs?|l|rolls?|box(es)?|sqm|m2|mtrs?|m|rm|sets?|drums?|sheets?|lengths?|bundles?|pkts?|cans?|each|ea|units?|pails?|cartons?|ft|sqft|cum|m3)\.?$/i;
  for (let line of String(text).split(/\r?\n/)) {
    if (/^###/.test(line) || /:\s*$/.test(line.trim())) continue; // sheet names, headings like "Site list:"
    // Spreadsheet rows: "1 | OPC Cement 50kg | 150 | bag"
    if (line.includes(' | ')) {
      const cells = line.split(' | ').map(c => c.trim()).filter(Boolean);
      const nameIdx = cells.reduce((bi, c, i) => (/[a-z]{3}/i.test(c) && !UNIT.test(c) && c.length > (cells[bi] || '').length ? i : bi), -1);
      if (nameIdx < 0) continue;
      const name = cells[nameIdx];
      if (/^(s\.?\s?no|sl|item|description|material|particulars|total|sub ?total)\b/i.test(name)) continue;
      const rest = cells.slice(nameIdx + 1);
      const qi = rest.findIndex(c => /^\d+(?:[.,]\d+)?$/.test(c.replace(/,/g, '')));
      const qty = qi >= 0 ? Number(rest[qi].replace(/,/g, '')) : '';
      const unit = rest.find(c => UNIT.test(c)) || '';
      items.push({ name, qty, unit: unit.toLowerCase(), note: '' });
      continue;
    }
    line = line.replace(/^\s*(?:\d{1,3}[.)-]|[-*•])\s+/, '').trim();
    if (!/[a-z]{3}/i.test(line) || /^(sl|s\.?no|item|description|qty|total|sub ?total)\b/i.test(line)) continue;
    let qty = '', unit = '';
    const m = line.match(/(?:[-–:x×|]\s*|\s)(\d+(?:[.,]\d+)?)\s*(bags?|pcs|nos|no|tons?|kg|ltrs?|l|rolls?|boxes|box|sqm|m2|mtrs?|m|rm|sets?|drums?|sheets?|lengths?|bundles?|pkts?|cans?|each)?\.?\s*$/i);
    if (m) { qty = Number(m[1].replace(',', '.')); unit = (m[2] || '').toLowerCase(); line = line.slice(0, m.index).trim(); }
    line = line.replace(/[\s|:–-]+$/, '').trim();
    if (line.length >= 3) items.push({ name: line, qty, unit, note: '' });
  }
  return { title: '', items };
}
