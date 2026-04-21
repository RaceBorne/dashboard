import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';
import { listCachedGmailThreads } from '@/lib/integrations/gmail';
import type { GmailThreadSummary } from '@/lib/types';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Per-play chat. Grounded in the play's brief, research notes,
 * existing targets, and prior chat history so every reply picks up where we
 * left off — even weeks later.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    message: string;
    history?: ChatMessage[];
  };
  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 });
  }

  const play = await getPlay(createSupabaseAdmin(), id);
  if (!play) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Recent customer context from Gmail (if connected). We pull 12 most recent
  // threads total, biased toward support + klaviyo-reply since those are the
  // ones with the richest "what are real customers actually saying" signal.
  const gmailContext = await safeGmailContext();

  const prompt = [
    `Play title: ${play.title}`,
    `Stage: ${play.stage}`,
    '',
    'Brief:',
    play.brief,
    '',
    play.research.length > 0
      ? 'Research notes so far:\n' +
        play.research.map((r) => `- ${r.title}: ${r.body}`).join('\n')
      : '',
    play.targets.length > 0
      ? `Targets so far (${play.targets.length}):\n` +
        play.targets
          .map((t) => `- ${t.name}${t.org ? ' @ ' + t.org : ''}${t.status ? ' [' + t.status + ']' : ''}`)
          .join('\n')
      : '',
    play.messaging.length > 0
      ? `Messaging drafts (${play.messaging.length}):\n` +
        play.messaging
          .map((m) => `- ${m.channel}${m.subject ? ' · "' + m.subject + '"' : ''}`)
          .join('\n')
      : '',
    gmailContext,
    '',
    '---',
    'Conversation so far:',
    ...(body.history ?? play.chat.map(({ role, content }) => ({ role, content })))
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Craig' : 'You'}: ${m.content}`),
    '',
    `Craig: ${message}`,
  ]
    .filter(Boolean)
    .join('\n');

  const task = `Help Craig develop this play. Be specific. Cite the research + targets above when it's relevant. If something needs doing (scraping, drafting, phone calls), name it and we add it to the task list. Keep replies punchy and decision-oriented. Markdown ok.`;

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({
      mock: true,
      markdown:
        `**Offline — AI Gateway not wired.** I can see this play ("${play.title}", stage: ${play.stage}) and the ${play.research.length} research notes / ${play.targets.length} targets already in it. Once you run \`vercel link\` + \`vercel env pull\`, I'll reply here with real context.`,
    });
  }

  try {
    const text = await generateBriefing({ voice: 'analyst', task, prompt });
    return NextResponse.json({ mock: false, markdown: text });
  } catch {
    return NextResponse.json({
      mock: true,
      markdown:
        'Something went wrong calling the AI Gateway. Check the logs or try again.',
    });
  }
}

/**
 * Build the "Recent customer context" prompt block from the Gmail ingest.
 * Returns '' if Gmail isn't connected or the table is empty — callers should
 * drop the block with a `.filter(Boolean)` so the prompt stays tidy.
 *
 * Bias: we pull up to 8 support + 4 klaviyo-reply + 3 outbound threads,
 * most-recent-first. Outbound is included last because it's lowest-signal
 * for "what are customers saying" — but it's useful for "what have we
 * already said" when spitballing follow-up.
 */
async function safeGmailContext(): Promise<string> {
  try {
    const [support, klaviyoReply, outbound] = await Promise.all([
      listCachedGmailThreads({ category: 'support', limit: 8 }),
      listCachedGmailThreads({ category: 'klaviyo-reply', limit: 4 }),
      listCachedGmailThreads({ category: 'outbound', limit: 3 }),
    ]);
    const threads = [...support, ...klaviyoReply, ...outbound];
    if (threads.length === 0) return '';
    return (
      'Recent customer context (from Gmail, last 30 days):\n' +
      threads.map((t) => `- [${t.category}] ${formatGmailRow(t)}`).join('\n')
    );
  } catch {
    // Never fail a chat because Gmail ingest is down — just skip the block.
    return '';
  }
}

function formatGmailRow(t: GmailThreadSummary): string {
  const when = t.lastMessageAt.slice(0, 10);
  const subject = t.subject.replace(/\s+/g, ' ').trim().slice(0, 120);
  const snippet = t.snippet.replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${when} · "${subject}" — ${snippet}`;
}
