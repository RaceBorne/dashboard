import { NextResponse } from 'next/server';
import { listContexts, saveContext, deleteContext } from '@/lib/context/activeContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const contexts = await listContexts();
  return NextResponse.json({ ok: true, contexts });
}

interface PostBody {
  id?: string;
  slug: string;
  name: string;
  description: string;
  voice: string;
  agentSystemPrompt?: string | null;
  defaultIndustries?: string[];
  defaultGeographies?: string[];
  defaultPersona?: string | null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;
  if (!body.slug || !body.name) {
    return NextResponse.json({ ok: false, error: 'slug + name required' }, { status: 400 });
  }
  const saved = await saveContext({
    id: body.id,
    slug: body.slug,
    name: body.name,
    description: body.description ?? '',
    voice: body.voice ?? '',
    agentSystemPrompt: body.agentSystemPrompt ?? null,
    defaultIndustries: body.defaultIndustries ?? [],
    defaultGeographies: body.defaultGeographies ?? [],
    defaultPersona: body.defaultPersona ?? null,
  });
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'Cap of 3 contexts reached or save failed' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, context: saved });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const deleted = await deleteContext(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: 'Cannot delete default context' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
