import { NextResponse } from 'next/server';
import { getConnectorSpec } from '@/lib/connectors/catalogue';
import {
  upsertIntegration,
  deleteIntegration,
} from '@/lib/connectors/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/connectors/[provider]
 *   Body: { credentials: Record<string,string>, config?: Record<string,unknown> }
 *   Upserts credentials for a provider. Empty string values are dropped
 *   to preserve existing secrets when the UI shows a blank placeholder.
 *
 * DELETE /api/connectors/[provider]
 *   Clears the row entirely (back to env-fallback only).
 */

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  const spec = getConnectorSpec(provider);
  if (!spec) {
    return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 404 });
  }

  let body: { credentials?: unknown; config?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const credentials: Record<string, string> = {};
  if (body.credentials && typeof body.credentials === 'object') {
    for (const f of spec.fields) {
      const raw = (body.credentials as Record<string, unknown>)[f.key];
      if (typeof raw === 'string') credentials[f.key] = raw.trim();
    }
  }

  const config: Record<string, unknown> = {};
  if (body.config && typeof body.config === 'object') {
    for (const [k, v] of Object.entries(body.config as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      config[k] = v;
    }
  }

  const res = await upsertIntegration({ provider, credentials, config });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  const spec = getConnectorSpec(provider);
  if (!spec) {
    return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 404 });
  }
  const res = await deleteIntegration(provider);
  return NextResponse.json({ ok: res.ok });
}
