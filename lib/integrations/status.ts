/**
 * Integration status — derived directly from the wireframe data so there's
 * exactly ONE source of truth. Anything that appears as a box on the
 * diagram appears as a row in the connections list, and vice versa.
 *
 * Categories are the diagram's cluster ids (core / outreach / seo / social)
 * so the two views always group by the same taxonomy.
 *
 * Synthetic env markers (those starting with `__`, e.g. `__GITHUB_LIVE`)
 * are computed at request time by the page that owns them — they're hidden
 * from the credentials UI but still count toward the "connected" check
 * when an `envPresent` set is supplied.
 */

import { WIREFRAME_NODES, type WireframeNode } from '@/lib/wireframe';
import type { IntegrationCategory, IntegrationStatus } from '@/lib/types';

const SYNTHETIC_PREFIX = '__';
const isReal = (v: string) => !v.startsWith(SYNTHETIC_PREFIX);

function envHas(name: string): boolean {
  return Boolean(process.env[name] && process.env[name]!.length > 0);
}

function nodeToIntegration(
  n: WireframeNode,
  envPresent?: Set<string>,
): IntegrationStatus {
  const realEnvVars = n.envVars.filter(isReal);
  const envVarsMissing = realEnvVars.filter((v) =>
    envPresent ? !envPresent.has(v) : !envHas(v),
  );
  const connected =
    n.envVars.length === 0
      ? false
      : envPresent
        ? n.envVars.every((v) => envPresent.has(v))
        : n.envVars.every(envHas);
  return {
    key: n.id,
    label: n.label,
    category: (n.cluster ?? 'core') as IntegrationCategory,
    connected,
    envVarsRequired: realEnvVars,
    envVarsMissing,
    docsUrl: n.docsUrl ?? '',
    notes: n.notes,
    synopsis: n.blurb,
    capabilities: n.capabilities,
  };
}

/**
 * Build the integration status list. Pass in the same `envPresent` set
 * the wireframe diagram uses so the two views agree on which services are
 * connected (especially important for synthetic markers like `__GITHUB_LIVE`
 * that aren't actual env vars).
 *
 * The dashboard node itself is filtered out — it's not an external service.
 */
export function getIntegrationStatuses(
  envPresent?: Set<string>,
): IntegrationStatus[] {
  return WIREFRAME_NODES.filter((n) => n.tier !== 'app').map((n) =>
    nodeToIntegration(n, envPresent),
  );
}
