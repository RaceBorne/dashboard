/**
 * Marketing asset library — wraps dashboard_mkt_assets + the public
 * mkt-assets Supabase storage bucket. Used by:
 *   - /email/assets browser
 *   - newsletter builder image picker (Phase 14)
 *   - brand kit logo references (could later swap data-URLs for these)
 */

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { AssetKind, AssetPurpose, MktAsset } from './types';

const BUCKET = 'mkt-assets';

interface AssetRow {
  id: string;
  kind: AssetKind;
  filename: string;
  storage_key: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  tags: string[] | null;
  purposes: AssetPurpose[] | null;
  parent_asset_id: string | null;
  variant_label: string | null;
  alt_text: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAsset(r: AssetRow): MktAsset {
  return {
    id: r.id,
    kind: r.kind,
    filename: r.filename,
    storageKey: r.storage_key,
    url: r.url,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    width: r.width,
    height: r.height,
    tags: r.tags ?? [],
    purposes: r.purposes ?? ['global'],
    parentAssetId: r.parent_asset_id,
    variantLabel: r.variant_label,
    altText: r.alt_text,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listAssets(opts: {
  kind?: AssetKind;
  search?: string;
  tag?: string;
  limit?: number;
  /** When true, return variants too (default false: only roots). */
  includeVariants?: boolean;
} = {}): Promise<MktAsset[]> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  let q = sb
    .from('dashboard_mkt_assets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500);
  if (!opts.includeVariants) q = q.is('parent_asset_id', null);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.tag)  q = q.contains('tags', [opts.tag]);
  if (opts.search) q = q.ilike('filename', `%${opts.search}%`);
  const { data, error } = await q;
  if (error) {
    console.error('[mkt.assets.list]', error);
    return [];
  }
  return (data ?? []).map(rowToAsset);
}

/**
 * Roots returned with their variants attached. Used by the workspace
 * detail panel + by tab-filtering that needs to see what each family
 * is prepared for.
 */
export async function listAssetsWithVariants(opts: {
  search?: string;
  limit?: number;
} = {}): Promise<Array<{ root: MktAsset; variants: MktAsset[] }>> {
  const sb = createSupabaseAdmin();
  if (!sb) return [];
  // Load every row in one query (roots + variants), then group.
  let q = sb
    .from('dashboard_mkt_assets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 1000);
  if (opts.search) q = q.ilike('filename', `%${opts.search}%`);
  const { data, error } = await q;
  if (error || !data) return [];
  const all = (data as AssetRow[]).map(rowToAsset);
  const byParent = new Map<string, MktAsset[]>();
  const roots: MktAsset[] = [];
  for (const a of all) {
    if (a.parentAssetId) {
      const list = byParent.get(a.parentAssetId) ?? [];
      list.push(a);
      byParent.set(a.parentAssetId, list);
    } else {
      roots.push(a);
    }
  }
  return roots.map((root) => ({ root, variants: byParent.get(root.id) ?? [] }));
}

/**
 * Look up an asset and the family it belongs to. If the supplied id
 * is a variant, the root is returned alongside all sibling variants.
 */
export async function getAssetWithVariants(id: string): Promise<{ root: MktAsset; variants: MktAsset[] } | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data: target } = await sb
    .from('dashboard_mkt_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!target) return null;
  const targetAsset = rowToAsset(target as AssetRow);
  const rootId = targetAsset.parentAssetId ?? targetAsset.id;
  const { data: rootRow } = rootId === targetAsset.id
    ? { data: target }
    : await sb.from('dashboard_mkt_assets').select('*').eq('id', rootId).maybeSingle();
  if (!rootRow) return null;
  const root = rowToAsset(rootRow as AssetRow);
  const { data: vs } = await sb
    .from('dashboard_mkt_assets')
    .select('*')
    .eq('parent_asset_id', root.id)
    .order('created_at', { ascending: true });
  const variants = ((vs ?? []) as AssetRow[]).map(rowToAsset);
  return { root, variants };
}

export async function getAsset(id: string): Promise<MktAsset | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb
    .from('dashboard_mkt_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[mkt.assets.get]', error);
    return null;
  }
  return data ? rowToAsset(data as AssetRow) : null;
}

function detectKind(mime: string | null, filename: string): AssetKind {
  if (mime === 'image/gif') return 'gif';
  if (mime?.startsWith('image/')) return 'image';
  if (filename.toLowerCase().endsWith('.gif')) return 'gif';
  return 'other';
}

function safeSlug(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function uploadAsset(input: {
  file: Blob;
  filename: string;
  kind?: AssetKind;
  tags?: string[];
  altText?: string;
}): Promise<MktAsset | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const f = input.file as File;
  const mime = (f.type || null) as string | null;
  const kind = input.kind ?? detectKind(mime, input.filename);
  const ext = (input.filename.split('.').pop() ?? 'bin').toLowerCase();
  const key = `${safeSlug(input.filename.replace(/\.[^.]+$/, ''))}-${Date.now()}.${ext}`;

  const arrayBuffer = await f.arrayBuffer();
  const { error: uploadErr } = await sb.storage.from(BUCKET).upload(key, arrayBuffer, {
    cacheControl: '31536000, immutable',
    contentType: mime || `image/${ext}`,
    upsert: false,
  });
  if (uploadErr) {
    console.error('[mkt.assets.upload storage]', uploadErr);
    return null;
  }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(key);
  const url = pub.publicUrl;

  const { data, error } = await sb
    .from('dashboard_mkt_assets')
    .insert({
      kind,
      filename: input.filename,
      storage_key: key,
      url,
      mime_type: mime,
      size_bytes: f.size ?? null,
      tags: input.tags ?? [],
      alt_text: input.altText ?? null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.assets.upload row]', error);
    return null;
  }
  return rowToAsset(data as AssetRow);
}

export async function updateAsset(id: string, patch: Partial<{
  altText: string | null;
  tags: string[];
  kind: AssetKind;
  purposes: AssetPurpose[];
}>): Promise<MktAsset | null> {
  const sb = createSupabaseAdmin();
  if (!sb) return null;
  const dbPatch: Record<string, unknown> = {};
  if ('altText' in patch)  dbPatch.alt_text = patch.altText;
  if ('tags' in patch)     dbPatch.tags = patch.tags;
  if ('kind' in patch)     dbPatch.kind = patch.kind;
  if ('purposes' in patch) dbPatch.purposes = patch.purposes;
  if (Object.keys(dbPatch).length === 0) return getAsset(id);
  const { data, error } = await sb
    .from('dashboard_mkt_assets')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[mkt.assets.update]', error);
    return null;
  }
  return rowToAsset(data as AssetRow);
}

export async function deleteAsset(id: string): Promise<boolean> {
  const sb = createSupabaseAdmin();
  if (!sb) return false;
  const asset = await getAsset(id);
  if (!asset) return true;
  // Best-effort storage cleanup; don't block the row delete on it.
  await sb.storage.from(BUCKET).remove([asset.storageKey]);
  const { error } = await sb.from('dashboard_mkt_assets').delete().eq('id', id);
  if (error) {
    console.error('[mkt.assets.delete]', error);
    return false;
  }
  return true;
}
