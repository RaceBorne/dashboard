import { NextResponse } from 'next/server';
import { getConnectorSpec } from '@/lib/connectors/catalogue';
import { testConnector } from '@/lib/connectors/testers';
import { recordTestOutcome } from '@/lib/connectors/repository';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * POST /api/connectors/[provider]/test
 *
 * Runs the provider's tester (small read-only API call) and records the
 * outcome on the integration row (status, last_tested_at, last_test_error).
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  const spec = getConnectorSpec(provider);
  if (!spec) {
    return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 404 });
  }
  if (!spec.tester) {
    return NextResponse.json(
      { ok: false, error: 'No tester available for ' + spec.name },
      { status: 400 },
    );
  }
  const result = await testConnector(provider);
  await recordTestOutcome({
    provider,
    ok: result.ok,
    error: result.error,
  });
  return NextResponse.json({
    ok: result.ok,
    detail: result.detail,
    error: result.error,
  });
}
