'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Copy, Globe, Layers, Loader2, Mail, Search, Trash2, Upload, X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AssetPurpose, MktAsset } from '@/lib/marketing/types';

interface Props {
  initialAssets: MktAsset[];
}

const ACCEPTED_MIMES = '.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.psd,image/*';

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

  // Convert modal state. When a tile's Web/Newsletter button is
  // clicked we don't toggle the tag directly any more, we open this
  // dialog so the operator sets dimensions + format.
  const [convertTarget, setConvertTarget] = useState<{ asset: MktAsset; purpose: AssetPurpose } | null>(null);

  async function runConvert(input: { width: number; height: number | null; format: 'jpeg' | 'png' | 'webp' | 'gif'; purpose: AssetPurpose; assetId: string }) {
    setBusyId(input.assetId);
    try {
      const res = await fetch(`/api/marketing/assets/${input.assetId}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          width: input.width,
          height: input.height,
          format: input.format,
          purpose: input.purpose,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && data.asset) {
        setAssets((curr) => [data.asset as MktAsset, ...curr]);
      } else if (data?.error) {
        setError(data.error);
      }
    } finally {
      setBusyId(null);
      setConvertTarget(null);
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
                onConvert={(p) => setConvertTarget({ asset: a, purpose: p })}
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

      {convertTarget ? (
        <ConvertModal
          asset={convertTarget.asset}
          purpose={convertTarget.purpose}
          busy={busyId === convertTarget.asset.id}
          onClose={() => setConvertTarget(null)}
          onConfirm={(input) => void runConvert({ ...input, assetId: convertTarget.asset.id })}
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
  asset, scale, busy, selected, onSelect, onConvert,
}: {
  asset: MktAsset;
  scale: Scale;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onConvert: (purpose: AssetPurpose) => void;
}) {
  const isPSD = asset.filename.toLowerCase().endsWith('.psd');
  const ext = fileExt(asset.filename);
  const isWeb = asset.purposes.includes('web');
  const isNewsletter = asset.purposes.includes('newsletter');
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
            'relative w-full overflow-hidden bg-[#1a1a1a]',
            aspect,
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
              className="absolute inset-0 w-full h-full object-cover"
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
              onClick={(e) => { e.stopPropagation(); onConvert('web'); }}
              disabled={busy}
              className={cn(
                'inline-flex items-center justify-center gap-1 h-6 px-1 rounded text-[10px] font-medium border transition',
                isWeb
                  ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40'
                  : 'border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                busy && 'opacity-50',
              )}
              title={isWeb ? 'A web variant exists. Click to make another at different dimensions.' : 'Open the convert dialog to make a web-ready variant.'}
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Globe className="h-2.5 w-2.5" />}
              {isWeb ? 'Web ✓' : 'Web'}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConvert('newsletter'); }}
              disabled={busy}
              className={cn(
                'inline-flex items-center justify-center gap-1 h-6 px-1 rounded text-[10px] font-medium border transition',
                isNewsletter
                  ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40'
                  : 'border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                busy && 'opacity-50',
              )}
              title={isNewsletter ? 'A newsletter variant exists. Click to make another at different dimensions.' : 'Open the convert dialog to make a newsletter-ready variant.'}
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
        <div className="rounded p-2 flex items-center justify-center min-h-[200px] bg-[#1a1a1a]">
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

function ConvertModal({
  asset, purpose, busy, onClose, onConfirm,
}: {
  asset: MktAsset;
  purpose: AssetPurpose;
  busy: boolean;
  onClose: () => void;
  onConfirm: (input: { width: number; height: number | null; format: 'jpeg' | 'png' | 'webp' | 'gif'; purpose: AssetPurpose }) => void;
}) {
  // Sensible defaults per purpose:
  //   - newsletter: 600px wide JPEG (email-safe, predictable size)
  //   - web:       1600px wide WebP (modern, small files)
  const defaults = purpose === 'newsletter'
    ? { width: 600, format: 'jpeg' as const }
    : { width: 1600, format: 'webp' as const };

  const [width, setWidth] = useState<number>(Math.min(defaults.width, asset.width ?? defaults.width));
  const [keepAspect, setKeepAspect] = useState(true);
  const [heightOverride, setHeightOverride] = useState<number | null>(null);
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp' | 'gif'>(defaults.format);

  const aspect = asset.width && asset.height ? asset.height / asset.width : null;
  const computedHeight = keepAspect && aspect ? Math.round(width * aspect) : (heightOverride ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md rounded-panel bg-evari-surface border border-evari-edge/30 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
              Make ready for {purpose === 'web' ? 'website' : 'newsletter'}
            </div>
            <div className="text-[14px] font-semibold text-evari-text truncate mt-0.5">{asset.filename}</div>
          </div>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4 space-y-4">
          {/* Current dimensions */}
          <div className="rounded bg-evari-ink/40 border border-evari-edge/20 p-3 flex items-center gap-3 text-[11px]">
            <div className="flex-1">
              <div className="text-evari-dimmer text-[10px] uppercase tracking-[0.12em]">Current</div>
              <div className="text-evari-text font-mono tabular-nums mt-0.5">
                {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'unknown'} · {fileExt(asset.filename)} · {formatBytes(asset.sizeBytes)}
              </div>
            </div>
            <div className="text-evari-gold/60 text-[16px]">→</div>
            <div className="flex-1">
              <div className="text-evari-dimmer text-[10px] uppercase tracking-[0.12em]">New</div>
              <div className="text-evari-text font-mono tabular-nums mt-0.5">
                {width}{computedHeight ? ` × ${computedHeight}` : ''} · {format.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Width input */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Target width (px)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={width}
                min={16}
                max={8000}
                step={50}
                onChange={(e) => setWidth(Math.max(16, Math.min(8000, Number(e.target.value) || 16)))}
                className="flex-1 h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50 font-mono tabular-nums"
              />
              <input
                type="range"
                min={120}
                max={Math.max(2400, asset.width ?? 2400)}
                step={20}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="flex-1 accent-evari-gold"
              />
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              {[600, 1200, 1600, 2400].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setWidth(preset)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium border transition',
                    width === preset
                      ? 'border-evari-gold/50 bg-evari-gold/10 text-evari-gold'
                      : 'border-evari-edge/40 text-evari-dim hover:text-evari-text',
                  )}
                >
                  {preset}px
                </button>
              ))}
            </div>
          </div>

          {/* Aspect lock */}
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-[12px] text-evari-text">
              <input
                type="checkbox"
                checked={keepAspect}
                onChange={(e) => setKeepAspect(e.target.checked)}
                className="accent-evari-gold"
              />
              Keep aspect ratio
            </label>
            {!keepAspect ? (
              <input
                type="number"
                placeholder="height (px)"
                value={heightOverride ?? ''}
                min={16}
                max={8000}
                onChange={(e) => setHeightOverride(e.target.value ? Number(e.target.value) : null)}
                className="w-32 h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50 font-mono tabular-nums"
              />
            ) : (
              <span className="text-[10px] text-evari-dimmer">height auto</span>
            )}
          </div>

          {/* Format picker */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">File format</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['jpeg', 'png', 'webp', 'gif'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'h-9 rounded-md text-[12px] font-medium border transition',
                    format === f
                      ? 'border-evari-gold bg-evari-gold/15 text-evari-gold'
                      : 'border-evari-edge/40 text-evari-dim hover:text-evari-text',
                  )}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-evari-dimmer mt-1.5 leading-relaxed">
              {format === 'jpeg' ? 'Smaller files, no transparency. Best for photos in newsletters.' : null}
              {format === 'png' ? 'Lossless with transparency. Best for logos and graphics.' : null}
              {format === 'webp' ? 'Modern format, much smaller than JPEG/PNG with transparency support. Best for web.' : null}
              {format === 'gif' ? 'Animated or 256-colour. Best preserved if the source was animated.' : null}
            </div>
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center h-9 px-3 rounded-md text-[12px] font-medium text-evari-dim hover:text-evari-text transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ width, height: computedHeight, format, purpose })}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {busy ? 'Converting…' : `Make ready for ${purpose === 'web' ? 'website' : 'newsletter'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
