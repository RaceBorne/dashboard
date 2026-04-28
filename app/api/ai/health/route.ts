import { NextResponse } from 'next/server';
import { hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/health
 *
 * Diagnostic endpoint that reports which AI credentials are visible to
 * the running serverless function. Useful when "AI is broken" is the
 * symptom and the question is whether the env vars actually made it
 * to production. Returns presence (true/false) only, never values.
 */
export async function GET() {
  const status = {
    ok: hasAIGatewayCredentials(),
    envs: {
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      AI_GATEWAY_API_KEY: Boolean(process.env.AI_GATEWAY_API_KEY),
      VERCEL_OIDC_TOKEN: Boolean(process.env.VERCEL_OIDC_TOKEN),
    },
    model: process.env.AI_MODEL || 'anthropic/claude-haiku-4-5',
  };
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } });
}
