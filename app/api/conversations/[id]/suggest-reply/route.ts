import { NextResponse } from 'next/server';
import { generateBriefing, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import { replySuggestionPrompt } from '@/lib/ai/prompts';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, getThread } from '@/lib/dashboard/repository';

const FALLBACK = (subject: string) =>
  `Thanks — quick reply on the points above.

I'll come back to you with a fuller note tomorrow morning. In the meantime, if you'd like to bring this forward I have time on Thursday at 10:00 or Friday at 16:00.

Craig

> _Mock reply — connect AI_GATEWAY_API_KEY for a freshly generated draft in your voice (subject: ${subject})._`;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();
  const thread = await getThread(supabase, id);
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

  if (!hasAIGatewayCredentials()) {
    return NextResponse.json({ markdown: FALLBACK(thread.subject), mock: true });
  }

  const lead = thread.leadId ? await getLead(supabase, thread.leadId) : undefined;

  try {
    const markdown = await generateBriefing({
      task: 'Draft a customer reply in the Evari voice',
      voice: 'evari',
      prompt: replySuggestionPrompt(thread, lead),
    });
    return NextResponse.json({ markdown, mock: false });
  } catch (err) {
    return NextResponse.json({
      markdown: `${FALLBACK(thread.subject)}\n\n> _AI Gateway error: ${(err as Error).message}_`,
      mock: true,
    });
  }
}
