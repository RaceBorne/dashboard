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
import { MOCK_TRAFFIC_30D, MOCK_TRAFFIC_SOURCES, MOCK_LANDING_PAGES } from '@/lib/mock/traffic';
import { MOCK_KEYWORDS, MOCK_PAGES, MOCK_AUDIT_FINDINGS } from '@/lib/mock/seo';
import { MOCK_SOCIAL_POSTS } from '@/lib/mock/social';
import { MOCK_USERS } from '@/lib/mock/users';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const MIGRATIONS = [
  'supabase/migrations/20260219120000_tasks.sql',
  'supabase/migrations/20260220100000_dashboard.sql',
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

    for (const d of MOCK_TRAFFIC_30D) {
      await client.query(
        `INSERT INTO public.dashboard_traffic_days (day, sessions, users, bounce_rate, avg_duration_sec, conversions)
         VALUES ($1::date, $2, $3, $4, $5, $6)
         ON CONFLICT (day) DO UPDATE SET
           sessions = EXCLUDED.sessions, users = EXCLUDED.users, bounce_rate = EXCLUDED.bounce_rate,
           avg_duration_sec = EXCLUDED.avg_duration_sec, conversions = EXCLUDED.conversions`,
        [d.date, d.sessions, d.users, d.bounceRate, d.avgDurationSec, d.conversions],
      );
    }
    console.log(`dashboard_traffic_days: ${MOCK_TRAFFIC_30D.length}`);

    await client.query('DELETE FROM public.dashboard_traffic_sources');
    let sortOrder = 0;
    for (const s of MOCK_TRAFFIC_SOURCES) {
      await client.query(
        `INSERT INTO public.dashboard_traffic_sources (sort_order, source, medium, sessions, conversions, conversion_rate)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sortOrder++, s.source, s.medium, s.sessions, s.conversions, s.conversionRate],
      );
    }
    console.log(`dashboard_traffic_sources: ${MOCK_TRAFFIC_SOURCES.length}`);

    for (const p of MOCK_LANDING_PAGES) {
      await client.query(
        `INSERT INTO public.dashboard_landing_pages (path, payload) VALUES ($1, $2::jsonb)
         ON CONFLICT (path) DO UPDATE SET payload = EXCLUDED.payload`,
        [p.path, JSON.stringify(p)],
      );
    }
    console.log(`dashboard_landing_pages: ${MOCK_LANDING_PAGES.length}`);

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

  for (const d of MOCK_TRAFFIC_30D) {
    const { error } = await supabase.from('dashboard_traffic_days').upsert(
      {
        day: d.date,
        sessions: d.sessions,
        users: d.users,
        bounce_rate: d.bounceRate,
        avg_duration_sec: d.avgDurationSec,
        conversions: d.conversions,
      },
      { onConflict: 'day' },
    );
    if (error) throw new Error(`dashboard_traffic_days: ${error.message}`);
  }
  console.log(`dashboard_traffic_days: ${MOCK_TRAFFIC_30D.length}`);

  await supabase.from('dashboard_traffic_sources').delete().neq('id', 0);
  let sortOrder = 0;
  for (const s of MOCK_TRAFFIC_SOURCES) {
    const { error } = await supabase.from('dashboard_traffic_sources').insert({
      sort_order: sortOrder++,
      source: s.source,
      medium: s.medium,
      sessions: s.sessions,
      conversions: s.conversions,
      conversion_rate: s.conversionRate,
    });
    if (error) throw new Error(`dashboard_traffic_sources: ${error.message}`);
  }
  console.log(`dashboard_traffic_sources: ${MOCK_TRAFFIC_SOURCES.length}`);

  {
    const { error } = await supabase.from('dashboard_landing_pages').upsert(
      MOCK_LANDING_PAGES.map((p) => ({ path: p.path, payload: p })),
      { onConflict: 'path' },
    );
    if (error) throw new Error(`dashboard_landing_pages: ${error.message}`);
  }
  console.log(`dashboard_landing_pages: ${MOCK_LANDING_PAGES.length}`);

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
