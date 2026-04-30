/**
 * Research log — shared memory for the play-level AI agent.
 *
 * Each Strategy stage (Market analysis, Target profile, Synopsis,
 * Handoff) and the Discover Agent at the end all read and write to
 * this log. The Discover Agent treats prior log entries as ground
 * truth so it does not re-run work that earlier stages have already
 * paid for.
 *
 * The log is append-only JSONB on dashboard_strategy_briefs.research_log.
 * Each entry: { kind, at, payload } where kind identifies the stage
 * that wrote it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ResearchLogKind =
  | 'market_sizing'
  | 'persona'
  | 'synopsis'
  | 'auto_fill'
  | 'bootstrap'
  | 'agent_search'
  | 'agent_note';

export interface ResearchLogEntry {
  kind: ResearchLogKind;
  at: string;
  payload: Record<string, unknown>;
}

export async function appendResearchLog(
  supabase: SupabaseClient,
  playId: string,
  entry: Omit<ResearchLogEntry, 'at'>,
): Promise<void> {
  const at = new Date().toISOString();
  const fullEntry: ResearchLogEntry = { ...entry, at };
  // Read-modify-write so we keep a strict insertion order without
  // depending on a Postgres array op + jsonb syntax.
  const { data } = await supabase
    .from('dashboard_strategy_briefs')
    .select('research_log')
    .eq('play_id', playId)
    .maybeSingle();
  const cur = (data?.research_log ?? []) as ResearchLogEntry[];
  const next = [...cur.slice(-99), fullEntry]; // cap at last 100 entries
  await supabase
    .from('dashboard_strategy_briefs')
    .update({ research_log: next })
    .eq('play_id', playId);
}

export async function readResearchLog(
  supabase: SupabaseClient,
  playId: string,
): Promise<ResearchLogEntry[]> {
  const { data } = await supabase
    .from('dashboard_strategy_briefs')
    .select('research_log')
    .eq('play_id', playId)
    .maybeSingle();
  return (data?.research_log ?? []) as ResearchLogEntry[];
}

/**
 * Format the log as a human-readable narrative for inclusion in the
 * Discover Agent's prompt. Compact: just the headline of each entry.
 */
export function formatResearchLogForPrompt(entries: ResearchLogEntry[]): string {
  if (entries.length === 0) return '(empty)';
  const lines: string[] = [];
  for (const e of entries) {
    if (e.kind === 'market_sizing') {
      const p = e.payload as { marketSize?: string; competitors?: string[]; intentSignals?: string[] };
      lines.push(
        '[Market sizing] size: ' + (p.marketSize ?? 'unknown') +
          (p.competitors && p.competitors.length > 0 ? '; competitors: ' + p.competitors.slice(0, 3).join(', ') : '') +
          (p.intentSignals && p.intentSignals.length > 0 ? '; intent: ' + p.intentSignals.slice(0, 2).join(', ') : ''),
      );
    } else if (e.kind === 'persona') {
      const p = e.payload as { persona?: string };
      if (p.persona) lines.push('[Persona] ' + p.persona.slice(0, 280));
    } else if (e.kind === 'synopsis') {
      const p = e.payload as { synopsis?: string };
      if (p.synopsis) lines.push('[Synopsis] ' + p.synopsis.slice(0, 280));
    } else if (e.kind === 'bootstrap') {
      const p = e.payload as { note?: string };
      if (p.note) lines.push('[Boot] ' + p.note.slice(0, 200));
    } else if (e.kind === 'agent_note') {
      const p = e.payload as { note?: string };
      if (p.note) lines.push('[Note] ' + p.note.slice(0, 200));
    } else if (e.kind === 'agent_search') {
      const p = e.payload as { tool?: string; query?: string; count?: number };
      lines.push('[Search] ' + (p.tool ?? '?') + ' "' + (p.query ?? '') + '" -> ' + (p.count ?? 0) + ' hits');
    } else if (e.kind === 'auto_fill') {
      lines.push('[Auto-fill] brief gaps written by Claude');
    }
  }
  return lines.slice(-25).join('\n');
}
