// Local data store. Everything lives in this browser's localStorage.
// Uploaded PDF/JPG files are never stored — only the extracted details.

import { normalize, similarity } from './match.js';

const KEY = 'pricebook.v1';
const KEY_API = 'pricebook.apiKey';

export const DEFAULT_CATEGORIES = [
  'Cement & Concrete',
  'Steel & Metal',
  'Blocks & Bricks',
  'Sand & Aggregates',
  'Wood & Timber',
  'Electrical',
  'Plumbing & Pipes',
  'Sanitary Ware',
  'Paint & Coatings',
  'Tiles & Flooring',
  'Glass & Aluminium',
  'Insulation & Waterproofing',
  'Hardware & Fasteners',
  'Tools & Equipment',
  'Safety & PPE',
  'Chemicals & Adhesives',
  'Other',
];

function guessCurrency() {
  const map = { AE: 'AED', SA: 'SAR', QA: 'QAR', OM: 'OMR', KW: 'KWD', BH: 'BHD', IN: 'INR', PK: 'PKR', GB: 'GBP', US: 'USD', EG: 'EGP' };
  try {
    const region = (navigator.language || '').split('-')[1];
    if (region && map[region.toUpperCase()]) return map[region.toUpperCase()];
  } catch { /* ignore */ }
  return 'AED';
}

function emptyState() {
  return {
    version: 1,
    products: [],   // {id, name, category, unit, createdAt}
    suppliers: [],  // {id, name, phone, email, address, taxId, contact, createdAt}
    prices: [],     // {id, productId, supplierId, price, currency, unit, qty, date, docType, docRef, notes, createdAt}
    categories: [...DEFAULT_CATEGORIES],
    settings: { currency: guessCurrency(), model: 'claude-opus-5-5', theme: 'auto' },
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = emptyState();
      return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
    }
  } catch (e) { console.warn('Could not read saved data', e); }
  return emptyState();
}

// Called after every save — the cloud sync (Claude account) hooks in here.
let afterSave = null;
export function setAfterSave(fn) { afterSave = fn; }

function writeLocal() {
  // The local copy is only a cache; the Claude-account copy is the real one when available.
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Local copy not saved', e); }
}

export function save() {
  state.updatedAt = Date.now();
  writeLocal();
  afterSave && afterSave();
}

export const hasData = s => !!s && ((s.prices && s.prices.length) || (s.products && s.products.length) || (s.suppliers && s.suppliers.length));

function normalizeState(s) {
  const base = emptyState();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
}

/** Replace everything with data loaded from the Claude account (does not trigger a cloud save). */
export function replaceState(s) {
  state = normalizeState(s);
  writeLocal();
}

/** Combine two copies: every product, supplier and price from both (same id: `b` wins). */
export function mergeStates(a, b) {
  const byId = (x, y) => { const m = new Map(); (x || []).forEach(r => m.set(r.id, r)); (y || []).forEach(r => m.set(r.id, r)); return [...m.values()]; };
  const cats = [...(a.categories || [])];
  (b.categories || []).forEach(c => { if (!cats.includes(c)) cats.splice(Math.max(0, cats.indexOf('Other')), 0, c); });
  return normalizeState({
    ...a,
    products: byId(a.products, b.products),
    suppliers: byId(a.suppliers, b.suppliers),
    prices: byId(a.prices, b.prices),
    categories: cats,
    settings: { ...(a.settings || {}), ...(b.settings || {}) },
    updatedAt: Date.now(),
  });
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const getState = () => state;

// ---------- API key ----------
export function getApiKey() { try { return localStorage.getItem(KEY_API) || ''; } catch { return ''; } }
export function setApiKey(k) { try { k ? localStorage.setItem(KEY_API, k.trim()) : localStorage.removeItem(KEY_API); } catch { /* ignore */ } }

// ---------- Settings & categories ----------
export function updateSettings(patch) { state.settings = { ...state.settings, ...patch }; save(); }
export function addCategory(name) {
  name = name.trim();
  if (!name || state.categories.some(c => c.toLowerCase() === name.toLowerCase())) return false;
  const i = state.categories.indexOf('Other');
  i >= 0 ? state.categories.splice(i, 0, name) : state.categories.push(name);
  save(); return true;
}
export function renameCategory(oldName, newName) {
  newName = newName.trim();
  if (!newName) return;
  state.categories = state.categories.map(c => (c === oldName ? newName : c));
  state.products.forEach(p => { if (p.category === oldName) p.category = newName; });
  save();
}
export function deleteCategory(name) {
  if (name === 'Other') return;
  state.categories = state.categories.filter(c => c !== name);
  if (!state.categories.includes('Other')) state.categories.push('Other');
  state.products.forEach(p => { if (p.category === name) p.category = 'Other'; });
  save();
}

// ---------- Suppliers ----------
export const getSupplier = id => state.suppliers.find(s => s.id === id);

export function findSupplier(name) {
  const n = normalize(name);
  if (!n) return null;
  let best = null, bestScore = 0;
  for (const s of state.suppliers) {
    const sc = normalize(s.name) === n ? 1 : similarity(name, s.name);
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return bestScore >= 0.85 ? best : null;
}

export function upsertSupplier(info) {
  const name = (info.name || '').trim() || 'Unknown supplier';
  let s = findSupplier(name);
  if (!s) {
    s = { id: uid(), name, phone: '', email: '', address: '', taxId: '', contact: '', createdAt: Date.now() };
    state.suppliers.push(s);
  }
  // Fill in any details we didn't have before (never wipe existing ones)
  for (const k of ['phone', 'email', 'address', 'taxId', 'contact']) {
    if (info[k] && !s[k]) s[k] = String(info[k]).trim();
  }
  return s;
}

export function updateSupplier(id, patch) {
  const s = getSupplier(id); if (!s) return;
  Object.assign(s, patch); save();
}

export function deleteSupplier(id) {
  state.suppliers = state.suppliers.filter(s => s.id !== id);
  state.prices = state.prices.filter(p => p.supplierId !== id);
  cleanupOrphans(); save();
}

// ---------- Products ----------
export const getProduct = id => state.products.find(p => p.id === id);

/** Ranked list of existing products that look like `name`. */
export function matchProducts(name, limit = 5) {
  if (!normalize(name)) return [];
  return state.products
    .map(p => ({ product: p, score: similarity(name, p.name) }))
    .filter(m => m.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function bestMatch(name, threshold = 0.72) {
  const m = matchProducts(name, 1)[0];
  return m && m.score >= threshold ? m : null;
}

export function createProduct({ name, category, unit }) {
  const p = { id: uid(), name: name.trim(), category: category || 'Other', unit: (unit || '').trim(), createdAt: Date.now() };
  state.products.push(p);
  return p;
}

export function updateProduct(id, patch) {
  const p = getProduct(id); if (!p) return;
  Object.assign(p, patch); save();
}

export function mergeProduct(fromId, intoId) {
  if (fromId === intoId) return;
  state.prices.forEach(r => { if (r.productId === fromId) r.productId = intoId; });
  state.products = state.products.filter(p => p.id !== fromId);
  save();
}

export function deleteProduct(id) {
  state.products = state.products.filter(p => p.id !== id);
  state.prices = state.prices.filter(r => r.productId !== id);
  save();
}

// ---------- Prices ----------
/**
 * Save a document's worth of prices.
 * header: {supplier:{name,phone,...}, date, docType, docRef, currency}
 * items:  [{productId?|null, product, category, unit, qty, price}]
 * Returns {added, skipped}.
 */
export function savePriceDocument(header, items) {
  const supplier = upsertSupplier(header.supplier || {});
  let added = 0, skipped = 0;
  for (const it of items) {
    const price = Number(it.price);
    if (!it.product || !isFinite(price) || price <= 0) { skipped++; continue; }
    let product = it.productId ? getProduct(it.productId) : null;
    if (!product) product = createProduct({ name: it.product, category: it.category, unit: it.unit });
    else if (it.category && product.category === 'Other' && it.category !== 'Other') product.category = it.category;
    if (!product.unit && it.unit) product.unit = it.unit;

    const date = header.date || today();
    const dup = state.prices.find(r => r.productId === product.id && r.supplierId === supplier.id && r.date === date && Math.abs(r.price - price) < 1e-9);
    if (dup) { skipped++; continue; }
    state.prices.push({
      id: uid(), productId: product.id, supplierId: supplier.id, price,
      currency: header.currency || state.settings.currency, unit: it.unit || product.unit || '',
      qty: it.qty === '' || it.qty == null ? null : Number(it.qty),
      date, docType: header.docType || 'manual', docRef: header.docRef || '', notes: it.notes || '',
      createdAt: Date.now(),
    });
    added++;
  }
  save();
  return { added, skipped, supplier };
}

export function deletePrice(id) {
  state.prices = state.prices.filter(r => r.id !== id);
  cleanupOrphans(); save();
}

function cleanupOrphans() {
  const used = new Set(state.prices.map(r => r.productId));
  state.products = state.products.filter(p => used.has(p.id));
}

export const pricesFor = productId =>
  state.prices.filter(r => r.productId === productId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

/** Summary numbers for a product (optionally only one currency). */
export function productSummary(productId, currency) {
  let rows = pricesFor(productId);
  if (currency) rows = rows.filter(r => r.currency === currency);
  if (!rows.length) return null;
  const latest = rows[0];
  // Latest price from each supplier
  const perSupplier = new Map();
  for (const r of rows) if (!perSupplier.has(r.supplierId)) perSupplier.set(r.supplierId, r);
  const latestPerSupplier = [...perSupplier.values()];
  const best = latestPerSupplier.reduce((a, b) => (b.price < a.price ? b : a));
  const lowest = rows.reduce((a, b) => (b.price < a.price ? b : a));
  const highest = rows.reduce((a, b) => (b.price > a.price ? b : a));
  const avg = rows.reduce((s, r) => s + r.price, 0) / rows.length;
  const prev = rows.find(r => r.id !== latest.id && r.supplierId === latest.supplierId) || rows[1];
  const change = prev ? (latest.price - prev.price) / prev.price : null;
  return { rows, latest, best, lowest, highest, avg, latestPerSupplier, count: rows.length, supplierCount: perSupplier.size, change, prev };
}

// ---------- Backup ----------
export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.prices) || !Array.isArray(s.products)) throw new Error('This is not a Price Book backup file.');
  state = normalizeState(s);
  save();
}
export function clearAll() { const settings = state.settings; state = emptyState(); state.settings = settings; save(); }

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
