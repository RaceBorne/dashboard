import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getPlay } from '@/lib/dashboard/repository';

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
