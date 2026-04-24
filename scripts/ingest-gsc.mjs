// scripts/ingest-gsc.mjs
//
// One-shot Google Search Console ingest for the local dev box.
// Pulls the last 28 days of top pages + top queries for GSC_SITE_URL and
// writes them into dashboard_gsc_pages_28d / dashboard_gsc_queries_28d in
// Supabase. Fills the Pages page Impr / Clicks / Avg pos columns.
//
// Why this exists: the production Vercel Cron handles this nightly, but
// if the cron hasn't run yet (or if production doesn't have the webmasters
// scope on its refresh token), the columns stay as dashes. Running this
// locally with .env.local works because .env.local has the freshly-minted
// refresh token with webmasters.readonly.
//
// Usage:
//   node scripts/ingest-gsc.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

function readEnv() {
  const txt = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
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
  if (!String(data.scope || '').includes('webmasters.readonly')) {
    throw new Error(
      'Refresh token missing webmasters.readonly scope. Got: ' + data.scope,
    );
  }
  return data.access_token;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function gscSearchAnalytics(accessToken, siteUrl, dimension, days, rowLimit) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const url =
    'https://searchconsole.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(siteUrl) +
    '/searchAnalytics/query';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: isoDate(start),
      endDate: isoDate(end),
      dimensions: [dimension],
      rowLimit,
      dataState: 'all',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('GSC API failed: ' + JSON.stringify(data));
  return {
    rows: data.rows || [],
    windowStart: isoDate(start),
    windowEnd: isoDate(end),
  };
}

async function supabaseRpc(env, path, method, body) {
  const res = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(method + ' ' + path + ' failed: ' + res.status + ' ' + text);
  }
}

async function truncateTable(env, table) {
  // PostgREST has no TRUNCATE; delete everything for the configured site_url.
  const siteUrl = env.GSC_SITE_URL;
  const q = 'site_url=eq.' + encodeURIComponent(siteUrl);
  await supabaseRpc(env, table + '?' + q, 'DELETE');
}

async function insertRows(env, table, rows) {
  if (rows.length === 0) return;
  // Insert in batches of 500 to stay under PostgREST's default limits.
  for (let i = 0; i < rows.length; i += 500) {
    await supabaseRpc(env, table, 'POST', rows.slice(i, i + 500));
  }
}

async function main() {
  const env = readEnv();
  for (const k of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
    'GSC_SITE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!env[k]) throw new Error('Missing ' + k + ' in .env.local');
  }

  console.log('1. Minting access token...');
  const accessToken = await mintAccessToken(env);
  console.log('   access token scope includes webmasters.readonly\n');

  const siteUrl = env.GSC_SITE_URL;
  console.log('2. Querying GSC for last 28 days of top pages at ' + siteUrl + '...');
  const pages = await gscSearchAnalytics(accessToken, siteUrl, 'page', 28, 500);
  console.log('   ' + pages.rows.length + ' page rows\n');

  console.log('3. Querying GSC for last 28 days of top queries...');
  const queries = await gscSearchAnalytics(accessToken, siteUrl, 'query', 28, 1000);
  console.log('   ' + queries.rows.length + ' query rows\n');

  const fetchedAt = new Date().toISOString();

  console.log('4. Truncating existing rows for this site_url in Supabase...');
  await truncateTable(env, 'dashboard_gsc_pages_28d');
  await truncateTable(env, 'dashboard_gsc_queries_28d');
  console.log('   cleared\n');

  console.log('5. Inserting fresh page rows...');
  const pageRows = pages.rows.map((r) => ({
    site_url: siteUrl,
    page: r.keys[0],
    clicks: Math.round(r.clicks || 0),
    impressions: Math.round(r.impressions || 0),
    ctr: r.ctr || 0,
    position: r.position || 0,
    window_start: pages.windowStart,
    window_end: pages.windowEnd,
    fetched_at: fetchedAt,
  }));
  await insertRows(env, 'dashboard_gsc_pages_28d', pageRows);
  console.log('   inserted ' + pageRows.length + ' page rows\n');

  console.log('6. Inserting fresh query rows...');
  const queryRows = queries.rows.map((r) => ({
    site_url: siteUrl,
    query: r.keys[0],
    clicks: Math.round(r.clicks || 0),
    impressions: Math.round(r.impressions || 0),
    ctr: r.ctr || 0,
    position: r.position || 0,
    window_start: queries.windowStart,
    window_end: queries.windowEnd,
    fetched_at: fetchedAt,
  }));
  await insertRows(env, 'dashboard_gsc_queries_28d', queryRows);
  console.log('   inserted ' + queryRows.length + ' query rows\n');

  console.log('Done. Hard-refresh /pages and the Impr / Clicks / Avg pos columns should populate.');
}

main().catch((err) => {
  console.error('FAIL: ' + err.message);
  process.exit(1);
});
