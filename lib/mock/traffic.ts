// All traffic mock fixtures have been retired. The Traffic page and the
// Supabase tables it reads (`dashboard_traffic_days`, `dashboard_traffic_sources`,
// `dashboard_ga4_*_28d`) are now populated exclusively by the real GA4 ingest
// (`npm run ingest:ga4`, or the nightly cron at `app/api/cron/daily`).
//
// Kept as a placeholder so any stale `import '@/lib/mock/traffic'` fails loudly
// at type-check time rather than silently re-introducing fake data.
export {};
