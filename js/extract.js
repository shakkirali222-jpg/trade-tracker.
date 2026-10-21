// Reads an invoice / quotation (PDF or image) and returns structured data.
// 1) With an Anthropic API key: Claude reads the document (best accuracy, works on photos & scans).
// 2) Without a key: basic offline reading (PDF text layer or on-device OCR) + simple rules.
// The file itself is only held in memory while reading; it is never saved.

import { getApiKey, getState } from './store.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.130.0/+esm';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

export async function extractDocument(file, onStatus = () => {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) throw new Error('Please upload a PDF or an image (JPG / PNG).');

  if (getApiKey()) {
    onStatus('AI is reading your document…');
    return await extractWithClaude(file, isPdf, onStatus);
  }
  onStatus(isPdf ? 'Reading PDF text…' : 'Reading image text (this can take ~20 seconds)…');
  const text = isPdf ? await pdfText(file) : await imageText(file, onStatus);
  if (!text.trim()) throw new Error('No readable text found. Add an API key in Settings for AI reading of scanned/photo documents, or type the prices manually.');
  const result = parseText(text);
  result.offline = true;
  return result;
}

// ---------------- Claude ----------------

function schema(categories) {
  const str = { type: 'string' };
  const strOrNull = { anyOf: [{ type: 'string' }, { type: 'null' }] };
  const numOrNull = { anyOf: [{ type: 'number' }, { type: 'null' }] };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['document_type', 'supplier', 'document_number', 'date', 'currency', 'items'],
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
- date: the document date in YYYY-MM-DD. Use null for anything not shown.`;

async function extractWithClaude(file, isPdf, onStatus) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  const { categories, settings } = getState();

  let block;
  if (isPdf) {
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
    date: validDate(data.date),
    currency: (data.currency || '').toUpperCase().slice(0, 3),
    items: (data.items || []).map(i => {
      let price = i.unit_price;
      if ((price == null || price === 0) && i.line_total && i.quantity) price = i.line_total / i.quantity;
      return {
        product: i.product || '',
        category: categories.includes(i.category) ? i.category : 'Other',
        unit: i.unit || '',
        qty: i.quantity ?? '',
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

async function pdfText(file) {
  const pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
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
