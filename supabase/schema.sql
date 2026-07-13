-- alloy 포트폴리오 데이터를 위한 테이블 및 RLS 정책
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.

create table if not exists public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holdings jsonb not null default '[]'::jsonb,
  cash_holdings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

create policy "Users can view own portfolio"
  on public.portfolios for select
  using (auth.uid() = user_id);

create policy "Users can insert own portfolio"
  on public.portfolios for insert
  with check (auth.uid() = user_id);

create policy "Users can update own portfolio"
  on public.portfolios for update
  using (auth.uid() = user_id);
