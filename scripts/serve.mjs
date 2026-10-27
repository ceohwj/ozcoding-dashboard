// 프로젝트 루트를 로컬에서 서빙한다. 사용: node scripts/serve.mjs [포트]
// 대시보드: http://localhost:<포트>/src/index.html  (file:// 로 열면 JSON을 읽지 못한다)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
// 원본 CSV와 설정은 서빙하지 않는다: 화면에 필요한 것은 src/ 와 data/processed/ 뿐
const allowed = ['/src/', '/data/processed/'];

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { location: '/src/index.html' }); return res.end(); }
  const file = normalize(join(root, path));
  if (!file.startsWith(root) || !allowed.some((p) => path.startsWith(p))) { res.writeHead(404); return res.end('not found'); }
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/src/index.html`));
