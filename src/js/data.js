// Supabase kr_claims → 화면용 집계 (scripts/aggregate.mjs 와 같은 계산, 같은 모양)
// 접속 정보와 분석 범위는 data/processed/config.json (scripts/load-supabase.mjs 가 생성)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const PAGE = 1000; // PostgREST 기본 최대 행 수

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const groupBy = (arr, key) => { const m = new Map(); for (const r of arr) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
const amts = (rows) => rows.map((r) => r.amt);

const must = ({ data, error, count }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return { data, count };
};

async function fetchAll(sb, table, cols, filter) {
  const { count } = must(await filter(sb.from(table).select('mid', { count: 'exact', head: true })), '건수 조회');
  const pages = await Promise.all(Array.from({ length: Math.ceil(count / PAGE) }, (_, i) =>
    filter(sb.from(table).select(cols)).order('mid').range(i * PAGE, (i + 1) * PAGE - 1)));
  return pages.flatMap((p) => must(p, '행 조회').data);
}

export async function load() {
  const res = await fetch('data/processed/config.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`config.json (${res.status})`);
  const { supabase: { url, anonKey, table }, analysis: { sickPrefix, formCode, minClaims }, sheetId } = await res.json();
  const sb = createClient(url, anonKey, { auth: { persistSession: false } });

  const outpatientOnly = (q) => q.eq('fom_tp_cd', formCode);
  const respOnly = (q) => q.eq('fom_tp_cd', formCode).like('main_sick', `${sickPrefix}%`);
  const first = (col, asc) => sb.from(table).select(col).order(col, { ascending: asc }).limit(1);

  const [resp, outCount, lo, hi, last] = await Promise.all([
    fetchAll(sb, table, 'mid,yid,recu_fr_dd,amt,quintile,tier,region', respOnly),
    outpatientOnly(sb.from(table).select('mid', { count: 'exact', head: true })),
    first('recu_fr_dd', true), first('recu_fr_dd', false), first('loaded_at', false),
  ]);
  const outpatient = must(outCount, '외래 건수').count;
  for (const r of resp) r.month = r.recu_fr_dd.slice(0, 7);
  if (!resp.length) throw new Error(`${table} 에 호흡기 외래 행이 없다`);

  const byInst = [...groupBy(resp, (r) => r.yid)].map(([yid, rows]) => ({
    inst_id: yid, n: rows.length, median: Math.round(median(amts(rows))), mean: Math.round(mean(amts(rows))), tier: rows[0].tier, region: rows[0].region,
  }));
  const qualified = byInst.filter((i) => i.n >= minClaims).sort((a, b) => b.median - a.median);
  const medians = qualified.map((i) => i.median);

  return {
    kpi: [{
      outpatient,
      resp: resp.length,
      share: Number((resp.length / outpatient).toFixed(4)),
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
      generatedAt: must(last, '적재 시각').data[0].loaded_at,
      from: must(lo, '시작일').data[0].recu_fr_dd,
      to: must(hi, '종료일').data[0].recu_fr_dd,
      sickPrefix, formCode, minClaims, sheetId,
    }],
  };
}
