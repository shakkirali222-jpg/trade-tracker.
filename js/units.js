// Unit conversion so "AED 2.80 / kg" and "AED 2,750 / ton" can be compared fairly.

const GROUPS = {
  mass: { kg: 1, kgs: 1, kilo: 1, kilogram: 1, g: 0.001, gm: 0.001, gram: 0.001, ton: 1000, tons: 1000, tonne: 1000, mt: 1000, t: 1000 },
  length: { m: 1, mtr: 1, mtrs: 1, meter: 1, metre: 1, rm: 1, lm: 1, cm: 0.01, mm: 0.001, ft: 0.3048, feet: 0.3048, foot: 0.3048, inch: 0.0254, in: 0.0254, km: 1000 },
  volume: { l: 1, ltr: 1, ltrs: 1, litre: 1, liter: 1, lit: 1, ml: 0.001, gal: 3.785, gallon: 3.785, cum: 1000, m3: 1000, cbm: 1000 },
  area: { sqm: 1, m2: 1, 'sq.m': 1, sqmtr: 1, sqft: 0.092903, 'sq.ft': 0.092903, ft2: 0.092903 },
  count: { pcs: 1, pc: 1, piece: 1, pieces: 1, nos: 1, no: 1, each: 1, ea: 1, unit: 1, units: 1, dozen: 12, doz: 12 },
};

const PLURAL_OK = new Set(['pcs', 'nos', 'kgs', 'ltrs', 'mtrs', 'tons', 'units', 'pieces']);
export function cleanUnit(u) {
  let c = String(u || '').toLowerCase().trim().replace(/[()]/g, '').replace(/\.$/, '').replace(/\s+/g, '');
  // "bags" = "bag", "rolls" = "roll", "boxes" = "box"
  if (!PLURAL_OK.has(c) && /[a-z]{2,}s$/.test(c)) c = c.endsWith('xes') ? c.slice(0, -2) : c.slice(0, -1);
  return c;
}

function lookup(u) {
  const c = cleanUnit(u);
  for (const [group, map] of Object.entries(GROUPS)) if (c in map) return { group, factor: map[c] };
  return null;
}

/**
 * How many `toUnit` are in one `fromUnit` (e.g. ton -> kg = 1000), or null if they can't be converted.
 * `product.pack` = {qty, unit} describes the product's own pack, e.g. 1 bag = 50 kg.
 */
export function unitRatio(fromUnit, toUnit, product) {
  const a = cleanUnit(fromUnit), b = cleanUnit(toUnit);
  if (!a || !b || a === b) return 1;
  const A = lookup(a), B = lookup(b);
  if (A && B && A.group === B.group) return A.factor / B.factor;
  // Use the product's pack size: 1 <product unit> = pack.qty <pack.unit>
  const pack = product?.pack;
  const pu = cleanUnit(product?.unit);
  if (pack && pack.qty > 0 && pack.unit) {
    const P = lookup(pack.unit);
    if (a === pu && P) { const Bq = lookup(b); if (Bq && Bq.group === P.group) return pack.qty * P.factor / Bq.factor; }
    if (b === pu && P) { const Aq = lookup(a); if (Aq && Aq.group === P.group) return Aq.factor / (pack.qty * P.factor); }
  }
  return null;
}

/** Price per `toUnit`, given a price per `fromUnit`. Null if not convertible. */
export function convertPrice(price, fromUnit, toUnit, product) {
  const r = unitRatio(fromUnit, toUnit, product);
  return r == null ? null : price / r;
}

export const sameUnit = (a, b) => !cleanUnit(a) || !cleanUnit(b) || cleanUnit(a) === cleanUnit(b) || unitRatio(a, b) === 1;
