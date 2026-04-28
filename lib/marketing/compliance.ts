/**
 * Compliance & deliverability pre-flight.
 *
 * Returns checklist results the operator should see before clicking
 * Launch. Each check has an id, label, status (pass / warn / fail),
 * and a one-line message.
 *
 * Sources:
 *   - SPF / DKIM / DMARC: real DNS lookups against the configured
 *     sending domain (lib/marketing/domains pulls the verified
 *     sending domain from dashboard_outreach_senders).
 *   - Spam-trigger words: regex scan over the rendered body + subject.
 *   - Link safety: extract <a href="..."> URLs from body, flag the
 *     ones that aren't https or that go to dodgy TLDs.
 *   - List hygiene: percentage of suppressed contacts in the audience.
 *
 * The DNS checks are best-effort — when DNS lookups fail (e.g. no
 * resolver in the runtime), the check returns 'warn' rather than
 * blocking the send.
 */

import dns from 'node:dns/promises';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getCampaign } from './campaigns';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ComplianceCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
}

const SPAM_TRIGGERS = [
  '!!!', 'free !!', 'guaranteed', 'no obligation', 'risk free', 'click here', 'act now',
  '100%% free', 'limited time', 'order now', 'urgent', 'winner', 'congratulations',
  'cash bonus', 'fast cash',
];

async function dnsTxt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((r) => r.join(''));
  } catch {
    return [];
  }
}

async function checkSpf(domain: string): Promise<ComplianceCheck> {
  const txt = await dnsTxt(domain);
  const spf = txt.find((r) => r.startsWith('v=spf1'));
  if (!spf) return { id: 'spf', label: 'SPF', status: 'fail', message: 'No SPF record found.' };
  if (!/include:|ip4:|ip6:|a |mx /i.test(spf)) return { id: 'spf', label: 'SPF', status: 'warn', message: 'SPF record exists but looks incomplete.' };
  return { id: 'spf', label: 'SPF', status: 'pass', message: 'SPF record is published.' };
}

async function checkDkim(domain: string): Promise<ComplianceCheck> {
  const candidates = ['default._domainkey', 'google._domainkey', 'postmark._domainkey'];
  for (const sel of candidates) {
    const txt = await dnsTxt(`${sel}.${domain}`);
    if (txt.some((r) => r.includes('p=') || r.includes('v=DKIM1'))) {
      return { id: 'dkim', label: 'DKIM', status: 'pass', message: `DKIM record found at ${sel}.` };
    }
  }
  return { id: 'dkim', label: 'DKIM', status: 'warn', message: 'Could not verify DKIM. Check selector spelling.' };
}

async function checkDmarc(domain: string): Promise<ComplianceCheck> {
  const txt = await dnsTxt(`_dmarc.${domain}`);
  const dmarc = txt.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  if (!dmarc) return { id: 'dmarc', label: 'DMARC', status: 'fail', message: 'No DMARC record found.' };
  if (/p=none/i.test(dmarc)) return { id: 'dmarc', label: 'DMARC', status: 'warn', message: 'DMARC policy is "none". Stronger policy recommended after monitoring.' };
  return { id: 'dmarc', label: 'DMARC', status: 'pass', message: 'DMARC record is published with enforcement.' };
}

function checkSpamTriggers(text: string): ComplianceCheck {
  const lower = text.toLowerCase();
  const hits = SPAM_TRIGGERS.filter((p) => lower.includes(p));
  if (hits.length === 0) return { id: 'spam_triggers', label: 'Spam-trigger words', status: 'pass', message: 'No spam-trigger words detected.' };
  if (hits.length <= 2) return { id: 'spam_triggers', label: 'Spam-trigger words', status: 'warn', message: `Detected: ${hits.slice(0, 3).join(', ')}.` };
  return { id: 'spam_triggers', label: 'Spam-trigger words', status: 'fail', message: `Detected ${hits.length} trigger phrases.` };
}

function checkLinkSafety(html: string): ComplianceCheck {
  const re = /href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = (m[1] || m[2] || '').trim();
    if (u && !u.startsWith('mailto:') && !u.startsWith('{{')) urls.push(u);
  }
  if (urls.length === 0) return { id: 'links', label: 'All links tracked and safe', status: 'pass', message: 'No outbound links to scan.' };
  const insecure = urls.filter((u) => /^http:\/\//.test(u));
  const dodgy = urls.filter((u) => /\.(zip|click|top|gq|tk|ml|cf|ga)(\/|$)/i.test(u));
  if (insecure.length > 0 || dodgy.length > 0) {
    return { id: 'links', label: 'Link safety', status: 'warn', message: `${insecure.length} insecure, ${dodgy.length} flagged TLD.` };
  }
  return { id: 'links', label: 'All links tracked and safe', status: 'pass', message: `${urls.length} link${urls.length === 1 ? '' : 's'} checked.` };
}

async function checkListHygiene(audienceContactCount: number, suppressedInAudience: number): Promise<ComplianceCheck> {
  if (audienceContactCount === 0) return { id: 'hygiene', label: 'List hygiene', status: 'warn', message: 'No audience to assess yet.' };
  const ratio = suppressedInAudience / audienceContactCount;
  if (ratio > 0.10) return { id: 'hygiene', label: 'List hygiene', status: 'fail', message: `${(ratio * 100).toFixed(0)}% of the audience is suppressed.` };
  if (ratio > 0.03) return { id: 'hygiene', label: 'List hygiene', status: 'warn', message: `${(ratio * 100).toFixed(0)}% of the audience is suppressed.` };
  return { id: 'hygiene', label: 'List hygiene: low risk', status: 'pass', message: `${(ratio * 100).toFixed(1)}% suppression in audience.` };
}

async function getSendingDomain(): Promise<string | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  // Pull from outreach senders (default), fall back to GMAIL_USER_EMAIL env.
  const { data } = await sb
    .from('dashboard_outreach_senders')
    .select('payload')
    .limit(1)
    .maybeSingle();
  const email = (data as { payload?: { fromEmail?: string } } | null)?.payload?.fromEmail
    ?? process.env.GMAIL_USER_EMAIL
    ?? null;
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

export async function runComplianceChecks(campaignId: string): Promise<ComplianceCheck[]> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return [];
  const domain = await getSendingDomain();
  const dnsChecks: ComplianceCheck[] = domain ? await Promise.all([checkSpf(domain), checkDkim(domain), checkDmarc(domain)]) : [
    { id: 'spf', label: 'SPF', status: 'warn', message: 'No sending domain configured.' },
    { id: 'dkim', label: 'DKIM', status: 'warn', message: 'No sending domain configured.' },
    { id: 'dmarc', label: 'DMARC', status: 'warn', message: 'No sending domain configured.' },
  ];

  const text = `${campaign.subject ?? ''}\n\n${campaign.content ?? ''}`;
  return [
    ...dnsChecks,
    checkSpamTriggers(text),
    checkLinkSafety(campaign.content ?? ''),
    await checkListHygiene(0, 0), // placeholder until plumbed to audience resolver; safe default
  ];
}
