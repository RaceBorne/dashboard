import { NextResponse } from 'next/server';
import { hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/health
 *
 * Diagnostic endpoint that reports which credentials are visible to the
 * running serverless function. Useful when "AI is broken" or "Discover
 * is empty" are the symptoms and the question is whether the env vars
 * actually made it to production. Returns presence (true/false) only,
 * never values.
 */
export async function GET() {
  const status = {
    ai: {
      ok: hasAIGatewayCredentials(),
      envs: {
        ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
        AI_GATEWAY_API_KEY: Boolean(process.env.AI_GATEWAY_API_KEY),
        VERCEL_OIDC_TOKEN: Boolean(process.env.VERCEL_OIDC_TOKEN),
      },
      model: process.env.AI_MODEL || 'anthropic/claude-haiku-4-5',
    },
    dataforseo: {
      ok: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
      envs: {
        DATAFORSEO_LOGIN: Boolean(process.env.DATAFORSEO_LOGIN),
        DATAFORSEO_PASSWORD: Boolean(process.env.DATAFORSEO_PASSWORD),
      },
    },
    supabase: {
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      envs: {
        NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
    },
    gmail: {
      ok: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
      envs: {
        GOOGLE_OAUTH_CLIENT_ID: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
        GOOGLE_OAUTH_CLIENT_SECRET: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
        GOOGLE_OAUTH_REFRESH_TOKEN: Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
      },
    },
  };
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } });
}
