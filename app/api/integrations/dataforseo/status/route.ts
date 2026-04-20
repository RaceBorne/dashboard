import { NextResponse } from 'next/server';
import { getDataForSeoStatus } from '@/lib/integrations/dataforseo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/integrations/dataforseo/status
 *
 * Returns connection status and last sync info for all DataForSEO products.
 */
export async function GET() {
  const status = await getDataForSeoStatus();
  return NextResponse.json(status);
}
