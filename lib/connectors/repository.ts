/**
 * Supabase-backed repository for org_integrations.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { encryptJson, decryptJson, encryptionEnabled } from './crypto';

// Phase 1: everything runs under a single 'default' org. Phase 2 swaps
// this for real org ids from the session.
export const DEFAULT_ORG_ID = 'default';

export interface IntegrationRow {
  id: string;
  org_id: string;
  provider: string;
  /** Decrypted credential JSON — only populated when read() is given `includeSecrets: true`. */
  credentials?: Record<string, string>;
  config: Record<string, unknown>;
  status: 'not_configured' | 'configured' | 'live' | 'error' | 'degraded';
  connected_at: string | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  updated_at: string;
}

export async function listIntegrations(opts: {
  orgId?: string;
  includeSecrets?: boolean;
} = {}): Promise<IntegrationRow[]> {
  const supa = createSupabaseAdmin();
  if (!supa) return [];
  const orgId = opts.orgId ?? DEFAULT_ORG_ID;
  const { data, error } = await supa
    .from('org_integrations')
    .select(
      'id, org_id, provider, credentials, encrypted, config, status, connected_at, last_tested_at, last_test_status, last_test_error, updated_at',
    )
    .eq('org_id', orgId);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    org_id: row.org_id,
    provider: row.provider,
    credentials: opts.includeSecrets
      ? (decryptJson<Record<string, string>>(row.credentials ?? '', row.encrypted) ?? {})
      : undefined,
    config: (row.config ?? {}) as Record<string, unknown>,
    status: row.status as IntegrationRow['status'],
    connected_at: row.connected_at,
    last_tested_at: row.last_tested_at,
    last_test_status: row.last_test_status,
    last_test_error: row.last_test_error,
    updated_at: row.updated_at,
  }));
}

export async function getIntegration(
  provider: string,
  opts: { orgId?: string; includeSecrets?: boolean } = {},
): Promise<IntegrationRow | null> {
  const supa = createSupabaseAdmin();
  if (!supa) return null;
  const orgId = opts.orgId ?? DEFAULT_ORG_ID;
  const { data } = await supa
    .from('org_integrations')
    .select(
      'id, org_id, provider, credentials, encrypted, config, status, connected_at, last_tested_at, last_test_status, last_test_error, updated_at',
    )
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    org_id: data.org_id,
    provider: data.provider,
    credentials: opts.includeSecrets
      ? (decryptJson<Record<string, string>>(data.credentials ?? '', data.encrypted) ?? {})
      : undefined,
    config: (data.config ?? {}) as Record<string, unknown>,
    status: data.status as IntegrationRow['status'],
    connected_at: data.connected_at,
    last_tested_at: data.last_tested_at,
    last_test_status: data.last_test_status,
    last_test_error: data.last_test_error,
    updated_at: data.updated_at,
  };
}

export async function upsertIntegration(args: {
  provider: string;
  credentials: Record<string, string>;
  config?: Record<string, unknown>;
  orgId?: string;
  status?: IntegrationRow['status'];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supa = createSupabaseAdmin();
  if (!supa) return { ok: false, error: 'Supabase unavailable' };
  const orgId = args.orgId ?? DEFAULT_ORG_ID;
  // Strip empty strings so we don't clobber existing secrets with ''.
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(args.credentials)) {
    if (typeof v === 'string' && v !== '') cleaned[k] = v;
  }
  // Merge onto any existing credentials rather than replacing wholesale —
  // secret fields left blank in the form must preserve the previous value.
  const existing = await getIntegration(args.provider, { orgId, includeSecrets: true });
  const merged = { ...(existing?.credentials ?? {}), ...cleaned };
  const encrypted = encryptionEnabled();
  const payload = encryptJson(merged);
  const hasRequired = Object.keys(merged).length > 0;
  const status: IntegrationRow['status'] = args.status ?? (hasRequired ? 'configured' : 'not_configured');
  const { error } = await supa.from('org_integrations').upsert(
    {
      org_id: orgId,
      provider: args.provider,
      credentials: payload,
      encrypted,
      config: args.config ?? existing?.config ?? {},
      status,
      connected_at: hasRequired ? new Date().toISOString() : null,
    },
    { onConflict: 'org_id,provider' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteIntegration(
  provider: string,
  opts: { orgId?: string } = {},
): Promise<{ ok: boolean }> {
  const supa = createSupabaseAdmin();
  if (!supa) return { ok: false };
  const orgId = opts.orgId ?? DEFAULT_ORG_ID;
  const { error } = await supa
    .from('org_integrations')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', provider);
  return { ok: !error };
}

export async function recordTestOutcome(args: {
  provider: string;
  ok: boolean;
  error?: string;
  orgId?: string;
}): Promise<void> {
  const supa = createSupabaseAdmin();
  if (!supa) return;
  const orgId = args.orgId ?? DEFAULT_ORG_ID;
  await supa
    .from('org_integrations')
    .update({
      status: args.ok ? 'live' : 'error',
      last_tested_at: new Date().toISOString(),
      last_test_status: args.ok ? 'ok' : 'error',
      last_test_error: args.error ?? null,
    })
    .eq('org_id', orgId)
    .eq('provider', args.provider);
}
