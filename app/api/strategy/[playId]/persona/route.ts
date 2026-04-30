import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/strategy/[playId]/persona
 *
 * Asks Claude to write a buyer persona for the picked target profile.
 * Returns a short prose paragraph (max 4 sentences) describing the
 * actual person we will email: their role, what they care about, what
 * triggers them to buy, and the language they speak.
 */
interface Body {
  playTitle?: string;
  pitch?: string;
  industries?: string[];
  geographies?: string[];
  companySizes?: string[];
  revenues?: string[];
  channels?: string[];
  targetAudience?: string[];
}

export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ ok: false, error: 'AI gateway not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;

  const lines: string[] = [];
  if (body.playTitle) lines.push('Idea: ' + body.playTitle);
  if (body.pitch) lines.push('Pitch: ' + body.pitch);
  if (body.industries && body.industries.length) lines.push('Sectors: ' + body.industries.join(', '));
  if (body.geographies && body.geographies.length) lines.push('Geographies: ' + body.geographies.join(', '));
  if (body.companySizes && body.companySizes.length) lines.push('Company size bands: ' + body.companySizes.join(', '));
  if (body.revenues && body.revenues.length) lines.push('Revenue bands: ' + body.revenues.join(', '));
  if (body.targetAudience && body.targetAudience.length) lines.push('Target roles: ' + body.targetAudience.join(', '));
  if (body.channels && body.channels.length) lines.push('Channels: ' + body.channels.join(', '));

  const prompt = [
    'Write a buyer persona for the person we are going to email. One paragraph, max 4 sentences. Plain prose, no headings, no bullet points, no markdown, no em-dashes (use commas or full stops). Cover: who they are (role, seniority), what they care about day-to-day, the trigger that makes them want what we sell, and the kind of language that lands with them.',
    '',
    'Inputs:',
    ...lines,
    '',
    'Output: just the paragraph.',
  ].join('\n');

  try {
    const text = await generateBriefing({
      task: 'strategy-persona',
      voice: 'analyst',
      prompt,
    });
    return NextResponse.json({ ok: true, persona: text.trim() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
