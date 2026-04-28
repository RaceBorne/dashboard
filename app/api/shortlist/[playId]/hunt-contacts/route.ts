/**
 * POST /api/shortlist/[playId]/hunt-contacts
 *
 * Body: { shortlistId: string }
 *
 * For a single shortlisted company, ask the LLM to propose 3-5 plausible
 * roles/people to target, and write them as needs_review enrichment
 * contacts. The output is intentionally optimistic placeholder data
 * (job title + role-shaped name) so the operator has something to
 * review and replace once a real provider is connected.
 *
 * No real email lookup yet — that's a follow-up integration.
 */

import { NextResponse } from 'next/server';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { generateTextWithFallback, hasAIGatewayCredentials, buildSystemPrompt } from '@/lib/ai/gateway';
import { addEnrichmentContact, type EnrichmentSignal } from '@/lib/marketing/enrichment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface AIContact {
  fullName: string;
  jobTitle: string;
  reason?: string;
  fitScore?: number;
  signals?: EnrichmentSignal[];
}

const FALLBACK: AIContact[] = [
  { fullName: 'Head of Marketing', jobTitle: 'Head of Marketing' },
  { fullName: 'CEO', jobTitle: 'CEO' },
  { fullName: 'Brand Director', jobTitle: 'Brand Director' },
];

export async function POST(req: Request, { params }: { params: Promise<{ playId: string }> }) {
  const { playId } = await params;
  const body = (await req.json().catch(() => null)) as { shortlistId?: string } | null;
  if (!body?.shortlistId) return NextResponse.json({ ok: false, error: 'shortlistId required' }, { status: 400 });

  const sb = createSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'DB unavailable' }, { status: 500 });

  const { data: row } = await sb
    .from('dashboard_play_shortlist')
    .select('id, name, domain, industry, description')
    .eq('id', body.shortlistId)
    .eq('play_id', playId)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: 'Not in shortlist' }, { status: 404 });
  const r = row as { id: string; name: string; domain: string; industry: string | null; description: string | null };

  let contacts: AIContact[] = FALLBACK;
  if (hasAIGatewayCredentials()) {
    try {
      const system = await buildSystemPrompt({
        voice: 'analyst',
        task: 'Proposing target contacts at a candidate company. Return JSON only.',
      });
      const prompt = [
        `Company: ${r.name} (${r.domain}). Industry: ${r.industry ?? 'unknown'}.`,
        r.description ? `Description: ${r.description}` : '',
        '',
        'Return 3-5 plausible target roles to reach out to. Each entry: fullName (use a generic placeholder like "Head of Marketing" if unknown), jobTitle, reason (one-liner why), fitScore (0-100).',
        'JSON array only, no commentary.',
      ].filter(Boolean).join('\n');
      const { text } = await generateTextWithFallback({
        model: process.env.AI_HUNT_MODEL || 'anthropic/claude-haiku-4-5',
        system, prompt, temperature: 0.4,
      });
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed) && parsed.length > 0) contacts = parsed.slice(0, 5).map((c: Record<string, unknown>) => ({
          fullName: typeof c.fullName === 'string' ? c.fullName : 'Unknown',
          jobTitle: typeof c.jobTitle === 'string' ? c.jobTitle : 'Unknown',
          reason: typeof c.reason === 'string' ? c.reason : undefined,
          fitScore: typeof c.fitScore === 'number' ? c.fitScore : undefined,
        }));
      }
    } catch (e) {
      console.warn('[shortlist.hunt]', e);
    }
  }

  const added: unknown[] = [];
  for (const c of contacts) {
    const e = await addEnrichmentContact({
      playId,
      shortlistId: r.id,
      domain: r.domain,
      companyName: r.name,
      fullName: c.fullName,
      jobTitle: c.jobTitle,
      fitScore: c.fitScore ?? null,
      aiSummary: c.reason ?? null,
    });
    if (e) added.push(e);
  }
  return NextResponse.json({ ok: true, added });
}
