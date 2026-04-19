import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getAssistantTaskSummary } from '@/lib/tasks/repository';
import {
  listLeads,
  listPlays,
  listProspects,
} from '@/lib/dashboard/repository';
import { getIntegrationStatuses } from '@/lib/integrations/status';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Assistant chat endpoint — powers the "Hey Evari" voice assistant on the
 * Briefing page. Replies are kept short and spoken-friendly so the TTS
 * voice reads well. Grounded in the dashboard's current state so it can
 * answer questions about tasks, plays, leads, prospects, connections etc.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    message: string;
    history?: ChatMessage[];
    greeting?: boolean;
  };

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  // Compact dashboard state for grounding
  const todayYmd = now.toISOString().slice(0, 10);
  let openTasks = 0;
  let todayTasks = 0;
  let urgentTasks = 0;
  const supabase = createSupabaseAdmin();
  if (supabase) {
    try {
      const s = await getAssistantTaskSummary(supabase, todayYmd);
      openTasks = s.openTasks;
      todayTasks = s.todayTasks;
      urgentTasks = s.urgentTasks;
    } catch {
      // keep zeros if Supabase is unavailable
    }
  }
  let activeLeads = 0;
  let readyProspects = 0;
  let activePlays: Awaited<ReturnType<typeof listPlays>> = [];
  if (supabase) {
    try {
      const [leads, prospects, plays] = await Promise.all([
        listLeads(supabase),
        listProspects(supabase),
        listPlays(supabase),
      ]);
      activeLeads = leads.filter((l) => !['won', 'lost', 'cold'].includes(l.stage)).length;
      readyProspects = prospects.filter(
        (p) => p.status === 'replied_positive' || p.status === 'qualified',
      ).length;
      activePlays = plays.filter((p) => p.stage !== 'retired' && p.stage !== 'idea');
    } catch {
      /* keep zeros */
    }
  }
  const integrations = getIntegrationStatuses();
  const connected = integrations.filter((i) => i.connected).length;
  const missing = integrations.filter((i) => !i.connected).length;

  const context = [
    `Date/time: ${now.toLocaleString('en-GB')}`,
    `Time of day: ${timeOfDay}`,
    `User: Craig (founder, Evari Speed Bikes)`,
    '',
    'Dashboard state:',
    `- ${openTasks} open tasks (${urgentTasks} urgent, ${todayTasks} due today)`,
    `- ${activeLeads} active leads in the pipeline`,
    `- ${readyProspects} prospects ready to promote to leads`,
    `- ${activePlays.length} plays in flight: ${activePlays.map((p) => p.title).join('; ')}`,
    `- ${connected} of ${integrations.length} connections wired (${missing} waiting)`,
  ].join('\n');

  const task = body.greeting
    ? `Greet Craig warmly in one short sentence suitable for being spoken aloud. Ask how he is. Then in one follow-up sentence offer to give him a synopsis. Keep the whole reply under 25 words. No markdown. No greetings like "hello there" — more natural like a friend would.`
    : `You are Evari — Craig's in-dashboard voice assistant. Reply in a conversational, spoken-English tone, short and warm. Give real numbers from the dashboard state above when asked. Under 60 words unless Craig asks for detail. No markdown, no bullet points — this is read aloud by a text-to-speech engine.`;

  const prompt = [
    context,
    '',
    '---',
    '',
    ...(body.history?.slice(-8).map((m) => `${m.role === 'user' ? 'Craig' : 'Evari'}: ${m.content}`) ?? []),
    body.greeting
      ? 'Craig just opened the assistant.'
      : `Craig: ${body.message}`,
  ].join('\n');

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ mock: true, text: buildMockReply(body, { timeOfDay, openTasks, urgentTasks, readyProspects, activePlays: activePlays.length }) });
  }

  try {
    const text = await generateBriefing({ voice: 'analyst', task, prompt });
    return NextResponse.json({ mock: false, text });
  } catch {
    return NextResponse.json({ mock: true, text: buildMockReply(body, { timeOfDay, openTasks, urgentTasks, readyProspects, activePlays: activePlays.length }) });
  }
}

function buildMockReply(
  body: { message: string; greeting?: boolean },
  s: { timeOfDay: string; openTasks: number; urgentTasks: number; readyProspects: number; activePlays: number },
) {
  if (body.greeting) {
    return `Morning, Craig. How are you? Want a quick synopsis of what's on the board today?`;
  }
  const msg = (body.message ?? '').toLowerCase();
  if (msg.includes('task')) {
    return `You've got ${s.openTasks} open tasks right now, with ${s.urgentTasks} flagged urgent. Want me to run through the urgent ones?`;
  }
  if (msg.includes('prospect') || msg.includes('lead')) {
    return `${s.readyProspects} prospects are ready to promote to leads. Worth a look on the prospects page.`;
  }
  if (msg.includes('play') || msg.includes('campaign')) {
    return `${s.activePlays} plays are in flight. The medical practices one is your most active — fifteen clinics being worked right now.`;
  }
  if (msg.includes('connect')) {
    return `Shopify, Klaviyo, and Google are the three to wire next. Once those are in, the dashboard starts answering with real data.`;
  }
  if (msg.includes('synopsis') || msg.includes('summary') || msg.includes('brief')) {
    return `${s.openTasks} open tasks with ${s.urgentTasks} urgent. ${s.readyProspects} prospects ready to promote. ${s.activePlays} plays in flight. The sitemap fix on evari.cc is top of the list.`;
  }
  return `I'm running on a fallback brain until the AI Gateway's wired. Once you've run vercel link, I'll be fully here.`;
}
