/**
 * One-shot Google OAuth refresh-token generator.
 *
 * Prints a consent URL with every scope the dashboard currently needs
 * (GSC + GA4 + Gmail readonly), spins up a tiny localhost listener, and
 * as soon as Google redirects back, exchanges the `code` for a long-lived
 * refresh token — which it prints to stdout so you can paste it into
 * .env.local as GOOGLE_REFRESH_TOKEN.
 *
 * Required env (in .env.local):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * Usage:
 *   npx tsx scripts/google-oauth-refresh.ts
 *
 * Notes:
 *   - Make sure http://localhost:3000/api/integrations/google/callback is
 *     added as an Authorised redirect URI on the OAuth client in Google
 *     Cloud Console (or pass a different port via REDIRECT_PORT=4567).
 *   - `access_type=offline` + `prompt=consent` together guarantee Google
 *     issues a fresh refresh token every time, even if you've already
 *     consented before. That's what we want — adding Gmail to an
 *     existing token scope-list requires re-consent.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { createServer } from 'http';
import { URL } from 'url';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const PORT = Number(process.env.REDIRECT_PORT ?? 3000);
const REDIRECT_URI = `http://localhost:${PORT}/api/integrations/google/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly', // GSC
  'https://www.googleapis.com/auth/analytics.readonly', // GA4
  'https://www.googleapis.com/auth/gmail.readonly', // Gmail
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local — set those first.',
  );
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('include_granted_scopes', 'true');

console.log('\nOpen this URL in your browser and approve:\n');
console.log(authUrl.toString());
console.log(
  '\nAfter you approve, Google will redirect back to this script and the refresh token will print below.\n',
);

const server = createServer(async (req, res) => {
  if (!req.url) return;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/api/integrations/google/callback') {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    res.statusCode = 400;
    res.end(`Google returned an error: ${error}`);
    console.error(`OAuth error from Google: ${error}`);
    process.exit(1);
  }
  if (!code) {
    res.statusCode = 400;
    res.end('Missing ?code');
    return;
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errText}`);
    }
    const json = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      scope: string;
      expires_in: number;
    };

    if (!json.refresh_token) {
      res.statusCode = 500;
      res.end(
        'Google did not return a refresh_token. Revoke access at https://myaccount.google.com/permissions and re-run.',
      );
      console.error(
        '\nGoogle did not return a refresh_token. This happens if the account has already consented and Google sees no reason to issue a new one.',
      );
      console.error(
        'Fix: revoke the app at https://myaccount.google.com/permissions and re-run this script.',
      );
      process.exit(1);
    }

    res.statusCode = 200;
    res.end(
      'Refresh token captured — you can close this tab and return to the terminal.',
    );

    console.log('\nSuccess. Paste this into .env.local as GOOGLE_REFRESH_TOKEN:\n');
    console.log(json.refresh_token);
    console.log('\nGranted scopes:\n' + json.scope.split(' ').map((s) => '  ' + s).join('\n'));
    console.log('\nYou can now run: npx tsx scripts/ingest-gmail.ts (or wait for the nightly cron).');
    setTimeout(() => process.exit(0), 250);
  } catch (err) {
    res.statusCode = 500;
    res.end(`Exchange failed: ${(err as Error).message}`);
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT} for Google to redirect back...`);
});
