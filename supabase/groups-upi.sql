-- YOKO! Student · Live groups: share each member's UPI ID with the group.
-- Run once in Supabase → SQL Editor. Safe to run again.

alter table public.group_members add column if not exists upi_id text;

-- Each person can change only their own member row (their name and UPI ID).
drop policy if exists "update own member row" on public.group_members;
create policy "update own member row" on public.group_members
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Members already see each other's rows through the existing read policy, so the UPI ID shows up for everyone.
