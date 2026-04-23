import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, getThread, listSenders } from '@/lib/dashboard/repository';
import { sendGmailMessage } from '@/lib/integrations/gmail';
import { renderSignature } from '@/lib/dashboard/signature';
import type { Thread, ThreadMessage, ThreadParticipant } from '@/lib/types';

/**
 * POST /api/conversations/[id]/reply
 *
 * Sends a reply to a Conversations thread via Gmail and persists the new
 * message back into the thread payload. Wires:
 *
 *   1. Resolve thread by id, lead by thread.leadId.
 *   2. Recipient: the most recent non-Evari participant (the lead's email).
 *   3. Sender: default OutreachSender (currently sender_craig_mcd) — has the
 *      from address, displayName, and signatureHtml ready to render.
 *   4. Subject: "Re: <thread.subject>" (skip the prefix if already there).
 *   5. Body HTML: markdown-ish body wrapped + signature appended.
 *   6. sendGmailMessage threads under thread.id so Gmail keeps the
 *      conversation linked.
 *   7. On success, append a ThreadMessage with isFromEvari=true to the
 *      thread's messages array, flip status awaiting_us → awaiting_lead,
 *      mark unread=false, bump lastMessageAt, and persist.
 *
 * Returns the updated Thread so the client can replace its local copy
 * without a refetch.
 */
export const runtime = 'nodejs';

interface ReplyBody {
  body?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const json = (await req.json().catch(() => ({}))) as ReplyBody;
  const body = (json.body ?? '').trim();
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Empty body' }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'Supabase admin client unavailable' },
      { status: 500 },
    );
  }

  const thread = await getThread(supabase, id);
  if (!thread) {
    return NextResponse.json({ ok: false, error: 'Thread not found' }, { status: 404 });
  }

  // Resolve recipient. Prefer the lead's email; fall back to the most
  // recent non-Evari participant on the thread.
  const lead = thread.leadId ? await getLead(supabase, thread.leadId) : undefined;
  const recipientEmail = (() => {
    if (lead?.email) return lead.email;
    const fromLast = [...thread.messages].reverse().find((m) => !m.isFromEvari)?.from?.email;
    if (fromLast) return fromLast;
    const fromParticipants = thread.participants.find((p) => p.role === 'lead')?.email;
    return fromParticipants;
  })();
  const recipientName =
    lead?.fullName ??
    thread.participants.find((p) => p.email === recipientEmail)?.name ??
    recipientEmail ??
    '';
  if (!recipientEmail) {
    return NextResponse.json(
      { ok: false, error: 'Could not resolve a recipient email for this thread.' },
      { status: 400 },
    );
  }

  // Resolve sender — pick the default outreach sender if multiple exist.
  const senders = await listSenders(supabase);
  const sender =
    senders.find((s) => s.isDefault) ?? senders[0];
  if (!sender) {
    return NextResponse.json(
      { ok: false, error: 'No outreach sender configured. Add one in Settings.' },
      { status: 500 },
    );
  }

  // Build subject — keep "Re:" idempotent.
  const subject = thread.subject.toLowerCase().startsWith('re:')
    ? thread.subject
    : `Re: ${thread.subject}`;

  // Convert markdown-ish body to HTML and append signature.
  const bodyHtml = markdownToInlineHtml(body);
  const signatureHtml = renderSignature({
    displayName: sender.displayName,
    role: sender.role,
    email: sender.email,
    phone: sender.phone,
    website: sender.website,
    logoUrl: sender.logoUrl,
    signatureHtml: sender.signatureHtml,
  });
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.5;">${bodyHtml}</div>` +
    `<br />` +
    signatureHtml;

  // Compose the In-Reply-To / References headers from the most recent
  // inbound Gmail message id, if we have one. Best-effort.
  const lastInbound = [...thread.messages].reverse().find((m) => !m.isFromEvari);
  const inReplyTo = lastInbound?.id?.startsWith('msg-') ? undefined : lastInbound?.id;

  // Send via Gmail. The sender email must match GMAIL_USER_EMAIL or Gmail
  // will rewrite the From header.
  let gmailResult: { id: string; threadId: string } | null = null;
  try {
    gmailResult = await sendGmailMessage({
      from: `"${sender.displayName}" <${sender.email}>`,
      to: recipientEmail,
      subject,
      html,
      inReplyTo,
      // Don't pass thread.id as Gmail's threadId — our thread id is a
      // local string ("thread-raceborne-001"), not a Gmail thread id.
      // Gmail will create a new thread on its side; that's fine for the
      // first send. Future sends could carry the real Gmail threadId
      // returned here back into thread.payload to keep Gmail threading
      // intact across reply round-trips.
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Gmail send failed' },
      { status: 502 },
    );
  }

  // Append the sent message to the thread, flip status, persist.
  const now = new Date().toISOString();
  const fromParticipant: ThreadParticipant = {
    name: sender.displayName,
    email: sender.email,
    role: 'evari',
  };
  const toParticipant: ThreadParticipant = {
    name: recipientName,
    email: recipientEmail,
    role: 'lead',
  };
  const newMessage: ThreadMessage = {
    id: gmailResult?.id ?? `msg-evari-${Date.now().toString(36)}`,
    from: fromParticipant,
    to: [toParticipant],
    sentAt: now,
    bodyMarkdown: body,
    isFromEvari: true,
  };

  // Make sure both participants exist on the thread.
  const participants = [...thread.participants];
  if (!participants.some((p) => p.email === fromParticipant.email)) {
    participants.push(fromParticipant);
  }
  if (!participants.some((p) => p.email === toParticipant.email)) {
    participants.push(toParticipant);
  }

  const updatedThread: Thread = {
    ...thread,
    participants,
    status: 'awaiting_lead',
    unread: false,
    lastMessageAt: now,
    messages: [...thread.messages, newMessage],
  };

  const { error: writeErr } = await supabase
    .from('dashboard_threads')
    .update({ payload: updatedThread })
    .eq('id', thread.id);

  if (writeErr) {
    // Send went out, but persist failed. Surface as a warning so the
    // operator knows the email landed but the UI may be stale.
    console.warn('[conversations/reply] persist failed after send', writeErr);
    return NextResponse.json({
      ok: true,
      sent: true,
      persisted: false,
      thread: updatedThread,
      warning: writeErr.message,
    });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    persisted: true,
    thread: updatedThread,
  });
}

/**
 * Minimal markdown → HTML for the reply body. Splits on blank lines into
 * <p> blocks; converts single newlines to <br>; escapes HTML special chars.
 * Not a full markdown parser — Conversations expects mostly prose, not
 * tables / code blocks.
 */
function markdownToInlineHtml(md: string): string {
  const escape = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  const paragraphs = md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs
    .map((p) => `<p style="margin:0 0 12px 0;">${escape(p).replaceAll('\n', '<br />')}</p>`)
    .join('');
}
