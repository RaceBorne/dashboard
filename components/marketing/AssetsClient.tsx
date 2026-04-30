'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Copy, Globe, Layers, Loader2, Mail, Maximize2,
  Minimize2, Search, Trash2, Upload, X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AssetPurpose, MktAsset } from '@/lib/marketing/types';

interface Props {
  initialAssets: MktAsset[];
}

const ACCEPTED_MIMES = '.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.psd,image/*';

// Filenames carrying transparency. PNG, SVG, GIF can. Showing them on
// a dark grey checkered background lets the operator see where the
// image ends and the canvas begins.
function isTransparent(filename: string, mime: string | null): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png' || ext === 'psd' || ext === 'svg' || ext === 'webp' || ext === 'gif') return true;
  if (mime?.includes('png') || mime?.includes('svg') || mime?.includes('webp') || mime?.includes('gif')) return true;
  return false;
}

function fileExt(filename: string): string {
  const e = filename.toLowerCase().split('.').pop();
  return e ? e.toUpperCase() : 'FILE';
}

function formatBytes(b: number | null): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

type Scale = 'small' | 'medium' | 'large';
type Tab = 'all' | 'global' | 'web' | 'newsletter';

const SCALE_GRID: Record<Scale, string> = {
  small: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8',
  medium: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  large: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3',
};

/**
 * Asset library with three view scales, category tabs, and per-tile
 * channel-readiness toggles. Replaces the old single-density grid.
 */
export function AssetsClient({ initialAssets }: Props) {
  const router = useRouter();
  const [assets, setAssets] = useState<MktAsset[]>(initialAssets);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [scale, setScale] = useState<Scale>('medium');
  const [selected, setSelected] = useState<MktAsset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setAssets(initialAssets), [initialAssets]);

  const counts = useMemo(() => {
    let g = 0, w = 0, n = 0;
    for (const a of assets) {
      if (a.purposes.includes('global')) g++;
      if (a.purposes.includes('web')) w++;
      if (a.purposes.includes('newsletter')) n++;
    }
    return { all: assets.length, global: g, web: w, newsletter: n };
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (tab === 'global' && !a.purposes.includes('global')) return false;
      if (tab === 'web' && !a.purposes.includes('web')) return false;
      if (tab === 'newsletter' && !a.purposes.includes('newsletter')) return false;
      if (!q) return true;
      return (
        a.filename.toLowerCase().includes(q) ||
        (a.altText ?? '').toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [assets, query, tab]);

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

  async function togglePurpose(asset: MktAsset, purpose: AssetPurpose) {
    setBusyId(asset.id);
    try {
      const has = asset.purposes.includes(purpose);
      const next = has
        ? asset.purposes.filter((p) => p !== purpose)
        : [...asset.purposes, purpose];
      // Server enforces global stays in. We mirror that locally so the
      // UI reflects the persisted state.
      if (!next.includes('global')) next.push('global');
      const res = await fetch(`/api/marketing/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purposes: next }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setAssets((curr) => curr.map((a) => (a.id === asset.id ? (data.asset as MktAsset) : a)));
        if (selected?.id === asset.id) setSelected(data.asset as MktAsset);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this asset? Any email or page referencing it will show a broken image.')) return;
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
      <div className="flex-1 min-w-0 overflow-auto p-4">
        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <input
              type="text"
              placeholder="Search filename, alt text, or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-panel bg-evari-surface text-evari-text text-sm placeholder:text-evari-dimmer border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition"
            />
          </div>

          {/* Category tabs */}
          <div className="inline-flex rounded-panel bg-evari-surface border border-evari-edge/30 p-0.5">
            <TabButton active={tab === 'all'} onClick={() => setTab('all')} label={`All ${counts.all}`} />
            <TabButton active={tab === 'global'} onClick={() => setTab('global')} icon={<Layers className="h-3 w-3" />} label={`Global ${counts.global}`} />
            <TabButton active={tab === 'web'} onClick={() => setTab('web')} icon={<Globe className="h-3 w-3" />} label={`Web ${counts.web}`} />
            <TabButton active={tab === 'newsletter'} onClick={() => setTab('newsletter')} icon={<Mail className="h-3 w-3" />} label={`Newsletter ${counts.newsletter}`} />
          </div>

          {/* Scale toggle */}
          <div className="inline-flex rounded-panel bg-evari-surface border border-evari-edge/30 p-0.5">
            <ScaleButton active={scale === 'small'} onClick={() => setScale('small')} label="S" title="Small (8 across)" />
            <ScaleButton active={scale === 'medium'} onClick={() => setScale('medium')} label="M" title="Medium (5 across)" />
            <ScaleButton active={scale === 'large'} onClick={() => setScale('large')} label="L" title="Large (3 across)" />
          </div>

          <span className="text-xs text-evari-dimmer tabular-nums">{filtered.length} shown</span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'rounded-md border-2 border-dashed p-5 text-center cursor-pointer mb-3 transition',
            dragOver
              ? 'border-evari-gold/60 bg-evari-gold/5'
              : 'border-evari-edge/40 bg-evari-surface/40 hover:border-evari-edge/60',
          )}
        >
          <input ref={fileRef} type="file" accept={ACCEPTED_MIMES} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <div className="flex flex-col items-center gap-1.5 text-evari-dim">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin text-evari-gold" /> : <Upload className="h-5 w-5" />}
            <p className="text-[12px] text-evari-text font-medium">
              {uploading ? 'Uploading…' : 'Drop images here or click to browse'}
            </p>
            <p className="text-[10px] text-evari-dimmer">PNG · JPG · GIF · WebP · SVG · AVIF · PSD · max 10 MB</p>
          </div>
        </div>
        {error ? <p className="mb-3 text-xs text-evari-warning">{error}</p> : null}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-panel bg-evari-surface border border-evari-edge/30 px-3 py-12 text-center text-evari-dimmer text-sm">
            {assets.length === 0 ? 'No assets yet, drop one above to get started.' : 'No assets match that filter.'}
          </div>
        ) : (
          <ul className={cn('grid gap-3', SCALE_GRID[scale])}>
            {filtered.map((a) => (
              <Tile
                key={a.id}
                asset={a}
                scale={scale}
                busy={busyId === a.id}
                selected={selected?.id === a.id}
                onSelect={() => setSelected(a)}
                onTogglePurpose={(p) => void togglePurpose(a, p)}
              />
            ))}
          </ul>
        )}
      </div>

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

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition',
        active ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ScaleButton({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded text-[11px] font-bold transition',
        active ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
      )}
    >
      {label}
    </button>
  );
}

function Tile({
  asset, scale, busy, selected, onSelect, onTogglePurpose,
}: {
  asset: MktAsset;
  scale: Scale;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onTogglePurpose: (p: AssetPurpose) => void;
}) {
  const isPSD = asset.filename.toLowerCase().endsWith('.psd');
  const transparent = isTransparent(asset.filename, asset.mimeType);
  const ext = fileExt(asset.filename);
  const isWeb = asset.purposes.includes('web');
  const isNewsletter = asset.purposes.includes('newsletter');

  // Tile aspect: a touch wider than tall on small/medium, square on
  // large, so the metadata footer doesn't dominate the card.
  const aspect = scale === 'large' ? 'aspect-square' : 'aspect-[4/3]';

  return (
    <li>
      <div
        className={cn(
          'rounded-panel overflow-hidden border bg-evari-surface flex flex-col transition',
          selected ? 'border-evari-gold' : 'border-evari-edge/30 hover:border-evari-edge/60',
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'relative w-full overflow-hidden',
            aspect,
            transparent
              ? 'bg-[#1a1a1a] bg-[linear-gradient(45deg,#262626_25%,transparent_25%),linear-gradient(-45deg,#262626_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#262626_75%),linear-gradient(-45deg,transparent_75%,#262626_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0px]'
              : 'bg-evari-ink',
          )}
          title={asset.filename}
        >
          {isPSD ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-evari-dim gap-1.5">
              <div className="text-[20px] font-bold tabular-nums opacity-60">PSD</div>
              <div className="text-[9px] uppercase tracking-[0.12em]">No browser preview</div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={asset.url}
              alt={asset.altText ?? asset.filename}
              loading="lazy"
              className={cn(
                'absolute inset-0 w-full h-full',
                transparent ? 'object-contain' : 'object-cover',
              )}
            />
          )}
        </button>

        {/* Footer metadata + actions */}
        <div className="px-2.5 py-2 space-y-1.5 border-t border-evari-edge/20">
          <div className="text-[11px] text-evari-text font-medium truncate" title={asset.filename}>
            {asset.filename}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-evari-dimmer">
            <span className="inline-block px-1.5 py-0.5 rounded bg-evari-edge/30 text-evari-dim font-mono tabular-nums">{ext}</span>
            <span className="font-mono tabular-nums">{formatBytes(asset.sizeBytes)}</span>
            {asset.width && asset.height ? (
              <span className="font-mono tabular-nums">{asset.width}×{asset.height}</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePurpose('web'); }}
              disabled={busy}
              className={cn(
                'inline-flex items-center justify-center gap-1 h-6 px-1 rounded text-[10px] font-medium border transition',
                isWeb
                  ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40'
                  : 'border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                busy && 'opacity-50',
              )}
              title={isWeb ? 'Marked ready for website' : 'Mark ready for website'}
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Globe className="h-2.5 w-2.5" />}
              {isWeb ? 'Web ✓' : 'Web'}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePurpose('newsletter'); }}
              disabled={busy}
              className={cn(
                'inline-flex items-center justify-center gap-1 h-6 px-1 rounded text-[10px] font-medium border transition',
                isNewsletter
                  ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40'
                  : 'border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                busy && 'opacity-50',
              )}
              title={isNewsletter ? 'Marked ready for newsletter' : 'Mark ready for newsletter'}
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Mail className="h-2.5 w-2.5" />}
              {isNewsletter ? 'Newsletter ✓' : 'Newsletter'}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function DetailPanel({
  asset, onClose, onChange, onDelete,
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
  const transparent = isTransparent(asset.filename, asset.mimeType);
  const isPSD = asset.filename.toLowerCase().endsWith('.psd');

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
        <div className={cn(
          'rounded p-2 flex items-center justify-center min-h-[200px]',
          transparent ? 'bg-[#1a1a1a]' : 'bg-evari-ink',
        )}>
          {isPSD ? (
            <div className="text-evari-dim text-center py-8">
              <div className="text-[24px] font-bold opacity-60">PSD</div>
              <div className="text-[10px] uppercase tracking-[0.12em] mt-1">No browser preview</div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={asset.url} alt={asset.altText ?? asset.filename} className="max-h-[280px] w-auto object-contain" />
          )}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-evari-ink p-2">
            <dt className="text-evari-dimmer text-[10px]">Type</dt>
            <dd className="text-evari-text font-mono">{fileExt(asset.filename)}</dd>
          </div>
          <div className="rounded bg-evari-ink p-2">
            <dt className="text-evari-dimmer text-[10px]">Size</dt>
            <dd className="text-evari-text font-mono tabular-nums">{formatBytes(asset.sizeBytes)}</dd>
          </div>
          {asset.width && asset.height ? (
            <div className="rounded bg-evari-ink p-2 col-span-2">
              <dt className="text-evari-dimmer text-[10px]">Dimensions</dt>
              <dd className="text-evari-text font-mono tabular-nums">{asset.width} × {asset.height}</dd>
            </div>
          ) : null}
          <div className="rounded bg-evari-ink p-2 col-span-2">
            <dt className="text-evari-dimmer text-[10px]">Public URL</dt>
            <dd className="text-evari-text font-mono text-[10px] break-all leading-tight mt-0.5">{asset.url}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={copyUrl}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-evari-ink text-evari-text hover:bg-black/40 transition"
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
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-gold transition"
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
