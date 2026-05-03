-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── user_profiles ────────────────────────────────────────────────────────────

create table if not exists public.user_profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  display_name      text,
  avatar_url        text,
  created_at        timestamptz not null default now(),
  last_active_at    timestamptz,
  total_dashboards  int not null default 0
);

alter table public.user_profiles enable row level security;

create policy "Users can view their own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── sessions ─────────────────────────────────────────────────────────────────

create table if not exists public.sessions (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  file_name               text not null,
  user_prompt             text not null,
  dashboard_title         text not null,
  dashboard_narrative     text not null default '',
  row_count               int not null default 0,
  column_count            int not null default 0,
  chart_count             int not null default 0,
  viz_ready_rows          jsonb,
  engineered_meta         jsonb,
  dashboard_blueprint     jsonb not null,
  selected_chart_ids      text[] not null default '{}',
  truncated_for_storage   boolean not null default false,
  created_at              timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Users can view their own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- Keep total_dashboards in sync
create or replace function public.increment_dashboard_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.user_profiles
  set total_dashboards = total_dashboards + 1
  where id = new.user_id;
  return new;
end;
$$;

create or replace function public.decrement_dashboard_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.user_profiles
  set total_dashboards = greatest(0, total_dashboards - 1)
  where id = old.user_id;
  return old;
end;
$$;

drop trigger if exists on_session_created on public.sessions;
create trigger on_session_created
  after insert on public.sessions
  for each row execute procedure public.increment_dashboard_count();

drop trigger if exists on_session_deleted on public.sessions;
create trigger on_session_deleted
  after delete on public.sessions
  for each row execute procedure public.decrement_dashboard_count();

-- ─── chart_usage ──────────────────────────────────────────────────────────────

create table if not exists public.chart_usage (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  chart_type    text not null,
  use_count     int not null default 0,
  last_used_at  timestamptz not null default now(),
  unique (user_id, chart_type)
);

alter table public.chart_usage enable row level security;

create policy "Users can view their own chart usage"
  on public.chart_usage for select
  using (auth.uid() = user_id);

create policy "Users can insert their own chart usage"
  on public.chart_usage for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own chart usage"
  on public.chart_usage for update
  using (auth.uid() = user_id);
