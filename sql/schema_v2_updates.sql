-- ============================================================
-- NextRise 勤怠管理システム - 追加機能用スキーマ更新
-- Supabaseダッシュボード → SQL Editor に貼り付けて実行してください
-- （最初の sql/schema.sql を実行済みであることが前提です）
-- ============================================================

-- ---------------------------------------------------------------
-- 0) 権限チェック用のヘルパー関数（RLSの無限再帰を避けるため）
-- ---------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_department()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select department from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------
-- 1) 部署名から自動で権限を割り当てる（新規登録時）
--    「管理者」と完全一致 → admin
--    「総務」を含む       → soumu（総務）
--    それ以外             → employee
-- ---------------------------------------------------------------
alter table public.profiles add column if not exists leave_granted_days numeric not null default 10;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  dept text := new.raw_user_meta_data ->> 'department';
  computed_role text := 'employee';
begin
  if trim(dept) = '管理者' then
    computed_role := 'admin';
  elsif dept like '%総務%' then
    computed_role := 'soumu';
  end if;

  insert into public.profiles (id, email, full_name, department, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', dept, computed_role);
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 2) profiles の権限まわりのポリシー追加
--    （管理者は全員分を閲覧・削除可、総務・管理者は更新可＝有給付与日数の編集用）
-- ---------------------------------------------------------------
create policy "管理者は全プロフィール閲覧可"
  on public.profiles for select
  using (public.current_role() = 'admin');

create policy "総務・管理者はプロフィール更新可"
  on public.profiles for update
  using (public.current_role() in ('soumu', 'admin'));

create policy "管理者はプロフィール削除可"
  on public.profiles for delete
  using (public.current_role() = 'admin');

-- ---------------------------------------------------------------
-- 3) attendance_logs：総務・管理者が全社員分を閲覧・修正できるように
-- ---------------------------------------------------------------
create policy "総務・管理者は全打刻ログ閲覧可"
  on public.attendance_logs for select
  using (public.current_role() in ('soumu', 'admin'));

create policy "総務・管理者は打刻ログを登録可"
  on public.attendance_logs for insert
  with check (public.current_role() in ('soumu', 'admin'));

create policy "総務・管理者は打刻ログを削除可"
  on public.attendance_logs for delete
  using (public.current_role() in ('soumu', 'admin'));

-- ---------------------------------------------------------------
-- 4) 打刻修正申請
-- ---------------------------------------------------------------
create table public.attendance_edit_requests (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  type text not null check (type in ('in', 'out')),
  requested_time time not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.attendance_edit_requests enable row level security;

create policy "本人または総務・管理者は修正申請を閲覧可"
  on public.attendance_edit_requests for select
  using (auth.uid() = employee_id or public.current_role() in ('soumu', 'admin'));

create policy "本人は修正申請を作成可"
  on public.attendance_edit_requests for insert
  with check (auth.uid() = employee_id);

create policy "総務・管理者は修正申請を更新可"
  on public.attendance_edit_requests for update
  using (public.current_role() in ('soumu', 'admin'));

-- ---------------------------------------------------------------
-- 5) 有給申請（同じ部署の人に見える・承認できる）
-- ---------------------------------------------------------------
create table public.leave_requests (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  department text,
  start_date date not null,
  end_date date not null,
  days numeric not null default 1,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.leave_requests enable row level security;

create policy "本人・同じ部署・総務管理者は有給申請を閲覧可"
  on public.leave_requests for select
  using (
    auth.uid() = employee_id
    or department = public.current_department()
    or public.current_role() in ('soumu', 'admin')
  );

create policy "本人は有給申請を作成可"
  on public.leave_requests for insert
  with check (auth.uid() = employee_id);

create policy "同じ部署・総務管理者は有給申請を更新(承認)可"
  on public.leave_requests for update
  using (
    department = public.current_department()
    or public.current_role() in ('soumu', 'admin')
  );
