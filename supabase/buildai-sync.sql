-- BuildAI sync tables (Phase 2)
-- Apply in your BuildAI-owned Supabase project (NOT the user's connected app DB).

create table if not exists public.buildai_sync_events (
  id bigserial primary key,
  workspace_id text not null,
  ts bigint not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists buildai_sync_events_workspace_id_id_idx
  on public.buildai_sync_events (workspace_id, id desc);

