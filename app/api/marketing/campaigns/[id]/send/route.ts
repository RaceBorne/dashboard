/**
 * POST /api/marketing/campaigns/[id]/send
 *
 * Body accepts either of two shapes — `held` is preferred since it
 * carries reason / source / AI flags for the holding-pen audit trail.
 * `excludeContactIds` is still accepted for back-compat with older
 * clients that only know about hard exclusion.
 *
 *   {
 *     held?: Array<{
 *       contactId: string;
 *       reason?: string;
 *       source?: 'human' | 'ai' | 'both';
 *       aiFlags?: Array<{ severity, kind, message }>;
 *     }>;
 *     excludeContactIds?: string[];
 *   }
 *
 * Approved recipients (everyone NOT in held / excluded) fire immediately.
 * Held recipients are persisted to dashboard_mkt_held_recipients so the
 * campaign report can surface them and we can ship a "Send held now"
 * action after the operator has fixed whatever was wrong.
 *
 * Returns { ok, attempted, sent, suppressed, failed, held: number, error? }.
 */

import { NextResponse } from 'next/server';

import { sendCampaign } from '@/lib/marketing/campaigns';
import { holdRecipients, type HoldInput, type HeldFlag, type HeldSource } from '@/lib/marketing/heldRecipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HeldPayload {
  contactId: string;
  reason?: string | null;
  source?: HeldSource;
  aiFlags?: HeldFlag[] | null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { held?: HeldPayload[]; excludeContactIds?: unknown }
    | null;

  // Normalise held items.
  const heldInputs: HoldInput[] = Array.isArray(body?.held)
    ? body!.held!
        .filter((h): h is HeldPayload => Boolean(h && typeof h === 'object' && typeof h.contactId === 'string'))
        .map((h) => ({
          contactId: h.contactId,
          reason: h.reason ?? null,
          source: h.source ?? 'human',
          aiFlags: h.aiFlags ?? null,
        }))
    : [];

  // Back-compat: bare excludeContactIds[] becomes a human-source hold with no reason.
  if (!heldInputs.length && Array.isArray(body?.excludeContactIds)) {
    for (const x of body!.excludeContactIds as unknown[]) {
      if (typeof x === 'string') heldInputs.push({ contactId: x, source: 'human' });
    }
  }

  // Persist holding pen first so even if send fails we don't lose the operator's review work.
  if (heldInputs.length > 0) {
    await holdRecipients(id, heldInputs);
  }

  const excludeContactIds = heldInputs.map((h) => h.contactId);
  const result = await sendCampaign(id, { excludeContactIds });

  return NextResponse.json({ ...result, held: heldInputs.length });
}
