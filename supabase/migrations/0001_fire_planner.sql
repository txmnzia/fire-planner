-- FIRE Planner: own schema on the shared txmnzia-dbs project.
-- Run once in the Supabase SQL editor. Safe to re-run.
-- Then: Project Settings > Data API > Exposed schemas > ADD fire_planner (keep the others).
--
-- The app's state is one versioned JSON payload that it always loads and saves
-- whole, with last-write-wins on a millisecond timestamp (see the state-and-sync
-- skill). One row per user keeps that contract exactly; `ts` mirrors payload.ts.

create schema if not exists fire_planner;
comment on schema fire_planner is 'txmnzia/fire-planner';
grant usage on schema fire_planner to anon, authenticated, service_role;
alter default privileges in schema fire_planner
  grant select, insert, update, delete on tables to authenticated;

create table if not exists fire_planner.state (
  user_id    uuid   primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb  not null,
  ts         bigint not null,
  updated_at timestamptz not null default now()
);

alter table fire_planner.state enable row level security;
drop policy if exists "own rows" on fire_planner.state;
create policy "own rows" on fire_planner.state
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on all tables in schema fire_planner to authenticated;
grant all on all tables in schema fire_planner to service_role;
