import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface Body {
  playTitle?: string;
  pitch?: string;
  brief?: {
    campaignName?: string | null;
    objective?: string | null;
    targetAudience?: string[];
    geography?: string | null;
    industries?: string[];
    companySizeMin?: number | null;
    companySizeMax?: number | null;
    revenueMin?: string | null;
    revenueMax?: string | null;
    channels?: string[];
    messaging?: { angle: string; line?: string }[] | null;
    successMetrics?: { name: string; target?: string }[] | null;
    idealCustomer?: string | null;
  };
}

/**
 * POST /api/strategy/[playId]/synopsis
 *
 * Asks Claude to fold every brief field into a single narrative
 * synopsis paragraph that the operator reads on the Synopsis stage of
 * Strategy. Returns plain prose, no markdown, ready to display.
 */
export async function POST(req: Request) {
  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ ok: false, error: 'AI gateway not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const b = body.brief ?? {};
  const lines: string[] = [];
  if (body.playTitle) lines.push('Idea: ' + body.playTitle);
  if (body.pitch) lines.push('Pitch: ' + body.pitch);
  if (b.campaignName) lines.push('Campaign: ' + b.campaignName);
  if (b.objective) lines.push('Objective: ' + b.objective);
  if (b.targetAudience && b.targetAudience.length) lines.push('Target audience: ' + b.targetAudience.join(', '));
  if (b.geography) lines.push('Geography: ' + b.geography);
  if (b.industries && b.industries.length) lines.push('Industries: ' + b.industries.join(', '));
  if (b.companySizeMin || b.companySizeMax) lines.push('Company size: ' + (b.companySizeMin ?? '') + '-' + (b.companySizeMax ?? ''));
  if (b.revenueMin || b.revenueMax) lines.push('Revenue: ' + (b.revenueMin ?? '') + ' to ' + (b.revenueMax ?? ''));
  if (b.channels && b.channels.length) lines.push('Channels: ' + b.channels.join(', '));
  if (b.messaging && b.messaging.length) lines.push('Messaging angles: ' + b.messaging.map((m) => m.angle).join('; '));
  if (b.successMetrics && b.successMetrics.length) lines.push('Success metrics: ' + b.successMetrics.map((m) => m.name + (m.target ? ' (' + m.target + ')' : '')).join('; '));
  if (b.idealCustomer) lines.push('Ideal customer: ' + b.idealCustomer);

  const prompt = [
    'You are writing a strategy synopsis for the founder. The synopsis is a single paragraph (max 6 sentences) that fuses every input below into one readable narrative. Write in plain English, present tense, no em-dashes (use commas or periods), no hedging.',
    '',
    'Inputs:',
    ...lines,
    '',
    'Output: just the paragraph. No headings, no markdown, no bullet points.',
  ].join('\n');

  try {
    const text = await generateBriefing({
      task: 'strategy-synopsis',
      voice: 'analyst',
      prompt,
    });
    return NextResponse.json({ ok: true, synopsis: text.trim() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
