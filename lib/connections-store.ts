/**
 * Client-side local store for connection env values.
 *
 * The server reads credentials from `process.env` — this store is a UX
 * convenience so Craig can paste tokens into the dashboard, keep a copy
 * handy, and export a `.env` block ready to drop into Vercel.
 *
 * When Supabase is wired, the server-side read path moves to the DB and
 * this store becomes optional.
 */

const NAMESPACE = 'evari-env';

export type EnvValues = Record<string, string>;

function storageKeyFor(integrationKey: string) {
  return `${NAMESPACE}:${integrationKey}`;
}

export function readEnvValues(integrationKey: string): EnvValues {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKeyFor(integrationKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as EnvValues;
  } catch {
    return {};
  }
}

export function writeEnvValues(integrationKey: string, values: EnvValues) {
  if (typeof window === 'undefined') return;
  // Strip empty strings
  const clean: EnvValues = {};
  for (const [k, v] of Object.entries(values)) {
    if (v && v.trim()) clean[k] = v.trim();
  }
  if (Object.keys(clean).length === 0) {
    window.localStorage.removeItem(storageKeyFor(integrationKey));
    return;
  }
  window.localStorage.setItem(
    storageKeyFor(integrationKey),
    JSON.stringify(clean),
  );
}

export function clearEnvValues(integrationKey: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKeyFor(integrationKey));
}

/** Render an `.env`-block representation of the values for clipboard / paste. */
export function envBlock(values: EnvValues): string {
  return Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/** Mask a value for display — show first 4 and last 4, dot everything else. */
export function maskValue(v: string): string {
  if (v.length <= 8) return '•'.repeat(v.length);
  return v.slice(0, 4) + '•'.repeat(Math.min(12, v.length - 8)) + v.slice(-4);
}
