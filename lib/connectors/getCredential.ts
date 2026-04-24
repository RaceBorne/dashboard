/**
 * Unified credential read.
 *
 * Usage:
 *   const { storeDomain, adminAccessToken } = await getCredentials('shopify');
 *
 * Reads from org_integrations first. Falls back to env vars listed in the
 * catalogue when the Supabase row is empty so the Evari deployment keeps
 * working unchanged during the rollout. Phase 2 drops the env fallback.
 */

import { getConnectorSpec } from './catalogue';
import { getIntegration } from './repository';

export async function getCredentials(
  providerId: string,
  opts: { orgId?: string } = {},
): Promise<Record<string, string>> {
  const spec = getConnectorSpec(providerId);
  if (!spec) return {};
  const row = await getIntegration(providerId, {
    orgId: opts.orgId,
    includeSecrets: true,
  });
  const fromRow = row?.credentials ?? {};
  const fromConfig = (row?.config ?? {}) as Record<string, unknown>;

  const out: Record<string, string> = {};
  for (const field of spec.fields) {
    const fromDb = fromRow[field.key];
    if (fromDb) {
      out[field.key] = fromDb;
      continue;
    }
    const fromConfigVal = fromConfig[field.key];
    if (typeof fromConfigVal === 'string' && fromConfigVal) {
      out[field.key] = fromConfigVal;
      continue;
    }
    const envName = spec.envFallback?.[field.key];
    if (envName) {
      const envVal = process.env[envName];
      if (envVal) {
        out[field.key] = envVal;
        continue;
      }
    }
    if (field.default) {
      out[field.key] = field.default;
    }
  }
  return out;
}

export async function hasCredential(
  providerId: string,
  opts: { orgId?: string } = {},
): Promise<boolean> {
  const spec = getConnectorSpec(providerId);
  if (!spec) return false;
  const creds = await getCredentials(providerId, opts);
  for (const field of spec.fields) {
    if (field.optional) continue;
    if (!creds[field.key]) return false;
  }
  return true;
}
