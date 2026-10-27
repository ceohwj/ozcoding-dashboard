// 의존성 없는 SVG 차트 도우미. 색은 CSS 변수(var(--accent) 등)에서 가져온다.
const NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

export const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

// 0..max 를 덮는 보기 좋은 눈금
export function niceTicks(max, count = 4) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(v);
  return ticks;
}

function canvas(el, height) {
  el.replaceChildren();
  const w = Math.max(240, el.clientWidth);
  const root = svg('svg', { width: '100%', height, viewBox: `0 0 ${w} ${height}` });
  el.appendChild(root);
  return { root, w };
}

// 월별 막대/선 차트. rows: [{label, value, tip:[제목, 내용]}]
export function timeChart(el, rows, { kind, fmt, height = 230 }) {
  const m = { t: 8, r: 8, b: 26, l: 48 };
  const { root, w } = canvas(el, height);
  const ticks = niceTicks(Math.max(...rows.map((r) => r.value)) * 1.05);
  const y = linear(0, ticks[ticks.length - 1], height - m.b, m.t);
  const step = (w - m.l - m.r) / rows.length;
  const cx = (i) => m.l + step * i + step / 2;

  for (const t of ticks) {
    root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: y(t), y2: y(t), stroke: 'var(--grid)' }));
    root.appendChild(svg('text', { x: m.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t)));
  }
  root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: y(0), y2: y(0), stroke: 'var(--muted-bar)' }));
  const every = w < 420 ? 6 : 3;
  rows.forEach((r, i) => { if (i % every === 0) root.appendChild(svg('text', { x: cx(i), y: height - 8, 'text-anchor': 'middle' }, r.label)); });

  if (kind === 'bar') {
    const bw = Math.max(2, step * 0.72);
    rows.forEach((r, i) => root.appendChild(svg('rect', { x: cx(i) - bw / 2, y: y(r.value), width: bw, height: y(0) - y(r.value), rx: 3, fill: 'var(--accent)', 'data-tip': r.tip.join('|') })));
  } else {
    const d = rows.map((r, i) => `${i ? 'L' : 'M'}${cx(i)},${y(r.value)}`).join('');
    root.appendChild(svg('path', { d, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    rows.forEach((r, i) => {
      root.appendChild(svg('circle', { cx: cx(i), cy: y(r.value), r: 3, fill: 'var(--accent)' }));
      root.appendChild(svg('circle', { cx: cx(i), cy: y(r.value), r: 9, fill: 'transparent', 'data-tip': r.tip.join('|') }));
    });
  }
}

// 가로 막대. rows: [{label, value, valueLabel, muted?, tip}]
export function hbarChart(el, rows, { fmtAxis }) {
  const rh = 32, height = rows.length * rh + 26, m = { l: 62, r: 72 };
  const { root, w } = canvas(el, height);
  const max = Math.max(...rows.map((r) => r.value)) * 1.05;
  const x = linear(0, max, m.l, w - m.r);
  const bh = rh * 0.68;
  rows.forEach((r, i) => {
    const y = 4 + i * rh + (rh - bh) / 2 - 2;
    root.appendChild(svg('text', { x: m.l - 8, y: y + bh / 2 + 4, 'text-anchor': 'end' }, r.label));
    root.appendChild(svg('rect', { x: m.l, y, width: x(r.value) - m.l, height: bh, rx: 4, fill: r.muted ? 'var(--muted-bar)' : 'var(--accent)', 'data-tip': r.tip.join('|') }));
    root.appendChild(svg('text', { x: x(r.value) + 6, y: y + bh / 2 + 4 }, r.valueLabel));
  });
  const base = height - 20;
  root.appendChild(svg('line', { x1: m.l, x2: w - m.r, y1: base, y2: base, stroke: 'var(--muted-bar)' }));
  niceTicks(max, 4).filter((t) => t <= max).forEach((t) => root.appendChild(svg('text', { x: x(t), y: height - 6, 'text-anchor': 'middle' }, fmtAxis(t))));
}
