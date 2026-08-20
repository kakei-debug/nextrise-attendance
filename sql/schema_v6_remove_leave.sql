-- ============================================================
-- 有給申請機能の削除にともなうデータベース側の後片付け
-- Supabaseダッシュボード → SQL Editor に貼り付けて実行してください
-- ============================================================

drop table if exists public.leave_requests;

alter table public.profiles drop column if exists leave_granted_days;
