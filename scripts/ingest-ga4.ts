/**
 * One-shot GA4 ingest runner.
 *
 * Wipes any seeded/mock rows in `dashboard_traffic_days` + `dashboard_traffic_sources`
 * and then pulls real GA4 data (365d trends + 28d per-property rollups) via the
 * same `ingestGA4Rollup` code path the cron job uses.
 *
 * Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
 * GA4_PROPERTY_ID, plus SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage: npx tsx scripts/ingest-ga4.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// These imports must come AFTER dotenv has loaded so that isGA4Connected() +
// the Supabase admin client pick up the env.
(async () => {
  const { ingestGA4Rollup, isGA4Connected } = await import('@/lib/integrations/google');
  const { createSupabaseAdmin } = await import('@/lib/supabase/admin');

  if (!isGA4Connected()) {
    console.error('GA4 is not connected — set GA4_PROPERTY_ID + Google OAuth env.');
    process.exit(1);
  }

  const supa = createSupabaseAdmin();
  if (!supa) {
    console.error('Supabase admin client unavailable — set SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  // Wipe the two tables that were historically seeded with mock rows.
  // `traffic_sources` is truncated + reinserted by ingestGA4Rollup anyway,
  // but we wipe up-front to keep the order of operations obvious.
  console.log('Wiping mock rows in dashboard_traffic_days + dashboard_traffic_sources...');
  const wipeDays = await supa
    .from('dashboard_traffic_days')
    .delete()
    .gte('day', '1900-01-01'); // match-all filter (delete() without a filter is blocked)
  if (wipeDays.error) {
    console.error(`Failed to wipe traffic days: ${wipeDays.error.message}`);
    process.exit(1);
  }
  const wipeSources = await supa
    .from('dashboard_traffic_sources')
    .delete()
    .gte('sort_order', 0);
  if (wipeSources.error) {
    console.error(`Failed to wipe traffic sources: ${wipeSources.error.message}`);
    process.exit(1);
  }

  console.log('Running ingestGA4Rollup (365d days + 28d rollups)...');
  const started = Date.now();
  const result = await ingestGA4Rollup({
    days: 365,
    maxSources: 50,
    maxPages: 100,
    maxGeo: 250,
    maxChannels: 20,
    maxCities: 200,
    maxLanguages: 20,
    maxEvents: 30,
    maxDevices: 10,
    maxDemographics: 50,
  });
  const elapsed = Math.round((Date.now() - started) / 1000);

  console.log('Ingest complete in ' + elapsed + 's:');
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
