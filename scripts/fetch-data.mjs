// 구글 시트의 각 탭을 CSV로 내려받아 data/raw/<탭>.csv 로 저장한다.
// 사용: node scripts/fetch-data.mjs [탭이름 ...]   (인자 없으면 project.config.json 의 모든 탭)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(join(root, 'project.config.json'), 'utf8'));

if (!cfg.sheetId || cfg.sheetId.startsWith('__')) {
  console.error('project.config.json 의 sheetId 가 비어 있다.');
  process.exit(1);
}

const tabs = process.argv.length > 2 ? process.argv.slice(2) : cfg.tabs;
const outDir = join(root, cfg.rawDir);
await mkdir(outDir, { recursive: true });

for (const tab of tabs) {
  const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL ${tab}: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const text = await res.text();
  await writeFile(join(outDir, `${tab}.csv`), text);
  console.log(`ok   ${tab}: ${text.split('\n').length - 1} lines`);
}
