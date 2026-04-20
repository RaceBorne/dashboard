/**
 * Run a single SQL migration file against DATABASE_URL (Supabase / Postgres).
 *
 *   DATABASE_URL=... npx tsx scripts/apply-migration-file.ts supabase/migrations/20260421120000_seo_health_scan.sql
 *
 * If the pooler returns "Tenant or user not found", copy the **Session mode**
 * or **Direct** connection string from Supabase → Project Settings → Database.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const rel = process.argv[2];
if (!rel) {
  console.error('Usage: npx tsx scripts/apply-migration-file.ts <path-to.sql>');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = readFileSync(resolve(process.cwd(), rel), 'utf8');

const client = new Client({
  connectionString: url,
  ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied: ${rel}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already exists')) {
      console.log(`Skipped (already exists): ${rel}`);
    } else {
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
