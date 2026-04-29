import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/strategy/[playId]/chips
 *
 * Asks Claude for stage-appropriate chip options the operator can
 * click to lock in. Returns categorised arrays of strings. If the AI
 * gateway is offline, returns sensible static defaults so the UI is
 * never blank.
 *
 * Body: { stage: 'market' | 'target', playTitle?: string, pitch?: string }
 */
interface Body {
  stage?: 'market' | 'target';
  playTitle?: string;
  pitch?: string;
}

interface MarketChips {
  industries: string[];
  geographies: string[];
  companySizes: string[];
  revenues: string[];
  channels: string[];
  audience: string[];
}

interface TargetChips {
  personas: string[];
  seniorities: string[];
  channels: string[];
  angles: string[];
}

const STATIC_MARKET: MarketChips = {
  industries: [
    'Private healthcare',
    'Sports clinics',
    'Luxury automotive',
    'Premium fitness',
    'Hospitality and resorts',
    'Private members clubs',
    'Education',
    'Wealth management',
    'Aviation and yachting',
    'Property development',
  ],
  geographies: [
    'United Kingdom',
    'London',
    'South East England',
    'Manchester',
    'Edinburgh',
    'Birmingham',
    'Surrey',
    'Bristol',
    'Leeds',
    'Brighton',
  ],
  companySizes: [
    '1-10 employees',
    '11-50 employees',
    '51-200 employees',
    '201-500 employees',
    '500+ employees',
  ],
  revenues: [
    'Under £1M',
    '£1M-£5M',
    '£5M-£20M',
    '£20M-£100M',
    '£100M+',
  ],
  channels: ['email', 'linkedin_organic', 'linkedin_paid', 'phone', 'event', 'website'],
  audience: [
    'Owner / Founder',
    'Managing Director',
    'Marketing Director',
    'Head of Sales',
    'Operations Director',
    'Procurement Lead',
  ],
};

const STATIC_TARGET: TargetChips = {
  personas: [
    'Owner / Founder',
    'CEO / Managing Director',
    'Marketing Director',
    'Head of Sales',
    'Operations Director',
    'Brand Manager',
    'Procurement Lead',
  ],
  seniorities: [
    'C-suite',
    'VP / Director',
    'Senior Manager',
    'Manager',
    'Specialist',
  ],
  channels: ['email', 'linkedin_organic', 'linkedin_paid', 'phone', 'event', 'website', 'social'],
  angles: [
    'Premium positioning',
    'Status / lifestyle',
    'Performance edge',
    'Reciprocal partnership',
    'Exclusive access',
    'Curated experience',
  ],
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const stage = body.stage ?? 'market';

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ ok: true, mock: true, ...defaults(stage) });
  }

  const prompt = stage === 'market'
    ? buildMarketPrompt(body)
    : buildTargetPrompt(body);

  try {
    const raw = await generateBriefing({
      task: 'strategy-chips-' + stage,
      voice: 'analyst',
      prompt,
    });
    const parsed = parseChips(raw, stage);
    if (!parsed) {
      return NextResponse.json({ ok: true, mock: true, ...defaults(stage) });
    }
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, mock: true, ...defaults(stage) });
  }
}

function defaults(stage: 'market' | 'target'): MarketChips | TargetChips {
  return stage === 'market' ? STATIC_MARKET : STATIC_TARGET;
}

function buildMarketPrompt(body: Body): string {
  return [
    'Propose chip-pick options for the Market analysis stage of an Evari Speed Bikes prospecting strategy.',
    '',
    'Idea title: ' + (body.playTitle ?? 'untitled'),
    'Pitch: ' + (body.pitch ?? ''),
    '',
    'Return a single JSON object with these arrays of short strings (4 to 8 entries each):',
    '{',
    '  "industries":   string[],   // sectors to target',
    '  "geographies":  string[],   // UK regions / cities most relevant',
    '  "companySizes": string[],   // employee bands like "11-50 employees"',
    '  "revenues":     string[],   // annual revenue bands like "£1M-£5M"',
    '  "channels":     string[],   // ALWAYS pick from: email, linkedin_organic, linkedin_paid, phone, event, website',
    '  "audience":     string[]    // exact roles to email, e.g. "Marketing Director"',
    '}',
    '',
    'Tailor the chips to the idea above. Output raw JSON, no prose, no markdown fences. No em-dashes.',
  ].join('\n');
}

function buildTargetPrompt(body: Body): string {
  return [
    'Propose chip-pick options for the Target stage of an Evari Speed Bikes prospecting strategy.',
    '',
    'Idea title: ' + (body.playTitle ?? 'untitled'),
    'Pitch: ' + (body.pitch ?? ''),
    '',
    'Return a single JSON object with these arrays of short strings (4 to 7 entries each):',
    '{',
    '  "personas":    string[],   // exact job titles or roles to email',
    '  "seniorities": string[],   // C-suite / Director / Manager etc.',
    '  "channels":    string[],   // ALWAYS pick from: email, linkedin_organic, linkedin_paid, phone, event, website, social',
    '  "angles":      string[]    // short messaging angle labels (3-5 words each)',
    '}',
    '',
    'Tailor to the idea. Output raw JSON only, no prose, no markdown fences. No em-dashes.',
  ].join('\n');
}

function parseChips(raw: string, stage: 'market' | 'target'): MarketChips | TargetChips | null {
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const arr = (k: string): string[] =>
      Array.isArray(parsed[k]) ? (parsed[k] as unknown[]).map(String).filter(Boolean) : [];
    if (stage === 'market') {
      return {
        industries:   arr('industries').length   ? arr('industries')   : STATIC_MARKET.industries,
        geographies:  arr('geographies').length  ? arr('geographies')  : STATIC_MARKET.geographies,
        companySizes: arr('companySizes').length ? arr('companySizes') : STATIC_MARKET.companySizes,
        revenues:     arr('revenues').length     ? arr('revenues')     : STATIC_MARKET.revenues,
        channels:     arr('channels').length     ? arr('channels')     : STATIC_MARKET.channels,
        audience:     arr('audience').length     ? arr('audience')     : STATIC_MARKET.audience,
      };
    }
    return {
      personas:    arr('personas').length    ? arr('personas')    : STATIC_TARGET.personas,
      seniorities: arr('seniorities').length ? arr('seniorities') : STATIC_TARGET.seniorities,
      channels:    arr('channels').length    ? arr('channels')    : STATIC_TARGET.channels,
      angles:      arr('angles').length      ? arr('angles')      : STATIC_TARGET.angles,
    };
  } catch {
    return null;
  }
}
