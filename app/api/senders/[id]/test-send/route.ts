/**
 * POST /api/senders/[id]/test-send
 *
 * One-shot "is this sender wired up correctly?" check:
 *   - loads the sender from Supabase
 *   - renders the signature HTML with the sender's own slot values
 *   - sends it via Gmail to OUTREACH_TEST_RECIPIENT (falls back to the
 *     sender's own address, so by default you email yourself)
 *
 * The shared Google OAuth refresh token (GOOGLE_REFRESH_TOKEN) must have
 * been issued with the `gmail.send` scope — see
 * scripts/google-oauth-refresh.ts.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getSender } from '@/lib/dashboard/repository';
import { renderSignature } from '@/lib/dashboard/signature';
import { sendGmailMessage } from '@/lib/integrations/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;

  try {
    const sender = await getSender(supabase, id);
    if (!sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    const recipient =
      process.env.OUTREACH_TEST_RECIPIENT?.trim() || sender.email;

    const signatureHtml = renderSignature({
      displayName: sender.displayName,
      role: sender.role,
      email: sender.email,
      phone: sender.phone,
      website: sender.website,
      logoUrl: sender.logoUrl,
      signatureHtml: sender.signatureHtml,
    });

    const html = [
      '<!doctype html>',
      '<html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,system-ui,Roboto,sans-serif;color:#111;">',
      '<div style="padding:24px;max-width:560px;">',
      '<p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;">',
      'This is a signature test from the Evari outreach dashboard. ',
      'If the block below renders correctly in Gmail, the sender is good to go.',
      '</p>',
      signatureHtml,
      '</div>',
      '</body></html>',
    ].join('');

    const fromHeader = sender.displayName
      ? `${sender.displayName} <${sender.email}>`
      : sender.email;

    const result = await sendGmailMessage({
      from: fromHeader,
      to: recipient,
      subject: 'Evari outreach — signature test',
      html,
    });

    return NextResponse.json({
      ok: true,
      recipient,
      messageId: result.id,
      threadId: result.threadId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
