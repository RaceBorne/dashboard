/**
 * Domain authentication — SPF / DKIM / DMARC management.
 *
 * Each domain row in dashboard_mkt_domains is the authoritative
 * record of what we expect to find in DNS. The Postmark Domains API
 * is the source of truth for DKIM (Postmark generates the public key
 * + selector for us); SPF + DMARC use sensible Postmark-friendly
 * defaults that the user can override per-domain by editing the row.
 *
 * verifyDomain() actually performs DNS lookups via Node's
 * dns/promises and compares the returned TXT records to the stored
 * expected values. Per-record status is reported separately so the
 * UI can show a green tick or red X next to each record.
 *
 * If POSTMARK_ACCOUNT_TOKEN is unset, addDomain still works — it
 * just stores the SPF + DMARC defaults and leaves DKIM blank with a
 * note explaining the user needs to set the token to fetch the DKIM
 * value from Postmark.
 */

import { promises as dns } from 'node:dns';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  DomainCheckStatus,
  DomainRecordCheck,
  DomainStatus,
  MktDomain,
} from './types';

interface DomainRow {
  id: string;
  domain_name: string;
  verified: boolean;
  spf_record: string | null;
  dkim_selector: string | null;
  dkim_record: string | null;
  dmarc_record: string | null;
  postmark_id: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDomain(r: DomainRow): MktDomain {
  return {
    id: r.id,
    domainName: r.domain_name,
    verified: r.verified,
    spfRecord: r.spf_record,
    dkimSelector: r.dkim_selector,
    dkimRecord: r.dkim_record,
    dmarcRecord: r.dmarc_record,
    postmarkId: r.postmark_id,
    lastCheckedAt: r.last_checked_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const POSTMARK_DOMAINS_API = 'https://api.postmarkapp.com/domains';

interface PostmarkDomain {
  ID: number;
  Name: string;
  DKIMVerified: boolean;
  ReturnPathDomainVerified: boolean;
  DKIMHost?: string;
  DKIMTextValue?: string;
  DKIMPendingHost?: string;
  DKIMPendingTextValue?: string;
  DKIMUpdateStatus?: string;
  ReturnPathDomain?: string;
  ReturnPathDomainCNAMEValue?: string;
}

function accountToken(): string | null {
  return process.env.POSTMARK_ACCOUNT_TOKEN ?? null;
}

async function postmarkRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = accountToken();
  if (!token) return null;
  try {
    const res = await fetch(`${POSTMARK_DOMAINS_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Account-Token': token,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[mkt.domains.postmark ${path}]`, res.status, txt);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[mkt.domains.postmark ${path}]`, err);
    return null;
  }
}

function defaultSpf(): string {
  return 'v=spf1 include:spf.mtasv.net ~all';
}

function defaultDmarc(domainName: string): string {
  // Conservative default — monitor only, send aggregate reports to a
  // mailbox the user can swap. p=none is the right starting point;
  // ramp to quarantine then reject after a few weeks of clean
  // aggregates.
  return `v=DMARC1; p=none; rua=mailto:dmarc@${domainName}`;
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function listDomains(): Promise<MktDomain[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_mkt_domains')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[mkt.domains.list]', error);
    return [];
  }
  return (data ?? []).map(rowToDomain);
}

export async function getDomain(id: string): Promise<MktDomain | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_domains')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[mkt.domains.get]', error);
    return null;
  }
  return data ? rowToDomain(data) : null;
}

/**
 * Register a domain. Tries Postmark first to get the DKIM selector +
 * value; falls back to template-only when no account token is set
 * (the row is still created; DKIM stays blank until the token is
 * configured + syncWithPostmark() runs).
 */
export async function addDomain(domainName: string): Promise<MktDomain | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const name = domainName.trim().toLowerCase();
  if (!name) return null;

  let postmarkId: string | null = null;
  let dkimSelector: string | null = null;
  let dkimRecord: string | null = null;

  const created = await postmarkRequest<PostmarkDomain>('', {
    method: 'POST',
    body: JSON.stringify({ Name: name }),
  });
  if (created) {
    postmarkId = String(created.ID);
    dkimSelector = (created.DKIMHost ?? created.DKIMPendingHost ?? '').replace(`._domainkey.${name}`, '') || null;
    dkimRecord = created.DKIMTextValue ?? created.DKIMPendingTextValue ?? null;
  }

  const { data, error } = await sb
    .from('dashboard_mkt_domains')
    .insert({
      domain_name: name,
      spf_record: defaultSpf(),
      dkim_selector: dkimSelector,
      dkim_record: dkimRecord,
      dmarc_record: defaultDmarc(name),
      postmark_id: postmarkId,
      verified: false,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.domains.add]', error);
    return null;
  }
  return rowToDomain(data);
}

/**
 * Pull fresh DKIM + verification state from Postmark and persist.
 * No-op when account token is unset.
 */
export async function syncWithPostmark(id: string): Promise<MktDomain | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const domain = await getDomain(id);
  if (!domain || !domain.postmarkId) return domain;
  const fresh = await postmarkRequest<PostmarkDomain>(`/${domain.postmarkId}`);
  if (!fresh) return domain;
  const dkimSelector = (fresh.DKIMHost ?? fresh.DKIMPendingHost ?? '').replace(`._domainkey.${domain.domainName}`, '') || domain.dkimSelector;
  const dkimRecord = fresh.DKIMTextValue ?? fresh.DKIMPendingTextValue ?? domain.dkimRecord;
  const { data, error } = await sb
    .from('dashboard_mkt_domains')
    .update({
      dkim_selector: dkimSelector,
      dkim_record: dkimRecord,
      verified: Boolean(fresh.DKIMVerified && fresh.ReturnPathDomainVerified),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.domains.sync]', error);
    return domain;
  }
  return rowToDomain(data);
}

export async function deleteDomain(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  // Best-effort cleanup on Postmark side too — ignore errors so a
  // local delete still succeeds if Postmark is unreachable.
  const domain = await getDomain(id);
  if (domain?.postmarkId) {
    await postmarkRequest(`/${domain.postmarkId}`, { method: 'DELETE' });
  }
  const { error } = await sb.from('dashboard_mkt_domains').delete().eq('id', id);
  if (error) {
    console.error('[mkt.domains.delete]', error);
    return false;
  }
  return true;
}

// ─── DNS verification ────────────────────────────────────────────

async function lookupTxt(host: string): Promise<{ found: string[]; error?: string }> {
  try {
    const arr = await dns.resolveTxt(host);
    // resolveTxt returns string[][] — outer = records, inner = chunks
    // (a single TXT record can be split across multiple strings).
    return { found: arr.map((chunks) => chunks.join('')) };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') {
      return { found: [], error: 'No TXT record found' };
    }
    return { found: [], error: e.message };
  }
}

/** Normalise to compare TXT strings without whitespace/quote noise. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function compareSpf(expected: string, found: string[]): { status: DomainCheckStatus; note?: string } {
  const exp = normalize(expected);
  const spfRecords = found.filter((f) => /^v=spf1\b/i.test(f.trim()));
  if (spfRecords.length === 0) return { status: 'missing', note: 'No v=spf1 record at this host' };
  if (spfRecords.length > 1) {
    return { status: 'mismatch', note: 'Multiple SPF records — RFC 7208 forbids more than one' };
  }
  return normalize(spfRecords[0]) === exp
    ? { status: 'verified' }
    : { status: 'mismatch', note: `Found: ${spfRecords[0]}` };
}

function compareDkim(expected: string, found: string[]): { status: DomainCheckStatus; note?: string } {
  if (found.length === 0) return { status: 'missing', note: 'No DKIM TXT at this host' };
  const exp = normalize(expected);
  const match = found.some((f) => normalize(f) === exp);
  if (match) return { status: 'verified' };
  // Loose check — many resolvers return DKIM split across multiple
  // strings + Postmark's value sometimes adds line breaks. Accept if
  // expected is a substring of any found record.
  if (found.some((f) => normalize(f).includes(exp.slice(0, 80)))) return { status: 'verified' };
  return { status: 'mismatch', note: `Found ${found.length} TXT record(s) but none matched` };
}

function compareDmarc(expected: string, found: string[]): { status: DomainCheckStatus; note?: string } {
  if (found.length === 0) return { status: 'missing', note: 'No DMARC record at _dmarc' };
  const dmarcs = found.filter((f) => /^v=DMARC1\b/i.test(f.trim()));
  if (dmarcs.length === 0) return { status: 'missing', note: 'No v=DMARC1 record found' };
  if (dmarcs.length > 1) return { status: 'mismatch', note: 'Multiple DMARC records — RFC 7489 forbids more than one' };
  // DMARC values are usually long; accept matching policy + rua
  // even if other tags differ. Strict equality is too brittle.
  const got = normalize(dmarcs[0]);
  const exp = normalize(expected);
  if (got === exp) return { status: 'verified' };
  // Loose match — must at least have v=DMARC1 + p=...
  const wantP = /p=([a-z]+)/i.exec(exp)?.[1];
  const gotP = /p=([a-z]+)/i.exec(got)?.[1];
  if (wantP && gotP && wantP === gotP) return { status: 'verified', note: 'Found DMARC with matching policy (other tags may differ)' };
  return { status: 'mismatch', note: `Found: ${dmarcs[0]}` };
}

export async function verifyDomain(id: string): Promise<DomainStatus | null> {
  const sb = createSupabaseAdmin();
  const domain = await getDomain(id);
  if (!domain) return null;

  // Sync first so we have the latest DKIM value to compare against.
  const synced = (await syncWithPostmark(id)) ?? domain;

  const checks: DomainRecordCheck[] = [];

  // SPF
  if (synced.spfRecord) {
    const { found, error } = await lookupTxt(synced.domainName);
    const cmp = error ? { status: 'error' as DomainCheckStatus, note: error } : compareSpf(synced.spfRecord, found);
    checks.push({ kind: 'spf', host: synced.domainName, expected: synced.spfRecord, found, ...cmp });
  } else {
    checks.push({ kind: 'spf', host: synced.domainName, expected: '', found: [], status: 'pending', note: 'No SPF record stored' });
  }

  // DKIM
  if (synced.dkimSelector && synced.dkimRecord) {
    const host = `${synced.dkimSelector}._domainkey.${synced.domainName}`;
    const { found, error } = await lookupTxt(host);
    const cmp = error ? { status: 'error' as DomainCheckStatus, note: error } : compareDkim(synced.dkimRecord, found);
    checks.push({ kind: 'dkim', host, expected: synced.dkimRecord, found, ...cmp });
  } else {
    checks.push({
      kind: 'dkim',
      host: synced.domainName,
      expected: '',
      found: [],
      status: 'pending',
      note: synced.postmarkId
        ? 'Postmark sync returned no DKIM yet — try again in a moment'
        : 'Set POSTMARK_ACCOUNT_TOKEN to fetch the DKIM record from Postmark',
    });
  }

  // DMARC
  if (synced.dmarcRecord) {
    const host = `_dmarc.${synced.domainName}`;
    const { found, error } = await lookupTxt(host);
    const cmp = error ? { status: 'error' as DomainCheckStatus, note: error } : compareDmarc(synced.dmarcRecord, found);
    checks.push({ kind: 'dmarc', host, expected: synced.dmarcRecord, found, ...cmp });
  } else {
    checks.push({ kind: 'dmarc', host: `_dmarc.${synced.domainName}`, expected: '', found: [], status: 'pending', note: 'No DMARC record stored' });
  }

  const fullyVerified = checks.every((c) => c.status === 'verified');

  // Persist verified flag + last_checked_at
  if (sb) {
    await sb
      .from('dashboard_mkt_domains')
      .update({ verified: fullyVerified, last_checked_at: new Date().toISOString() })
      .eq('id', id);
  }

  return { domain: { ...synced, verified: fullyVerified, lastCheckedAt: new Date().toISOString() }, checks, fullyVerified };
}
