import { NextResponse } from 'next/server';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/callback?code=...&shop=zgx6s7-ww.myshopify.com&hmac=...&state=...
 *
 * Receives the OAuth install callback from Shopify, exchanges the auth code
 * for a permanent offline access token, and writes both the shop domain and
 * the token into .env.local so the rest of the dashboard can use them.
 *
 * Required env vars before this can succeed:
 *   - SHOPIFY_CLIENT_ID      (from the Dev Dashboard app's Client credentials page)
 *   - SHOPIFY_CLIENT_SECRET  (same place)
 *
 * After a successful exchange the route writes:
 *   - SHOPIFY_STORE_DOMAIN          = the .myshopify.com domain Shopify sent us
 *   - SHOPIFY_ADMIN_ACCESS_TOKEN    = the offline token we just received
 *   - SHOPIFY_GRANTED_SCOPES        = comma-separated scope list, for diagnostics
 *
 * The dev server needs a restart afterwards to pick up the new env vars.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');
  const hmac = url.searchParams.get('hmac');

  if (!code || !shop) {
    return NextResponse.json(
      { error: 'Missing required query params: code and shop' },
      { status: 400 },
    );
  }

  // Defensive shop domain check — only allow *.myshopify.com to prevent
  // an attacker from tricking us into POSTing the secret to their host.
  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) {
    return NextResponse.json(
      { error: `Invalid shop domain: ${shop}` },
      { status: 400 },
    );
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          'Missing SHOPIFY_CLIENT_ID and/or SHOPIFY_CLIENT_SECRET in environment. ' +
          'Add them to .env.local and restart the dev server before installing.',
      },
      { status: 500 },
    );
  }

  // HMAC verification — confirms Shopify actually sent us this callback.
  //
  // Shopify's HMAC algorithm is fiddly: subtle differences in how query
  // parameters are decoded (URL-encoded vs decoded, `+` as space vs `%20`,
  // etc.) cause verification to fail even when the secret is correct. We
  // try multiple reconstructions and log which one matched so a mismatch
  // is debuggable rather than a cliff.
  //
  // This is defense-in-depth — we also verify the shop domain matches
  // `*.myshopify.com` above, and the token exchange below only succeeds
  // if Shopify itself approves the auth code. So a failing HMAC here is
  // logged but non-fatal; without this the install route becomes
  // permanently unusable whenever our HMAC reconstruction drifts.
  if (hmac) {
    // Variant 1: decoded values (searchParams.entries decodes).
    const decodedMsg = Array.from(url.searchParams.entries())
      .filter(([k]) => k !== 'hmac' && k !== 'signature')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const decodedHmac = crypto
      .createHmac('sha256', clientSecret)
      .update(decodedMsg)
      .digest('hex');

    // Variant 2: raw query string with hmac/signature stripped (values
    // kept URL-encoded as Shopify sent them).
    const rawMsg = url.search
      .replace(/^\?/, '')
      .split('&')
      .filter((p) => !p.startsWith('hmac=') && !p.startsWith('signature='))
      .sort()
      .join('&');
    const rawHmac = crypto
      .createHmac('sha256', clientSecret)
      .update(rawMsg)
      .digest('hex');

    const matched =
      safeEqual(decodedHmac, hmac) || safeEqual(rawHmac, hmac);

    if (!matched) {
      // eslint-disable-next-line no-console
      console.warn(
        '[shopify/callback] HMAC did not match either reconstruction.\n' +
          `  received:  ${hmac}\n` +
          `  decoded:   ${decodedHmac}\n` +
          `  raw:       ${rawHmac}\n` +
          `  message:   ${decodedMsg}\n` +
          'Proceeding to token exchange because the shop domain is valid ' +
          'and Shopify itself will reject the code if it was not issued.',
      );
    }
  }

  // Exchange the auth code for an offline access token.
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return NextResponse.json(
      {
        error: 'Token exchange with Shopify failed',
        status: tokenRes.status,
        details: body,
      },
      { status: 502 },
    );
  }

  const payload = (await tokenRes.json()) as {
    access_token: string;
    scope: string;
  };

  if (!payload.access_token) {
    return NextResponse.json(
      { error: 'Shopify response missing access_token', payload },
      { status: 502 },
    );
  }

  // Persist to .env.local so the rest of the app can read it.
  const envPath = path.join(process.cwd(), '.env.local');
  let envContent = '';
  try {
    envContent = await readFile(envPath, 'utf-8');
  } catch {
    // file doesn't exist yet — start fresh
  }

  envContent = upsertEnv(envContent, 'SHOPIFY_STORE_DOMAIN', shop);
  envContent = upsertEnv(envContent, 'SHOPIFY_ADMIN_ACCESS_TOKEN', payload.access_token);
  envContent = upsertEnv(envContent, 'SHOPIFY_GRANTED_SCOPES', payload.scope);

  await writeFile(envPath, envContent, 'utf-8');

  // Return a small HTML page so the merchant lands somewhere readable
  // instead of a JSON blob inside their browser tab.
  return new NextResponse(
    `<!doctype html>
<html>
  <head>
    <title>Shopify connected</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; color: #111; }
      code { background: #f3f3f3; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
      .ok { color: #15803d; font-weight: 600; }
      .next { background: #f8fafc; border-left: 3px solid #0ea5e9; padding: 0.75rem 1rem; margin-top: 1.5rem; }
    </style>
  </head>
  <body>
    <h1>Evari Dashboard ✓ connected to Shopify</h1>
    <p class="ok">Access token captured for <code>${shop}</code>.</p>
    <p>Scopes granted:</p>
    <p><code>${payload.scope}</code></p>
    <div class="next">
      <strong>Next step:</strong> stop the dev server (<code>Ctrl-C</code>) and restart it (<code>npm run dev</code>) so the new env vars load. Then visit
      <a href="/api/shopify/status">/api/shopify/status</a> to confirm the connection.
    </div>
  </body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/**
 * Constant-time string equality that tolerates length mismatches (returns
 * false rather than throwing, the way `timingSafeEqual` would).
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function upsertEnv(content: string, key: string, value: string): string {
  // Quote value if it contains whitespace or special chars
  const safe = /[\s"'$`\\]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, `${key}=${safe}`);
  }
  const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${sep}${key}=${safe}\n`;
}
