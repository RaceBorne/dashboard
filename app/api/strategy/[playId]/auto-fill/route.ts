import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/strategy/[playId]/auto-fill
 *
 * Looks at the current brief and asks Claude to fill any blank
 * structural fields — campaign name, objective, ideal customer prose,
 * messaging angles (3), success metrics (3) — based on the picks the
 * user already made on Market analysis + Target profile. Returns a
 * patch object the caller applies to the brief.
 *
 * Plain prose, never markdown. JSON shape strictly enforced.
 */
interface Body {
  playTitle?: string;
  pitch?: string;
  brief?: {
    campaignName?: string | null;
    objective?: string | null;
    targetAudience?: string[];
    geography?: string | null;
    geographies?: string[];
    industries?: string[];
    companySizeMin?: number | null;
    companySizeMax?: number | null;
    companySizes?: string[];
    revenueMin?: string | null;
    revenueMax?: string | null;
    revenues?: string[];
    channels?: string[];
    messaging?: { angle: string; line?: string }[] | null;
    successMetrics?: { name: string; target?: string }[] | null;
    idealCustomer?: string | null;
  };
}

export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ ok: false, error: 'AI gateway not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const b = body.brief ?? {};

  const lines: string[] = [];
  if (body.playTitle) lines.push('Idea: ' + body.playTitle);
  if (body.pitch) lines.push('Pitch: ' + body.pitch);
  if (b.industries && b.industries.length) lines.push('Sectors: ' + b.industries.join(', '));
  if (b.geographies && b.geographies.length) lines.push('Geographies: ' + b.geographies.join(', '));
  else if (b.geography) lines.push('Geography: ' + b.geography);
  if (b.companySizes && b.companySizes.length) lines.push('Company size bands: ' + b.companySizes.join(', '));
  if (b.revenues && b.revenues.length) lines.push('Revenue bands: ' + b.revenues.join(', '));
  if (b.channels && b.channels.length) lines.push('Channels: ' + b.channels.join(', '));
  if (b.targetAudience && b.targetAudience.length) lines.push('Roles to email: ' + b.targetAudience.join(', '));

  // Mark which fields are already filled so Claude only writes the
  // empty ones.
  const filled: string[] = [];
  if (b.campaignName && b.campaignName.trim().length > 0) filled.push('campaignName');
  if (b.objective && b.objective.trim().length > 0) filled.push('objective');
  if (b.idealCustomer && b.idealCustomer.trim().length > 0) filled.push('idealCustomer');
  if (b.messaging && b.messaging.length > 0) filled.push('messaging');
  if (b.successMetrics && b.successMetrics.length > 0) filled.push('successMetrics');

  const prompt = [
    'Fill in the empty structural fields of this strategy brief based on the picks already made. Only write fields that are currently empty; for fields already filled, omit them from the JSON.',
    '',
    'Already filled (skip these): ' + (filled.length > 0 ? filled.join(', ') : 'none'),
    '',
    'Inputs:',
    ...lines,
    '',
    'Reply with VALID JSON in exactly this shape, omitting any keys for already-filled fields, no commentary, no markdown fences:',
    '{',
    '  "campaignName": "string — short, punchy, max 6 words, sentence case",',
    '  "objective": "string — single sentence describing what this campaign is meant to achieve in concrete terms",',
    '  "idealCustomer": "string — one paragraph (3-4 sentences) describing the ideal customer: who they are, what they care about, the trigger that makes them buy",',
    '  "messaging": [{ "angle": "string", "line": "string — optional supporting tagline" }],',
    '  "successMetrics": [{ "name": "string", "target": "string — concrete numeric or qualitative target" }]',
    '}',
    '',
    'Strict rules: plain prose only inside each string, no em-dashes (use commas or full stops), no markdown, no headings, no bold. messaging should have exactly 3 entries. successMetrics should have exactly 3 entries.',
  ].join('\n');

  try {
    const text = await generateBriefing({
      task: 'strategy-auto-fill',
      voice: 'analyst',
      prompt,
    });
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as {
      campaignName?: string;
      objective?: string;
      idealCustomer?: string;
      messaging?: { angle: string; line?: string }[];
      successMetrics?: { name: string; target?: string }[];
    };

    // Build the patch: only include keys Claude actually returned, and
    // never overwrite fields the user has already filled.
    const patch: Record<string, unknown> = {};
    if (typeof parsed.campaignName === 'string' && !filled.includes('campaignName')) patch.campaignName = parsed.campaignName;
    if (typeof parsed.objective === 'string' && !filled.includes('objective')) patch.objective = parsed.objective;
    if (typeof parsed.idealCustomer === 'string' && !filled.includes('idealCustomer')) patch.idealCustomer = parsed.idealCustomer;
    if (Array.isArray(parsed.messaging) && !filled.includes('messaging')) patch.messaging = parsed.messaging.slice(0, 3);
    if (Array.isArray(parsed.successMetrics) && !filled.includes('successMetrics')) patch.successMetrics = parsed.successMetrics.slice(0, 3);

    return NextResponse.json({ ok: true, patch });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
