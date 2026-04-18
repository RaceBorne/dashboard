import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { morningBriefingPrompt } from '@/lib/ai/prompts';
import { getMockBriefing } from '@/lib/mock/briefing';

const FALLBACK = `### Headline
Mock briefing — AI Gateway is not connected.

**Pipeline.** A handful of warm leads are sat with you. James Pemberton is the closest to closing — test ride is booked Saturday and he is bringing his wife. Phoebe Carrington is on the bespoke quote, paint slot held until Friday. Aurora Architects in Bath has been waiting eight hours for a reply on six commuters.

**Website.** Sessions are up week-on-week. The two real problems are the sitemap returning 500 since the last theme deploy, and the mobile LCP on the Tour PDP at 3.8 seconds. The first is hurting indexing. The second is hurting conversion.

**Action for today.** Reply to Sarah Mitchell at Aurora Architects. Six commuters at corporate value is the highest-leverage conversation in the inbox.

> _Connect AI_GATEWAY_API_KEY (or run \`vercel env pull\` to get a Vercel OIDC token) to replace this fallback with a freshly generated briefing in your voice._
`;

export async function POST() {
  const payload = getMockBriefing();

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ markdown: FALLBACK, mock: true, payload });
  }

  try {
    const markdown = await generateBriefing({
      task: 'Morning briefing for the founder',
      voice: 'analyst',
      prompt: morningBriefingPrompt(payload),
    });
    return NextResponse.json({ markdown, mock: false, payload });
  } catch (err) {
    return NextResponse.json({
      markdown: `${FALLBACK}\n\n> _Tried to call the AI Gateway and it failed: ${(err as Error).message}_`,
      mock: true,
      payload,
    });
  }
}
