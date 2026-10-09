-- YOKO! Student · Live groups: let people edit and delete expenses they paid for.
-- Run once in Supabase → SQL Editor. Safe to run again.

-- Expenses: only the member who paid can change or delete them.
drop policy if exists "payer can update expense" on public.group_expenses;
create policy "payer can update expense" on public.group_expenses
  for update to authenticated
  using (exists (select 1 from public.group_members m where m.id = group_expenses.paid_by and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.group_members m where m.id = group_expenses.paid_by and m.user_id = (select auth.uid())));

drop policy if exists "payer can delete expense" on public.group_expenses;
create policy "payer can delete expense" on public.group_expenses
  for delete to authenticated
  using (exists (select 1 from public.group_members m where m.id = group_expenses.paid_by and m.user_id = (select auth.uid())));

-- Splits: the payer of the parent expense can remove and re-add its splits when editing.
drop policy if exists "payer can delete splits" on public.group_expense_splits;
create policy "payer can delete splits" on public.group_expense_splits
  for delete to authenticated
  using (exists (
    select 1 from public.group_expenses e join public.group_members m on m.id = e.paid_by
    where e.id = group_expense_splits.expense_id and m.user_id = (select auth.uid())));

-- Deletes and edits show up live for everyone in the group.
alter table public.group_expenses replica identity full;
alter table public.group_expense_splits replica identity full;
