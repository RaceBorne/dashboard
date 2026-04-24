/**
 * One-shot DataForSEO ingest runner.
 *
 * Pulls three datasets in sequence:
 *   1. Ranked keywords for evari.cc     -> dashboard_dataforseo_serp_keywords
 *   2. Ranked keywords for every tracked competitor list
 *   3. On-page scan for evari.cc        -> dashboard_dataforseo_onpage_*
 *
 * Required env (reads from .env.local): DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:  npx tsx scripts/ingest-dataforseo.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

(async () => {
  const {
    ingestRankedKeywords,
    ingestOnpage,
    isDataForSeoConnected,
  } = await import('@/lib/integrations/dataforseo');
  const { createSupabaseAdmin } = await import('@/lib/supabase/admin');

  if (!isDataForSeoConnected()) {
    console.error('DataForSEO not connected — check DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD in .env.local.');
    process.exit(1);
  }
  const supa = createSupabaseAdmin();
  if (!supa) {
    console.error('Supabase admin unavailable — SUPABASE_SERVICE_ROLE_KEY missing.');
    process.exit(1);
  }

  // Fetch the list of targets: Evari itself + every competitor domain the
  // Keywords workspace knows about.
  console.log('1. Discovering targets from dashboard_keyword_lists...');
  const { data: lists } = await supa
    .from('dashboard_keyword_lists')
    .select('id, label, kind, target_domain')
    .is('retired_at', null);

  const targets = new Set<string>(['evari.cc']);
  for (const l of lists ?? []) {
    if (l.kind === 'competitor' && typeof l.target_domain === 'string' && l.target_domain) {
      targets.add(l.target_domain);
    }
  }
  const targetList = [...targets];
  console.log('   targets:', targetList.join(', '));

  // ---- 2. Ranked keywords per target ----
  console.log('\n2. Pulling ranked keywords for each target (limit 200 each)...');
  for (const target of targetList) {
    const list = (lists ?? []).find(
      (l) => l.kind === 'competitor' && l.target_domain === target,
    );
    const startedAt = Date.now();
    try {
      const res = await ingestRankedKeywords({
        target,
        limit: 200,
        locationCode: 2826,
        languageCode: 'en',
        ...(list ? { listId: list.id } : {}),
      });
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        '   ' + target + ': rows=' + res.rowsWritten + ', cost=$' + (res.costUsd ?? 0).toFixed(2) + ', ' + secs + 's',
      );
    } catch (err) {
      console.log('   ' + target + ': FAILED —', err instanceof Error ? err.message : err);
    }
  }

  // ---- 3. On-page scan for evari.cc ----
  console.log('\n3. On-page scan for evari.cc (homepage + top 10 pages)...');
  try {
    const urls = [
      'https://www.evari.cc/',
      'https://www.evari.cc/products',
      'https://www.evari.cc/pages/about',
    ];
    const startedAt = Date.now();
    const res = await ingestOnpage({ urls, target: 'evari.cc' });
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('   rows=' + res.rowsWritten + ', ' + secs + 's');
  } catch (err) {
    console.log('   FAILED —', err instanceof Error ? err.message : err);
  }

  console.log('\nDone. Refresh /keywords and /synopsis — DataForSEO should now report connected with data.');
  process.exit(0);
})();
