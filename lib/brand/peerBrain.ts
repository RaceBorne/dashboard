/**
 * Peer Brain.
 *
 * A persistent knowledge graph of brand to peer-brand relationships
 * that lives in dashboard_brand_peers. Built up over time by AI
 * suggestions and reinforced by user actions (Add to list, Send to
 * shortlist).
 *
 * Why this exists: hanging every Similar lookup on Google or even on
 * a fresh AI call is slow, expensive, and produces zero compounding
 * value. The brain inverts that: every accepted peer makes the next
 * search faster and better. After two weeks of normal use, most peer
 * lookups should hit cached entries with confidence above 0.6 and
 * never need an AI round trip at all.
 *
 * Confidence math:
 *   - AI seeded:           0.5
 *   - Web-verified:        0.7  (+0.2 over AI)
 *   - User Added to list:  +0.2
 *   - User Sent to short:  +0.4
 *   - Capped at 1.0
 *
 * Source precedence (highest to lowest): user > verified > ai > seed.
 * On upsert, we keep the higher-precedence source and the higher
 * confidence. Records never get downgraded.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type PeerSource = 'ai' | 'user' | 'verified' | 'seed';

export interface BrainPeer {
  domain: string;
  name: string | null;
  why: string | null;
  confidence: number;
  source: PeerSource;
}

export interface BrainStats {
  referenceCount: number;
  peerCount: number;
}

const SOURCE_RANK: Record<PeerSource, number> = {
  seed: 0,
  ai: 1,
  verified: 2,
  user: 3,
};

function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

function clampConfidence(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Look up known peers for a reference brand.
 *
 * Returns peers ordered by confidence desc, then by recency. Filters
 * out anything in skipDomains so we don't re-suggest things already
 * on the operator's list. Touches use_count + last_used_at on the
 * returned rows so the brain learns which entries are useful.
 */
export async function lookupPeers(
  referenceDomain: string,
  opts: { limit?: number; skipDomains?: string[]; minConfidence?: number } = {},
): Promise<BrainPeer[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const ref = normalizeDomain(referenceDomain);
  const skip = new Set([ref, ...(opts.skipDomains ?? []).map(normalizeDomain)]);
  const minConf = opts.minConfidence ?? 0;
  const fetchLimit = Math.min((opts.limit ?? 8) * 2 + skip.size, 50);

  const { data, error } = await sb
    .from('dashboard_brand_peers')
    .select('peer_domain, peer_name, why, confidence, source')
    .eq('reference_domain', ref)
    .gte('confidence', minConf)
    .order('confidence', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(fetchLimit);

  if (error || !data) return [];

  const filtered = (data as Array<{
    peer_domain: string;
    peer_name: string | null;
    why: string | null;
    confidence: number;
    source: PeerSource;
  }>)
    .filter((r) => !skip.has(normalizeDomain(r.peer_domain)))
    .slice(0, opts.limit ?? 8);

  if (filtered.length === 0) return [];

  // Touch use_count + last_used_at so the brain knows these entries
  // are still hot. Best-effort; failure here is non-fatal.
  const ids = filtered.map((r) => r.peer_domain);
  // Best effort touch of last_used_at; failure here is non fatal.
  try {
    await sb
      .from('dashboard_brand_peers')
      .update({ last_used_at: new Date().toISOString() })
      .eq('reference_domain', ref)
      .in('peer_domain', ids);
  } catch {
    // swallow
  }

  return filtered.map((r) => ({
    domain: normalizeDomain(r.peer_domain),
    name: r.peer_name,
    why: r.why,
    confidence: r.confidence,
    source: r.source,
  }));
}

/**
 * Record peers found by an AI call (or any other source) into the
 * brain. Idempotent on (reference_domain, peer_domain). On conflict
 * we keep the stronger source and the higher confidence so user
 * confirmations never get overwritten by lower-trust AI rerolls.
 */
export async function recordPeers(
  referenceDomain: string,
  peers: Array<{ domain: string; name?: string | null; why?: string | null }>,
  opts: { source: PeerSource; confidence: number },
): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb || peers.length === 0) return;
  const ref = normalizeDomain(referenceDomain);
  const incomingConfidence = clampConfidence(opts.confidence);
  const incomingRank = SOURCE_RANK[opts.source];

  // Read existing rows for these domains so we can take the max on
  // confidence and the higher precedence on source. One round trip,
  // then a single upsert.
  const peerDomains = peers.map((p) => normalizeDomain(p.domain)).filter(Boolean);
  if (peerDomains.length === 0) return;
  const { data: existing } = await sb
    .from('dashboard_brand_peers')
    .select('peer_domain, confidence, source')
    .eq('reference_domain', ref)
    .in('peer_domain', peerDomains);

  const byDomain = new Map<string, { confidence: number; source: PeerSource }>();
  for (const r of (existing ?? []) as Array<{ peer_domain: string; confidence: number; source: PeerSource }>) {
    byDomain.set(normalizeDomain(r.peer_domain), { confidence: r.confidence, source: r.source });
  }

  const rowsToUpsert = peers.map((p) => {
    const dom = normalizeDomain(p.domain);
    const prior = byDomain.get(dom);
    const finalConfidence = prior ? Math.max(prior.confidence, incomingConfidence) : incomingConfidence;
    const finalSource: PeerSource = prior && SOURCE_RANK[prior.source] > incomingRank ? prior.source : opts.source;
    return {
      reference_domain: ref,
      peer_domain: dom,
      peer_name: p.name ?? null,
      why: p.why ?? null,
      confidence: finalConfidence,
      source: finalSource,
      updated_at: new Date().toISOString(),
    };
  });

  await sb
    .from('dashboard_brand_peers')
    .upsert(rowsToUpsert, { onConflict: 'reference_domain,peer_domain' });
}

/**
 * Bump confidence on a single peer, used when the operator clicks
 * Add to list or Send to shortlist. Promotes source to 'user' and
 * caps confidence at 1.0. Best-effort: an upsert if the row doesn't
 * exist yet (in case the user added a peer that wasn't in the brain).
 */
export async function bumpConfidence(
  referenceDomain: string,
  peerDomain: string,
  opts: { delta: number; peerName?: string | null; why?: string | null },
): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  const ref = normalizeDomain(referenceDomain);
  const peer = normalizeDomain(peerDomain);
  if (!ref || !peer) return;

  const { data: existing } = await sb
    .from('dashboard_brand_peers')
    .select('confidence')
    .eq('reference_domain', ref)
    .eq('peer_domain', peer)
    .maybeSingle();

  const baseConfidence = (existing?.confidence as number | undefined) ?? 0.5;
  const nextConfidence = clampConfidence(baseConfidence + opts.delta);

  await sb
    .from('dashboard_brand_peers')
    .upsert(
      {
        reference_domain: ref,
        peer_domain: peer,
        peer_name: opts.peerName ?? null,
        why: opts.why ?? null,
        confidence: nextConfidence,
        source: 'user',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'reference_domain,peer_domain' },
    );
}

/**
 * High level summary of how big the brain has grown. Surfaced in the
 * Discovery footer so the operator can see compounding happen.
 */
export async function getBrainStats(): Promise<BrainStats> {
  const sb = createSupabaseAdmin();
  if (!sb) return { referenceCount: 0, peerCount: 0 };

  // Two cheap counts. Could be one query with a CTE but two is fine.
  const { count: peerCount } = await sb
    .from('dashboard_brand_peers')
    .select('*', { count: 'exact', head: true });

  const { data: refRows } = await sb
    .from('dashboard_brand_peers')
    .select('reference_domain');
  const refSet = new Set<string>();
  for (const r of (refRows ?? []) as Array<{ reference_domain: string }>) {
    refSet.add(r.reference_domain);
  }

  return {
    referenceCount: refSet.size,
    peerCount: peerCount ?? 0,
  };
}
