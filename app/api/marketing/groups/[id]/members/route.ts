import { NextResponse } from 'next/server';
import { addApprovedMembers, importLeadsAsPending, listMembers } from '@/lib/marketing/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const members = await listMembers(id);
  return NextResponse.json({ ok: true, members });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    mode?: 'manual' | 'csv' | 'from_leads';
    members?: Array<{ email: string; firstName?: string | null; lastName?: string | null; company?: string | null }>;
    leadIds?: string[];
  } | null;
  if (!body?.mode) return NextResponse.json({ ok: false, error: 'mode required' }, { status: 400 });
  if (body.mode === 'from_leads') {
    const ids = (body.leadIds ?? []).filter((x) => typeof x === 'string');
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'leadIds[] required' }, { status: 400 });
    const result = await importLeadsAsPending(id, ids);
    return NextResponse.json({ ok: true, ...result, status: 'pending' });
  }
  const inputs = (body.members ?? []).filter((m) => m && typeof m.email === 'string');
  if (inputs.length === 0) return NextResponse.json({ ok: false, error: 'members[] required' }, { status: 400 });
  const result = await addApprovedMembers(id, inputs, body.mode);
  return NextResponse.json({ ok: true, ...result, status: 'approved' });
}
