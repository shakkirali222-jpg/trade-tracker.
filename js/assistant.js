// "Ask AI" — a small agent that answers questions about the saved prices.
// It looks things up with tools that read this browser's price book
// (search products, price history, suppliers), then answers in plain words.
// Inside claude.ai it runs on the viewer's Claude account; elsewhere it uses the API key from Settings.

import * as db from './store.js';
import { getSample, markSampleBlocked } from './extract.js';
import { normalize } from './match.js';
import { icon } from './icons.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.130.0/+esm';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const supName = id => db.getSupplier(id)?.name || 'Unknown';

// ---------- Tools the agent can use (read-only) ----------
function productCard(p) {
  const s = db.productSummary(p.id);
  if (!s) return null;
  const r = x => ({ price: x.price, currency: x.currency, supplier: supName(x.supplierId), date: x.date });
  return {
    product_id: p.id, name: p.name, category: p.category, unit: p.unit || null,
    best_current_price: r(s.best), latest_price: r(s.latest), lowest_ever: r(s.lowest),
    average_price: Math.round(s.avg * 100) / 100, price_records: s.count, suppliers: s.supplierCount,
    latest_from_each_supplier: s.latestPerSupplier.map(r),
  };
}

const TOOLS = [
  {
    name: 'search_products',
    description: 'Find saved products by name words, category and/or supplier. Returns up to 25 products, each with its best current price, latest price, lowest ever price and the latest price from each supplier. Call with no arguments to list everything (most recent first).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words from the product name, e.g. "rebar 12mm" or "cement"' },
        category: { type: 'string', description: 'Exact category name' },
        supplier: { type: 'string', description: 'Supplier name or part of it' },
      },
    },
    execute(input) {
      const st = db.getState();
      const words = normalize(input.query || '').split(' ').filter(Boolean);
      const supQ = normalize(input.supplier || '');
      const supIds = supQ ? new Set(st.suppliers.filter(s => normalize(s.name).includes(supQ)).map(s => s.id)) : null;
      let list = st.products.filter(p => {
        if (input.category && p.category.toLowerCase() !== String(input.category).toLowerCase()) return false;
        const name = normalize(p.name + ' ' + p.category);
        if (words.length && !words.every(w => name.includes(w))) return false;
        if (supIds && !st.prices.some(r => r.productId === p.id && supIds.has(r.supplierId))) return false;
        return true;
      });
      // Loose fallback: any word matches
      if (!list.length && words.length) list = st.products.filter(p => words.some(w => w.length > 2 && normalize(p.name).includes(w)));
      const cards = list.map(productCard).filter(Boolean).sort((a, b) => b.latest_price.date.localeCompare(a.latest_price.date));
      return { total_found: cards.length, products: cards.slice(0, 25) };
    },
  },
  {
    name: 'get_price_history',
    description: 'Full dated price history of one product (from search_products product_id): every price with supplier, date, quantity and document reference, newest first.',
    inputSchema: { type: 'object', properties: { product_id: { type: 'string' } }, required: ['product_id'] },
    execute(input) {
      const p = db.getProduct(String(input.product_id));
      if (!p) throw new Error('No product with that id. Use search_products first.');
      return {
        name: p.name, unit: p.unit || null,
        history: db.pricesFor(p.id).slice(0, 80).map(r => ({
          date: r.date, supplier: supName(r.supplierId), price: r.price, currency: r.currency,
          qty: r.qty, document: r.docType, ref: r.docRef || null,
        })),
      };
    },
  },
  {
    name: 'list_suppliers',
    description: 'All suppliers with contact details, how many products they supplied, last price date, and how many products they are currently cheapest for.',
    execute() {
      const st = db.getState();
      const cheapest = new Map();
      st.products.forEach(p => { const s = db.productSummary(p.id); if (s) cheapest.set(s.best.supplierId, (cheapest.get(s.best.supplierId) || 0) + 1); });
      return st.suppliers.map(s => {
        const pr = st.prices.filter(r => r.supplierId === s.id);
        return {
          name: s.name, phone: s.phone || null, email: s.email || null, contact: s.contact || null,
          products: new Set(pr.map(r => r.productId)).size, last_price_date: pr.reduce((m, r) => (r.date > m ? r.date : m), '') || null,
          cheapest_for_products: cheapest.get(s.id) || 0,
        };
      });
    },
  },
  {
    name: 'get_supplier_prices',
    description: "The latest price this supplier gave for every product they supplied, with how it compares to the best price from any supplier.",
    inputSchema: { type: 'object', properties: { supplier: { type: 'string', description: 'Supplier name or part of it' } }, required: ['supplier'] },
    execute(input) {
      const st = db.getState();
      const q = normalize(input.supplier || '');
      const s = st.suppliers.find(x => normalize(x.name) === q) || st.suppliers.find(x => normalize(x.name).includes(q));
      if (!s) throw new Error('Supplier not found. Use list_suppliers to see names.');
      const latest = new Map();
      st.prices.filter(r => r.supplierId === s.id).sort((a, b) => b.date.localeCompare(a.date))
        .forEach(r => { if (!latest.has(r.productId)) latest.set(r.productId, r); });
      return {
        supplier: s.name,
        items: [...latest.values()].map(r => {
          const best = db.productSummary(r.productId, r.currency)?.best;
          return {
            product: db.getProduct(r.productId)?.name, price: r.price, currency: r.currency, date: r.date,
            best_price_any_supplier: best ? { price: best.price, supplier: supName(best.supplierId), date: best.date } : null,
          };
        }),
      };
    },
  },
];

function rules() {
  const st = db.getState();
  return `You are the "Price Book" assistant inside a purchasing app for building materials and trade supplies.
The user saves supplier prices from invoices and quotations. Answer their question using ONLY their saved data, which you read with the tools (search_products, get_price_history, list_suppliers, get_supplier_prices). Look things up before answering; never invent prices or suppliers.

Today is ${db.today()}. Default currency: ${st.settings.currency}. Saved: ${st.products.length} products, ${st.suppliers.length} suppliers, ${st.prices.length} prices.
Categories: ${st.categories.join(', ')}.

How to answer:
- Short and practical. Start with the direct answer, then a few bullet points.
- Always give each price with its supplier and date, e.g. "AED 14.75 — Gulf Traders (2 May 2026)".
- When comparing, say who is cheapest and by how much (amount and %).
- If old prices may be outdated (more than ~6 months), mention it.
- If nothing matches, say so and suggest what to search for or to add prices.
- Reply in the same language the user writes in.`;
}

// ---------- Engines ----------
async function askWithSample(sample, turns, { onText, signal, onTool }) {
  const limits = await sample.limits().catch(() => null);
  if (limits?.tools) {
    const tools = TOOLS.map(t => ({
      name: t.name, description: t.description, ...(t.inputSchema ? { inputSchema: t.inputSchema } : {}),
      execute: input => { onTool(t.name); return t.execute(input || {}); },
    }));
    return (await sample([{ role: 'user', content: rules() }, ...turns], { tools, onText, signal })).text;
  }
  // No page tools in this view: give Claude a compact copy of the data instead.
  const all = TOOLS[0].execute({}).products;
  const data = JSON.stringify(db.getState().products.map(p => productCard(p)).filter(Boolean)).slice(0, 180000);
  return (await sample([{ role: 'user', content: `${rules()}\n\nThe saved data (${all.length} products) as JSON:\n${data}` }, ...turns], { onText, signal, cache: false })).text;
}

async function askWithApiKey(turns, { onText, signal, onTool }) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: db.getApiKey(), dangerouslyAllowBrowser: true, maxRetries: 2 });
  const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
  const messages = turns.map(t => ({ role: t.role, content: t.content }));
  let text = '';
  for (let round = 0; round < 8; round++) {
    const res = await client.beta.messages.create({
      model: db.getState().settings.model || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: rules(),
      tools,
      messages,
    }, { signal });
    if (res.stop_reason === 'refusal') throw { code: 'refused' };
    const t = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (t) { text += (text ? '\n\n' : '') + t; onText({ text }); }
    if (res.stop_reason !== 'tool_use') return text;
    messages.push({ role: 'assistant', content: res.content });
    const results = res.content.filter(b => b.type === 'tool_use').map(b => {
      const tool = TOOLS.find(x => x.name === b.name);
      onTool(b.name);
      try { return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(tool.execute(b.input || {})) }; }
      catch (e) { return { type: 'tool_result', tool_use_id: b.id, content: 'Error: ' + e.message, is_error: true }; }
    });
    messages.push({ role: 'user', content: results });
  }
  return text || 'Sorry, I could not finish that. Please ask in a simpler way.';
}

// ---------- Tiny markdown (bold, lists, headings, line breaks) ----------
function md(src) {
  const lines = esc(src).split('\n');
  let html = '', inList = false;
  for (let line of lines) {
    line = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) html += `<p><b>${h[1]}</b></p>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

// ---------- Screen ----------
const chat = { turns: [] }; // kept while the app is open

const SUGGESTIONS = [
  'Which supplier is cheapest for cement?',
  'Show the price history of 12mm rebar',
  'Which prices went up the most recently?',
  'Who is my cheapest supplier overall?',
  'What did I pay for tiles last time?',
];

export async function renderAssistant(view, toast) {
  const st = db.getState();
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Ask AI</h1><p>Ask anything about your saved prices — the assistant looks them up for you.</p></div>
      <button class="btn" id="clearChat">${icon.trash} New chat</button>
    </div>
    <div id="aiStatus"></div>
    <div class="card chat-card">
      <div id="chatLog" class="chat-log"></div>
      <div id="chatSuggest" class="chips" style="margin:12px 0"></div>
      <form id="chatForm" class="chat-input">
        <input id="chatBox" placeholder="e.g. Cheapest supplier for 12mm rebar?" autocomplete="off" required>
        <button class="btn btn-primary" id="sendBtn">${icon.sparkle} Ask</button>
        <button type="button" class="btn hidden" id="stopBtn">Stop</button>
      </form>
    </div>`;

  const log = view.querySelector('#chatLog');
  const box = view.querySelector('#chatBox');
  const status = view.querySelector('#aiStatus');
  let busy = false, ctl = null;

  const sample = await getSample();
  const engine = sample ? 'claude' : db.getApiKey() ? 'key' : null;
  if (!engine) {
    status.innerHTML = `<div class="notice" style="margin-bottom:14px">${icon.info}<div>The assistant needs AI. Open this app inside <b>claude.ai</b> (it then uses your Claude account), or add an Anthropic API key in <a href="#/settings">Settings</a>.</div></div>`;
  } else if (!st.prices.length) {
    status.innerHTML = `<div class="notice info" style="margin-bottom:14px">${icon.info}<div>You have no saved prices yet. <a href="#/add">Add an invoice or quotation</a> first, then ask questions about it.</div></div>`;
  }

  function draw() {
    log.innerHTML = chat.turns.length ? chat.turns.map(t => t.role === 'user'
      ? `<div class="msg msg-user">${esc(t.content)}</div>`
      : `<div class="msg msg-ai">${t.pending ? `<span class="muted">${esc(t.pending)}</span>` : md(t.content)}</div>`).join('')
      : `<div class="empty" style="padding:18px">${icon.sparkle}<h3>Your price assistant</h3><p>Ask about prices, suppliers, trends — in any language.</p></div>`;
    view.querySelector('#chatSuggest').innerHTML = chat.turns.length ? '' :
      SUGGESTIONS.map(q => `<button type="button" class="chip chip-filter" data-q="${esc(q)}">${esc(q)}</button>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  draw();

  async function ask(q) {
    if (busy || !q.trim()) return;
    if (!engine) { toast('Open in claude.ai or add an API key in Settings to use the assistant.', true); return; }
    busy = true;
    view.querySelector('#sendBtn').disabled = true;
    view.querySelector('#stopBtn').classList.remove('hidden');
    chat.turns.push({ role: 'user', content: q.trim() });
    const reply = { role: 'assistant', content: '', pending: 'Thinking…' };
    chat.turns.push(reply);
    draw();
    ctl = new AbortController();
    const history = chat.turns.filter(t => t !== reply && !t.failed).slice(-12)
      .map(t => ({ role: t.role, content: t.content }));
    while (history.length && history[0].role !== 'user') history.shift();
    const opts = {
      signal: ctl.signal,
      onText: ({ text }) => { reply.pending = ''; reply.content = text; draw(); },
      onTool: name => { if (!reply.content) { reply.pending = { search_products: 'Searching your prices…', get_price_history: 'Reading price history…', list_suppliers: 'Checking suppliers…', get_supplier_prices: 'Reading supplier prices…' }[name] || 'Looking things up…'; draw(); } },
    };
    try {
      const text = engine === 'claude' ? await askWithSample(sample, history, opts) : await askWithApiKey(history, opts);
      reply.content = text; reply.pending = '';
    } catch (e) {
      const code = e?.code || (ctl?.signal.aborted ? 'cancelled' : undefined);
      if (code === 'not_granted' || code === 'sampling_disabled') markSampleBlocked();
      reply.failed = true;
      reply.pending = '';
      reply.content = (e?.text ? e.text + '\n\n' : '') + ({
        cancelled: '(stopped)',
        not_granted: 'Claude was not allowed for this page. You can allow it from the page\'s Permissions menu.',
        rate_limited: 'Too many questions right now, or your usage limit was reached. Please try again later.',
        refused: 'Sorry, I can\'t help with that question.',
        session_expired: 'Please sign in to claude.ai again.',
      }[code] || (e?.status === 401 ? 'Your API key was not accepted. Check it in Settings.' : 'Something went wrong. Please try again.'));
    } finally {
      busy = false; ctl = null;
      view.querySelector('#sendBtn').disabled = false;
      view.querySelector('#stopBtn').classList.add('hidden');
      draw();
    }
  }

  view.querySelector('#chatForm').addEventListener('submit', e => { e.preventDefault(); const q = box.value; box.value = ''; ask(q); });
  view.querySelector('#stopBtn').addEventListener('click', () => ctl?.abort());
  view.querySelector('#chatSuggest').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });
  view.querySelector('#clearChat').addEventListener('click', () => { ctl?.abort(); chat.turns = []; draw(); });
}
