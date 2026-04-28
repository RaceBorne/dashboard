-- AI Assistant pane threads. Persistent, page-aware AI chat that lives in
-- the right rail of every dashboard surface. Each thread is keyed by
-- surface (e.g., 'campaigns', 'discovery:<playId>', 'enrichment:<companyId>')
-- so the operator's conversation about that thing keeps building up across
-- sessions.

create table if not exists public.dashboard_ai_threads (
  id uuid primary key default gen_random_uuid(),
  surface text not null,
  context jsonb,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dashboard_ai_threads_surface_idx
  on public.dashboard_ai_threads (surface);

create table if not exists public.dashboard_ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dashboard_ai_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_ai_messages_thread_idx
  on public.dashboard_ai_messages (thread_id, created_at);
