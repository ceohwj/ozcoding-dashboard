-- 대시보드용 평면 청구 테이블. 명세서 1건 = 1행.
-- claim + patient(보험료 분위) + institution(종별·권역 이름)을 적재 시점에 조인해 둔다.
-- 환자 ID·출생연도는 담지 않는다(공개 읽기).
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 Run.

create table if not exists public.kr_claims (
  mid        text primary key,          -- 명세서 ID
  yid        text not null,             -- 기관 익명 ID
  recu_fr_dd date not null,             -- 요양개시일
  fom_tp_cd  text not null,             -- 서식구분(031 외래, 021 입원)
  main_sick  text not null default '',  -- 주상병 코드
  amt        integer not null,          -- 총진료비(rvd_rpe_tamt_amt)
  quintile   text not null,             -- 보험료 분위 '1'~'5', 결측 '미상'
  tier       text not null,             -- 기관 종별 이름
  region     text not null,             -- 권역 이름
  loaded_at  timestamptz not null default now()
);

create index if not exists kr_claims_form_sick on public.kr_claims (fom_tp_cd, main_sick text_pattern_ops);

-- anon(브라우저)은 읽기만. 쓰기는 service_role(적재 스크립트)만 가능.
alter table public.kr_claims enable row level security;
drop policy if exists kr_claims_read on public.kr_claims;
create policy kr_claims_read on public.kr_claims for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.kr_claims from anon, authenticated;
grant select on public.kr_claims to anon, authenticated;
