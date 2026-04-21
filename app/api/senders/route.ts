import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { listSenders, upsertSender } from '@/lib/dashboard/repository';
import type { OutreachSender } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_SIGNATURE = `<p>{{displayName}}{{#if role}} · {{role}}{{/if}}<br/>
Evari Speed Bikes<br/>
<a href="mailto:{{email}}">{{email}}</a></p>
{{#if logoUrl}}<img src="{{logoUrl}}" alt="Evari" height="32"/>{{/if}}`;

function newId(): string {
  return 'sender_' + Math.random().toString(36).slice(2, 10);
}

export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ senders: [], note: 'Supabase not configured' });
  }
  try {
    const senders = await listSenders(supabase);
    return NextResponse.json({ senders });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), senders: [] },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  try {
    const body = (await req.json()) as Partial<OutreachSender>;
    if (!body.email?.trim()) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }
    if (!body.displayName?.trim()) {
      return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const sender: OutreachSender = {
      id: body.id ?? newId(),
      email: body.email.trim().toLowerCase(),
      displayName: body.displayName.trim(),
      role: body.role?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      website: body.website?.trim() || undefined,
      signatureHtml: body.signatureHtml?.trim() || FALLBACK_SIGNATURE,
      logoUrl: body.logoUrl || undefined,
      isActive: body.isActive ?? true,
      isDefault: body.isDefault ?? false,
      oauthConnected: body.oauthConnected ?? false,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
      lastSentAt: body.lastSentAt,
    };
    await upsertSender(supabase, sender);
    return NextResponse.json({ sender });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
