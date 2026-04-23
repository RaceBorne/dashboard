// scripts/send-first-touch.mjs
//
// One-shot: fires the Raceborne first-touch email from craig@evari.cc to
// craig@raceborne.com, using the local .env.local refresh token. Bypasses
// Vercel entirely so we can test the Gmail send path tonight without the
// production env swap.
//
// Usage:
//   node scripts/send-first-touch.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

function readEnv() {
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

async function mintAccessToken(env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token mint failed: ' + JSON.stringify(data));
  if (!data.scope.includes('gmail.send')) {
    throw new Error(
      'Refresh token missing gmail.send scope. Got: ' + data.scope,
    );
  }
  return data.access_token;
}

function buildRaw({ from, to, subject, html, text }) {
  const boundary = 'evari-' + Date.now().toString(36);
  const headers = [
    'From: ' + from,
    'To: ' + to,
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
  ];
  const body = [
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    '--' + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    '--' + boundary + '--',
    '',
  ].join('\r\n');
  const mime = headers.join('\r\n') + '\r\n' + body;
  return Buffer.from(mime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const SIGNATURE = `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#111111;line-height:1.4;">
  <tr><td style="height:32px;line-height:32px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:0 0 2px 0;font-family:-apple-system,BlinkMacSystemFont,system-ui,Roboto,sans-serif;font-size:13px;font-weight:normal;color:#111111;">Craig McDonald</td></tr>
  <tr><td style="padding:0 0 24px 0;font-size:10px;color:#6b6b6b;">CEO &amp; Head of Design</td></tr>
  <tr><td style="padding:0 0 24px 0;"><img src="https://qtxwcyoslvocfodvsmsl.supabase.co/functions/v1/logo-evari-blue" alt="Evari" width="120" height="14" style="display:block;border:0;outline:none;text-decoration:none;width:120px;height:14px;max-width:120px;" /></td></tr>
  <tr><td style="padding:0 0 2px 0;font-size:13px;color:#111111;">UK (M) +44 (0)7720 288398</td></tr>
  <tr><td style="padding:0 0 16px 0;font-size:13px;"><a href="https://evari.cc" style="color:#111111;text-decoration:none;">evari.cc</a></td></tr>
  <tr><td style="padding:0;font-size:0;line-height:0;border-top:1px solid #cccccc;height:1px;">&nbsp;</td></tr>
  <tr><td style="padding:16px 0 6px 0;font-size:10px;font-weight:bold;color:#555555;">Confidentiality Notice:</td></tr>
  <tr><td style="padding:0 0 8px 0;font-size:10px;color:#666666;line-height:1.55;max-width:520px;">This message is confidential and intended solely for the individual or organisation to whom it is addressed. It may contain privileged or sensitive information. If you are not the intended recipient, please do not copy, distribute, or act upon its contents.</td></tr>
  <tr><td style="font-size:10px;color:#666666;line-height:1.55;max-width:520px;">If you have received this message in error, kindly notify the sender at the email address provided above.</td></tr>
</table>`;

const BODY_TEXT = `Hi Craig,

Saw Raceborne is running a strong chaingang programme out of South London, and a few members tagging the 856 on Instagram. I think there's something real here.

Quick pitch: we'd like to put one or two co-branded 856s in the hands of your fastest members for the season. No contract, no sponsorship ask. If the bike earns its keep on the Sunday rides, you'll see it, and we'll happily talk about a proper partnership for 2026.

Worth a 20-min call next week? Tuesday or Thursday both work.

Best,
Craig`;

const BODY_HTML =
  '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.5;">' +
  BODY_TEXT.split('\n\n')
    .map((p) => '<p style="margin:0 0 12px 0;">' + p.replaceAll('\n', '<br />') + '</p>')
    .join('') +
  '</div><br />' +
  SIGNATURE;

async function main() {
  const env = readEnv();
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']) {
    if (!env[k]) throw new Error('Missing ' + k + ' in .env.local');
  }

  console.log('1. Minting access token from refresh token…');
  const accessToken = await mintAccessToken(env);
  console.log('   ✓ scope includes gmail.send\n');

  console.log('2. Building RFC 2822 message…');
  const raw = buildRaw({
    from: '"Craig McDonald" <craig@evari.cc>',
    to: 'craig@raceborne.com',
    subject: 'Quick intro: Evari × Raceborne partnership?',
    html: BODY_HTML,
    text: BODY_TEXT,
  });
  console.log('   ✓ ' + raw.length + ' base64url chars\n');

  console.log('3. POSTing to Gmail users.messages.send…');
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    console.error('   ✗ Gmail send failed');
    console.error('   Status: ' + res.status);
    console.error('   Body:   ' + JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log('   ✓ Gmail message id: ' + data.id);
  console.log('   ✓ Gmail thread id:  ' + data.threadId + '\n');

  console.log('Done. Check craig@raceborne.com — email should land within ~10 seconds.');
}

main().catch((err) => {
  console.error('✗ ' + err.message);
  process.exit(1);
});
