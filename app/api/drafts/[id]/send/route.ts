import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getDraft,
  getPlay,
  getSender,
  isSuppressed,
  listDraftsByStatus,
  upsertDraft,
  upsertLead,
} from '@/lib/dashboard/repository';
import { renderSignature } from '@/lib/dashboard/signature';
import { sendGmailMessage } from '@/lib/integrations/gmail';
import type { DraftMessage, Lead, ProspectOutreach } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/drafts/[id]/send
 *
 * Dispatch an approved draft via Gmail. This is the Phase 3 "approve +
 * send" step: the draft must be status='approved' before it's eligible.
 * Pre-flight:
 *   - sender exists and is active
 *   - recipient isn't suppressed
 *   - sender isn't over its daily cap (OUTREACH_DAILY_CAP, default 30)
 *
 * On success:
 *   - draft.status → 'sent', sentAt + gmailThreadId populated
 *   - a Prospect row is upserted in dashboard_prospects with a new
 *     ProspectOutreach entry appended
 *
 * On failure:
 *   - draft.status → 'failed', lastError populated
 */
export async function POST(
  _req: Request,
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

  const draft = await getDraft(supabase, id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: 'Draft not found' }, { status: 404 });
  }

  if (draft.status !== 'approved') {
    return NextResponse.json(
      { ok: false, error: 'Only approved drafts can be sent (status is ' + draft.status + ')' },
      { status: 400 },
    );
  }

  // Everything below depends only on `draft` (already fetched) - fire
  // the four reads in parallel instead of serial. Typically saves
  // ~150-250ms per send on a warm path.
  const cap = Number(process.env.OUTREACH_DAILY_CAP ?? '30');
  const [sender, suppressed, sentRecent, play] = await Promise.all([
    getSender(supabase, draft.senderId),
    isSuppressed(supabase, draft.toEmail, draft.playId),
    listDraftsByStatus(supabase, 'sent'),
    getPlay(supabase, draft.playId),
  ]);

  if (!sender) {
    return NextResponse.json(
      { ok: false, error: 'Sender no longer exists' },
      { status: 400 },
    );
  }
  if (sender.isActive === false) {
    return NextResponse.json(
      { ok: false, error: 'Sender is not active' },
      { status: 400 },
    );
  }
  if (!sender.oauthConnected) {
    return NextResponse.json(
      { ok: false, error: 'Sender has no Gmail refresh token connected' },
      { status: 400 },
    );
  }

  if (suppressed) {
    const fail = await markFailed(draft, supabase, 'Recipient is on the suppression list');
    return NextResponse.json({ ok: false, error: fail.lastError, draft: fail }, { status: 400 });
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const sentLast24h = sentRecent.filter(
    (d) => d.senderId === sender.id && d.sentAt && new Date(d.sentAt).getTime() >= cutoff,
  ).length;
  if (sentLast24h >= cap) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Sender ' +
          sender.email +
          ' is at its daily cap (' +
          cap +
          ' sends / 24h). Adjust OUTREACH_DAILY_CAP or wait.',
      },
      { status: 429 },
    );
  }

  // Play was fetched above in parallel; kept here for prospect attribution.
  // Render body + signature + compliance footer.
  const bodyHtml = bodyToHtml(draft.body);
  const signatureHtml = renderSignature({
    displayName: sender.displayName,
    role: sender.role,
    email: sender.email,
    phone: sender.phone,
    website: sender.website,
    logoUrl: sender.logoUrl,
    signatureHtml: sender.signatureHtml,
  });
  const footerHtml = complianceFooter({
    playId: draft.playId,
    toEmail: draft.toEmail,
  });

  const html = [
    '<!doctype html>',
    '<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,system-ui,Roboto,sans-serif;color:#111;">',
    '<div style="padding:0;max-width:560px;font-size:14px;line-height:1.55;">',
    bodyHtml,
    signatureHtml,
    footerHtml,
    '</div>',
    '</body></html>',
  ].join('');

  const fromHeader = sender.displayName
    ? sender.displayName + ' <' + sender.email + '>'
    : sender.email;

  let sendResult: { id: string; threadId: string };
  try {
    sendResult = await sendGmailMessage({
      from: fromHeader,
      to: draft.toName ? draft.toName + ' <' + draft.toEmail + '>' : draft.toEmail,
      subject: draft.subject,
      html,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const failed = await markFailed(draft, supabase, reason.slice(0, 400));
    return NextResponse.json({ ok: false, error: reason, draft: failed }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  const sentDraft: DraftMessage = {
    ...draft,
    status: 'sent',
    sentAt,
    gmailThreadId: sendResult.threadId,
    updatedAt: sentAt,
    lastError: undefined,
  };
  await upsertDraft(supabase, sentDraft);

  // Bump sender.lastSentAt so the Settings page reflects actual use.
  await supabase
    .from('dashboard_outreach_senders')
    .update({
      payload: { ...sender, lastSentAt: sentAt, updatedAt: sentAt },
    })
    .eq('id', sender.id);

  // Promote to Prospect tier in dashboard_leads: look up by email, create if
  // missing, append outreach. Carries play.category through as the funnel label.
  const prospect = await upsertProspectFromSend({
    supabase,
    draft: sentDraft,
    sendId: sendResult.id,
    threadId: sendResult.threadId,
    sentAt,
    sourceDetail: play ? 'Play: ' + play.title : undefined,
    category: play?.category,
  });

  return NextResponse.json({
    ok: true,
    draft: sentDraft,
    prospectId: prospect?.id,
    gmail: {
      messageId: sendResult.id,
      threadId: sendResult.threadId,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markFailed(
  draft: DraftMessage,
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  reason: string,
): Promise<DraftMessage> {
  const next: DraftMessage = {
    ...draft,
    status: 'failed',
    lastError: reason,
    updatedAt: new Date().toISOString(),
  };
  await upsertDraft(supabase, next);
  return next;
}

/**
 * Convert the plain-text-ish draft body into safe HTML: paragraph-split on
 * blank lines, line-breaks inside paragraphs, escape entities, linkify bare
 * URLs. Nothing fancy — the body is authored by Craig, not arbitrary input.
 */
function bodyToHtml(body: string): string {
  const escape = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  const linkify = (s: string) =>
    s.replace(/\b(https?:\/\/[^\s<]+)\b/g, (m) => {
      return (
        '<a href="' +
        m +
        '" style="color:#111;text-decoration:underline;">' +
        m +
        '</a>'
      );
    });

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs
    .map((p) => {
      const inner = linkify(escape(p)).replace(/\n/g, '<br />');
      return '<p style="margin:0 0 14px 0;">' + inner + '</p>';
    })
    .join('\n');
}

/**
 * Compliance footer — very small block under the signature with a plain-text
 * unsubscribe line. If OUTREACH_UNSUBSCRIBE_BASE_URL is set, we add a one-click
 * link; otherwise we fall back to a "reply with unsubscribe" instruction. Both
 * paths land the recipient on the same suppression list via Phase 4's reply
 * listener.
 */
function complianceFooter(opts: { playId: string; toEmail: string }): string {
  const base = process.env.OUTREACH_UNSUBSCRIBE_BASE_URL?.trim();
  const unsubscribeHtml = base
    ? '<a href="' +
      base.replace(/\/$/, '') +
      '/' +
      encodeURIComponent(opts.toEmail) +
      '?play=' +
      encodeURIComponent(opts.playId) +
      '" style="color:#888;text-decoration:underline;">Unsubscribe</a>'
    : 'Reply with "unsubscribe" and I will take you off this list.';

  return [
    '<div style="margin-top:16px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#888;line-height:1.55;">',
    'Evari Speed Bikes — this is a personal outreach email, not a bulk send. ',
    unsubscribeHtml,
    '</div>',
  ].join('');
}

/**
 * Create or update the Lead row (tier='prospect') representing the recipient of
 * this draft. Matching is by lowercased email. When a row already exists we
 * append an outreach entry; when it doesn't we seed a new row from the draft.
 */
async function upsertProspectFromSend(opts: {
  supabase: NonNullable<ReturnType<typeof createSupabaseAdmin>>;
  draft: DraftMessage;
  sendId: string;
  threadId: string;
  sentAt: string;
  sourceDetail?: string;
  category?: string;
}): Promise<Lead | undefined> {
  const { supabase, draft, sendId, threadId, sentAt, sourceDetail, category } = opts;
  const email = draft.toEmail.toLowerCase();

  // Look up existing Lead row by email (lowered email is indexed).
  const { data: existingRows, error: readErr } = await supabase
    .from('dashboard_leads')
    .select('id, payload')
    .ilike('payload->>email', email);
  if (readErr) {
    console.warn('[drafts/send] lead lookup failed', readErr);
    return undefined;
  }

  const outreach: ProspectOutreach = {
    id: 'po-' + sendId,
    at: sentAt,
    channel: 'email',
    subject: draft.subject,
    body: draft.body,
    status: 'sent',
  };

  const existing = (existingRows as { id: string; payload: Lead }[] | null)?.[0];

  if (existing) {
    const prev = existing.payload;
    const next: Lead = {
      ...prev,
      lastTouchAt: sentAt,
      prospectStatus: 'sent',
      outreach: [...(prev.outreach ?? []), outreach],
      playId: prev.playId ?? draft.playId,
      category: prev.category ?? category,
      tier: prev.tier ?? 'prospect',
    };
    return upsertLead(supabase, next);
  }

  const lead: Lead = {
    id: 'prospect-' + threadId,
    fullName: draft.toName,
    email: draft.toEmail,
    companyName: draft.toOrg,
    jobTitle: draft.toRole,
    source: 'outreach_agent',
    sourceCategory: 'outreach',
    sourceDetail,
    stage: 'new',
    intent: 'unknown',
    firstSeenAt: sentAt,
    lastTouchAt: sentAt,
    tags: [],
    activity: [],
    tier: 'prospect',
    category,
    playId: draft.playId,
    prospectStatus: 'sent',
    outreach: [outreach],
  };
  return upsertLead(supabase, lead);
}
