# 호흡기 진료비 격차 모니터 — 재현 가이드

이 문서만으로 같은 대시보드를 처음부터 다시 만들 수 있게 정리했다.
1장은 AI 코딩 도구에 그대로 붙여 넣는 프롬프트이고, 2장부터는 그 프롬프트가 기대하는 정확한 명세다.
결과가 맞는지는 7장의 기준값으로 확인한다.

- 결과물: https://ceohwj.github.io/ozcoding-dashboard/dashboard.html
- 저장소: https://github.com/ceohwj/ozcoding-dashboard
- 작성 기준일: 2026-10-27

---

## 1. 프롬프트 (그대로 붙여 넣기)

> 아래 프롬프트와 이 문서의 2~8장을 함께 AI 코딩 도구에 전달한다. 2~8장이 프롬프트의 "명세"다.

```text
빈 폴더에 웹 대시보드 프로젝트를 만들어줘. 명세는 아래 문서(2~8장)를 그대로 따른다.

목적: 식약처 보건의료분석 담당자가 월 1회, 호흡기 질환 외래 진료비가
기관 종별·환자 보험료 분위·개별 기관에 따라 얼마나 다른지 점검한다.

데이터: 구글 시트 1nPuY8AKFAs2r9da4xUBV3WMKdLEBZJGpmd3kP7xKNvU (보기 전용, kr_claims).
각 탭을 https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<탭> 으로 CSV로 받는다.

순서:
1. 3장 폴더 구조와 project.config.json을 만든다.
2. scripts/fetch-data.mjs로 탭 10개를 data/raw/*.csv로 받는다.
3. scripts/aggregate.mjs로 4장 정의대로 집계해 data/processed/*.json 6개를 만든다.
4. 5장대로 dashboard.html + src/css + src/js 를 만든다. 빌드·외부 라이브러리 없이 SVG를 직접 그린다.
5. scripts/serve.mjs로 로컬에서 띄워 7장 기준값과 화면 숫자가 맞는지 확인한다.
6. 8장대로 GitHub 공개 저장소에 올리고 GitHub Pages로 배포한다.

지켜야 할 것:
- 시트 값은 모두 텍스트다. '031' 같은 코드는 문자열로 비교하고 금액·날짜만 변환한다.
- 화면의 모든 숫자는 data/processed JSON에서 읽는다. HTML/JS에 숫자를 하드코딩하지 않는다.
- 원본 CSV(data/raw)는 git에 올리지 않는다.
- JS/CSS 주소에 ?v=<번호>를 붙인다 (GitHub Pages 10분 캐시 대응, 6장 참고).
```

---

## 2. 확정된 요구사항 (인터뷰 결과)

| 항목 | 결정 |
|---|---|
| 사용자 | 식약처 보건의료분석 담당자 |
| 질문 | 빈부격차 때문에 병원별 진료비 차이가 크다는 이야기가 사실인가 |
| 갱신 주기 | 월 1회, 스크립트 재실행(시트 → 집계 → 커밋) |
| 질환 범위 | ICD-10 **J00~J99 전체** (주상병 `claim.main_sick`이 `J`로 시작). A·B 감염병 코드는 제외 |
| 진료 형태 | **외래만** (`claim.fom_tp_cd = '031'`). 입원(021, 624건)은 규모가 달라 제외 |
| 병원 단위 | **개별 기관 익명 ID** (`claim.yid`). 데이터에 기관명이 없음 |
| 빈부 지표 | **보험료 5분위** (`patient.prem_quintile`, 1 낮음 ~ 5 높음). 결측은 `'미상'` |
| 진료비 지표 | **명세서 1건당 총진료비** (`claim.rvd_rpe_tamt_amt`) |
| 기관 비교 최소 건수 | **20건** (처음 30건 → 30건이면 102곳 전부 의원이라 20건으로 낮춤) |
| 기술 | 정적 HTML + JS, 빌드·외부 라이브러리 없음 |
| 디자인 | 차분한 보고서형, 한국어, 라이트/다크 자동 |
| 공개 | 공개 GitHub 저장소 + GitHub Pages, 주소 형식 `github.io/<레포>/dashboard.html` |

---

## 3. 폴더 구조와 설정

```
project.config.json   설정의 단일 출처
package.json          npm 스크립트
index.html            dashboard.html로 즉시 이동 (meta refresh)
dashboard.html        대시보드 페이지
src/css/style.css
src/js/main.js        데이터 로드·렌더링
src/js/charts.js      의존성 없는 SVG 차트 도우미
scripts/fetch-data.mjs     시트 → data/raw/*.csv
scripts/aggregate.mjs      data/raw → data/processed/*.json
scripts/serve.mjs          로컬 서버 (src/, data/processed/, dashboard.html만 서빙)
scripts/new-dashboard.sh   이 구조를 빈 폴더로 복제 (선택)
data/raw/             원본 CSV (git 제외, .gitkeep만 추적)
data/processed/       집계 JSON (git에 포함, 화면이 읽음)
docs/                 brief.md · data-dictionary.md · decisions.md · REPRODUCE.md
```

`project.config.json`:
```json
{
  "name": "OZ_dashboard_2",
  "sheetId": "1nPuY8AKFAs2r9da4xUBV3WMKdLEBZJGpmd3kP7xKNvU",
  "tabs": ["claim", "patient", "institution", "sick_master", "code_table",
           "sido_code", "hospital_open", "claim_sick", "claim_rx", "drug_ingredient"],
  "rawDir": "data/raw",
  "processedDir": "data/processed",
  "analysis": { "sickPrefix": "J", "formCode": "031", "minClaims": 20 }
}
```

`package.json`의 scripts:
```json
{
  "fetch": "node scripts/fetch-data.mjs",
  "aggregate": "node scripts/aggregate.mjs",
  "update": "node scripts/fetch-data.mjs && node scripts/aggregate.mjs",
  "serve": "node scripts/serve.mjs"
}
```

`.gitignore`: `.env`, `node_modules/`, `.DS_Store`, `data/raw/*`, `!data/raw/.gitkeep`

- 스크립트는 `.mjs` 확장자라 `package.json`에 `"type": "module"`이 없어도 된다. 의존성은 없다(`npm install` 불필요, Node 18+ 내장 `fetch` 사용).
- 브라우저 JS는 ES 모듈이다: `dashboard.html` 끝에 `<script type="module" src="src/js/main.js?v=2"></script>`, `<head>`에 `<link rel="stylesheet" href="src/css/style.css?v=2">`.
- 루트 `index.html`은 `<meta http-equiv="refresh" content="0; url=dashboard.html">`와 같은 곳으로 가는 링크 하나만 둔다.

### 3.1 스크립트 동작

- **fetch-data.mjs**: 설정의 탭을 **순서대로 하나씩** 받아 `data/raw/<탭>.csv`로 저장하고 `ok   <탭>: <줄 수> lines`를 출력한다. 인자로 탭 이름을 주면 그 탭만 받는다. 응답이 200이 아니면 `FAIL <탭>: HTTP <코드>`를 출력하고 종료 코드를 1로 두되 다음 탭은 계속 받는다. `sheetId`가 비었거나 `__`로 시작하면 바로 종료한다. claim 탭이 약 4.5MB이며 페이징은 필요 없다.
- **aggregate.mjs**: 4장대로 계산해 6개 JSON을 쓰고 `ok   <이름>.json (<행 수> rows)`를 출력한다.
- **serve.mjs**: `127.0.0.1:<포트>`(기본 5173, 첫 인자로 변경)에서 프로젝트 루트를 서빙한다. 경로가 `/src/`, `/data/processed/`, `/dashboard.html`로 시작할 때만 응답하고 나머지는 404(원본 CSV·설정 노출 방지). `/`는 `302 → /dashboard.html`. MIME은 html·css·js·mjs·json·svg를 지정하고 `cache-control: no-store`. 시작 시 `http://localhost:<포트>/dashboard.html`을 출력한다. Ctrl+C로 끈다.

---

## 4. 데이터와 집계 명세

### 4.1 원본 시트

모든 셀은 텍스트, 빈 칸은 NULL. 탭별 행 수(헤더 제외): claim 38,375 · patient 3,000 · institution 2,184 · sick_master 21,299 · code_table 215 · sido_code 17 · hospital_open 4,215 · claim_sick 39,892 · claim_rx 60,146 · drug_ingredient 20,114.

이 대시보드가 쓰는 컬럼:

| 테이블 | 컬럼 | 뜻 |
|---|---|---|
| claim | `jid`, `yid` | 환자·기관 키 |
| claim | `fom_tp_cd` | 서식구분 (`031` 외래, `021` 입원) |
| claim | `main_sick` | 주상병코드 (`J209` 등) |
| claim | `rvd_rpe_tamt_amt` | 총진료비(원) |
| claim | `recu_fr_dd` | 요양개시일 `YYYY-MM-DD` |
| patient | `prem_quintile` | 보험료 분위 `1`~`5`, 빈 칸 98명 |
| institution | `cl_cd`, `region_cd` | 종별코드, 권역코드 |
| code_table | `code_type='종별코드'`, `code`, `code_nm` | `01` 상급종합병원, `11` 종합병원, `21` 병원, `31` 의원 … |
| sido_code | `sido_cd`, `sido_nm`, `region_cd`, `region_nm` | 시도 17행. 권역은 `region_cd`로 묶이며 여러 시도가 같은 권역을 공유 |

조인: `claim.jid → patient.jid`, `claim.yid → institution.yid`, `institution.cl_cd → code_table(종별코드)`, `institution.region_cd → sido_code.region_cd` (region_cd 하나에 region_nm이 하나뿐: 1 수도권, 2 강원충청권, 3 호남제주권, 4 영남권).
`hospital_open`은 `institution`과 연결 키가 없어 쓰지 않는다.

### 4.2 CSV 파싱

gviz CSV는 모든 값이 큰따옴표로 감싸져 있다. 따옴표 안의 쉼표·줄바꿈, `""` 이스케이프를 처리하는 파서를 직접 쓴다(라이브러리 없음). `\r`은 버린다. 첫 줄이 헤더이고, 셀이 1개 이하인 줄(빈 줄)은 버린다. 각 행은 `{헤더: 값}` 객체로 만들며, 값은 모두 문자열로 둔다.

### 4.3 집계 정의 (`scripts/aggregate.mjs`)

```
outpatient = claim 중 fom_tp_cd == formCode('031')
resp       = outpatient 중 main_sick가 sickPrefix('J')로 시작
각 resp 행: amt = Number(rvd_rpe_tamt_amt)
            month = recu_fr_dd 앞 7글자
            quintile = patient.prem_quintile, 없거나 빈 값이면 '미상'
            tier = 종별코드 이름(cl_cd), 없으면 cl_cd 그대로, 그것도 없으면 '미상'
            region = 권역 이름, 없으면 '미상'
mean = 산술평균, median = 정렬 후 중앙(짝수면 두 값 평균)
```

출력 파일 6개 (모두 행 객체의 배열):

| 파일 | 행 | 필드 |
|---|---|---|
| `kpi.json` | 1 | `outpatient`, `resp`, `share`(=resp/outpatient, 소수 4자리), `mean`(반올림), `median`, `institutions`(resp가 있는 기관 수), `qualified`(n≥minClaims 기관 수), `min_n`, `spread`(기관 중앙값 p90/p10, 소수 2자리) |
| `monthly.json` | 월별 | `month`, `n`, `mean`(반올림) — 월 오름차순 |
| `quintile.json` | 분위별 | `quintile`(`1`~`5`, `미상`), `n`, `mean`(반올림), `median` |
| `institutions.json` | 기관별(n≥minClaims) | `inst_id`, `n`, `median`(반올림), `mean`(반올림), `tier`, `region` — median 내림차순 |
| `heat.json` | 종별×분위 | `tier`, `quintile`(`1`~`5`, 미상 제외), `n`, `mean`(반올림) |
| `meta.json` | 1 | `generatedAt`(ISO), `from`/`to`(claim 전체 최소·최대 날짜), `sickPrefix`, `formCode`, `minClaims`, `sheetId` |

세부 규칙:
- 백분위 `pct(a, p)` = 오름차순 정렬 후 인덱스 `floor(p × (길이−1))`의 값. `spread`는 **비교 가능한 기관들의 반올림된 `median`** 값에 적용한다. 기관이 0곳이면 `null`.
- 반올림(`Math.round`)하는 필드는 표에 "반올림"이라 적힌 것뿐이다. `kpi.median`, `quintile.median`은 반올림하지 않는다(짝수 개면 `.5`가 나올 수 있으나 현재 데이터에서는 정수).
- `quintile.json` 행 순서는 고정 목록 `1, 2, 3, 4, 5, 미상` 중 데이터에 있는 것만.
- `institutions.json`은 median 내림차순 정렬(동점이면 호흡기 외래 명세서 중 먼저 나온 기관이 앞. 기관을 처음 등장 순서로 모은 뒤 안정 정렬). `heat.json` 행 순서는 화면에 영향 없음.
- `from`/`to`는 **claim 전체**(외래·호흡기 필터 전)의 `recu_fr_dd`를 문자열로 정렬한 첫 값과 끝 값.
- `generatedAt`은 `new Date().toISOString()`(UTC).

---

## 5. 화면 명세 (`dashboard.html`)

페이지는 최대 폭 1180px, 위에서 아래로 아래 순서. 두 개씩 놓이는 카드는 `grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr))`로, 좁으면 한 줄로 쌓인다.

1. **제목** `호흡기 진료비 격차 모니터`
2. **결론 문장** (데이터에서 계산):
   - heat.json으로 종별 가중평균(Σn·mean / Σn)을 구해 내림차순 정렬.
   - `호흡기 외래 진료는 기관 종별로 건당 진료비가 크게 갈린다. {최고 종별}은 평균 {x.x만 원}으로 {최저 종별} {x.x만 원}의 {배수 소수1자리}배다. 같은 종별({건수 최다 종별}) 안에서 보험료 분위 간 평균 차이는 최대 {(max/min−1)를 %로 반올림}% 수준이다.`
3. **부제**: `호흡기(J00~J99) 외래(서식 031) 명세서, {from} ~ {to} · 건당 총진료비 기준 · 집계 {generatedAt 날짜}`
4. **요약 카드 4개** (라벨 / 큰 숫자 / 보조 문구):
   - 호흡기 외래 명세서 / `resp` / `전체 외래 대비 {share %, 소수1}`
   - 건당 평균 진료비 / `{mean}원` / `중앙값 {median}원`
   - 청구 기관 / `{institutions}곳` / `호흡기 청구가 1건 이상인 곳`
   - 비교 가능한 기관 / `{qualified}곳` / `{min_n}건 이상 청구한 곳만`
5. **카드 2개 한 줄**
   - **종별 × 보험료 분위 평균 진료비** (히트맵, HTML grid `6.5rem + 5열`): 행 = 종별(가중평균 내림차순), 열 = `1분위`~`5분위`. 칸에 평균을 만 원 단위 소수1자리로, 아래 작은 글씨로 `{n}건`. 칸 배경은 강조색, 불투명도 `0.12 + 0.78 × (mean / 전체 최대 mean)`.
     설명: `세로는 기관 종별, 가로는 환자의 보험료 분위(1 낮음 ~ 5 높음). 칸의 숫자는 건당 평균(만 원), 아래는 건수. 진하기는 금액.`
   - **보험료 분위별 건당 평균** (가로 막대): `1분위`~`5분위`, `미상` 순. 막대 끝에 `x.x만 원`. 미상은 회색 막대. x축 눈금 `0만, 1만, 2만…`.
     설명: `종별을 섞은 전체 평균이라 분위 간 차이는 종별 구성에 영향을 받는다.`
6. **카드 2개 한 줄**
   - **월별 호흡기 외래 건수** (세로 막대, 둥근 모서리 rx 3): x축 라벨 `YY-MM`, 3개월마다(폭 420px 미만이면 6개월마다). y축 0부터, 눈금 4개 정도.
   - **월별 건당 평균 진료비** (선 2px + 점 r3): y축 **0원부터**, 눈금 `0만, 1만, 2만, 3만`. 설명: `0원부터 시작하는 축.`
7. **기관별 건당 중앙값 진료비** (표, 최대 높이 360px 스크롤, 헤더 고정)
   - 열: 기관 ID · 종별 · 권역 · 청구 건수(오른쪽 정렬) · 건당 중앙값(원, 오른쪽 정렬, 옆에 최대값 대비 길이 최대 70px 막대)
   - 기본 정렬: 중앙값 내림차순. 헤더 클릭으로 정렬 전환(숫자 열은 내림차순부터, 문자 열은 가나다순부터), `aria-sort`와 ▲▼ 표시.
   - 설명: `호흡기 외래 {min_n}건 이상 청구한 기관만 표시. 기관 이름은 데이터에 없어 익명 ID로 보인다. 열 이름을 누르면 정렬된다.`
8. **정의·주의** 문단: 호흡기·외래·진료비·분위의 정의, 청구가 적은 기관 제외, 입원 제외, 월 1회 갱신.

공통 동작:
- 막대·점·히트맵 칸에 `data-tip="제목|내용"`을 달고, 페이지 전체에 하나뿐인 툴팁이 마우스를 따라간다(화면 밖으로 나가지 않게 위치를 제한).
- 창 크기가 바뀌면 SVG 차트를 120ms 디바운스 후 다시 그린다. 차트는 `viewBox` + `width="100%"`.
- 데이터 로드 실패 시 페이지 전체를 빨간 테두리 박스로 바꾸고 원인 파일명과 HTTP 상태를 보여준다.
- 데이터는 `fetch('data/processed/<이름>.json', { cache: 'no-cache' })` — **페이지 기준 상대경로**.

### 5.1 디자인 토큰 (`src/css/style.css`)

| 토큰 | 라이트 | 다크 |
|---|---|---|
| `--bg` | `#f7f8f6` | `#131815` |
| `--panel` | `#ffffff` | `#1b221e` |
| `--fg` | `#1d2420` | `#e8ede9` |
| `--muted` | `#5e6a63` | `#98a59d` |
| `--line` | `#dfe4e0` | `#2c3631` |
| `--grid` | `#e8ece9` | `#27302b` |
| `--accent` | `#1f6f5c` | `#5fc2a6` |
| `--muted-bar` | `#a9b3ad` | `#56625b` |
| `--bad` | `#c0392b` | `#ef7a6d` |

추가 토큰: `--pop`(툴팁 배경) 라이트 `#ffffff` / 다크 `#242d28`, `--shadow` 라이트 `0 4px 16px rgba(20,30,25,.14)` / 다크 `0 4px 16px rgba(0,0,0,.5)`, `--radius: 10px`.

- 다크는 `@media (prefers-color-scheme: dark)`로 전환.
- 글꼴: 제목·큰 숫자 `"Noto Serif KR", "Nanum Myeongjo", "Apple SD Gothic Neo", Georgia, serif`, 본문 `"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif` (웹폰트 로드 없음).
- 카드: `--panel` 배경, 1px `--line` 테두리, 반경 10px, 안쪽 여백 18px. 숫자는 `tabular-nums`.
- 페이지: `max-width: 1180px; margin: 0 auto; padding: 28px max(16px, 3vw) 48px;` 섹션 간격 20px, 카드 간격 14px. 요약 카드 그리드는 `repeat(auto-fit, minmax(min(100%, 11rem), 1fr))`.
- 글자 크기: 제목 1.75rem(serif 500), 결론 문장 1.05rem(최대 62ch, 숫자는 `<b>` 600), 부제·설명·라벨 12px `--muted`, 카드 제목 1rem 600, 요약 카드 큰 숫자 1.9rem serif, SVG 글자 11px `--muted`.

### 5.2 숫자 형식

- 정수는 `Number(v).toLocaleString('ko-KR')` (예: `13,232`).
- 만 원 단위는 `(v / 10000).toFixed(1)` (예: `5.6`), 문장·막대 끝에는 `5.6만 원`.
- 비율은 `(share × 100).toFixed(1)%`, 결론 문장의 분위 차이는 `Math.round(gap × 100)%`, 배수는 `toFixed(1)`.
- "건수 최다 종별"은 heat.json에서 **n 합계가 가장 큰 종별**이다(현재 의원).

### 5.3 차트 세부 (`src/js/charts.js`)

모든 SVG는 그릴 때 컨테이너 폭 `w = max(240, 컨테이너.clientWidth)`를 재서 `width="100%" height={높이} viewBox="0 0 {w} {높이}"`로 만든다. 폭 판정(420px)도 **각 차트 자신의 컨테이너** 폭을 쓴다.

눈금 함수 `niceTicks(max, count=4)`: `raw = max / count`, `mag = 10^floor(log10(raw))`, `step` = `[1, 2, 2.5, 5, 10] × mag` 중 `raw` 이상인 첫 값, 눈금 = `0, step, 2·step, …, ceil(max/step)·step`.

| 차트 | 규격 |
|---|---|
| 월별 건수 (막대) | 높이 230, 여백 위8·오른8·아래26·왼48. 눈금 = `niceTicks(최대값 × 1.05)`, 축 최댓값 = 마지막 눈금. 가로 격자선 `--grid`, 기준선(0) `--muted-bar`. y 라벨은 왼쪽 정렬 끝(`text-anchor: end`)에 `toLocaleString`. 한 칸 폭 = `(w−56)/개월 수`, 막대 폭 = 칸 × 0.72(최소 2), `rx 3`, `--accent`. x 라벨은 칸 가운데, `YYYY-MM`의 3번째 글자부터(`24-01`). |
| 월별 평균 (선) | 같은 틀. 선 2px `--accent`, 둥근 끝·이음. 점 r3, 그 위에 투명한 r9 원을 겹쳐 툴팁 영역으로 쓴다. y 라벨은 `{v/10000}만`. |
| 분위별 평균 (가로 막대) | 한 줄 높이 32, 전체 높이 `줄 수 × 32 + 26`, 왼쪽 여백 62·오른쪽 72. x축 최대 = `최대 mean × 1.05`, 막대 두께 = 32 × 0.68, `rx 4`. 왼쪽에 `N분위`(미상은 `미상`), 막대 끝 오른쪽 6px에 `x.x만 원`. 아래 기준선과 `niceTicks(축 최대, 4)` 중 축 최대 이하인 눈금에 `{v/10000}만` 라벨. 미상 막대만 `--muted-bar`. |
| 히트맵 (HTML) | `display: grid; grid-template-columns: 6.5rem repeat(5, minmax(0, 1fr)); gap: 3px`. 첫 줄은 빈 칸 + `1분위`~`5분위`. 각 칸은 `position: relative`이고 **배경을 `::before` 가상 요소로** 깐다(`background: var(--accent); opacity: var(--ho)`). 그래야 글자가 함께 흐려지지 않는다. 숫자는 14px `--fg`, 그 아래 `{n}건`은 10px `--muted`. |
| 기관 표 | 헤더 고정(`position: sticky; top: 0`, 배경 `--panel`), 글자 12px. 중앙값 막대 폭 = `round(median / 전체 행 최대 median × 70)`px, 높이 8px, 정렬해도 같은 최대값 기준. `기관 ID`는 문자열로 정렬(`localeCompare(…, 'ko')`). |

### 5.4 툴팁·문구

툴팁 내용(`제목|내용`):

| 요소 | 제목 | 내용 |
|---|---|---|
| 히트맵 칸 | `{종별} · {q}분위` | `평균 {mean}원 · {n}건` |
| 분위 막대 | `{q}분위` (미상은 `분위 미상`) | `평균 {mean}원 · {n}건` |
| 월별 막대 | `YYYY-MM` | `{n}건` |
| 월별 점 | `YYYY-MM` | `건당 평균 {mean}원` |

툴팁은 `--pop` 배경, 1px `--line`, 반경 8px, `--shadow`, 12px, 제목은 `--muted`. 위치는 마우스 +14px, 페이지 영역 밖으로 나가지 않게 제한.

정의·주의 문단 원문(`{}`는 meta.json 값):
> **정의** · 호흡기: 주상병(claim.main_sick)이 {sickPrefix}로 시작. 외래: 서식구분 {formCode}. 진료비: 명세서 1건의 총진료비(rvd_rpe_tamt_amt). 보험료 분위: 환자(patient.prem_quintile) 기준이며 결측은 '미상'으로 분리. **주의** · 청구가 적은 기관은 평균이 흔들려 비교에서 뺐다. 입원은 규모가 달라 제외했다. 월 1회 시트를 다시 집계해 갱신한다.

로드 실패 시 문구: **데이터를 불러오지 못했다.** `{파일명} ({HTTP 상태})`. `npm run update`로 집계한 뒤 `npm run serve`로 열어야 한다.

부제의 집계 날짜는 `generatedAt`의 앞 10글자(UTC 기준 날짜).

---

## 6. 로컬 실행과 함정

```bash
npm run update   # 시트 받기 + 집계
npm run serve    # http://localhost:5173/dashboard.html
```

- **`file://`로 열면 안 된다.** 브라우저가 JSON fetch를 막는다. 반드시 서버로 연다.
- **GitHub Pages 주소에는 저장소 이름이 붙는다** (`/ozcoding-dashboard/...`). 데이터 경로를 `/data/...` 같은 절대경로로 쓰면 404가 난다. 페이지 기준 상대경로만 쓴다.
- **GitHub Pages는 파일을 10분 캐시한다** (`cache-control: max-age=600`). 경로를 바꾸고 배포하면 이전 JS가 옛 경로를 요청해 "데이터를 불러오지 못했다 · kpi.json (404)"가 날 수 있다. 그래서:
  - `dashboard.html`에서 `src/css/style.css?v=2`, `src/js/main.js?v=2`로 부르고,
  - `main.js`에서 `import … from './charts.js?v=2'`로 부른다.
  - CSS·JS를 바꿀 때마다 `?v=` 숫자를 함께 올린다. 그래도 `dashboard.html` 자체는 최대 10분 캐시되므로 배포 직후엔 강력 새로고침(Cmd+Shift+R)이 필요할 수 있다.
- 시트의 코드값은 문자열이다. `fom_tp_cd === '031'`처럼 비교한다. 숫자로 바꾸면 `31`이 되어 아무것도 걸리지 않는다.

---

## 7. 기준값 (재현 결과 검증용)

시트가 바뀌지 않았다면 `minClaims: 20` 기준으로 아래 값이 나와야 한다.

| 항목 | 값 |
|---|---|
| 전체 외래 명세서 (031) | 37,751 |
| 호흡기 외래 명세서 | **13,232** (전체 외래의 35.0%) |
| 건당 평균 / 중앙값 | **22,635원** / 18,300원 |
| 청구 기관 / 비교 가능한 기관 | 1,460곳 / **158곳** (의원 144, 상급종합병원 14) |
| 기관 중앙값 p90/p10 | 1.47 |
| 기간 | 2024-01-01 ~ 2025-12-31, 월 24개 |
| 첫 달 / 마지막 달 | 2024-01: 529건, 평균 22,096원 / 2025-12: 839건, 평균 21,832원 |
| 표 맨 위 / 맨 아래 | 1023 상급종합병원 호남제주권 21건 60,300원 / 2102 의원 수도권 22건 11,750원 |

히트맵 (평균 원 / 건수):

| 종별 | 1분위 | 2분위 | 3분위 | 4분위 | 5분위 |
|---|---|---|---|---|---|
| 상급종합병원 | 57,651 / 113 | 56,532 / 136 | 51,334 / 128 | 58,555 / 195 | 55,937 / 179 |
| 종합병원 | 35,699 / 179 | 30,043 / 191 | 33,510 / 230 | 31,405 / 267 | 32,823 / 311 |
| 병원 | 21,874 / 170 | 23,929 / 170 | 24,701 / 210 | 21,851 / 238 | 22,248 / 265 |
| 의원 | 19,249 / 1,669 | 18,377 / 1,611 | 18,678 / 1,866 | 18,675 / 2,269 | 18,966 / 2,443 |

분위별 평균: 1분위 22,876 · 2분위 22,343 · 3분위 22,317 · 4분위 22,693 · 5분위 22,655 · 미상 24,249 (원).

결론 문장은 `상급종합병원은 평균 5.6만 원으로 의원 1.9만 원의 3.0배다. 같은 종별(의원) 안에서 보험료 분위 간 평균 차이는 최대 5% 수준이다.`가 된다.

`minClaims: 30`이면 비교 가능한 기관은 102곳(전부 의원), p90/p10은 1.28이다.

---

## 8. 배포

```bash
git init -b main
git add -A            # data/raw는 .gitignore로 제외됨
git commit -m "호흡기 진료비 격차 모니터"
gh repo create <계정>/ozcoding-dashboard --public --source . --remote origin --push
gh api -X POST repos/<계정>/ozcoding-dashboard/pages -f 'source[branch]=main' -f 'source[path]=/'
```

- 빌드가 끝나면(`gh api repos/<계정>/ozcoding-dashboard/pages/builds/latest --jq .status` 가 `built`) `https://<계정>.github.io/ozcoding-dashboard/dashboard.html`에서 열린다.
- 확인: `/dashboard.html`, `/data/processed/kpi.json`이 200, `/data/raw/claim.csv`가 404여야 한다.
- 공개되는 것: 코드, 문서, 집계 JSON(기관 익명 ID 포함), `project.config.json`의 시트 ID.

월 1회 갱신:
```bash
npm run update
git add data/processed && git commit -m "데이터 갱신 YYYY-MM" && git push
```

---

## 9. 해석 시 알아둘 점

- 진료비 차이는 **보험료 분위보다 기관 종별**에서 크게 난다. 상급종합병원 건당 평균은 의원의 약 3배이고, 같은 종별 안에서 분위 간 차이는 5% 안팎이며 방향도 일정하지 않다.
- 종합병원·병원은 기관당 호흡기 외래가 20건에 못 미쳐 기관 단위 비교에 들어가지 않는다.
- 상급종합병원 14곳은 청구가 20~28건이라 개별 순위는 참고용이다.
- 월별 건수는 겨울에 늘고 여름에 줄어드는 계절성이 있다. 건당 평균은 월별로 거의 일정하다.
