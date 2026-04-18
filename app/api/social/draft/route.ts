import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { socialPostPrompt } from '@/lib/ai/prompts';
import type { SocialPlatform } from '@/lib/types';

interface Body {
  platform: SocialPlatform;
  topic: string;
  link?: string;
  productInterest?: string;
}

const FALLBACK = (b: Body) =>
  `[mock draft — ${b.platform}]
${b.topic}.

A quiet detail. A specific number. A single sentence that earns the next look.

#evari #craft

> _Connect AI_GATEWAY_API_KEY for a freshly generated draft in the Evari voice._`;

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ markdown: FALLBACK(body), mock: true });
  }

  try {
    const markdown = await generateBriefing({
      task: `Draft a ${body.platform} post`,
      voice: 'evari',
      prompt: socialPostPrompt(body),
    });
    return NextResponse.json({ markdown, mock: false });
  } catch (err) {
    return NextResponse.json({
      markdown: `${FALLBACK(body)}\n\n> _AI Gateway error: ${(err as Error).message}_`,
      mock: true,
    });
  }
}
