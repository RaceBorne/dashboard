/**
 * Contact enrichment — discover up to 20 people at a prospect's company
 * from the open web, for free.
 *
 * Pipeline:
 *   1. scrapeTeamPages(domain)  — fetch home + common "team" URL paths,
 *      strip to plain text with basic tag removal + whitespace collapse.
 *   2. extractContactsWithAI(..) — pass the cleaned text to Claude with a
 *      structured JSON schema. Claude must quote emails verbatim from the
 *      source text; inferred / guessed emails come from step 3 only.
 *   3. inferEmails(contacts, domain) — for people without an email, derive
 *      the dominant local-part pattern from verified emails and apply it.
 *      Output is tagged `emailSource: 'inferred'` so the UI can warn the
 *      operator before sending.
 *
 * The function `enrichContacts(lead)` orchestrates all three and returns a
 * normalised CompanyContact[] plus a short operator-facing sourceNote
 * (e.g. "Scraped 4 pages on forgelondon.cc, found 8 names, 5 emails
 * verbatim, 3 inferred from dominant pattern (firstname.lastname@)").
 */

import { generateBriefing } from '@/lib/ai/gateway';
import type { CompanyContact, Lead } from '@/lib/types';

/**
 * Team-page URL suffixes we try on every prospect domain. Ordered roughly by
 * hit-rate across cycling clubs, private clinics, pro-service practices.
 * We always prepend "" (the site root) so index.html has a shot too.
 */
const TEAM_PATHS = [
  '',
  '/about',
  '/about-us',
  '/team',
  '/our-team',
  '/meet-the-team',
  '/people',
  '/committee',
  '/leadership',
  '/consultants',
  '/our-consultants',
  '/doctors',
  '/staff',
  '/board',
  '/management',
  '/contact',
  '/contact-us',
];

/** Hard cap on chars we feed to the AI per page — big pages get truncated. */
const PER_PAGE_CHAR_LIMIT = 40_000;
/** Hard cap on total scraped chars sent to the AI across all pages. */
const TOTAL_CHAR_LIMIT = 150_000;
/** Fetch timeout — don't let one slow site stall the whole pipeline. */
const FETCH_TIMEOUT_MS = 8_000;
/** Hard upper bound on contacts returned per company. */
const MAX_CONTACTS_PER_COMPANY = 20;

export interface EnrichResult {
  contacts: CompanyContact[];
  scrapedPaths: string[];
  failedPaths: string[];
  sourceNote: string;
}

/**
 * Orchestrator — the only public entry point.
 * `lead.companyUrl` must be set (or we have nothing to scrape); returns an
 * empty result with a sourceNote if the lead is under-specified.
 */
export async function enrichContacts(
  lead: Pick<Lead, 'companyUrl' | 'companyName' | 'fullName' | 'jobTitle' | 'email' | 'address'>,
  opts: {
    onProgress?: (phase: string, detail?: Record<string, unknown>) => void;
  } = {},
): Promise<EnrichResult> {
  const { onProgress } = opts;
  onProgress?.('start');

  const domain = deriveDomain(lead.companyUrl);
  if (!domain) {
    return {
      contacts: [],
      scrapedPaths: [],
      failedPaths: [],
      sourceNote: 'No company URL on this lead — skipped contact enrichment.',
    };
  }

  // 1. Scrape team pages in parallel
  onProgress?.('scraping', { domain });
  const pages = await scrapeTeamPages(domain, onProgress);
  if (pages.pages.length === 0) {
    return {
      contacts: [],
      scrapedPaths: [],
      failedPaths: pages.failed,
      sourceNote:
        'Could not fetch any team pages on ' +
        domain +
        '. Tried ' +
        pages.failed.length +
        ' paths.',
    };
  }

  // 2. Ask Claude to extract structured people from the scraped text
  onProgress?.('extracting', {
    pageCount: pages.pages.length,
    charCount: pages.pages.reduce((s, p) => s + p.text.length, 0),
  });
  let extracted: CompanyContact[] = [];
  try {
    extracted = await extractContactsWithAI(pages.pages, lead, domain);
  } catch (err) {
    return {
      contacts: [],
      scrapedPaths: pages.pages.map((p) => p.url),
      failedPaths: pages.failed,
      sourceNote:
        'AI extraction failed on ' +
        domain +
        ': ' +
        (err as Error).message,
    };
  }

  // 3. Infer missing emails from the site's dominant pattern
  onProgress?.('inferring');
  const pattern = dominantEmailPattern(extracted, domain);
  const withEmails = extracted.map((c) =>
    c.email
      ? c
      : pattern
        ? {
            ...c,
            email: applyPattern(pattern, c.name, domain),
            emailSource: 'inferred' as const,
            confidence: 'low' as const,
          }
        : c,
  );

  // Dedupe by (lowercased name, lowercased email).
  const seen = new Set<string>();
  const deduped: CompanyContact[] = [];
  for (const c of withEmails) {
    const key = (c.name.toLowerCase().trim() + '|' + (c.email ?? '').toLowerCase()).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
    if (deduped.length >= MAX_CONTACTS_PER_COMPANY) break;
  }

  const verbatim = deduped.filter((c) => c.email && c.emailSource !== 'inferred').length;
  const inferred = deduped.filter((c) => c.emailSource === 'inferred').length;
  const noEmail = deduped.filter((c) => !c.email).length;

  onProgress?.('done', {
    total: deduped.length,
    verbatim,
    inferred,
    noEmail,
  });

  return {
    contacts: deduped,
    scrapedPaths: pages.pages.map((p) => p.url),
    failedPaths: pages.failed,
    sourceNote:
      'Scraped ' +
      pages.pages.length +
      ' page(s) on ' +
      domain +
      ', extracted ' +
      deduped.length +
      ' contact(s) — ' +
      verbatim +
      ' with verbatim emails, ' +
      inferred +
      ' inferred (pattern: ' +
      (pattern ?? 'none') +
      '), ' +
      noEmail +
      ' name-only.',
  };
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

interface ScrapedPage {
  url: string;
  text: string;
}

async function scrapeTeamPages(
  domain: string,
  onProgress?: (phase: string, detail?: Record<string, unknown>) => void,
): Promise<{ pages: ScrapedPage[]; failed: string[] }> {
  const base = 'https://' + domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Fan out in parallel — Promise.allSettled so one 404 doesn't kill others.
  const results = await Promise.allSettled(
    TEAM_PATHS.map(async (path) => {
      const url = base + path;
      const text = await fetchAndClean(url);
      return { url, text };
    }),
  );

  const pages: ScrapedPage[] = [];
  const failed: string[] = [];
  let totalChars = 0;

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.text.length > 200) {
      // Truncate + enforce the global cap.
      const remaining = Math.max(0, TOTAL_CHAR_LIMIT - totalChars);
      if (remaining <= 0) break;
      const clipped = r.value.text.slice(0, Math.min(PER_PAGE_CHAR_LIMIT, remaining));
      pages.push({ url: r.value.url, text: clipped });
      totalChars += clipped.length;
      onProgress?.('scraped-page', { url: r.value.url, chars: clipped.length });
    } else if (r.status === 'rejected') {
      failed.push((r.reason as Error)?.message ?? 'unknown');
    } else if (r.status === 'fulfilled') {
      failed.push(r.value.url + ' (too short)');
    }
  }

  return { pages, failed };
}

async function fetchAndClean(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Many small-business sites block obvious bot user-agents.
        'User-Agent':
          'Mozilla/5.0 (compatible; EvariDashboard/1.0; +https://evari.cc)',
        Accept: 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml'))
      throw new Error('not html: ' + contentType);
    const html = await res.text();
    return htmlToText(html);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Minimal HTML -> text. Strips <script>/<style>, replaces tags with spaces,
 * collapses whitespace. Keeps mailto: URLs inline so Claude can still pick
 * them up (we rewrite them as "email: foo@bar.com" so they're obvious).
 */
function htmlToText(html: string): string {
  // 1. Drop script and style blocks entirely.
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  // 2. Pull mailto:email@x addresses out of href attributes and inline them.
  s = s.replace(
    /href\s*=\s*["']mailto:([^"'?]+)["']?/gi,
    (_, em) => ' email: ' + em + ' ',
  );

  // 3. Convert common block tags to newlines so the text keeps line structure.
  s = s.replace(/<\s*\/?(br|p|div|li|h[1-6]|tr|td|th|section|article|header|footer|nav)[^>]*>/gi, '\n');

  // 4. Strip remaining tags.
  s = s.replace(/<[^>]+>/g, ' ');

  // 5. Decode a handful of common HTML entities (cheap, no full decoder).
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');

  // 6. Collapse whitespace but keep paragraph breaks.
  s = s.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// ---------------------------------------------------------------------------
// AI extraction
// ---------------------------------------------------------------------------

async function extractContactsWithAI(
  pages: ScrapedPage[],
  lead: Pick<Lead, 'companyName' | 'fullName' | 'jobTitle'>,
  domain: string,
): Promise<CompanyContact[]> {
  const combined = pages
    .map((p) => '=== PAGE: ' + p.url + ' ===\n' + p.text)
    .join('\n\n');

  const prompt = [
    'You are extracting people from the scraped text of a company\'s own website.',
    'Return a JSON array of up to ' +
      MAX_CONTACTS_PER_COMPANY +
      ' people mentioned on these pages who could plausibly be contacted for a B2B sales conversation.',
    '',
    'Context:',
    '- Company name: ' + (lead.companyName ?? '(unknown)'),
    '- Domain: ' + domain,
    '- Known contact on file: ' + (lead.fullName ?? '(unknown)') + (lead.jobTitle ? ' (' + lead.jobTitle + ')' : ''),
    '',
    'Rules:',
    '- Only return people EXPLICITLY named in the scraped text. Never invent names.',
    '- Include leadership (chair, CEO, director, founder, managing partner, committee members, head coach, consultants, surgeons, practice managers) AND also department leads (design, product, marketing, operations, sales, community, events).',
    '- Prioritise: senior roles first; then anyone whose title suggests decision-making on purchasing, partnerships, sponsorships, or equipment.',
    '- Skip admin / reception / generic "contact us" entries unless they\'re the only entry.',
    '- Title should match the text as written (e.g. "Head of Product", "Club Secretary", "Consultant Orthopaedic Surgeon"). If no title is visible, use null.',
    '- Email: ONLY include an email address if it appears VERBATIM in the source text as the person\'s own email. Do not guess. Do not combine a name with the domain. If unsure, use null.',
    '- Department: one of "leadership" | "design" | "product" | "engineering" | "marketing" | "sales" | "operations" | "medical" | "community" | "events" | "finance" | "other" — pick the best fit.',
    '- Seniority: one of "exec" | "senior" | "mid" | "junior" | "other" — pick the best fit.',
    '',
    'Return EXACTLY this JSON (no markdown fences, no prose):',
    '{',
    '  "contacts": [',
    '    {',
    '      "name": string,',
    '      "jobTitle": string | null,',
    '      "email": string | null,',
    '      "department": string | null,',
    '      "seniority": string | null',
    '    }',
    '  ]',
    '}',
    '',
    'Scraped text follows:',
    '',
    combined,
  ].join('\n');

  const raw = (
    await generateBriefing({
      task: 'contact-enrichment',
      voice: 'analyst',
      prompt,
    })
  ).trim();

  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as {
    contacts?: Array<{
      name?: string;
      jobTitle?: string | null;
      email?: string | null;
      department?: string | null;
      seniority?: string | null;
    }>;
  };
  const arr = Array.isArray(parsed.contacts) ? parsed.contacts : [];
  const out: CompanyContact[] = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const jobTitle = typeof r.jobTitle === 'string' && r.jobTitle.trim() ? r.jobTitle.trim() : undefined;
    const rawEmail = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    // Guard: reject anything that isn't a vaguely-email-shaped string.
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : undefined;
    const department = typeof r.department === 'string' && r.department.trim() ? r.department.trim().toLowerCase() : undefined;
    const seniority = typeof r.seniority === 'string' && r.seniority.trim() ? r.seniority.trim().toLowerCase() : undefined;
    out.push({
      name,
      jobTitle,
      email,
      emailSource: email ? 'scraped' : undefined,
      confidence: email ? 'high' : undefined,
      department: department as CompanyContact['department'],
      seniority: seniority as CompanyContact['seniority'],
    });
    if (out.length >= MAX_CONTACTS_PER_COMPANY) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Email pattern inference
// ---------------------------------------------------------------------------

type EmailPattern =
  | 'firstname'
  | 'lastname'
  | 'firstname.lastname'
  | 'firstinitial.lastname'
  | 'firstname.lastinitial'
  | 'firstnamelastname';

/**
 * Inspect verbatim-scraped emails (@ the target domain) and infer the
 * dominant local-part format. Returns undefined when there's no signal.
 */
function dominantEmailPattern(
  contacts: CompanyContact[],
  domain: string,
): EmailPattern | undefined {
  const counts: Record<EmailPattern, number> = {
    firstname: 0,
    lastname: 0,
    'firstname.lastname': 0,
    'firstinitial.lastname': 0,
    'firstname.lastinitial': 0,
    firstnamelastname: 0,
  };
  for (const c of contacts) {
    if (!c.email || !c.name) continue;
    if (c.emailSource === 'inferred') continue;
    const [local, mailDomain] = c.email.toLowerCase().split('@');
    if (!mailDomain || !sameDomain(mailDomain, domain)) continue;
    const nameParts = c.name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
    if (nameParts.length < 2) continue;
    const first = nameParts[0];
    const last = nameParts[nameParts.length - 1];

    if (local === first) counts.firstname += 1;
    else if (local === last) counts.lastname += 1;
    else if (local === first + '.' + last) counts['firstname.lastname'] += 1;
    else if (local === first[0] + '.' + last) counts['firstinitial.lastname'] += 1;
    else if (local === first + '.' + last[0]) counts['firstname.lastinitial'] += 1;
    else if (local === first + last) counts.firstnamelastname += 1;
  }
  let best: EmailPattern | undefined;
  let bestN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = k as EmailPattern;
      bestN = n;
    }
  }
  return bestN >= 1 ? best : undefined;
}

function applyPattern(pattern: EmailPattern, name: string, domain: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'info@' + domain;
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  let local = first;
  if (pattern === 'firstname') local = first;
  else if (pattern === 'lastname') local = last || first;
  else if (pattern === 'firstname.lastname') local = last ? first + '.' + last : first;
  else if (pattern === 'firstinitial.lastname') local = last ? first[0] + '.' + last : first;
  else if (pattern === 'firstname.lastinitial') local = last ? first + '.' + last[0] : first;
  else if (pattern === 'firstnamelastname') local = last ? first + last : first;
  return local + '@' + domain;
}

function sameDomain(a: string, b: string): boolean {
  const clean = (x: string) => x.replace(/^www\./, '').toLowerCase();
  return clean(a) === clean(b);
}

function deriveDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}
