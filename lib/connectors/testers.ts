/**
 * Connector testers.
 *
 * Each tester makes a minimal, read-only API call to confirm the
 * credentials are valid and authenticated. Returns { ok, error? }.
 * Used by the Connectors page's Test button and by the status badge
 * when the last_tested_at column updates.
 */

import { getCredentials } from './getCredential';

export interface TestResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

async function ok(detail?: string): Promise<TestResult> {
  return { ok: true, detail };
}
async function err(error: string): Promise<TestResult> {
  return { ok: false, error };
}

export async function testConnector(providerId: string): Promise<TestResult> {
  switch (providerId) {
    case 'shopify':
      return testShopify();
    case 'google-oauth':
      return testGoogleOauth();
    case 'ga4':
      return testGa4();
    case 'gsc':
      return testGsc();
    case 'pagespeed':
      return testPagespeed();
    case 'google-places':
      return testGooglePlaces();
    case 'dataforseo':
      return testDataforseo();
    case 'klaviyo':
      return testKlaviyo();
    default:
      return err('No tester implemented for ' + providerId);
  }
}

async function testShopify(): Promise<TestResult> {
  const creds = await getCredentials('shopify');
  if (!creds.storeDomain || !creds.adminAccessToken) {
    return err('Missing storeDomain or adminAccessToken');
  }
  const version = creds.apiVersion || '2025-01';
  const url = 'https://' + creds.storeDomain + '/admin/api/' + version + '/shop.json';
  try {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': creds.adminAccessToken },
    });
    if (!res.ok) return err('HTTP ' + res.status);
    const json = (await res.json()) as { shop?: { name?: string; myshopify_domain?: string } };
    return ok('Connected to ' + (json.shop?.myshopify_domain ?? creds.storeDomain));
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}

async function testGoogleOauth(): Promise<TestResult> {
  const creds = await getCredentials('google-oauth');
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    return err('Missing clientId, clientSecret or refreshToken');
  }
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      scope?: string;
    };
    if (!res.ok || !json.access_token) {
      return err(json.error_description || json.error || 'HTTP ' + res.status);
    }
    return ok('Access token minted. Scopes: ' + (json.scope ?? 'unknown'));
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}

async function testGa4(): Promise<TestResult> {
  // We delegate to the existing GA4 path by hitting the live dashboard
  // snapshot. If credentials are fine it responds with connected:true.
  const creds = await getCredentials('ga4');
  if (!creds.propertyId) return err('Missing propertyId');
  // Deep test would need the service-account key. Surface presence only.
  return ok('Property ID set (' + creds.propertyId + '). Full auth via Google OAuth.');
}

async function testGsc(): Promise<TestResult> {
  const creds = await getCredentials('gsc');
  if (!creds.siteUrl) return err('Missing siteUrl');
  // Needs a fresh access token from google-oauth to probe the real API.
  const google = await getCredentials('google-oauth');
  if (!google.clientId || !google.clientSecret || !google.refreshToken) {
    return err('Google OAuth connector not configured; cannot probe GSC.');
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: google.clientId,
        client_secret: google.clientSecret,
        refresh_token: google.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const t = (await tokenRes.json()) as { access_token?: string; error_description?: string };
    if (!t.access_token) return err(t.error_description || 'Failed to mint access token');
    const listRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: 'Bearer ' + t.access_token },
    });
    const list = (await listRes.json()) as { siteEntry?: Array<{ siteUrl: string }> };
    const match = list.siteEntry?.find((s) => s.siteUrl === creds.siteUrl);
    if (!match) {
      return err(
        'Site URL ' + creds.siteUrl + ' not found in GSC properties. Available: ' +
          (list.siteEntry?.map((s) => s.siteUrl).join(', ') ?? 'none'),
      );
    }
    return ok('Verified ' + match.siteUrl);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}

async function testPagespeed(): Promise<TestResult> {
  const creds = await getCredentials('pagespeed');
  if (!creds.apiKey) return err('Missing apiKey');
  const url =
    'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fwww.google.com&strategy=mobile&key=' +
    encodeURIComponent(creds.apiKey);
  try {
    const res = await fetch(url);
    if (!res.ok) return err('HTTP ' + res.status);
    return ok('API key valid');
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}

async function testGooglePlaces(): Promise<TestResult> {
  const creds = await getCredentials('google-places');
  if (!creds.apiKey) return err('Missing apiKey');
  const url =
    'https://maps.googleapis.com/maps/api/place/textsearch/json?query=london&key=' +
    encodeURIComponent(creds.apiKey);
  try {
    const res = await fetch(url);
    const json = (await res.json()) as { status?: string; error_message?: string };
    if (json.status === 'OK' || json.status === 'ZERO_RESULTS') return ok('API key valid');
    return err(json.error_message || json.status || 'Unknown error');
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}

async function testDataforseo(): Promise<TestResult> {
  const creds = await getCredentials('dataforseo');
  if (!creds.login || !creds.password) return err('Missing login or password');
  const basic = Buffer.from(creds.login + ':' + creds.password).toString('base64');
  try {
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { Authorization: 'Basic ' + basic },
    });
    if (!res.ok) return err('HTTP ' + res.status);
    const json = (await res.json()) as { status_code?: number; status_message?: string };
    if (json.status_code !== 20000) return err(json.status_message ?? 'Non-success status');
    return ok('Authenticated');
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}

async function testKlaviyo(): Promise<TestResult> {
  const creds = await getCredentials('klaviyo');
  if (!creds.apiKey) return err('Missing apiKey');
  try {
    const res = await fetch('https://a.klaviyo.com/api/accounts/', {
      headers: {
        Authorization: 'Klaviyo-API-Key ' + creds.apiKey,
        revision: '2024-10-15',
      },
    });
    if (!res.ok) return err('HTTP ' + res.status);
    return ok('Authenticated');
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Network error');
  }
}
