'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2, Search, Trash2, Upload, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AssetKind, MktAsset } from '@/lib/marketing/types';

interface Props {
  initialAssets: MktAsset[];
}

const KIND_OPTIONS: Array<{ value: AssetKind | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'image',       label: 'Images' },
  { value: 'gif',         label: 'GIFs' },
  { value: 'logo',        label: 'Logos' },
  { value: 'video_thumb', label: 'Video thumbs' },
  { value: 'other',       label: 'Other' },
];

const ACCEPTED_MIMES = '.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,image/*';

function formatBytes(b: number | null): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Asset library — drag-drop upload zone + searchable grid + click-to-open
 * detail panel for editing alt/tags/kind. Used as the foundation for the
 * newsletter builder's image picker in Phase 14.
 */
export function AssetsClient({ initialAssets }: Props) {
  const router = useRouter();
  const [assets, setAssets] = useState<MktAsset[]>(initialAssets);
  const [query, setQuery] = useState('');
  const [activeKind, setActiveKind] = useState<AssetKind | 'all'>('all');
  const [selected, setSelected] = useState<MktAsset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setAssets(initialAssets), [initialAssets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (activeKind !== 'all' && a.kind !== activeKind) return false;
      if (!q) return true;
      return (
        a.filename.toLowerCase().includes(q) ||
        (a.altText ?? '').toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [assets, query, activeKind]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const next: MktAsset[] = [];
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/marketing/assets', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) {
          setError(data.error ?? 'Upload failed');
          continue;
        }
        next.push(data.asset as MktAsset);
      }
      if (next.length > 0) setAssets((curr) => [...next, ...curr]);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this asset? Any email referencing it will show a broken image.')) return;
    const res = await fetch(`/api/marketing/assets/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setAssets((curr) => curr.filter((a) => a.id !== id));
      if (selected?.id === id) setSelected(null);
      router.refresh();
    }
  }

  return (
    <div className="flex-1 min-h-0 flex bg-evari-ink">
      {/* Main column */}
      <div className="flex-1 min-w-0 overflow-auto p-4">
        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <input
              type="text"
              placeholder="Search filename, alt text, or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-md bg-evari-surface text-evari-text text-sm placeholder:text-evari-dimmer border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out"
            />
          </div>
          <div className="inline-flex rounded-md bg-evari-surface border border-evari-edge/30 p-0.5">
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setActiveKind(o.value)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors duration-500 ease-in-out',
                  activeKind === o.value ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-evari-dimmer tabular-nums">{filtered.length} of {assets.length}</span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'rounded-md border-2 border-dashed p-6 text-center cursor-pointer mb-3 transition-colors duration-300 ease-in-out',
            dragOver
              ? 'border-evari-gold/60 bg-evari-gold/5'
              : 'border-evari-edge/40 bg-evari-surface/40 hover:border-evari-edge/60 hover:bg-evari-surface/60',
          )}
        >
          <input ref={fileRef} type="file" accept={ACCEPTED_MIMES} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <div className="flex flex-col items-center gap-2 text-evari-dim">
            {uploading ? <Loader2 className="h-6 w-6 animate-spin text-evari-gold" /> : <Upload className="h-6 w-6" />}
            <p className="text-sm text-evari-text font-medium">
              {uploading ? 'Uploading…' : 'Drop images here or click to browse'}
            </p>
            <p className="text-[11px] text-evari-dimmer">
              PNG · JPG · GIF · WebP · SVG · AVIF · max 10 MB · stored in the public mkt-assets Supabase bucket
            </p>
          </div>
        </div>
        {error ? <p className="mb-3 text-xs text-evari-danger">{error}</p> : null}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-md bg-evari-surface border border-evari-edge/30 px-3 py-12 text-center text-evari-dimmer text-sm">
            {assets.length === 0 ? 'No assets yet — drop one above to get started.' : 'No assets match that filter.'}
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelected(a)}
                  className={cn(
                    'group relative w-full aspect-square rounded-md overflow-hidden border bg-evari-surface',
                    selected?.id === a.id ? 'border-evari-gold' : 'border-evari-edge/30 hover:border-evari-edge/60',
                  )}
                  title={a.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.altText ?? a.filename}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-contain bg-[linear-gradient(45deg,#222_25%,transparent_25%),linear-gradient(-45deg,#222_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#222_75%),linear-gradient(-45deg,transparent_75%,#222_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-left">
                    <div className="text-[10px] text-white truncate font-mono">{a.filename}</div>
                    <div className="text-[9px] text-white/70 tabular-nums">
                      {a.kind} {a.width && a.height ? `· ${a.width}×${a.height}` : ''} · {formatBytes(a.sizeBytes)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Detail rail */}
      {selected ? (
        <DetailPanel
          asset={selected}
          onClose={() => setSelected(null)}
          onChange={(updated) => {
            setAssets((curr) => curr.map((a) => (a.id === updated.id ? updated : a)));
            setSelected(updated);
          }}
          onDelete={() => handleDelete(selected.id)}
        />
      ) : null}
    </div>
  );
}

function DetailPanel({
  asset,
  onClose,
  onChange,
  onDelete,
}: {
  asset: MktAsset;
  onClose: () => void;
  onChange: (a: MktAsset) => void;
  onDelete: () => void;
}) {
  const [alt, setAlt] = useState(asset.altText ?? '');
  const [tagsStr, setTagsStr] = useState(asset.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setAlt(asset.altText ?? '');
    setTagsStr(asset.tags.join(', '));
  }, [asset.id, asset.altText, asset.tags]);

  const dirty = alt !== (asset.altText ?? '') || tagsStr !== asset.tags.join(', ');

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/marketing/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ altText: alt.trim() || null, tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) onChange(data.asset as MktAsset);
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <aside className="w-80 shrink-0 border-l border-evari-edge/30 bg-evari-surface flex flex-col overflow-hidden">
      <header className="px-3 py-2 border-b border-evari-edge/30 flex items-center justify-between">
        <span className="text-xs font-semibold text-evari-text truncate">{asset.filename}</span>
        <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        <div className="rounded bg-evari-ink p-2 flex items-center justify-center min-h-[200px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.url} alt={asset.altText ?? asset.filename} className="max-h-[280px] w-auto object-contain" />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-evari-ink p-2">
            <dt className="text-evari-dimmer text-[10px]">Kind</dt>
            <dd className="text-evari-text capitalize font-mono">{asset.kind}</dd>
          </div>
          <div className="rounded bg-evari-ink p-2">
            <dt className="text-evari-dimmer text-[10px]">Size</dt>
            <dd className="text-evari-text font-mono tabular-nums">{formatBytes(asset.sizeBytes)}</dd>
          </div>
          <div className="rounded bg-evari-ink p-2 col-span-2">
            <dt className="text-evari-dimmer text-[10px]">Public URL</dt>
            <dd className="text-evari-text font-mono text-[10px] break-all leading-tight mt-0.5">{asset.url}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={copyUrl}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-evari-ink text-evari-text hover:bg-black/40 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-evari-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy URL'}
        </button>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Alt text</span>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Describe this image (accessibility + spam-filter friendly)"
            className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Tags (comma-separated)</span>
          <input
            type="text"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="logo, hero, product, footer"
            className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          />
        </label>
      </div>
      <footer className="px-3 py-2 border-t border-evari-edge/30 flex items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-danger transition-colors"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>
      </footer>
    </aside>
  );
}
