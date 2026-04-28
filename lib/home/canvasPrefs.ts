/**
 * Home canvas state — tile layout + display prefs.
 *
 * Persisted in Supabase as a singleton row in dashboard_home_canvas.
 * The client also caches the same state in localStorage so the first
 * paint after a reload doesn't flash the defaults while we wait for
 * the network round-trip.
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export interface HomeTile {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
  widget: string;
}

export interface HomePrefs {
  showGrid: boolean;
  glass: boolean;
  bgImage: string | null;
}

export interface HomeCanvasState {
  tiles: HomeTile[];
  prefs: HomePrefs;
}

const DEFAULT_STATE: HomeCanvasState = {
  tiles: [
    { id: 'tile-1', col: 0, row: 0, w: 1, h: 1, widget: 'prospecting' },
    { id: 'tile-2', col: 1, row: 0, w: 1, h: 1, widget: 'broadcast' },
  ],
  prefs: { showGrid: true, glass: false, bgImage: null },
};

interface Row {
  id: string;
  tiles: HomeTile[] | null;
  prefs: HomePrefs | null;
  updated_at: string;
}

export async function getHomeCanvas(): Promise<HomeCanvasState> {
  const sb = createSupabaseAdmin();
  if (!sb) return DEFAULT_STATE;
  const { data, error } = await sb
    .from('dashboard_home_canvas')
    .select('id, tiles, prefs, updated_at')
    .eq('id', 'singleton')
    .maybeSingle();
  if (error || !data) return DEFAULT_STATE;
  const r = data as Row;
  return {
    tiles: r.tiles && r.tiles.length > 0 ? r.tiles : DEFAULT_STATE.tiles,
    prefs: { ...DEFAULT_STATE.prefs, ...(r.prefs ?? {}) },
  };
}

export async function saveHomeCanvas(state: HomeCanvasState): Promise<void> {
  const sb = createSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from('dashboard_home_canvas')
    .upsert({
      id: 'singleton',
      tiles: state.tiles,
      prefs: state.prefs,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) console.error('[home.canvas.save]', error);
}
