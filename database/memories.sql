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
  tag text,
  emotion text,
  image_url text,
  image_path text,
  location_source text not null default 'manual',
  exif_detected boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table memories enable row level security;

create policy "Users can select own memories"
on memories for select
using (auth.uid() = user_id);

create policy "Users can insert own memories"
on memories for insert
with check (auth.uid() = user_id);

create policy "Users can update own memories"
on memories for update
using (auth.uid() = user_id);

create policy "Users can delete own memories"
on memories for delete
using (auth.uid() = user_id);
