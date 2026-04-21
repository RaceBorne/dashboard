import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getPlay,
  getSender,
  listSuppressions,
  listDraftsByPlay,
  listDraftsByStatus,
  listSenders,
  upsertDraft,
} from '@/lib/dashboard/repository';
import type {
  DraftMessage,
  OutreachCadence,
  OutreachSender,
  Play,
} from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agent/follow-ups
 *
 * Sweeps every sent draft and, for plays with a cadence configured, queues
 * the next-touch follow-up as a new draft (status='draft') so Craig still
 * approves before send. A draft is eligible for a follow-up when:
 *
 *   - the parent play has a `cadence` with more touches than the draft's
 *     current `sequenceStep` (default 1 if unset)
 *   - the recipient hasn't replied (positive / neutral / negative /
 *     unsubscribe). auto_reply and unknown still trigger follow-up.
 *   - the recipient isn't on the suppression list (global or per-play)
 *   - enough days have passed since `sentAt` to hit the next cadence offset
 *   - no follow-up draft has already been generated for that step
 *
 * Phase 5 will wrap this endpoint in a Vercel cron (daily) so the queue fills
 * itself without a manual button press.
 *
 * Request body (optional): { limit?: number, dryRun?: boolean }
 *   - limit: cap follow-ups generated this run (default 25, max 100)
 *   - dryRun: compute eligibility but don't write. Useful for previewing.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    dryRun?: boolean;
  };
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
  const dryRun = Boolean(body.dryRun);

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const sent = await listDraftsByStatus(supabase, 'sent');

  // Pre-load the suppression list once. We used to query `isSuppressed`
  // per sent-draft in the loop below (N extra round-trips); a single
  // full-list fetch plus in-memory lookup is dramatically cheaper in
  // the common case (few hundred suppressions, many sent drafts).
  const allSuppressions = await listSuppressions(supabase);
  const isEmailSuppressed = (email: string, playId: string) => {
    const lower = email.trim().toLowerCase();
    return allSuppressions.some((s) => {
      if (s.email.trim().toLowerCase() !== lower) return false;
      return !s.playId || s.playId === playId;
    });
  };
  if (sent.length === 0) {
    return NextResponse.json({ ok: true, generated: [], skipped: [] });
  }

  // Cache the per-play lookups — several sent drafts often share a play.
  const playCache = new Map<string, Play | undefined>();
  const playDraftCache = new Map<string, DraftMessage[]>();
  const senderCache = new Map<string, OutreachSender | undefined>();
  const senders = await listSenders(supabase);
  const defaultSender =
    senders.find((s) => s.isDefault && s.isActive !== false) ??
    senders.find((s) => s.isActive !== false);

  const generated: DraftMessage[] = [];
  const skipped: Array<{ draftId: string; reason: string }> = [];
  const now = Date.now();

  for (const prior of sent) {
    if (generated.length >= limit) {
      skipped.push({ draftId: prior.id, reason: 'rate limit reached' });
      continue;
    }

    // Must have a sent timestamp to compute cadence offset.
    if (!prior.sentAt) {
      skipped.push({ draftId: prior.id, reason: 'no sentAt' });
      continue;
    }

    // Skip if a reply already ended the conversation. auto_reply and unknown
    // do not count — bots and ambiguous replies shouldn't block follow-ups.
    const cls = prior.lastReplyClassification;
    if (cls === 'positive' || cls === 'neutral' || cls === 'negative' || cls === 'unsubscribe') {
      skipped.push({ draftId: prior.id, reason: 'reply received (' + cls + ')' });
      continue;
    }

    // Load play + its cadence.
    let play = playCache.get(prior.playId);
    if (!playCache.has(prior.playId)) {
      play = await getPlay(supabase, prior.playId);
      playCache.set(prior.playId, play);
    }
    if (!play) {
      skipped.push({ draftId: prior.id, reason: 'play not found' });
      continue;
    }
    if (!play.cadence || !Array.isArray(play.cadence.daysBetween)) {
      skipped.push({ draftId: prior.id, reason: 'no cadence' });
      continue;
    }

    const currentStep = prior.sequenceStep ?? 1;
    const nextStep = currentStep + 1;
    if (nextStep > play.cadence.totalTouches) {
      skipped.push({ draftId: prior.id, reason: 'cadence exhausted' });
      continue;
    }

    // daysBetween is indexed by step (1 = first send, so offset for step N is
    // daysBetween[N-1]). The first offset is always 0 (same day as the send),
    // so follow-up offsets start at index 1.
    const offsetDays = play.cadence.daysBetween[nextStep - 1];
    if (typeof offsetDays !== 'number' || offsetDays <= 0) {
      skipped.push({ draftId: prior.id, reason: 'no offset for step ' + nextStep });
      continue;
    }

    const dueAtMs =
      new Date(prior.sentAt).getTime() + offsetDays * 24 * 60 * 60 * 1000;
    if (dueAtMs > now) {
      skipped.push({
        draftId: prior.id,
        reason:
          'too early (due ' +
          new Date(dueAtMs).toISOString().slice(0, 10) +
          ')',
      });
      continue;
    }

    // Dedup: has a follow-up draft already been created for this step?
    let playDrafts = playDraftCache.get(play.id);
    if (!playDraftCache.has(play.id)) {
      playDrafts = await listDraftsByPlay(supabase, play.id);
      playDraftCache.set(play.id, playDrafts);
    }
    const already = (playDrafts ?? []).find(
      (d) =>
        d.previousDraftId === prior.id &&
        (d.sequenceStep ?? 0) === nextStep &&
        d.status !== 'rejected',
    );
    if (already) {
      skipped.push({
        draftId: prior.id,
        reason: 'follow-up already queued (' + already.id + ')',
      });
      continue;
    }

    // Compliance: recipient may have opted out since the first touch landed.
    if (isEmailSuppressed(prior.toEmail, play.id)) {
      skipped.push({ draftId: prior.id, reason: 'suppressed' });
      continue;
    }

    // Sender: reuse the sender the first touch was sent from when possible.
    let sender = senderCache.get(prior.senderId);
    if (!senderCache.has(prior.senderId)) {
      sender = await getSender(supabase, prior.senderId);
      senderCache.set(prior.senderId, sender);
    }
    if (!sender || sender.isActive === false) {
      sender = defaultSender;
    }
    if (!sender) {
      skipped.push({ draftId: prior.id, reason: 'no active sender' });
      continue;
    }

    if (!hasAIGatewayCredentials()) {
      skipped.push({ draftId: prior.id, reason: 'AI gateway not wired' });
      continue;
    }

    try {
      const t0 = Date.now();
      const generatedCopy = await generateFollowUp({
        play,
        sender,
        prior,
        nextStep,
        cadence: play.cadence,
      });
      const durationMs = Date.now() - t0;

      const next: DraftMessage = {
        id: 'd-fu-' + nextStep + '-' + prior.id.slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6),
        playId: play.id,
        targetId: prior.targetId,
        senderId: sender.id,
        toName: prior.toName,
        toOrg: prior.toOrg,
        toRole: prior.toRole,
        toEmail: prior.toEmail,
        subject: generatedCopy.subject,
        body: generatedCopy.body,
        rationale: generatedCopy.rationale,
        status: 'draft',
        generator: {
          model: process.env.AI_MODEL || 'anthropic/claude-haiku-4-5',
          provider: 'gateway',
          durationMs,
        },
        sequenceStep: nextStep,
        previousDraftId: prior.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (!dryRun) {
        await upsertDraft(supabase, next);
        // Keep the cache warm so a second follow-up for the same play in this
        // run doesn't race ahead of the just-inserted draft.
        playDraftCache.set(play.id, [...(playDrafts ?? []), next]);
      }
      generated.push(next);
    } catch (err) {
      skipped.push({
        draftId: prior.id,
        reason:
          'generator error: ' +
          (err instanceof Error ? err.message.slice(0, 200) : String(err)),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    generated,
    skipped,
  });
}

// ---------------------------------------------------------------------------
// Follow-up copy generation. We feed the model the prior email it's chasing
// plus the play context so the follow-up references the original thread
// naturally instead of sounding like a cold send #2.
// ---------------------------------------------------------------------------

interface GeneratedFollowUp {
  subject: string;
  body: string;
  rationale?: string;
}

async function generateFollowUp(opts: {
  play: Play;
  sender: OutreachSender;
  prior: DraftMessage;
  nextStep: number;
  cadence: OutreachCadence;
}): Promise<GeneratedFollowUp> {
  const { play, sender, prior, nextStep, cadence } = opts;

  const stepLabel =
    nextStep === 2
      ? 'second touch'
      : nextStep === 3
        ? 'third touch'
        : 'touch #' + nextStep;

  const task =
    'Draft a short follow-up email from ' +
    sender.displayName +
    ' at Evari Speed Bikes. This is the ' +
    stepLabel +
    ' in a ' +
    cadence.totalTouches +
    '-touch sequence. The prospect has not replied to the previous email. Reference the prior thread naturally ("circling back", "bumping this"), offer one concrete hook (a new angle, a question, or a low-commitment ask), and keep it under 80 words. No "I hope this finds you well". No re-pitching the whole thing. No placeholders or [square-bracket] tokens.';

  const playContext = [
    '## Play: ' + play.title,
    '',
    'Brief:',
    play.brief,
    play.strategy
      ? '\nMessaging angles:\n' +
        (play.strategy.messagingAngles ?? [])
          .map((a) => '  - ' + a)
          .join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const priorContext = [
    '## Previous email (sent ' + (prior.sentAt ?? '?') + ')',
    'Subject: ' + prior.subject,
    '',
    prior.body,
  ].join('\n');

  const prospectContext = [
    '## Prospect',
    'Name: ' + prior.toName,
    prior.toRole ? 'Role: ' + prior.toRole : '',
    prior.toOrg ? 'Organisation: ' + prior.toOrg : '',
  ]
    .filter(Boolean)
    .join('\n');

  const senderContext = [
    '## Sender',
    'From: ' + sender.displayName + ' <' + sender.email + '>',
    sender.role ? 'Title: ' + sender.role : '',
  ]
    .filter(Boolean)
    .join('\n');

  const format = [
    '## Output format',
    'Return exactly three sections, in this order, with these exact labels:',
    '',
    'SUBJECT: <one line. Prefix with "Re: " to sit on the original thread, then a fresh hook (not a repeat of the prior subject).>',
    'RATIONALE: <one sentence explaining the angle you picked for this follow-up>',
    'BODY:',
    '<the email body, 40-80 words, plain text, no greeting to the sender, no signature (added at send time). Start with "Hi ' +
      firstName(prior.toName) +
      ',".>',
  ].join('\n');

  const prompt = [
    playContext,
    '',
    prospectContext,
    '',
    senderContext,
    '',
    priorContext,
    '',
    format,
  ].join('\n');

  const text = await generateBriefing({ voice: 'evari', task, prompt });
  return parseDraft(text, prior);
}

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}

function parseDraft(text: string, prior: DraftMessage): GeneratedFollowUp {
  const subjectMatch = text.match(/^[*\s]*subject[*:\s-]+([^\n]+)/im);
  const rationaleMatch = text.match(/^[*\s]*rationale[*:\s-]+([^\n]+)/im);
  const bodyMatch = text.match(/^[*\s]*body[*:\s]*\n([\s\S]+)$/im);

  let subject = (subjectMatch?.[1] ?? '').trim();
  if (!subject) {
    subject = prior.subject.startsWith('Re: ')
      ? prior.subject
      : 'Re: ' + prior.subject;
  }

  const rationale = (rationaleMatch?.[1] ?? '').trim() || undefined;
  let body = (bodyMatch?.[1] ?? text).trim();

  body = stripInlineSignoff(body);

  if (/^subject[*:\s-]/im.test(body)) {
    const bodyOnly = body.split(/^[*\s]*body[*:\s]*\n/im)[1];
    if (bodyOnly) body = bodyOnly.trim();
  }

  if (!/^hi\b/i.test(body) && !/^hello\b/i.test(body) && !/^dear\b/i.test(body)) {
    body = 'Hi ' + firstName(prior.toName) + ',\n\n' + body;
  }

  return { subject, body, rationale };
}

function stripInlineSignoff(body: string): string {
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
    if (lines.length < body.split('\n').length && /^[A-Z][a-zA-Z'-]{1,20}$/.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}
