import { NextResponse } from 'next/server';
import { hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/**
 * GET /api/ai/health
 *
 * Diagnostic endpoint that reports which credentials are visible to the
 * running serverless function. Useful when "AI is broken" or "Discover
 * is empty" are the symptoms and the question is whether the env vars
 * actually made it to production.
 *
 * For DataForSEO, also pings the live API so we can see whether the
 * value Vercel has actually authenticates. Reports the password length
 * (and first/last 2 chars) without exposing the secret, so we can
 * compare against .env.local without leaking anything sensitive.
 */
export async function GET() {
  const dfsLogin = process.env.DATAFORSEO_LOGIN ?? '';
  const dfsPass = process.env.DATAFORSEO_PASSWORD ?? '';

  let dfsLive: { ok: boolean; status?: number; statusCode?: number; statusMessage?: string; error?: string } = { ok: false };
  if (dfsLogin && dfsPass) {
    try {
      const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
        headers: { Authorization: 'Basic ' + Buffer.from(`${dfsLogin}:${dfsPass}`).toString('base64') },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as { status_code?: number; status_message?: string };
      dfsLive = {
        ok: res.ok && json.status_code === 20000,
        status: res.status,
        statusCode: json.status_code,
        statusMessage: json.status_message,
      };
    } catch (e) {
      dfsLive = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

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
      ok: Boolean(dfsLogin && dfsPass),
      envs: {
        DATAFORSEO_LOGIN: Boolean(dfsLogin),
        DATAFORSEO_PASSWORD: Boolean(dfsPass),
      },
      // Diagnostic fingerprint of the password Vercel has, so we can
      // compare against the value in .env.local without exposing the
      // secret. Length + first/last 2 chars uniquely identifies a
      // 16-char DataForSEO password.
      loginValue: dfsLogin,
      passwordLen: dfsPass.length,
      passwordPreview: dfsPass.length >= 4 ? `${dfsPass.slice(0, 2)}…${dfsPass.slice(-2)}` : '',
      live: dfsLive,
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
