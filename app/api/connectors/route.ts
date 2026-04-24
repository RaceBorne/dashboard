import { NextResponse } from 'next/server';
import { CONNECTORS } from '@/lib/connectors/catalogue';
import { listIntegrations } from '@/lib/connectors/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/connectors
 *
 * Returns the combined view:
 *   - every connector in the catalogue
 *   - merged with whatever the current org has saved (status, config,
 *     last_tested_at) from org_integrations
 *   - secrets redacted — only a "has value" boolean per field so the UI
 *     can show the real state without sending credentials over the wire
 *
 * Also tells the UI whether the encryption key is set so we can surface
 * a small warning when it's not.
 */
export async function GET() {
  const rows = await listIntegrations({ includeSecrets: false });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const envKeys: Record<string, boolean> = {};
  for (const c of CONNECTORS) {
    for (const [fieldKey, envName] of Object.entries(c.envFallback ?? {})) {
      envKeys[c.id + ':' + fieldKey] = Boolean(process.env[envName]);
    }
  }

  const items = CONNECTORS.map((spec) => {
    const row = byProvider.get(spec.id);
    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      module: spec.module,
      icon: spec.icon,
      description: spec.description,
      docsUrl: spec.docsUrl,
      oauth: spec.oauth ?? false,
      hasTest: Boolean(spec.tester),
      fields: spec.fields,
      status: row?.status ?? 'not_configured',
      config: (row?.config ?? {}) as Record<string, unknown>,
      connectedAt: row?.connected_at ?? null,
      lastTestedAt: row?.last_tested_at ?? null,
      lastTestStatus: row?.last_test_status ?? null,
      lastTestError: row?.last_test_error ?? null,
      hasEnvFallback: spec.fields.some(
        (f) => envKeys[spec.id + ':' + f.key] === true,
      ),
    };
  });

  return NextResponse.json({
    ok: true,
    connectors: items,
    encryptionEnabled: Boolean(process.env.CONNECTOR_ENCRYPTION_KEY),
  });
}
