import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getPlay,
  getSender,
  isSuppressed,
  listDraftsByPlay,
  listSenders,
  upsertDraft,
} from '@/lib/dashboard/repository';
import type { DraftMessage, OutreachSender, Play, PlayTarget } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/plays/[id]/dry-run
 *
 * Generate first-touch email drafts for every eligible target on the play.
 * "Eligible" means: has an email, isn't suppressed, doesn't already have a
 * non-rejected draft. Each draft lands in `dashboard_draft_messages` with
 * status='draft' for Craig to review in the Drafts pane.
 *
 * This is the dry-run step — nothing is sent. Phase 3 adds the approve + send
 * flow on top.
 *
 * Request body (optional):
 *   { targetIds?: string[]; regenerate?: boolean; limit?: number }
 *   - targetIds: only generate for these target ids
 *   - regenerate: if true, replaces any existing 'draft' drafts for matched
 *     targets (approved / sent drafts are always left alone)
 *   - limit: cap the number of drafts generated this run (default 25)
 *
 * Response: { ok, drafts: DraftMessage[], skipped: Array<{targetId,reason}> }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const play = await getPlay(supabase, id);
  if (!play) {
    return NextResponse.json({ ok: false, error: 'Play not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    targetIds?: string[];
    regenerate?: boolean;
    limit?: number;
  };
  const onlyTargets = new Set(body.targetIds ?? []);
  const regenerate = Boolean(body.regenerate);
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);

  // Resolve sender: play.senderId > isDefault > first active.
  const sender = await resolveSender(supabase, play);
  if (!sender) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No outreach sender configured. Add one in Settings → Senders, or set senderId on the play.',
      },
      { status: 400 },
    );
  }

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'AI Gateway not wired. Configure ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY before running dry-run.',
      },
      { status: 400 },
    );
  }

  const existingDrafts = await listDraftsByPlay(supabase, play.id);
  const existingByTargetId = new Map<string, DraftMessage>();
  for (const d of existingDrafts) {
    if (d.targetId) existingByTargetId.set(d.targetId, d);
  }

  // Build candidate target list.
  const candidates = play.targets.filter((t) => {
    if (onlyTargets.size > 0 && !onlyTargets.has(t.id)) return false;
    if (!t.email) return false;
    return true;
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      drafts: [],
      skipped: play.targets.map((t) => ({
        targetId: t.id,
        reason: t.email ? 'not selected' : 'no email',
      })),
    });
  }

  const newDrafts: DraftMessage[] = [];
  const skipped: Array<{ targetId: string; reason: string }> = [];

  for (const target of candidates) {
    if (newDrafts.length >= limit) {
      skipped.push({ targetId: target.id, reason: 'rate limit reached' });
      continue;
    }

    const email = target.email!.trim().toLowerCase();

    // Skip suppressed addresses.
    if (await isSuppressed(supabase, email, play.id)) {
      skipped.push({ targetId: target.id, reason: 'suppressed' });
      continue;
    }

    // Skip if an existing draft already exists and we're not regenerating.
    const existing = existingByTargetId.get(target.id);
    if (existing) {
      if (existing.status === 'sent' || existing.status === 'approved') {
        skipped.push({ targetId: target.id, reason: `already ${existing.status}` });
        continue;
      }
      if (!regenerate) {
        skipped.push({ targetId: target.id, reason: 'draft already exists' });
        continue;
      }
    }

    try {
      const t0 = Date.now();
      const generated = await generateDraft({ play, sender, target });
      const durationMs = Date.now() - t0;

      const draft: DraftMessage = {
        id: existing?.id ?? 'd-' + Math.random().toString(36).slice(2, 12),
        playId: play.id,
        targetId: target.id,
        senderId: sender.id,
        toName: target.name,
        toOrg: target.org,
        toRole: target.role,
        toEmail: email,
        subject: generated.subject,
        body: generated.body,
        rationale: generated.rationale,
        status: 'draft',
        generator: {
          model: process.env.AI_MODEL || 'anthropic/claude-haiku-4-5',
          provider: 'gateway',
          durationMs,
        },
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await upsertDraft(supabase, draft);
      newDrafts.push(draft);
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 200) : String(err);
      skipped.push({ targetId: target.id, reason: 'generator error: ' + reason });
    }
  }

  return NextResponse.json({ ok: true, drafts: newDrafts, skipped });
}

// ---------------------------------------------------------------------------
// Sender resolution — mirrors the order the UI uses so server-generated
// drafts and human-edited drafts always pick the same From address.
// ---------------------------------------------------------------------------
async function resolveSender(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  play: Play,
): Promise<OutreachSender | undefined> {
  if (!supabase) return undefined;
  if (play.senderId) {
    const s = await getSender(supabase, play.senderId);
    if (s?.isActive !== false) return s;
  }
  const senders = await listSenders(supabase);
  const active = senders.filter((s) => s.isActive !== false);
  return active.find((s) => s.isDefault) ?? active[0];
}

// ---------------------------------------------------------------------------
// Draft generation — one target at a time. The prompt is a tight brief built
// from the play + target, and we parse SUBJECT / RATIONALE / BODY out of the
// response with regex rather than round-tripping JSON (LLMs are more reliable
// when they can write naturally in markdown than when we force them to emit
// strict JSON for prose).
// ---------------------------------------------------------------------------
interface GeneratedDraft {
  subject: string;
  body: string;
  rationale?: string;
}

async function generateDraft(opts: {
  play: Play;
  sender: OutreachSender;
  target: PlayTarget;
}): Promise<GeneratedDraft> {
  const { play, sender, target } = opts;

  const task =
    'Draft a first-touch cold outreach email from ' +
    sender.displayName +
    ' at Evari Speed Bikes to a single named prospect. Write only what Craig would send — no placeholders, no [square-bracket] tokens, no "I hope this finds you well". Short, specific, earns a reply.';

  const playContext = [
    '## Play: ' + play.title,
    '',
    'Brief:',
    play.brief,
    play.strategy
      ? '\nHypothesis: ' +
        play.strategy.hypothesis +
        '\nSector: ' +
        play.strategy.sector +
        '\nPersona we\'re emailing: ' +
        play.strategy.targetPersona +
        (play.strategy.messagingAngles.length
          ? '\nMessaging angles to test:\n' +
            play.strategy.messagingAngles.map((a) => '  - ' + a).join('\n')
          : '')
      : '',
    play.research.length > 0
      ? '\nResearch notes:\n' +
        play.research
          .slice(0, 8)
          .map((r) => '- ' + r.title + ': ' + (r.body || '').slice(0, 400))
          .join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const targetContext = [
    '## Prospect',
    'Name: ' + target.name,
    target.role ? 'Role: ' + target.role : '',
    target.org ? 'Organisation: ' + target.org : '',
    target.notes ? 'Notes: ' + target.notes : '',
  ]
    .filter(Boolean)
    .join('\n');

  const senderContext = [
    '## Sender',
    'From: ' + sender.displayName + ' <' + sender.email + '>',
    sender.role ? 'Title: ' + sender.role : '',
    sender.website ? 'Website: ' + sender.website : '',
  ]
    .filter(Boolean)
    .join('\n');

  const format = [
    '## Output format',
    'Return exactly three sections, in this order, with these exact labels:',
    '',
    'SUBJECT: <one line, 4-8 words, no emoji>',
    'RATIONALE: <one sentence explaining which angle you picked and why it fits this prospect>',
    'BODY:',
    '<the email body, 80-140 words, plain text / markdown, no greeting to the sender, no signature (that\'s added at send time). Start with "Hi ' +
      firstName(target.name) +
      ',".>',
  ].join('\n');

  const prompt = [playContext, '', targetContext, '', senderContext, '', format].join('\n');

  const text = await generateBriefing({ voice: 'evari', task, prompt });
  return parseDraft(text, target);
}

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}

function parseDraft(text: string, target: PlayTarget): GeneratedDraft {
  // Tolerant parser — accepts:
  //   SUBJECT: …  |  **Subject:** …  |  Subject - …
  // and picks out everything after BODY: as the body.
  const subjectMatch = text.match(/^[*\s]*subject[*:\s-]+([^\n]+)/im);
  const rationaleMatch = text.match(/^[*\s]*rationale[*:\s-]+([^\n]+)/im);
  const bodyMatch = text.match(/^[*\s]*body[*:\s]*\n([\s\S]+)$/im);

  const subject = (subjectMatch?.[1] ?? '').trim() || 'Quick note from Evari';
  const rationale = (rationaleMatch?.[1] ?? '').trim() || undefined;
  let body = (bodyMatch?.[1] ?? text).trim();

  // Strip any trailing "Best, Craig"-style sign-off the model snuck in — the
  // real signature is appended at send time and we don't want double-sigs.
  body = stripInlineSignoff(body);

  // If the parse went sideways and we ended up with the literal labels in the
  // body, salvage by splitting on the markers.
  if (/^subject[*:\s-]/im.test(body)) {
    const bodyOnly = body.split(/^[*\s]*body[*:\s]*\n/im)[1];
    if (bodyOnly) body = bodyOnly.trim();
  }

  // Make sure it opens with a greeting — belt + braces.
  if (!/^hi\b/i.test(body) && !/^hello\b/i.test(body) && !/^dear\b/i.test(body)) {
    body = 'Hi ' + firstName(target.name) + ',\n\n' + body;
  }

  return { subject, body, rationale };
}

function stripInlineSignoff(body: string): string {
  // Remove common sign-offs + any trailing name/title lines — the real
  // signature is appended at send time. Err on the side of keeping text: we
  // only strip the last 1-3 lines if they match very obvious sign-off shapes.
  const lines = body.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1]!.trim();
    if (last === '') {
      lines.pop();
      continue;
    }
    if (
      /^(best|cheers|thanks|regards|warmly|sincerely|kind regards|all the best|speak soon|talk soon)[,.!]?$/i.test(
        last,
      )
    ) {
      lines.pop();
      continue;
    }
    // A single word that looks like a first name on its own line near the end.
    if (lines.length < body.split('\n').length && /^[A-Z][a-zA-Z'-]{1,20}$/.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}
