import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getLead, upsertLead } from '@/lib/dashboard/repository';
import type { Lead, LeadNote } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notes CRUD for a Lead row (prospect or lead tier). Notes are stored on
 * the lead's payload as `noteEntries: LeadNote[]` — timestamped bubbles the
 * operator can edit / delete individually from the CompanyPanel Notes tab.
 *
 *   POST   /api/leads/[id]/notes    { text }                -> append a new note
 *   PATCH  /api/leads/[id]/notes    { id, text }            -> edit existing note
 *   DELETE /api/leads/[id]/notes    { id }                  -> remove a note
 */

interface PostBody {
  text?: string;
}

interface PatchBody {
  id?: string;
  text?: string;
}

interface DeleteBody {
  id?: string;
}

function newNoteId(): string {
  return 'note_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function loadOr404(id: string): Promise<
  | { ok: true; lead: Lead; supabase: ReturnType<typeof createSupabaseAdmin> }
  | { ok: false; response: NextResponse }
> {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'Supabase admin client unavailable' },
        { status: 500 },
      ),
    };
  }
  const lead = await getLead(supabase, id);
  if (!lead) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 }),
    };
  }
  return { ok: true, lead, supabase };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOr404(id);
  if (!loaded.ok) return loaded.response;

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const text = (body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: 'Note text is required' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const note: LeadNote = { id: newNoteId(), text, createdAt: nowIso };
  const next: Lead = {
    ...loaded.lead,
    noteEntries: [...(loaded.lead.noteEntries ?? []), note],
    lastTouchAt: nowIso,
  };

  const saved = await upsertLead(loaded.supabase, next);
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: saved, note });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOr404(id);
  if (!loaded.ok) return loaded.response;

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const noteId = (body.id ?? '').trim();
  const text = (body.text ?? '').trim();
  if (!noteId) {
    return NextResponse.json({ ok: false, error: 'Note id is required' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ ok: false, error: 'Note text is required' }, { status: 400 });
  }

  const existing = loaded.lead.noteEntries ?? [];
  const idx = existing.findIndex((n) => n.id === noteId);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: 'Note not found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const updated: LeadNote = { ...existing[idx]!, text, updatedAt: nowIso };
  const nextNotes = [...existing];
  nextNotes[idx] = updated;

  const next: Lead = { ...loaded.lead, noteEntries: nextNotes, lastTouchAt: nowIso };
  const saved = await upsertLead(loaded.supabase, next);
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: saved, note: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await loadOr404(id);
  if (!loaded.ok) return loaded.response;

  const body = (await req.json().catch(() => ({}))) as DeleteBody;
  const noteId = (body.id ?? '').trim();
  if (!noteId) {
    return NextResponse.json({ ok: false, error: 'Note id is required' }, { status: 400 });
  }

  const existing = loaded.lead.noteEntries ?? [];
  const nextNotes = existing.filter((n) => n.id !== noteId);
  if (nextNotes.length === existing.length) {
    // Idempotent — note already absent.
    return NextResponse.json({ ok: true, lead: loaded.lead });
  }

  const nowIso = new Date().toISOString();
  const next: Lead = { ...loaded.lead, noteEntries: nextNotes, lastTouchAt: nowIso };
  const saved = await upsertLead(loaded.supabase, next);
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead: saved });
}
