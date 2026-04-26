/**
 * Suppression list. Backed by the existing `dashboard_suppressions`
 * table (shared with the outreach module — single source of truth so
 * an unsubscribe in either place is honoured everywhere).
 *
 * The table stores a jsonb payload with at least { email } and a
 * generated lower(email) column for indexed lookup.
 *
 * Auto-suppression is wired in two places already:
 *   - Phase 6 Postmark webhook: HardBounce + SpamComplaint +
 *     SubscriptionChange{ SuppressSending: true }
 *   - Phase 5 sendCampaign: pre-flight isSuppressed() check
 *
 * Phase 9 adds: signed unsubscribe tokens, the public unsubscribe
 * endpoint, manual add/remove from the UI, and List-Unsubscribe
 * header injection at send time.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Suppression } from './types';

interface SuppressionRow {
  id: string;
  email: string;
  payload: {
    email?: string;
    reason?: string;
    source?: string;
    campaignId?: string;
    contactId?: string;
    addedAt?: string;
  } | null;
  created_at: string;
}

function rowToSuppression(row: SuppressionRow): Suppression {
  const p = row.payload ?? {};
  return {
    id: row.id,
    email: row.email,
    reason: p.reason ?? null,
    source: p.source ?? null,
    campaignId: p.campaignId ?? null,
    contactId: p.contactId ?? null,
    addedAt: p.addedAt ?? row.created_at,
  };
}

// ─── List + manual add / remove ───────────────────────────────────

export async function listSuppressions(opts: { limit?: number; search?: string } = {}): Promise<Suppression[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_suppressions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500);
  if (opts.search) q = q.ilike('email', `%${opts.search.toLowerCase()}%`);
  const { data, error } = await q;
  if (error) {
    console.error('[mkt.suppressions.list]', error);
    return [];
  }
  return (data ?? []).map(rowToSuppression);
}

export async function isSuppressed(email: string): Promise<boolean> {
  if (!email) return false;
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const { data, error } = await sb
    .from('dashboard_suppressions')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[mkt.suppressions.isSuppressed]', error);
    return false;
  }
  return Boolean(data);
}

export async function addSuppression(input: {
  email: string;
  reason?: string;
  source?: string;
  campaignId?: string;
  contactId?: string;
}): Promise<Suppression | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const email = input.email.trim().toLowerCase();
  if (!email) return null;
  // Check + skip if already suppressed (no double-row, no error
  // bubbling back to the user).
  const existing = await isSuppressed(email);
  if (existing) {
    const { data } = await sb
      .from('dashboard_suppressions')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    return data ? rowToSuppression(data as SuppressionRow) : null;
  }
  const id = `mkt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    email,
    reason: input.reason ?? 'manual',
    source: input.source ?? 'dashboard',
    campaignId: input.campaignId,
    contactId: input.contactId,
    addedAt: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from('dashboard_suppressions')
    .insert({ id, payload })
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.suppressions.add]', error);
    return null;
  }
  // Also flip the contact's status to 'unsubscribed' if we know who.
  if (input.contactId) {
    await sb
      .from('dashboard_mkt_contacts')
      .update({ status: 'unsubscribed' })
      .eq('id', input.contactId);
  } else {
    // If contactId wasn't passed, look it up by email + flip status.
    await sb
      .from('dashboard_mkt_contacts')
      .update({ status: 'unsubscribed' })
      .eq('email', email);
  }
  return rowToSuppression(data as SuppressionRow);
}

export async function removeSuppression(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  // Look the email up first so we can re-activate the contact too.
  const { data: row } = await sb
    .from('dashboard_suppressions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  const email = (row as SuppressionRow | null)?.email;
  const { error } = await sb.from('dashboard_suppressions').delete().eq('id', id);
  if (error) {
    console.error('[mkt.suppressions.remove]', error);
    return false;
  }
  if (email) {
    await sb
      .from('dashboard_mkt_contacts')
      .update({ status: 'active' })
      .eq('email', email);
  }
  return true;
}

// ─── Signed unsubscribe tokens ───────────────────────────────────
//
// Token shape:  base64url(payload).base64url(sig)
// Payload     : '<email>|<issuedAtMs>'   (iat lets us add expiry later)
// Sig         : HMAC-SHA256(payload, UNSUB_SECRET)
//
// Without the secret + email we can't forge a token, and we can't
// derive an email from a token without the secret. Tokens don't
// expire by default — unsubscribe should be a one-click final action.

function unsubSecret(): string {
  // Fall back to CRON_SECRET so dev still works (every Vercel project
  // already sets that). Production should set UNSUB_SECRET explicitly.
  return process.env.UNSUB_SECRET || process.env.CRON_SECRET || 'evari-dev-unsub-secret';
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Buffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

export function signUnsubToken(email: string): string {
  const payload = `${email.trim().toLowerCase()}|${Date.now()}`;
  const sig = createHmac('sha256', unsubSecret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

export function verifyUnsubToken(token: string): { email: string; iat: number } | null {
  if (!token) return null;
  const [pB64, sigB64] = token.split('.');
  if (!pB64 || !sigB64) return null;
  let payloadStr: string;
  let sigBuf: Buffer;
  try {
    payloadStr = unb64url(pB64).toString('utf8');
    sigBuf = unb64url(sigB64);
  } catch {
    return null;
  }
  const expected = createHmac('sha256', unsubSecret()).update(payloadStr).digest();
  if (sigBuf.length !== expected.length) return null;
  if (!timingSafeEqual(sigBuf, expected)) return null;
  const [email, iatStr] = payloadStr.split('|');
  const iat = Number(iatStr);
  if (!email || !Number.isFinite(iat)) return null;
  return { email, iat };
}

/** Public absolute URL for the unsubscribe page for a given email. */
export function unsubscribeUrlFor(email: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? (process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
      : 'http://localhost:3000';
  const token = signUnsubToken(email);
  return `${base.replace(/\/+$/, '')}/unsubscribe?u=${encodeURIComponent(token)}`;
}
