import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { getIntegrationStatuses } from '@/lib/integrations/status';

export const runtime = 'nodejs';

/**
 * Chat endpoint for the Connections page.
 *
 * Takes a message + short history, grounds the answer in the actual
 * connection state (which integrations are connected vs missing, what scopes
 * they expose), and replies as the "Dr Anton" persona — an analyst helping
 * Craig decide what to wire up next.
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    message: string;
    history?: ChatMessage[];
  };
  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json(
      { error: 'empty message' },
      { status: 400 },
    );
  }

  const integrations = getIntegrationStatuses();
  const connected = integrations.filter((i) => i.connected);
  const missing = integrations.filter((i) => !i.connected);

  const prompt = [
    'Context — current integration state:',
    '',
    'Connected:',
    connected.length ? connected.map((i) => `  - ${i.label}`).join('\n') : '  (none yet)',
    '',
    'Not connected:',
    missing
      .map((i) => {
        const caps = i.capabilities
          ?.slice(0, 4)
          .map((c) => c.name)
          .join(', ');
        return `  - ${i.label}${caps ? ` (${caps})` : ''}`;
      })
      .join('\n'),
    '',
    '---',
    '',
    ...(body.history?.slice(-6).map((m) => `${m.role === 'user' ? 'Craig' : 'You'}: ${m.content}`) ?? []),
    '',
    `Craig: ${message}`,
  ].join('\n');

  const task =
    'Advise Craig on connections the Evari Dashboard can/should wire up. Be specific, cite actual scopes and capabilities from the context. Keep replies short, punchy, and decision-oriented. Markdown ok. If a connection is already live, say so plainly.';

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({
      mock: true,
      markdown: buildMockReply(message, integrations),
    });
  }

  try {
    const text = await generateBriefing({ voice: 'analyst', task, prompt });
    return NextResponse.json({ mock: false, markdown: text });
  } catch (err) {
    return NextResponse.json({
      mock: true,
      markdown: buildMockReply(message, integrations),
    });
  }
}

// Lightweight canned reply used when the AI Gateway isn't wired yet.
function buildMockReply(
  message: string,
  integrations: ReturnType<typeof getIntegrationStatuses>,
) {
  const missing = integrations.filter((i) => !i.connected);
  const lines: string[] = [];
  lines.push(
    `**Offline — AI Gateway not wired yet.** Here's what I can see from the integration state:`,
  );
  lines.push('');
  if (missing.length === 0) {
    lines.push('Everything is connected. Nothing to wire right now.');
  } else {
    lines.push(`${missing.length} connections are still missing. Highest leverage first:`);
    lines.push('');
    const priority = ['shopify', 'database', 'gsc', 'gmail', 'ga4'] as const;
    const ordered = missing.slice().sort((a, b) => {
      const ai = priority.indexOf(a.key as (typeof priority)[number]);
      const bi = priority.indexOf(b.key as (typeof priority)[number]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    for (const i of ordered.slice(0, 4)) {
      lines.push(`- **${i.label}** — ${i.synopsis ?? 'unlocks core functionality'}`);
    }
  }
  lines.push('');
  lines.push(
    `Once you run \`vercel link\` + \`vercel env pull\`, I can reply properly here with scope-by-scope recommendations.`,
  );
  return lines.join('\n');
}
