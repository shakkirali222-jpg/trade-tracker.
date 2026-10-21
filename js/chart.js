// Small dependency-free SVG line chart: price over time, one line per supplier.

const SERIES = 8;

export function priceChart(container, series, fmt) {
  // series: [{name, points:[{date:'YYYY-MM-DD', price}]}]
  container.innerHTML = '';
  const all = series.flatMap(s => s.points);
  if (all.length < 2) {
    container.innerHTML = '<p class="muted small">Add at least two prices to see a trend chart.</p>';
    return;
  }
  const W = 720, H = 260, pad = { l: 64, r: 16, t: 14, b: 30 };
  const t = d => new Date(d + 'T00:00:00').getTime();
  let x0 = Math.min(...all.map(p => t(p.date))), x1 = Math.max(...all.map(p => t(p.date)));
  if (x0 === x1) { x0 -= 864e5 * 15; x1 += 864e5 * 15; }
  let y0 = Math.min(...all.map(p => p.price)), y1 = Math.max(...all.map(p => p.price));
  const span = y1 - y0 || y1 * 0.2 || 1;
  y0 = Math.max(0, y0 - span * 0.15); y1 = y1 + span * 0.15;
  const X = v => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const Y = v => H - pad.b - ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);

  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Price history chart' });

  // Grid + y labels
  const step = (y1 - y0) / 4;
  const decimals = step < 0.1 ? 3 : step < 1 ? 2 : step < 10 ? 1 : 0;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + step * i, y = Y(v);
    el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid-line' }, svg);
    el('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis-text' }, svg).textContent =
      v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  // x labels
  const ticks = Math.min(5, new Set(all.map(p => p.date)).size);
  for (let i = 0; i < ticks; i++) {
    const v = ticks === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (ticks - 1);
    const d = new Date(v);
    el('text', { x: X(v), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === ticks - 1 ? 'end' : 'middle', class: 'axis-text' }, svg)
      .textContent = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  const shown = series.slice(0, SERIES);
  shown.forEach((s, i) => {
    const color = `var(--series-${i + 1})`;
    const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length > 1) el('path', { d: pts.map((p, j) => `${j ? 'L' : 'M'}${X(t(p.date)).toFixed(1)},${Y(p.price).toFixed(1)}`).join(''), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    pts.forEach(p => el('circle', { cx: X(t(p.date)), cy: Y(p.price), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg));
  });

  const cross = el('line', { y1: pad.t, y2: H - pad.b, class: 'crosshair', visibility: 'hidden' }, svg);
  container.appendChild(svg);

  const tip = document.createElement('div');
  tip.className = 'chart-tip hidden';
  container.appendChild(tip);

  // Hover: snap to nearest date that has a price
  const dates = [...new Set(all.map(p => p.date))].sort();
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let best = dates[0], bd = Infinity;
    for (const d of dates) { const dd = Math.abs(X(t(d)) - mx); if (dd < bd) { bd = dd; best = d; } }
    const cx = X(t(best));
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const rows = shown.map((s, i) => ({ s, i, p: s.points.find(p => p.date === best) })).filter(o => o.p);
    tip.innerHTML = `<div class="small muted" style="margin-bottom:4px">${new Date(best + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>` +
      rows.map(o => `<div class="row"><span style="display:flex;gap:6px;align-items:center"><i class="swatch" style="background:var(--series-${o.i + 1})"></i>${escape(o.s.name)}</span><b class="num">${fmt(o.p.price)}</b></div>`).join('');
    tip.classList.remove('hidden');
    const px = (cx / W) * r.width;
    tip.style.left = Math.min(Math.max(0, px + 12), r.width - tip.offsetWidth) + 'px';
    tip.style.top = '8px';
  });
  svg.addEventListener('pointerleave', () => { tip.classList.add('hidden'); cross.setAttribute('visibility', 'hidden'); });

  if (shown.length >= 1) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = shown.map((s, i) => `<span><i class="swatch" style="background:var(--series-${i + 1})"></i>${escape(s.name)}</span>`).join('') +
      (series.length > SERIES ? `<span class="muted">+${series.length - SERIES} more suppliers (see table)</span>` : '');
    container.appendChild(lg);
  }
}

function escape(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
