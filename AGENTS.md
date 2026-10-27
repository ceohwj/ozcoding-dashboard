# OZ_dashboard_2

호흡기 진료비 격차 모니터(웹 대시보드). 데이터 원본은 구글 시트(보기 전용). 새 프로젝트는 `bash scripts/new-dashboard.sh`로 이 구조를 복제해 만든다.

## 구조
- `project.config.json` — 이름, 시트 ID, 탭 목록, 분석 범위(`analysis`). 설정의 단일 출처.
- `docs/brief.md` — 인터뷰로 확정한 요구사항. 구현 전에 먼저 읽는다.
- `docs/data-dictionary.md` — 테이블/컬럼 의미와 조인 관계.
- `docs/decisions.md` — 결정 기록(날짜, 결정, 이유).
- `scripts/fetch-data.mjs` — 시트 → `data/raw/*.csv`.
- `scripts/aggregate.mjs` — `data/raw` → `data/processed/*.json` (화면이 읽는 집계).
- `scripts/serve.mjs` — 로컬 서버. `src/`와 `data/processed/`만 서빙.
- `dashboard.html` — 대시보드 페이지(배포 주소 `/dashboard.html`). 루트 `index.html`은 여기로 이동시킨다.
- `src/` — 정적 CSS/JS(빌드·외부 라이브러리 없음). 차트는 `js/charts.js`의 SVG 도우미.

## 규칙
- 원본(`data/raw`)은 읽기만 한다. 가공은 `data/processed`에 쓴다.
- 화면에 쓰는 숫자는 모두 `data/processed`에서 온다. `src/`에 값을 하드코딩하지 않는다.
- 모든 시트 값은 텍스트다. 앞자리 0 코드(`031`)는 문자열로 유지하고, 금액/날짜만 변환한다.
- 요구사항이 바뀌면 `docs/brief.md`와 `docs/decisions.md`를 먼저 고친다.
- 비밀값은 `.env`에 두고 커밋하지 않는다(현재 시트는 공개 읽기라 필요 없음).
- `src/`의 CSS·JS를 바꾸면 `dashboard.html`과 `src/js/main.js`의 `?v=` 숫자를 함께 올린다. GitHub Pages가 파일을 10분간 캐시해서, 안 올리면 이전 파일로 열린다.
