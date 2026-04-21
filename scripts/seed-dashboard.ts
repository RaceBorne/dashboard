/**
 * Seeds tasks + dashboard_* tables from lib/mock fixtures (idempotent upserts).
 *
 * Uses Supabase JS when SUPABASE_SERVICE_ROLE_KEY is set; otherwise uses
 * DATABASE_URL + pg (direct Postgres — same DB as Supabase).
 *
 * Usage: npm run db:seed
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { MOCK_LEADS } from '@/lib/mock/leads';
import { MOCK_THREADS } from '@/lib/mock/conversations';
import { MOCK_PLAYS } from '@/lib/mock/plays';
import { MOCK_PROSPECTS } from '@/lib/mock/prospects';
import { MOCK_KEYWORDS, MOCK_PAGES, MOCK_AUDIT_FINDINGS } from '@/lib/mock/seo';
import { MOCK_SOCIAL_POSTS } from '@/lib/mock/social';
import { MOCK_USERS } from '@/lib/mock/users';
import { MOCK_SENDERS } from '@/lib/mock/senders';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const MIGRATIONS = [
  'supabase/migrations/20260219120000_tasks.sql',
  'supabase/migrations/20260220100000_dashboard.sql',
  'supabase/migrations/20260421120000_seo_health_scan.sql',
  'supabase/migrations/20260421130000_ga4_devices_demographics.sql',
  'supabase/migrations/20260422120000_klaviyo_campaign_preview.sql',
  'supabase/migrations/20260424120000_outreach_senders_suppressions.sql',
];

async function applyMigrationsPg(client: Client) {
  for (const rel of MIGRATIONS) {
    const sql = readFileSync(resolve(process.cwd(), rel), 'utf8');
    try {
      await client.query(sql);
      console.log(`Migration applied: ${rel}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Idempotent re-runs: objects already there
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate key') ||
        msg.includes('duplicate_object')
      ) {
        console.log(`Migration skipped (objects exist): ${rel}`);
      } else {
        throw e;
      }
    }
  }
}

async function seedViaPg() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('DATABASE_URL is not set — cannot seed via Postgres.');
    process.exit(1);
  }
  const client = new Client({
    connectionString: conn,
    ssl: conn.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await applyMigrationsPg(client);

    const upsertJson = async (table: string, idCol: string, rows: { id: string; payload: unknown }[]) => {
      for (const r of rows) {
        await client.query(
          `INSERT INTO public.${table} (${idCol}, payload) VALUES ($1, $2::jsonb)
           ON CONFLICT (${idCol}) DO UPDATE SET payload = EXCLUDED.payload`,
          [r.id, JSON.stringify(r.payload)],
        );
      }
    };

    await upsertJson('dashboard_leads', 'id', MOCK_LEADS.map((l) => ({ id: l.id, payload: l })));
    console.log(`dashboard_leads: ${MOCK_LEADS.length}`);

    await upsertJson('dashboard_threads', 'id', MOCK_THREADS.map((t) => ({ id: t.id, payload: t })));
    console.log(`dashboard_threads: ${MOCK_THREADS.length}`);

    await upsertJson('dashboard_plays', 'id', MOCK_PLAYS.map((p) => ({ id: p.id, payload: p })));
    console.log(`dashboard_plays: ${MOCK_PLAYS.length}`);

    await upsertJson(
      'dashboard_prospects',
      'id',
      MOCK_PROSPECTS.map((p) => ({ id: p.id, payload: p })),
    );
    console.log(`dashboard_prospects: ${MOCK_PROSPECTS.length}`);

    // Traffic tables (dashboard_traffic_days, dashboard_traffic_sources,
    // dashboard_landing_pages) are intentionally NOT seeded here — they're
    // populated by the real GA4 ingest (`npm run ingest:ga4` or the nightly
    // cron). Seeding fake rows here would collide with real GA4 data.

    await upsertJson('dashboard_seo_keywords', 'id', MOCK_KEYWORDS.map((k) => ({ id: k.id, payload: k })));
    console.log(`dashboard_seo_keywords: ${MOCK_KEYWORDS.length}`);

    await upsertJson('dashboard_seo_pages', 'id', MOCK_PAGES.map((p) => ({ id: p.id, payload: p })));
    console.log(`dashboard_seo_pages: ${MOCK_PAGES.length}`);

    await upsertJson(
      'dashboard_audit_findings',
      'id',
      MOCK_AUDIT_FINDINGS.map((f) => ({ id: f.id, payload: f })),
    );
    console.log(`dashboard_audit_findings: ${MOCK_AUDIT_FINDINGS.length}`);

    await upsertJson(
      'dashboard_social_posts',
      'id',
      MOCK_SOCIAL_POSTS.map((p) => ({ id: p.id, payload: p })),
    );
    console.log(`dashboard_social_posts: ${MOCK_SOCIAL_POSTS.length}`);

    await upsertJson('dashboard_users', 'id', MOCK_USERS.map((u) => ({ id: u.id, payload: u })));
    console.log(`dashboard_users: ${MOCK_USERS.length}`);

    await upsertJson(
      'dashboard_outreach_senders',
      'id',
      MOCK_SENDERS.map((s) => ({ id: s.id, payload: s })),
    );
    console.log(`dashboard_outreach_senders: ${MOCK_SENDERS.length}`);

    console.log('Done (via DATABASE_URL / pg).');
  } finally {
    await client.end();
  }
}

async function seedViaSupabaseJs() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL + service role required');
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const upsertPayload = async (table: string, rows: { id: string; payload: unknown }[]) => {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  };

  await upsertPayload(
    'dashboard_leads',
    MOCK_LEADS.map((l) => ({ id: l.id, payload: l })),
  );
  console.log(`dashboard_leads: ${MOCK_LEADS.length}`);

  await upsertPayload(
    'dashboard_threads',
    MOCK_THREADS.map((t) => ({ id: t.id, payload: t })),
  );
  console.log(`dashboard_threads: ${MOCK_THREADS.length}`);

  await upsertPayload(
    'dashboard_plays',
    MOCK_PLAYS.map((p) => ({ id: p.id, payload: p })),
  );
  console.log(`dashboard_plays: ${MOCK_PLAYS.length}`);

  await upsertPayload(
    'dashboard_prospects',
    MOCK_PROSPECTS.map((p) => ({ id: p.id, payload: p })),
  );
  console.log(`dashboard_prospects: ${MOCK_PROSPECTS.length}`);

  // Traffic tables (dashboard_traffic_days, dashboard_traffic_sources,
  // dashboard_landing_pages) are intentionally NOT seeded here — they're
  // populated by the real GA4 ingest (`npm run ingest:ga4` or the nightly
  // cron). Seeding fake rows here would collide with real GA4 data.

  await upsertPayload(
    'dashboard_seo_keywords',
    MOCK_KEYWORDS.map((k) => ({ id: k.id, payload: k })),
  );
  console.log(`dashboard_seo_keywords: ${MOCK_KEYWORDS.length}`);

  await upsertPayload(
    'dashboard_seo_pages',
    MOCK_PAGES.map((p) => ({ id: p.id, payload: p })),
  );
  console.log(`dashboard_seo_pages: ${MOCK_PAGES.length}`);

  await upsertPayload(
    'dashboard_audit_findings',
    MOCK_AUDIT_FINDINGS.map((f) => ({ id: f.id, payload: f })),
  );
  console.log(`dashboard_audit_findings: ${MOCK_AUDIT_FINDINGS.length}`);

  await upsertPayload(
    'dashboard_social_posts',
    MOCK_SOCIAL_POSTS.map((p) => ({ id: p.id, payload: p })),
  );
  console.log(`dashboard_social_posts: ${MOCK_SOCIAL_POSTS.length}`);

  await upsertPayload(
    'dashboard_users',
    MOCK_USERS.map((u) => ({ id: u.id, payload: u })),
  );
  console.log(`dashboard_users: ${MOCK_USERS.length}`);

  await upsertPayload(
    'dashboard_outreach_senders',
    MOCK_SENDERS.map((s) => ({ id: s.id, payload: s })),
  );
  console.log(`dashboard_outreach_senders: ${MOCK_SENDERS.length}`);

  console.log('Done (via Supabase service role).');
}

async function main() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    await seedViaSupabaseJs();
    return;
  }
  if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL + pg (no service role in env).');
    await seedViaPg();
    return;
  }
  console.error(
    'Need either (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) or DATABASE_URL',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
