-- ============================================================
-- NextRise 勤怠管理システム - Supabaseテーブル定義
-- Supabaseダッシュボード → SQL Editor に貼り付けて実行してください
-- ============================================================

-- 1) 社員プロフィール（ログイン用アカウントに紐づく情報）
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  department text,
  role text not null default 'employee',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "本人のプロフィールのみ閲覧可"
  on public.profiles for select
  using (auth.uid() = id);

create policy "本人のプロフィールのみ更新可"
  on public.profiles for update
  using (auth.uid() = id);

-- 2) 打刻ログ（出勤・退勤の記録）
create table public.attendance_logs (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  created_at timestamptz not null default now()
);

alter table public.attendance_logs enable row level security;

create policy "本人の打刻ログのみ閲覧可"
  on public.attendance_logs for select
  using (auth.uid() = employee_id);

create policy "本人の打刻ログのみ登録可"
  on public.attendance_logs for insert
  with check (auth.uid() = employee_id);

-- 3) 新規登録（サインアップ）時に profiles 行を自動作成するトリガー
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, department)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'department'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
