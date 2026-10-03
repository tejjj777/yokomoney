-- YOKO! sync: run this once in Supabase → SQL Editor → New query → Run.
-- Each person gets one row. The app locks the data on the device before sending it,
-- so these columns only ever hold encrypted text. Row-level security means a signed-in
-- person can only read or change their own row.

create table if not exists public.vaults (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kdf          jsonb  not null,                 -- salts and rounds for unlocking (not secret)
  key_pass     text   not null,                 -- data key, locked with the passphrase
  key_recovery text   not null,                 -- data key, locked with the recovery key
  data         text   not null check (octet_length(data) < 5000000),   -- the encrypted app data
  version      bigint not null default 1,       -- goes up by one on every save
  device       text,
  updated_at   timestamptz not null default now()
);

alter table public.vaults enable row level security;

drop policy if exists "read own vault"   on public.vaults;
drop policy if exists "add own vault"    on public.vaults;
drop policy if exists "change own vault" on public.vaults;
drop policy if exists "remove own vault" on public.vaults;
create policy "read own vault"   on public.vaults for select to authenticated using ((select auth.uid()) = user_id);
create policy "add own vault"    on public.vaults for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "change own vault" on public.vaults for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "remove own vault" on public.vaults for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.vaults from anon;
grant select, insert, update, delete on public.vaults to authenticated;

-- The server sets the time of every save
create or replace function public.vaults_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists vaults_touch on public.vaults;
create trigger vaults_touch before insert or update on public.vaults
  for each row execute function public.vaults_touch();

-- "Delete account" in the app: removes the sign-in and (through the cascade) the synced data
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
