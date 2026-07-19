create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text unique not null,
  telegram_chat_id text,
  interest_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  source_url text unique not null,
  title text not null,
  category text,
  description text,
  explanation text,
  venue text,
  starts_at timestamptz,
  city text not null default 'Москва',
  raw_data jsonb not null default '{}'::jsonb,
  first_found_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  reminder_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create index if not exists events_starts_at_idx on public.events(starts_at);
create index if not exists events_city_idx on public.events(city);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.favorites enable row level security;
