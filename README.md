# 호흡기 진료비 격차 모니터

호흡기(J00~J99) 외래 명세서의 기관·종별·보험료 분위별 건당 진료비 격차를 월 1회 점검하는 웹 대시보드.

## 월간 갱신과 열기
```bash
npm run update   # 시트 내려받기 + 집계 (fetch → aggregate)
npm run serve    # http://localhost:5173/src/index.html
```
`npm`이 없으면 `node scripts/fetch-data.mjs && node scripts/aggregate.mjs`, `node scripts/serve.mjs`.
`file://`로 열면 JSON을 읽지 못하므로 서버로 연다.

## 분석 범위 바꾸기
`project.config.json`의 `analysis`: `sickPrefix`(주상병 접두어), `formCode`(서식구분, 031=외래), `minClaims`(기관 비교 최소 청구 건수). 바꾼 뒤 `npm run aggregate`.

## 새 대시보드 프로젝트 만들기 (반복)
```bash
bash scripts/new-dashboard.sh <대상폴더> <구글시트ID> [프로젝트이름]
```
이 프로젝트의 구조를 빈 폴더로 복제하고 이름·시트 ID를 채운다. `data/`와 `docs/` 내용은 가져가지 않는다(docs는 빈 뼈대).

## 폴더
```
project.config.json   설정(이름, 시트 ID, 탭, 분석 범위)
docs/                 brief(요구사항) · data-dictionary · decisions
scripts/              fetch-data.mjs · aggregate.mjs · serve.mjs · new-dashboard.sh
data/raw/             원본 CSV (git 제외)
data/processed/       집계 JSON (대시보드가 읽음)
src/                  index.html, css/style.css, js/main.js, js/charts.js
```
