import { NextResponse } from 'next/server';
import { isKlaviyoConnected, renderCampaignPreview } from '@/lib/integrations/klaviyo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/integrations/klaviyo/render/[id]
 *
 * On-demand render of a single campaign's email HTML. Fetches the campaign
 * message, follows the template relationship, writes the HTML + subject back
 * to dashboard_klaviyo_campaigns, and returns the result so the dashboard can
 * display it immediately without a full re-ingest.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing campaign id' }, { status: 400 });
  }

  if (!isKlaviyoConnected()) {
    return NextResponse.json(
      { ok: false, connected: false, error: 'Klaviyo not connected — set KLAVIYO_API_KEY' },
      { status: 400 },
    );
  }

  try {
    const result = await renderCampaignPreview(id);
    if (!result.html) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.error ??
            'Klaviyo returned no HTML. The template may be empty, the campaign may use inline content without a saved template, or the API key may lack templates:read scope.',
          messageId: result.messageId,
        },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      html: result.html,
      subject: result.subject,
      messageId: result.messageId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
