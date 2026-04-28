/**
 * Send a reply to a marketing conversation (an inbound email reply).
 *
 *   POST /api/marketing/conversations/<id>/reply
 *   body: { html: string, subject?: string }
 *
 * Resolves the inbound conversation, sends a reply via sendOne (uses
 * Postmark when configured, stub mode otherwise), and stamps the
 * conversation as 'replied' on success.
 *
 * The subject defaults to the original subject prefixed with 'Re: '
 * if not already present, matching standard email client behaviour.
 */

import { NextResponse } from 'next/server';

import { getConversation, setConversationStatus, recordOutboundReply } from '@/lib/marketing/conversations';
import { sendOne } from '@/lib/marketing/sender';
import { getBrand } from '@/lib/marketing/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as { html?: string; subject?: string } | null;
  const html = (body?.html ?? '').trim();
  if (!html) return NextResponse.json({ ok: false, error: 'html required' }, { status: 400 });

  const conv = await getConversation(id);
  if (!conv) return NextResponse.json({ ok: false, error: 'Conversation not found' }, { status: 404 });
  if (!conv.fromEmail) return NextResponse.json({ ok: false, error: 'No address to reply to' }, { status: 400 });

  // Resolve subject. If caller supplied one, use it verbatim; otherwise
  // mirror standard reply behaviour ('Re: <original>').
  const baseSubject = conv.subject ?? '(no subject)';
  const subject = body?.subject?.trim()
    || (baseSubject.toLowerCase().startsWith('re:') ? baseSubject : `Re: ${baseSubject}`);

  const brand = await getBrand();
  const result = await sendOne({
    to: conv.fromEmail,
    subject,
    html,
    context: `reply to conversation ${id}`,
    replyTo: brand.replyToEmail ?? undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? 'Send failed' }, { status: 500 });
  }

  // Mark the inbound replied so the inbox folder count + row badge update.
  const updated = await setConversationStatus(id, 'replied');

  // Persist the outbound reply as a sibling row with the same
  // thread_key so groupThreads() will surface it inline. Using the
  // brand's reply-to as the from-address (or POSTMARK_FROM_EMAIL
  // when reply-to isn't set) so the thread reads as evari->them.
  const fromEmail = brand.replyToEmail
    ?? process.env.POSTMARK_FROM_EMAIL
    ?? brand.companyName
    ?? 'noreply@evari.cc';
  const outbound = await recordOutboundReply({
    inReplyTo: conv,
    toEmail: conv.fromEmail,
    fromEmail,
    fromName: brand.companyName ?? null,
    subject,
    htmlBody: html,
    textBody: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    messageId: result.messageId ?? null,
  });

  return NextResponse.json({
    ok: true,
    messageId: result.messageId,
    conversation: updated ?? conv,
    outbound: outbound ?? null,
  });
}
