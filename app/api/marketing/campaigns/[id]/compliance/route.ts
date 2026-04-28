import { NextResponse } from 'next/server';
import { runComplianceChecks } from '@/lib/marketing/compliance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const checks = await runComplianceChecks(id);
  return NextResponse.json({ ok: true, checks });
}
