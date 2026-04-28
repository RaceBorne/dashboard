/**
 * Singleton settings repo. Reads + writes the one row in
 * dashboard_mkt_settings. Cached per request via dynamic = 'force-dynamic'
 * routes — every send/preview pulls fresh.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface MktSettings {
  frequencyCapCount: number;   // 0 = no cap
  frequencyCapDays: number;    // window in days
  updatedAt: string;
}

interface SettingsRow {
  id: string;
  frequency_cap_count: number;
  frequency_cap_days: number;
  updated_at: string;
}

const DEFAULTS: MktSettings = {
  frequencyCapCount: 0,
  frequencyCapDays: 7,
  updatedAt: new Date(0).toISOString(),
};

export async function getMktSettings(): Promise<MktSettings> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULTS;
  const { data, error } = await sb
    .from('dashboard_mkt_settings')
    .select('id, frequency_cap_count, frequency_cap_days, updated_at')
    .eq('id', 'singleton')
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  const row = data as SettingsRow;
  return {
    frequencyCapCount: row.frequency_cap_count,
    frequencyCapDays: row.frequency_cap_days,
    updatedAt: row.updated_at,
  };
}

export async function updateMktSettings(patch: Partial<MktSettings>): Promise<MktSettings> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULTS;
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.frequencyCapCount !== undefined) dbPatch.frequency_cap_count = Math.max(0, Math.floor(patch.frequencyCapCount));
  if (patch.frequencyCapDays !== undefined) dbPatch.frequency_cap_days = Math.max(1, Math.floor(patch.frequencyCapDays));
  const { error } = await sb
    .from('dashboard_mkt_settings')
    .upsert({ id: 'singleton', ...dbPatch }, { onConflict: 'id' });
  if (error) console.error('[mkt.settings.update]', error);
  return getMktSettings();
}

/**
 * Returns the set of contactIds that would BREACH the frequency cap
 * if the current campaign sent to them right now. Empty when cap=0
 * (disabled) or no recent sends.
 *
 * "Breach" = (current sends in window) + 1 > cap. So cap=2 means a
 * contact who already has 2 sends in the last N days won't get a 3rd.
 */
export async function findFrequencyCapBreaches(contactIds: string[]): Promise<{ contactId: string; recentCount: number }[]> {
  if (contactIds.length === 0) return [];
  const settings = await getMktSettings();
  if (settings.frequencyCapCount <= 0) return [];
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  const since = new Date(Date.now() - settings.frequencyCapDays * 86400_000).toISOString();
  const { data, error } = await sb
    .from('dashboard_mkt_campaign_recipients')
    .select('contact_id, sent_at')
    .in('contact_id', contactIds)
    .in('status', ['sent', 'delivered', 'opened', 'clicked'])
    .gte('sent_at', since);
  if (error) {
    console.error('[mkt.settings.findFrequencyCapBreaches]', error);
    return [];
  }
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ contact_id: string }>) {
    counts.set(r.contact_id, (counts.get(r.contact_id) ?? 0) + 1);
  }
  const out: { contactId: string; recentCount: number }[] = [];
  for (const [contactId, n] of counts) {
    if (n + 1 > settings.frequencyCapCount) out.push({ contactId, recentCount: n });
  }
  return out;
}
