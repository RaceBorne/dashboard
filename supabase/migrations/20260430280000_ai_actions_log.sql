-- Mojito tool action log.
--
-- Every tool call from the AI assistant writes one row here. Used for
-- two things:
--   1. Undo. Tools record the inverse action so undoLast can replay it.
--   2. Telemetry. Per-tool usage counts so we can see which tools the
--      model reaches for and refine the registry over time.
--
-- The rows are ephemeral by intent: a daily cron can prune > 7 days
-- since the undo window is short. For now nothing prunes them.

create table if not exists dashboard_ai_actions (
  id            uuid primary key default gen_random_uuid(),
  tool_name     text not null,
  tool_args     jsonb,
  -- The result the tool returned. Used to surface what was done in the
  -- undo confirmation ("Undo: createIdea 'supercar club'?")
  result        jsonb,
  -- Inverse action descriptor. Shape: { tool: 'deleteIdea', args: {...} }.
  -- When undoLast fires, it reads the most recent row whose undone_at is
  -- still null and dispatches the inverse via fetch back to /api/ai/chat.
  -- Null when the action has no inverse (read-only or fire-and-forget).
  inverse       jsonb,
  -- Track when the action was undone so we don't double-undo.
  undone_at     timestamptz,
  -- Cheap pane-thread association so future telemetry can split by surface.
  surface       text,
  created_at    timestamptz not null default now()
);

create index if not exists dashboard_ai_actions_recent_idx
  on dashboard_ai_actions (created_at desc);

create index if not exists dashboard_ai_actions_undoable_idx
  on dashboard_ai_actions (created_at desc)
  where undone_at is null and inverse is not null;
