-- ============================================================
-- Panini WC2026 Swap Tracker — Supabase Schema
-- Paste this entire file into Supabase SQL Editor and click RUN.
-- ============================================================

-- 1) Players table: 5 slots, renameable
create table if not exists players (
  id           text primary key,
  display_name text not null,
  color        text not null default '#3b82f6',
  emoji        text not null default '🔵',
  sort_order   int  not null default 0
);

-- 2) Per-player sticker status overrides
create table if not exists sticker_status (
  player_id   text not null references players(id) on delete cascade,
  sticker_id  text not null,
  status      text not null check (status in ('have','double','missing')),
  updated_at  timestamptz not null default now(),
  primary key (player_id, sticker_id)
);

-- 3) Traded swaps log (per unordered player pair)
create table if not exists swaps_done (
  pair_key    text not null,
  sticker_id  text not null,
  done_at     timestamptz not null default now(),
  primary key (pair_key, sticker_id)
);

-- 4) Seed 5 player slots
insert into players (id, display_name, color, emoji, sort_order) values
  ('p1', 'Rédha',    '#3b82f6', '🔵', 1),
  ('p2', 'Mat',      '#10b981', '🟢', 2),
  ('p3', 'Friend 1', '#f59e0b', '🟡', 3),
  ('p4', 'Friend 2', '#a855f7', '🟣', 4),
  ('p5', 'Friend 3', '#ef4444', '🔴', 5)
on conflict (id) do nothing;

-- 5) Row Level Security: open read/write for anon (small private group; URL is the access control)
alter table players        enable row level security;
alter table sticker_status enable row level security;
alter table swaps_done     enable row level security;

drop policy if exists "open_read_players"  on players;
drop policy if exists "open_write_players" on players;
drop policy if exists "open_read_status"   on sticker_status;
drop policy if exists "open_write_status"  on sticker_status;
drop policy if exists "open_read_done"     on swaps_done;
drop policy if exists "open_write_done"    on swaps_done;

create policy "open_read_players"  on players        for select using (true);
create policy "open_write_players" on players        for all    using (true) with check (true);
create policy "open_read_status"   on sticker_status for select using (true);
create policy "open_write_status"  on sticker_status for all    using (true) with check (true);
create policy "open_read_done"     on swaps_done     for select using (true);
create policy "open_write_done"    on swaps_done     for all    using (true) with check (true);

-- 6) Realtime: enable live updates (safe to re-run)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='sticker_status')
    then alter publication supabase_realtime add table sticker_status; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='swaps_done')
    then alter publication supabase_realtime add table swaps_done; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='players')
    then alter publication supabase_realtime add table players; end if;
end $$;
