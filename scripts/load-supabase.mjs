// data/raw/*.csv → Supabase kr_claims (명세서 1건 = 1행, 종별·권역·보험료 분위를 조인해 평면화)
// 사용: node scripts/load-supabase.mjs        (.env 의 SUPABASE_SERVICE_ROLE_KEY 필요)
// 함께: data/processed/config.json 에 화면이 쓸 공개 접속 정보와 분석 범위를 쓴다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, readEnv } from './lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'project.config.json'), 'utf8'));
const { url, anonKey, table } = cfg.supabase;
const env = { ...(await readEnv(join(root, '.env'))), ...process.env };
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY 가 없다 (.env 또는 환경변수).'); process.exit(1); }

const read = async (name) => parseCsv(await readFile(join(root, cfg.rawDir, `${name}.csv`), 'utf8'));
const [claim, patient, institution, codeTable, sido] = await Promise.all(
  ['claim', 'patient', 'institution', 'code_table', 'sido_code'].map(read),
);
const pat = Object.fromEntries(patient.map((p) => [p.jid, p]));
const inst = Object.fromEntries(institution.map((i) => [i.yid, i]));
const tierName = Object.fromEntries(codeTable.filter((c) => c.code_type === '종별코드').map((c) => [c.code, c.code_nm]));
const regionName = Object.fromEntries(sido.map((s) => [s.region_cd, s.region_nm]));

const loadedAt = new Date().toISOString();
const rows = claim.map((c) => ({
  mid: c.mid,
  yid: c.yid,
  recu_fr_dd: c.recu_fr_dd,
  fom_tp_cd: c.fom_tp_cd,
  main_sick: c.main_sick ?? '',
  amt: Number(c.rvd_rpe_tamt_amt),
  quintile: pat[c.jid]?.prem_quintile || '미상',
  tier: tierName[inst[c.yid]?.cl_cd] || inst[c.yid]?.cl_cd || '미상',
  region: regionName[inst[c.yid]?.region_cd] || '미상',
  loaded_at: loadedAt,
}));

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const rest = `${url}/rest/v1/${table}`;
const BATCH = 1000;
for (let i = 0; i < rows.length; i += BATCH) {
  const res = await fetch(`${rest}?on_conflict=mid`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.slice(i, i + BATCH)),
  });
  if (!res.ok) { console.error(`FAIL rows ${i}~: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
  process.stdout.write(`\rupsert ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
// 이번 적재에 없는 행(시트에서 빠진 명세서)은 지운다
const del = await fetch(`${rest}?loaded_at=lt.${encodeURIComponent(loadedAt)}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } });
if (!del.ok) { console.error(`\nFAIL 이전 행 삭제: HTTP ${del.status} ${await del.text()}`); process.exit(1); }

const cnt = await fetch(`${rest}?select=mid&limit=1`, { headers: { ...headers, Prefer: 'count=exact' } });
const total = Number(cnt.headers.get('content-range')?.split('/')[1]);
console.log(`\nok   ${table}: ${total} rows (원본 ${rows.length})`);
if (total !== rows.length) process.exitCode = 1;

const outDir = join(root, cfg.processedDir);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'config.json'), JSON.stringify({ supabase: { url, anonKey, table }, analysis: cfg.analysis, sheetId: cfg.sheetId }));
console.log('ok   config.json');
