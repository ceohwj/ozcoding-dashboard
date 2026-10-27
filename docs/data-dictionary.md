# 데이터 사전

원본: 구글 시트 `1nPuY8AKFAs2r9da4xUBV3WMKdLEBZJGpmd3kP7xKNvU` (kr_claims, 보기 전용). 시트 README 기준 2026-10-06 배포판 SQL과 같은 데이터. 모든 값은 텍스트, 빈 칸은 NULL.

## 테이블
| 탭 | 한 행의 뜻 | 행 수 | 키 |
|---|---|---|---|
| claim | 명세서 한 건 | 38,375 | mid |
| patient | 수진자 한 명 | 3,000 | jid |
| institution | 요양기관 한 곳(이름 없음) | 2,184 | yid |
| sick_master | 상병코드 한 개 | 21,299 | sickcd |
| code_table | 코드 종류와 코드 한 쌍 | 215 | code_type+code |
| sido_code | 시도 한 곳 | 17 | sido_cd |
| hospital_open | 실제 병원급 이상 기관 | 4,215 | hosp_id |
| claim_sick | 명세서의 상병 한 줄 | 39,892 | mid+sick_sno |
| claim_rx | 명세서의 원외처방 한 줄 | 60,146 | mid+ln_no |
| drug_ingredient | 주성분코드 한 개 | 20,114 | gnl_cd |

## 조인 관계
- `claim.jid` → `patient.jid`, `claim.yid` → `institution.yid`
- `claim.mid` → `claim_sick.mid`, `claim_rx.mid`; `claim_rx.gnl_cd` → `drug_ingredient.gnl_cd`
- `claim.main_sick` → `sick_master.sickcd`
- `institution.cl_cd` → `code_table`(code_type=종별코드), `institution.region_cd` → `sido_code.region_cd`
- `hospital_open`은 `institution`과 직접 키가 없다(기관명 연결 불가)

## 이 대시보드가 쓰는 컬럼
- `claim`: fom_tp_cd(031 외래/021 입원), main_sick(J…=호흡기), rvd_rpe_tamt_amt(총진료비), recu_fr_dd(월), jid, yid
- `patient`: prem_quintile(보험료 5분위, 98명 결측)
- `institution`: cl_cd(종별), region_cd(권역)

## 주의
- 호흡기 외래 13,232건 중 청구 20건 이상 기관은 158곳(의원 144, 상급종합병원 14)이다. 30건 이상이면 102곳이 모두 의원이다. 종합병원·병원은 어느 기준에서도 기관 단위로 비교할 수 없다(기관당 건수 부족).
- 입원은 624건뿐이라 제외했다.
