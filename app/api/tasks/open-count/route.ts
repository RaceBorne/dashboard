import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { countOpenTasks } from '@/lib/tasks/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ open: 0 });
  }
  try {
    const open = await countOpenTasks(supabase);
    return NextResponse.json({ open });
  } catch {
    return NextResponse.json({ open: 0 });
  }
}
