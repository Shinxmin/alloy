-- alloy 포트폴리오 데이터를 위한 테이블 및 RLS 정책
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.

create table if not exists public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holdings jsonb not null default '[]'::jsonb,
  cash_holdings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;

drop policy if exists "Users can view own portfolio" on public.portfolios;
create policy "Users can view own portfolio"
  on public.portfolios for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own portfolio" on public.portfolios;
create policy "Users can insert own portfolio"
  on public.portfolios for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own portfolio" on public.portfolios;
create policy "Users can update own portfolio"
  on public.portfolios for update
  using (auth.uid() = user_id);

-- 사용자 프로필 (닉네임) 테이블
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);
