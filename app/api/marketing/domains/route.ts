import { NextResponse } from 'next/server';

import { addDomain, listDomains } from '@/lib/marketing/domains';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const domains = await listDomains();
  return NextResponse.json({ domains });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { domainName?: string } | null;
  const domainName = body?.domainName?.trim();
  if (!domainName) {
    return NextResponse.json({ ok: false, error: 'domainName required' }, { status: 400 });
  }
  const domain = await addDomain(domainName);
  if (!domain) return NextResponse.json({ ok: false, error: 'add failed' }, { status: 500 });
  return NextResponse.json({ ok: true, domain });
}
