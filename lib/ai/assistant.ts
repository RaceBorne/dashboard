/**
 * Page-aware AI Assistant threads.
 *
 * Every dashboard surface (campaigns, discovery, enrichment, ...) has
 * its own persistent thread keyed by `surface` (with optional context).
 * The pane mounts on every page, finds-or-creates the thread for the
 * current surface, and lets the operator chat with brand-grounded AI.
 *
 * Suggestions: each surface defines its own quick-action buttons; the
 * pane renders them above the chat input. Clicking one sends a
 * pre-built user prompt and gets the same assistant response treatment.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { generateTextWithFallback, hasAIGatewayCredentials, buildSystemPrompt } from './gateway';

export interface AIMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AIThread {
  id: string;
  surface: string;
  context: Record<string, unknown> | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Build a deterministic surface key. e.g. 'discovery' or 'discovery:abc-123'. */
export function surfaceKey(base: string, scopeId?: string | null): string {
  if (!scopeId) return base;
  return `${base}:${scopeId}`;
}

export async function findOrCreateThread(surface: string, context?: Record<string, unknown> | null): Promise<AIThread | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data: existing } = await sb
    .from('dashboard_ai_threads')
    .select('*')
    .eq('surface', surface)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const t = existing as { id: string; surface: string; context: Record<string, unknown> | null; title: string | null; created_at: string; updated_at: string };
    return { id: t.id, surface: t.surface, context: t.context, title: t.title, createdAt: t.created_at, updatedAt: t.updated_at };
  }
  const { data, error } = await sb
    .from('dashboard_ai_threads')
    .insert({ surface, context: context ?? null })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[ai.assistant.create]', error);
    return null;
  }
  const t = data as { id: string; surface: string; context: Record<string, unknown> | null; title: string | null; created_at: string; updated_at: string };
  return { id: t.id, surface: t.surface, context: t.context, title: t.title, createdAt: t.created_at, updatedAt: t.updated_at };
}

export async function listMessages(threadId: string, limit = 50): Promise<AIMessage[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from('dashboard_ai_messages')
    .select('id, thread_id, role, content, metadata, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[ai.assistant.listMessages]', error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; thread_id: string; role: 'user' | 'assistant' | 'system'; content: string; metadata: Record<string, unknown> | null; created_at: string }>).map((r) => ({
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    content: r.content,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
}

async function appendMessage(threadId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, unknown> | null): Promise<AIMessage | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_ai_messages')
    .insert({ thread_id: threadId, role, content, metadata: metadata ?? null })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[ai.assistant.appendMessage]', error);
    return null;
  }
  // Touch the thread so latest activity drives ordering.
  await sb.from('dashboard_ai_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  const r = data as { id: string; thread_id: string; role: 'user' | 'assistant' | 'system'; content: string; metadata: Record<string, unknown> | null; created_at: string };
  return {
    id: r.id, threadId: r.thread_id, role: r.role, content: r.content, metadata: r.metadata, createdAt: r.created_at,
  };
}

export async function chat(threadId: string, userText: string, surface: string, context: Record<string, unknown> | null): Promise<{ user: AIMessage | null; assistant: AIMessage | null }> {
  const user = await appendMessage(threadId, 'user', userText);
  if (!hasAIGatewayCredentials()) {
    const ass = await appendMessage(threadId, 'assistant', 'AI is not configured for this environment. Set ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY to enable the assistant.');
    return { user, assistant: ass };
  }
  const history = await listMessages(threadId, 30);
  const system = await buildSystemPrompt({
    voice: 'evari',
    task: `You are the inline AI assistant on the ${surface} surface of the Evari Dashboard. Stay short, concrete, action-oriented. No em-dashes. Reference specific items from the surface context when offered.`,
  });
  const conversation = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Operator' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  const ctxBlock = context && Object.keys(context).length > 0
    ? `\nSURFACE CONTEXT:\n${JSON.stringify(context).slice(0, 3000)}`
    : '';
  const prompt = `${conversation}${ctxBlock}\n\nOperator: ${userText}\nAssistant:`;
  try {
    const { text } = await generateTextWithFallback({
      model: process.env.AI_ASSISTANT_MODEL || 'anthropic/claude-haiku-4-5',
      system,
      prompt,
      temperature: 0.4,
    });
    const ass = await appendMessage(threadId, 'assistant', text.trim());
    return { user, assistant: ass };
  } catch (e) {
    console.warn('[ai.assistant.chat]', e);
    const ass = await appendMessage(threadId, 'assistant', 'Sorry, the AI request failed. Try again in a moment.');
    return { user, assistant: ass };
  }
}
