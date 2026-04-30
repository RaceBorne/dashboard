/**
 * Tool action log — records every Mojito tool call for telemetry + undo.
 *
 * Each tool call writes one row to dashboard_ai_actions. The row includes:
 *   - tool_name
 *   - tool_args (the input the model passed)
 *   - result (the tool's return value)
 *   - inverse (optional descriptor: { tool, args } that undoes this one)
 *   - surface (which page the user was on)
 *
 * Logging is best-effort: a DB failure here MUST NOT break the tool call.
 * If the migration has not been applied yet, every insert fails silently.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface ActionLogInput {
  toolName: string;
  args: unknown;
  result: unknown;
  inverse?: { tool: string; args: Record<string, unknown> } | null;
  surface?: string | null;
}

export async function recordAction(input: ActionLogInput): Promise<string | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('dashboard_ai_actions')
      .insert({
        tool_name: input.toolName,
        tool_args: input.args ?? null,
        result: input.result ?? null,
        inverse: input.inverse ?? null,
        surface: input.surface ?? null,
      })
      .select('id')
      .single();
    if (error) {
      // Don't break the tool call when logging fails. Just warn so we
      // notice if the table is missing.
      console.warn('[ai.actionLog] insert failed', error.message);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (e) {
    console.warn('[ai.actionLog] threw', e);
    return null;
  }
}

export async function listRecentActions(limit = 20) {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_ai_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[ai.actionLog] list failed', error.message);
    return [];
  }
  return (data ?? []) as Array<{
    id: string;
    tool_name: string;
    tool_args: unknown;
    result: unknown;
    inverse: { tool: string; args: Record<string, unknown> } | null;
    undone_at: string | null;
    surface: string | null;
    created_at: string;
  }>;
}

export async function findMostRecentUndoable() {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_ai_actions')
    .select('*')
    .is('undone_at', null)
    .not('inverse', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as {
    id: string;
    tool_name: string;
    tool_args: unknown;
    result: unknown;
    inverse: { tool: string; args: Record<string, unknown> };
    created_at: string;
  };
}

export async function markUndone(id: string) {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { error } = await sb
    .from('dashboard_ai_actions')
    .update({ undone_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}
