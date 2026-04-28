/**
 * GET /api/ai/assistant?surface=foo&scopeId=bar
 *   → { ok: true, thread: AIThread, messages: AIMessage[] }
 *
 * POST /api/ai/assistant
 *   body: { surface: string; scopeId?: string; context?: Record<string, unknown>; userText: string }
 *   → { ok: true, user, assistant }
 */

import { NextResponse } from 'next/server';

import { chat, findOrCreateThread, listMessages, surfaceKey } from '@/lib/ai/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const surface = (url.searchParams.get('surface') ?? '').trim();
  const scopeId = url.searchParams.get('scopeId');
  if (!surface) return NextResponse.json({ ok: false, error: 'surface required' }, { status: 400 });
  const key = surfaceKey(surface, scopeId);
  const thread = await findOrCreateThread(key);
  if (!thread) return NextResponse.json({ ok: false, error: 'thread create failed' }, { status: 500 });
  const messages = await listMessages(thread.id);
  return NextResponse.json({ ok: true, thread, messages });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { surface?: string; scopeId?: string | null; context?: Record<string, unknown>; userText?: string }
    | null;
  if (!body || typeof body.surface !== 'string' || !body.userText) {
    return NextResponse.json({ ok: false, error: 'surface + userText required' }, { status: 400 });
  }
  const key = surfaceKey(body.surface, body.scopeId);
  const thread = await findOrCreateThread(key, body.context ?? null);
  if (!thread) return NextResponse.json({ ok: false, error: 'thread create failed' }, { status: 500 });
  const result = await chat(thread.id, body.userText.trim(), body.surface, body.context ?? null);
  return NextResponse.json({ ok: true, ...result, threadId: thread.id });
}
