create extension if not exists "pgcrypto";

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  place_name text,
  latitude numeric not null,
  longitude numeric not null,
  visited_at date not null,
  people text,
  memo text,
  tags text[] not null default '{}',
  emotion text,
  image_url text,
  image_path text,
  location_source text not null default 'manual',
  exif_detected boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table memories drop column if exists tag;
alter table memories add column if not exists tags text[] not null default '{}';
alter table memories alter column tags set default '{}';

alter table memories enable row level security;

drop policy if exists "Users can select own memories" on memories;
drop policy if exists "Users can insert own memories" on memories;
drop policy if exists "Users can update own memories" on memories;
drop policy if exists "Users can delete own memories" on memories;

create policy "Users can select own memories"
on memories for select
using (auth.uid() = user_id);

create policy "Users can insert own memories"
on memories for insert
with check (auth.uid() = user_id);

create policy "Users can update own memories"
on memories for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own memories"
on memories for delete
using (auth.uid() = user_id);

create or replace function set_memories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memories_set_updated_at on memories;
create trigger memories_set_updated_at
before update on memories
for each row
execute function set_memories_updated_at();
