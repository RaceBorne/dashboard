/**
 * Email Contacts API — backed by dashboard_leads.
 *
 *   POST   create a manual contact
 *   PATCH  body: { id, ...editableFields }   updates an existing lead
 */

import { NextResponse } from 'next/server';

import { createManualContact, updateContactFields, loadContactsBundle } from '@/lib/marketing/leads-as-contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const bundle = await loadContactsBundle();
  return NextResponse.json({ ok: true, ...bundle });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim();
  if (!fullName) return NextResponse.json({ ok: false, error: 'fullName required' }, { status: 400 });
  if (!email)    return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 });
  const contact = await createManualContact({
    fullName, email,
    phone:       body.phone       ? String(body.phone).trim()       : undefined,
    companyName: body.companyName ? String(body.companyName).trim() : undefined,
    jobTitle:    body.jobTitle    ? String(body.jobTitle).trim()    : undefined,
  });
  if (!contact) return NextResponse.json({ ok: false, error: 'Create failed' }, { status: 500 });
  return NextResponse.json({ ok: true, contact });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  }
  const { id, ...rest } = body;
  const patch: Record<string, string> = {};
  for (const k of ['fullName','email','phone','jobTitle','companyName','companyUrl','linkedinUrl','location','address','synopsis']) {
    if (k in rest && (rest as Record<string, unknown>)[k] != null) {
      patch[k] = String((rest as Record<string, unknown>)[k] ?? '');
    }
  }
  const contact = await updateContactFields(id, patch);
  if (!contact) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 });
  return NextResponse.json({ ok: true, contact });
}
