import { timeChart, hbarChart } from './charts.js';

const won = (v) => Number(v).toLocaleString('ko-KR');
const man = (v) => (v / 10000).toFixed(1);
const manWon = (v) => `${man(v)}만 원`;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const NAMES = ['kpi', 'monthly', 'quintile', 'institutions', 'heat', 'meta'];
const load = async () => Object.fromEntries(await Promise.all(NAMES.map(async (n) => {
  const res = await fetch(`../data/processed/${n}.json`);
  if (!res.ok) throw new Error(`${n}.json (${res.status})`);
  return [n, await res.json()];
})));

// ---- 종별 가중 평균, 종별 순서, 격차 ----
function tierStats(heat) {
  const m = new Map();
  for (const r of heat) {
    const t = m.get(r.tier) ?? { tier: r.tier, n: 0, sum: 0 };
    t.n += r.n; t.sum += r.n * r.mean; m.set(r.tier, t);
  }
  return [...m.values()].map((t) => ({ tier: t.tier, n: t.n, mean: t.sum / t.n })).sort((a, b) => b.mean - a.mean);
}

function renderHeader({ kpi: [k], heat, meta: [m] }) {
  const tiers = tierStats(heat);
  const hi = tiers[0], lo = tiers[tiers.length - 1];
  const base = tiers.reduce((a, b) => (b.n > a.n ? b : a)); // 청구가 가장 많은 종별
  const q = heat.filter((r) => r.tier === base.tier).map((r) => r.mean);
  const gap = q.length ? Math.max(...q) / Math.min(...q) - 1 : null;
  const take = $('take');
  take.replaceChildren(
    `호흡기 외래 진료는 기관 종별로 건당 진료비가 크게 갈린다. ${hi.tier}은 평균 `, el('b', '', manWon(hi.mean)),
    `으로 ${lo.tier} `, el('b', '', manWon(lo.mean)), '의 ', el('b', '', (hi.mean / lo.mean).toFixed(1)), '배다. ',
    ...(gap == null ? [] : [`같은 종별(${base.tier}) 안에서 보험료 분위 간 평균 차이는 최대 `, el('b', '', `${Math.round(gap * 100)}%`), ' 수준이다.']),
  );
  const sub = $('sub');
  sub.textContent = `호흡기(${m.sickPrefix}00~${m.sickPrefix}99) 외래(서식 ${m.formCode}) 명세서, ${m.from} ~ ${m.to} · 건당 총진료비 기준 · 집계 ${m.generatedAt.slice(0, 10)}`;
  document.title = '호흡기 진료비 격차 모니터';

  const cards = [
    ['호흡기 외래 명세서', won(k.resp), `전체 외래 대비 ${(k.share * 100).toFixed(1)}%`],
    ['건당 평균 진료비', `${won(k.mean)}원`, `중앙값 ${won(k.median)}원`],
    ['청구 기관', `${won(k.institutions)}곳`, '호흡기 청구가 1건 이상인 곳'],
    ['비교 가능한 기관', `${won(k.qualified)}곳`, `${won(k.min_n)}건 이상 청구한 곳만`],
  ];
  $('kpis').replaceChildren(...cards.map(([lab, num, hint]) => {
    const c = el('div', 'card kpi');
    c.append(el('div', 'lab', lab), el('div', 'num', num), el('div', 'hint', hint));
    return c;
  }));
  $('inst-note').textContent = `호흡기 외래 ${won(k.min_n)}건 이상 청구한 기관만 표시. 기관 이름은 데이터에 없어 익명 ID로 보인다. 열 이름을 누르면 정렬된다.`;
  $('method').replaceChildren(
    el('b', '', '정의 '), `· 호흡기: 주상병(claim.main_sick)이 ${m.sickPrefix}로 시작. 외래: 서식구분 ${m.formCode}. 진료비: 명세서 1건의 총진료비(rvd_rpe_tamt_amt). 보험료 분위: 환자(patient.prem_quintile) 기준이며 결측은 '미상'으로 분리. `,
    el('b', '', '주의 '), '· 청구가 적은 기관은 평균이 흔들려 비교에서 뺐다. 입원은 규모가 달라 제외했다. 월 1회 시트를 다시 집계해 갱신한다.',
  );
}

function renderHeat({ heat }) {
  const box = $('heat');
  const tiers = tierStats(heat).map((t) => t.tier);
  const max = Math.max(...heat.map((r) => r.mean));
  box.replaceChildren(el('div', 'hd'), ...['1', '2', '3', '4', '5'].map((q) => el('div', 'hd', `${q}분위`)));
  for (const t of tiers) {
    box.append(el('div', 'rl', t));
    for (const q of ['1', '2', '3', '4', '5']) {
      const r = heat.find((x) => x.tier === t && x.quintile === q);
      const c = el('div', 'cell');
      if (r) {
        c.style.setProperty('--ho', String(0.12 + 0.78 * (r.mean / max)));
        c.dataset.tip = `${t} · ${q}분위|평균 ${won(r.mean)}원 · ${won(r.n)}건`;
        const s = el('span', '', man(r.mean));
        s.append(el('small', '', `${won(r.n)}건`));
        c.append(s);
      }
      box.append(c);
    }
  }
}

function renderCharts({ quintile, monthly }) {
  hbarChart($('q-chart'), quintile.map((r) => ({
    label: r.quintile === '미상' ? '미상' : `${r.quintile}분위`, value: r.mean, valueLabel: manWon(r.mean), muted: r.quintile === '미상',
    tip: [r.quintile === '미상' ? '분위 미상' : `${r.quintile}분위`, `평균 ${won(r.mean)}원 · ${won(r.n)}건`],
  })), { fmtAxis: (v) => `${v / 10000}만` });
  timeChart($('m-n'), monthly.map((r) => ({ label: r.month.slice(2), value: r.n, tip: [r.month, `${won(r.n)}건`] })), { kind: 'bar', fmt: won });
  timeChart($('m-mean'), monthly.map((r) => ({ label: r.month.slice(2), value: r.mean, tip: [r.month, `건당 평균 ${won(r.mean)}원`] })), { kind: 'line', fmt: (v) => `${v / 10000}만` });
}

// ---- 기관 표 (정렬) ----
let sortKey = 'median', sortDir = -1;
function renderTable(rows) {
  const numeric = sortKey === 'n' || sortKey === 'median';
  const sorted = rows.slice().sort((a, b) => (numeric ? a[sortKey] - b[sortKey] : String(a[sortKey]).localeCompare(String(b[sortKey]), 'ko')) * sortDir);
  const max = Math.max(...rows.map((r) => r.median));
  document.querySelector('#inst-table tbody').replaceChildren(...sorted.map((r) => {
    const tr = el('tr');
    tr.append(el('td', '', r.inst_id), el('td', '', r.tier), el('td', '', r.region), el('td', 'r', won(r.n)));
    const td = el('td', 'r', won(r.median));
    const bar = el('span', 'bar'); bar.style.width = `${Math.round((r.median / max) * 70)}px`;
    td.append(bar); tr.append(td);
    return tr;
  }));
  document.querySelectorAll('#inst-table th').forEach((th) => {
    if (th.dataset.k === sortKey) th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
  });
}

// ---- 툴팁 ----
const tip = $('tip'), app = $('app');
app.addEventListener('mousemove', (ev) => {
  const t = ev.target.closest('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  const [title, body] = t.getAttribute('data-tip').split('|');
  tip.hidden = false;
  tip.replaceChildren(el('i', '', title), el('div', '', body));
  const b = app.getBoundingClientRect();
  tip.style.left = `${Math.max(0, Math.min(ev.clientX - b.left + 14, b.width - tip.offsetWidth - 4))}px`;
  tip.style.top = `${Math.max(0, Math.min(ev.clientY - b.top + 14, b.height - tip.offsetHeight - 4))}px`;
});
app.addEventListener('mouseleave', () => { tip.hidden = true; });

try {
  const data = await load();
  renderHeader(data); renderHeat(data); renderCharts(data); renderTable(data.institutions);
  document.querySelector('#inst-table thead').addEventListener('click', (ev) => {
    const th = ev.target.closest('th'); if (!th) return;
    const numeric = th.dataset.k === 'n' || th.dataset.k === 'median';
    if (sortKey === th.dataset.k) sortDir = -sortDir; else { sortKey = th.dataset.k; sortDir = numeric ? -1 : 1; }
    renderTable(data.institutions);
  });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => renderCharts(data), 120); });
} catch (e) {
  const box = el('div', 'error-box');
  box.append(el('b', '', '데이터를 불러오지 못했다. '), `${e.message}. \`npm run update\`로 집계한 뒤 \`npm run serve\`로 열어야 한다.`);
  app.replaceChildren(box);
}
