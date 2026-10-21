// Fuzzy name matching so "OPC Cement 50kg" and "Cement OPC - 50 KG bag"
// are treated as the same product, but "Rebar 12mm" and "Rebar 16mm" are not.

const STOP = new Set(['the', 'and', 'of', 'for', 'with', 'a', 'an', '-', 'pcs', 'pc', 'nos', 'no', 'each', 'ea']);

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/(\d)\s+(mm|cm|m|kg|g|ltr|l|ml|inch|in|ft|mtr|sqm|w|v|a)\b/g, '$1$2') // "12 mm" -> "12mm"
    .replace(/["'`’]/g, '')
    .replace(/[^a-z0-9.\/x]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s) {
  return normalize(s).split(' ').filter(t => t && !STOP.has(t));
}

function bigrams(s) {
  const t = normalize(s).replace(/ /g, '');
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, total = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  for (const [g, v] of A) inter += Math.min(v, B.get(g) || 0);
  return total ? (2 * inter) / total : 0;
}

/** 0..1 similarity between two product names. */
export function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size || 1;
  const jac = inter / union;
  const containment = Math.min(ta.size, tb.size) ? inter / Math.min(ta.size, tb.size) : 0;
  let score = 0.4 * dice(a, b) + 0.3 * jac + 0.3 * containment;

  // Sizes/specs must agree: 12mm vs 16mm are different products.
  const numsA = [...ta].filter(t => /\d/.test(t)), numsB = [...tb].filter(t => /\d/.test(t));
  if (numsA.length && numsB.length) {
    const same = numsA.filter(t => tb.has(t)).length;
    if (same === 0) score *= 0.55;
    else if (same < Math.max(numsA.length, numsB.length)) score *= 0.85;
  }
  return Math.max(0, Math.min(1, score));
}
