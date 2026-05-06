-- BuildAI core tables (Auth + Credits + Billing)
-- Apply in your BuildAI-owned Supabase project.
-- Assumes Supabase Auth is enabled.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credits_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts bigint not null,
  kind text not null, -- monthly_grant | top_up | refund | usage_charge
  amount_usd numeric(12,2) not null, -- positive or negative
  meta jsonb not null default '{}'::jsonb
);

create index if not exists credits_ledger_user_ts_idx on public.credits_ledger(user_id, ts desc);

create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts bigint not null,
  provider text not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric(12,6) not null,
  charged_usd numeric(12,2) not null,
  request_id text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists usage_events_user_ts_idx on public.usage_events(user_id, ts desc);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.deployments (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  version_id text,
  site_name text not null,
  repo_name text not null,
  repo_url text not null,
  url text not null,
  vercel_deployment_id text,
  ts bigint not null
);

create index if not exists deployments_user_ts_idx on public.deployments(user_id, ts desc);

-- Supabase BYO connections (user-level; reusable across BuildAI projects)
create table if not exists public.supabase_connections (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_ref text not null,
  supabase_url text not null,
  anon_key text not null,
  region text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_ref)
);

create index if not exists supabase_connections_user_updated_idx on public.supabase_connections(user_id, updated_at desc);

-- OAuth tokens for 3rd-party integrations (server-only; encrypted payload)
create table if not exists public.oauth_tokens (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, -- e.g. 'supabase'
  token_encrypted text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.oauth_states (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state text not null,
  code_verifier text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (provider, state)
);

create index if not exists oauth_states_provider_expires_idx on public.oauth_states(provider, expires_at desc);

-- RLS (read-only for user; server should write with service_role).
alter table public.profiles enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.usage_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.deployments enable row level security;
alter table public.supabase_connections enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.oauth_states enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

create policy "ledger_select_own" on public.credits_ledger
  for select using (auth.uid() = user_id);

create policy "usage_select_own" on public.usage_events
  for select using (auth.uid() = user_id);

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "deployments_select_own" on public.deployments
  for select using (auth.uid() = user_id);

create policy "supabase_connections_select_own" on public.supabase_connections
  for select using (auth.uid() = user_id);

-- oauth_tokens/oauth_states: no SELECT policy. Server uses service_role only.

