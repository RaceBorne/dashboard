import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getDashboardNavCounts } from '@/lib/dashboard/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createSupabaseAdmin();
  try {
    const counts = await getDashboardNavCounts(supabase);
    return NextResponse.json(counts);
  } catch {
    return NextResponse.json({
      plays: 0,
      prospectsActive: 0,
      leadsPipeline: 0,
      conversationsUnread: 0,
    });
  }
}
