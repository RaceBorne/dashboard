/**
 * lib/enrich/mxCheck.ts — dead-simple DNS MX lookup.
 *
 * Used by the enrichment engine (STEP 5) to flip EmailCandidate.mxVerified
 * from undefined to true when the candidate's domain actually publishes an
 * MX record. This confirms the domain is configured to accept mail — it
 * does NOT confirm the specific mailbox exists (that would need an SMTP
 * probe, which most providers silently drop to prevent address
 * harvesting).
 *
 * Results are in-process memoised for the duration of a request so we
 * don't DNS-resolve the same domain ten times while checking ten
 * candidates at @evari.cc.
 */
import { promises as dns } from 'node:dns';

const cache = new Map<string, Promise<boolean>>();

export async function hasMxRecord(domain: string): Promise<boolean> {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  const existing = cache.get(d);
  if (existing) return existing;
  const p = dns
    .resolveMx(d)
    .then((records) => records.length > 0)
    .catch(() => false);
  cache.set(d, p);
  return p;
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  if (at === -1) return '';
  return email.slice(at + 1).toLowerCase();
}
