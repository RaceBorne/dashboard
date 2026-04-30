/**
 * Application context.
 *
 * The "context" is the top-level "which company are we prospecting AS"
 * scope. Currently lightweight: it changes the brand grounding fed to
 * the AI, the search defaults seeded into Strategy briefs, and the
 * brand identity surfaced in the Context page. Plays / discovery /
 * shortlist remain shared across contexts for now.
 *
 * The active context is stored in a cookie. Server components read
 * it with cookies() from next/headers. Client components read it via
 * the TopBar dropdown which holds the cookie's value as a prop.
 *
 * Hard cap: 3 contexts per install, enforced in saveContext().
 */

import { cookies } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const ACTIVE_CONTEXT_COOKIE = 'evari_active_context';
export const MAX_CONTEXTS = 3;

export interface AppContext {
  id: string;
  slug: string;
  name: string;
  description: string;
  voice: string;
  agentSystemPrompt: string | null;
  defaultIndustries: string[];
  defaultGeographies: string[];
  defaultPersona: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  slug: string;
  name: string;
  description: string;
  voice: string;
  agent_system_prompt: string | null;
  default_industries: string[] | null;
  default_geographies: string[] | null;
  default_persona: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function rowToContext(r: Row): AppContext {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    voice: r.voice,
    agentSystemPrompt: r.agent_system_prompt,
    defaultIndustries: r.default_industries ?? [],
    defaultGeographies: r.default_geographies ?? [],
    defaultPersona: r.default_persona,
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listContexts(): Promise<AppContext[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_contexts')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map(rowToContext);
}

/**
 * Returns the currently-active context. Reads the cookie set by
 * setActiveContextId(). Falls back to the default-flagged context
 * (Evari) if the cookie is missing or points to a deleted row.
 */
export async function getActiveContext(): Promise<AppContext | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;

  let cookieId: string | undefined;
  try {
    const c = await cookies();
    cookieId = c.get(ACTIVE_CONTEXT_COOKIE)?.value;
  } catch {
    // cookies() unavailable (e.g. during a non-request render). Fall
    // through to the default lookup.
  }

  if (cookieId) {
    const { data } = await sb
      .from('dashboard_contexts')
      .select('*')
      .eq('id', cookieId)
      .maybeSingle();
    if (data) return rowToContext(data as Row);
  }

  // Fall back to the default-flagged row.
  const { data: def } = await sb
    .from('dashboard_contexts')
    .select('*')
    .eq('is_default', true)
    .maybeSingle();
  if (def) return rowToContext(def as Row);

  // No default flagged — return the first row by created_at.
  const { data: any1 } = await sb
    .from('dashboard_contexts')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return any1 ? rowToContext(any1 as Row) : null;
}

export interface SaveContextInput {
  id?: string;
  slug: string;
  name: string;
  description: string;
  voice: string;
  agentSystemPrompt?: string | null;
  defaultIndustries: string[];
  defaultGeographies: string[];
  defaultPersona?: string | null;
}

/**
 * Insert or update a context. Enforces MAX_CONTEXTS = 3 on insert.
 * Returns the saved row, or null if the cap would be exceeded.
 */
export async function saveContext(input: SaveContextInput): Promise<AppContext | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;

  if (!input.id) {
    // New context. Check the cap.
    const { count } = await sb
      .from('dashboard_contexts')
      .select('*', { count: 'exact', head: true });
    if ((count ?? 0) >= MAX_CONTEXTS) return null;
  }

  const payload = {
    slug: input.slug.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description,
    voice: input.voice,
    agent_system_prompt: input.agentSystemPrompt ?? null,
    default_industries: input.defaultIndustries,
    default_geographies: input.defaultGeographies,
    default_persona: input.defaultPersona ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await sb
      .from('dashboard_contexts')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();
    if (error || !data) return null;
    return rowToContext(data as Row);
  }

  const { data, error } = await sb
    .from('dashboard_contexts')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) return null;
  return rowToContext(data as Row);
}

/**
 * Delete a non-default context. The default context (Evari) cannot
 * be removed because it acts as the fallback for getActiveContext().
 */
export async function deleteContext(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { data: row } = await sb
    .from('dashboard_contexts')
    .select('is_default')
    .eq('id', id)
    .maybeSingle();
  if (!row || (row as { is_default: boolean }).is_default) return false;
  const { error } = await sb.from('dashboard_contexts').delete().eq('id', id);
  return !error;
}
