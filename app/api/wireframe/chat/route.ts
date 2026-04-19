import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { WIREFRAME_NODES, WIREFRAME_FLOWS } from '@/lib/wireframe';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Wireframe per-service chat — the AI window inside each node's detail panel.
 *
 * Takes a service id and returns answers grounded in that specific service's
 * role in the Evari stack: its env vars, what we manage where, business
 * outcomes, costs, related flows. The prompt injects the full node record so
 * the reply is specific to the integration Craig is asking about.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    nodeId: string;
    message: string;
    history?: ChatMessage[];
  };

  const node = WIREFRAME_NODES.find((n) => n.id === body.nodeId);
  if (!node) {
    return NextResponse.json(
      { mock: true, text: `I don't recognise "${body.nodeId}" as a service in the wireframe.` },
      { status: 400 },
    );
  }

  const relatedFlows = WIREFRAME_FLOWS.filter(
    (f) => f.from === node.id || f.to === node.id,
  );

  const accountLine = node.account
    ? `Account type: ${node.account.label}. Admin URL: ${node.account.adminUrlTemplate}`
    : 'No account info for this service.';

  // Build compact context the model can ground on.
  const context = [
    `SERVICE: ${node.label} (${node.role})`,
    `TIER: ${node.tier}`,
    `COST: £${node.costGBP}/mo${node.costNote ? ` — ${node.costNote}` : ''}`,
    node.optional ? 'FLAG: Optional — dashboard works without this.' : '',
    '',
    `BLURB: ${node.blurb}`,
    '',
    accountLine,
    '',
    `ENV VARS NEEDED: ${node.envVars.length > 0 ? node.envVars.join(', ') : '(none)'}`,
    node.docsUrl ? `DOCS: ${node.docsUrl}` : '',
    node.notes ? `SETUP NOTES: ${node.notes}` : '',
    '',
    `MANAGED IN THE EVARI DASHBOARD:\n${node.manageHere.map((m) => `- ${m}`).join('\n')}`,
    '',
    `MANAGED IN THE SERVICE ITSELF:\n${node.manageInService.map((m) => `- ${m}`).join('\n') || '- (nothing)'}`,
    '',
    `BUSINESS OUTCOMES:\n${node.outcomes.map((o) => `- ${o}`).join('\n')}`,
    '',
    node.costDetail.length > 0
      ? `COST BREAKDOWN:\n${node.costDetail.map((c) => `- ${c.label}: £${c.amount}${c.note ? ` (${c.note})` : ''}`).join('\n')}`
      : '',
    '',
    node.capabilities && node.capabilities.length > 0
      ? `CAPABILITIES / API SCOPES:\n${node.capabilities.map((c) => `- ${c.name}: ${c.description}`).join('\n')}`
      : '',
    '',
    relatedFlows.length > 0
      ? `CONNECTIONS:\n${relatedFlows.map((f) => `- ${f.from} ⇄ ${f.to}: ${f.summary}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const task = `You're the Evari Dashboard's in-app assistant for a specific service: "${node.label}". Craig is the founder asking a context-specific question about how to work with this integration, set it up, or decide about it. Answer concisely (under 180 words unless detail is needed), pragmatic, specific to Evari's scale (small team, UK, premium ebike). Reference the context above — don't invent features. If asked about cost, cite the cost breakdown. If asked how to add tokens, reference the env var names. If asked about alternatives, be honest about trade-offs. No markdown headers. Paragraphs are fine, bullet lists allowed for 3+ items.`;

  const prompt = [
    context,
    '',
    '---',
    '',
    ...(body.history?.slice(-6).map((m) => `${m.role === 'user' ? 'Craig' : 'Assistant'}: ${m.content}`) ?? []),
    `Craig: ${body.message}`,
    'Assistant:',
  ].join('\n');

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({
      mock: true,
      text: buildMockReply(node.label, body.message),
    });
  }

  try {
    const text = await generateBriefing({ voice: 'analyst', task, prompt });
    return NextResponse.json({ mock: false, text });
  } catch {
    return NextResponse.json({
      mock: true,
      text: buildMockReply(node.label, body.message),
    });
  }
}

function buildMockReply(label: string, message: string): string {
  const msg = (message ?? '').toLowerCase();
  if (msg.includes('token') || msg.includes('key') || msg.includes('add')) {
    return `To wire up ${label}, click the env var name in the Credentials section of this panel and paste the token. The dashboard writes it to .env.local — restart npm run dev to pick it up. For production, put the same value in the Vercel env var dashboard. (I'm running on a fallback — turn on the AI Gateway for a real answer.)`;
  }
  if (msg.includes('cost') || msg.includes('price') || msg.includes('cheap')) {
    return `The cost breakdown is in the panel above — hover the rows. For ${label} specifically, the real cost is usage-driven; at Evari's early stage most services sit at the free tier. Once we have traffic, costs step up. (Fallback reply — enable the AI Gateway for specifics.)`;
  }
  if (msg.includes('need') || msg.includes('necessary') || msg.includes('skip')) {
    return `${label} is wire-when-you-need-it. If this service is flagged "optional" in the panel, you can skip it entirely and the dashboard still runs. Connect it when you start using the feature it unlocks. (Fallback — the AI Gateway gives a tailored answer.)`;
  }
  return `I'm running on a fallback brain for ${label} — turn on the AI Gateway and I can answer this with real context from the wireframe.`;
}
