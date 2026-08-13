-- ============================================================
-- 追加：交通費申請の内容をデータベースに保存できるようにする
-- Supabaseダッシュボード → SQL Editor に貼り付けて実行してください
-- ============================================================

create table public.expense_items (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  claim_month text not null,
  item_date date,
  route text,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.expense_items enable row level security;

create policy "本人の交通費のみ閲覧可"
  on public.expense_items for select
  using (auth.uid() = employee_id);

create policy "本人の交通費のみ登録可"
  on public.expense_items for insert
  with check (auth.uid() = employee_id);

create policy "本人の交通費のみ更新可"
  on public.expense_items for update
  using (auth.uid() = employee_id);

create policy "本人の交通費のみ削除可"
  on public.expense_items for delete
  using (auth.uid() = employee_id);
