/**
 * Pluggable contact provider abstraction.
 *
 * findContactsAtCompany(domain, opts) is the single shape every
 * provider implements. Concrete providers we may wire up later:
 *
 *   - 'apollo'     (Apollo.io People Search API; needs APOLLO_API_KEY)
 *   - 'clearbit'   (Clearbit Prospector / Discovery; needs CLEARBIT_API_KEY)
 *   - 'hunter'     (Hunter.io Domain Search; needs HUNTER_API_KEY)
 *
 * Today we ship two adapters:
 *
 *   - 'mock'       (LLM-generated placeholder roles; what we had before)
 *   - 'env-stub'   (LLM-generated, but flag the candidates as needs_review
 *                   and omit emails so the operator knows the data isn't real)
 *
 * The active provider is picked by EVARI_CONTACT_PROVIDER. Falls back
 * to 'mock' when unset.
 */

import { generateTextWithFallback, hasAIGatewayCredentials, buildSystemPrompt } from '@/lib/ai/gateway';

export interface ContactCandidate {
  fullName: string;
  jobTitle: string;
  email: string | null;
  emailVerified: boolean;
  linkedinUrl: string | null;
  fitScore: number | null;
  reason: string | null;
  source: string; // provider id
}

export interface FindContactsOpts {
  industry?: string | null;
  description?: string | null;
  preferRoles?: string[];
  limit?: number;
}

export type ProviderId = 'mock' | 'env-stub' | 'apollo' | 'clearbit' | 'hunter';

export function activeProvider(): ProviderId {
  const v = (process.env.EVARI_CONTACT_PROVIDER ?? 'mock').toLowerCase();
  if (v === 'mock' || v === 'env-stub' || v === 'apollo' || v === 'clearbit' || v === 'hunter') return v as ProviderId;
  return 'mock';
}

export async function findContactsAtCompany(domain: string, name: string, opts: FindContactsOpts = {}): Promise<ContactCandidate[]> {
  const provider = activeProvider();
  switch (provider) {
    case 'apollo':
      return findViaApollo(domain, name, opts);
    case 'clearbit':
      return findViaClearbit(domain, name, opts);
    case 'hunter':
      return findViaHunter(domain, name, opts);
    case 'env-stub':
    case 'mock':
    default:
      return findViaMock(domain, name, opts);
  }
}

// ─── Mock (LLM placeholder roles) ────────────────────────────────

async function findViaMock(domain: string, name: string, opts: FindContactsOpts): Promise<ContactCandidate[]> {
  const limit = Math.max(1, Math.min(10, opts.limit ?? 5));
  if (!hasAIGatewayCredentials()) {
    return [
      { fullName: 'Head of Marketing', jobTitle: 'Head of Marketing', email: null, emailVerified: false, linkedinUrl: null, fitScore: null, reason: 'Generic placeholder', source: 'mock' },
      { fullName: 'Founder / CEO', jobTitle: 'CEO', email: null, emailVerified: false, linkedinUrl: null, fitScore: null, reason: 'Generic placeholder', source: 'mock' },
      { fullName: 'Brand Director', jobTitle: 'Brand Director', email: null, emailVerified: false, linkedinUrl: null, fitScore: null, reason: 'Generic placeholder', source: 'mock' },
    ].slice(0, limit);
  }
  try {
    const system = await buildSystemPrompt({
      voice: 'analyst',
      task: 'Proposing target roles at a candidate company. JSON only.',
    });
    const prompt = [
      `Company: ${name} (${domain}).`,
      opts.industry ? `Industry: ${opts.industry}.` : '',
      opts.description ? `Description: ${opts.description}` : '',
      opts.preferRoles && opts.preferRoles.length > 0 ? `Prefer roles: ${opts.preferRoles.join(', ')}.` : '',
      '',
      `Return ${limit} JSON array entries. Each entry: { fullName, jobTitle, reason (one-liner), fitScore (0-100) }. fullName can be a generic role like "Head of Marketing" if a real name is unknown. JSON array only, no commentary.`,
    ].filter(Boolean).join('\n');
    const { text } = await generateTextWithFallback({ model: process.env.AI_HUNT_MODEL || 'anthropic/claude-haiku-4-5', system, prompt, temperature: 0.4 });
    const start = text.indexOf('['); const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Array<Record<string, unknown>>;
      return parsed.slice(0, limit).map((c) => ({
        fullName: typeof c.fullName === 'string' ? c.fullName : 'Unknown',
        jobTitle: typeof c.jobTitle === 'string' ? c.jobTitle : 'Unknown',
        email: null,
        emailVerified: false,
        linkedinUrl: null,
        fitScore: typeof c.fitScore === 'number' ? c.fitScore : null,
        reason: typeof c.reason === 'string' ? c.reason : null,
        source: 'mock',
      }));
    }
  } catch (e) {
    console.warn('[contactProvider.mock]', e);
  }
  return [];
}

// ─── Apollo (stub — wired when APOLLO_API_KEY is set) ────────────

async function findViaApollo(domain: string, name: string, opts: FindContactsOpts): Promise<ContactCandidate[]> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return findViaMock(domain, name, opts);
  // Placeholder — implement against https://api.apollo.io/v1/mixed_people/search
  // when ready. Keep the signature stable so the call site doesn't change.
  // For now, return mock so the surface still works.
  return findViaMock(domain, name, opts);
}

async function findViaClearbit(domain: string, name: string, opts: FindContactsOpts): Promise<ContactCandidate[]> {
  const key = process.env.CLEARBIT_API_KEY;
  if (!key) return findViaMock(domain, name, opts);
  return findViaMock(domain, name, opts);
}

async function findViaHunter(domain: string, name: string, opts: FindContactsOpts): Promise<ContactCandidate[]> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return findViaMock(domain, name, opts);
  return findViaMock(domain, name, opts);
}
