// data/raw/*.csv → data/processed/*.json (대시보드가 읽는 집계 결과)
// 사용: node scripts/aggregate.mjs
// 범위: project.config.json 의 analysis (주상병 접두어, 서식구분, 기관 최소 청구 건수)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'project.config.json'), 'utf8'));
const { sickPrefix, formCode, minClaims } = cfg.analysis;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}
const read = async (name) => parseCsv(await readFile(join(root, cfg.rawDir, `${name}.csv`), 'utf8'));

const [claim, patient, institution, codeTable, sido] = await Promise.all(
  ['claim', 'patient', 'institution', 'code_table', 'sido_code'].map(read),
);
const pat = Object.fromEntries(patient.map((p) => [p.jid, p]));
const inst = Object.fromEntries(institution.map((i) => [i.yid, i]));
const tierName = Object.fromEntries(codeTable.filter((c) => c.code_type === '종별코드').map((c) => [c.code, c.code_nm]));
const regionName = Object.fromEntries(sido.map((s) => [s.region_cd, s.region_nm]));

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const groupBy = (arr, key) => { const m = new Map(); for (const r of arr) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };

const outpatient = claim.filter((c) => c.fom_tp_cd === formCode);
const resp = outpatient.filter((c) => c.main_sick.startsWith(sickPrefix)).map((c) => ({
  yid: c.yid,
  amt: Number(c.rvd_rpe_tamt_amt),
  month: c.recu_fr_dd.slice(0, 7),
  quintile: pat[c.jid]?.prem_quintile || '미상',
  tier: tierName[inst[c.yid]?.cl_cd] || inst[c.yid]?.cl_cd || '미상',
  region: regionName[inst[c.yid]?.region_cd] || '미상',
}));
const amts = (rows) => rows.map((r) => r.amt);
const dates = claim.map((c) => c.recu_fr_dd).sort();

const byInst = [...groupBy(resp, (r) => r.yid)].map(([yid, rows]) => ({
  inst_id: yid, n: rows.length, median: Math.round(median(amts(rows))), mean: Math.round(mean(amts(rows))), tier: rows[0].tier, region: rows[0].region,
}));
const qualified = byInst.filter((i) => i.n >= minClaims).sort((a, b) => b.median - a.median);
const medians = qualified.map((i) => i.median);

const out = {
  kpi: [{
    outpatient: outpatient.length,
    resp: resp.length,
    share: Number((resp.length / outpatient.length).toFixed(4)),
    mean: Math.round(mean(amts(resp))),
    median: median(amts(resp)),
    institutions: byInst.length,
    qualified: qualified.length,
    min_n: minClaims,
    spread: qualified.length ? Number((pct(medians, 0.9) / pct(medians, 0.1)).toFixed(2)) : null,
  }],
  monthly: [...groupBy(resp, (r) => r.month)].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => ({ month, n: rows.length, mean: Math.round(mean(amts(rows))) })),
  quintile: ['1', '2', '3', '4', '5', '미상'].filter((q) => resp.some((r) => r.quintile === q)).map((q) => {
    const rows = resp.filter((r) => r.quintile === q);
    return { quintile: q, n: rows.length, mean: Math.round(mean(amts(rows))), median: median(amts(rows)) };
  }),
  institutions: qualified,
  heat: [...groupBy(resp.filter((r) => r.quintile !== '미상'), (r) => `${r.tier}|${r.quintile}`)].map(([k, rows]) => {
    const [tier, quintile] = k.split('|');
    return { tier, quintile, n: rows.length, mean: Math.round(mean(amts(rows))) };
  }),
  meta: [{
    generatedAt: new Date().toISOString(),
    from: dates[0],
    to: dates[dates.length - 1],
    sickPrefix, formCode, minClaims,
    sheetId: cfg.sheetId,
  }],
};

const outDir = join(root, cfg.processedDir);
await mkdir(outDir, { recursive: true });
for (const [name, data] of Object.entries(out)) {
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(data));
  console.log(`ok   ${name}.json (${data.length} rows)`);
}
