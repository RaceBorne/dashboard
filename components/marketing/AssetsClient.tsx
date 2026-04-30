'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Copy, Globe, Layers, Loader2, Mail, Plus, Search, Trash2, Upload, X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AssetPurpose, MktAsset, MktAssetFamily } from '@/lib/marketing/types';

interface Props {
  initialFamilies: MktAssetFamily[];
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
 * A family is "ready for X" if the root or any variant carries that
 * purpose. Used by the tabs and per-tile badges.
 */
function familyHasPurpose(fam: MktAssetFamily, purpose: AssetPurpose): boolean {
  if (fam.root.purposes.includes(purpose)) return true;
  return fam.variants.some((v) => v.purposes.includes(purpose));
}

export function AssetsClient({ initialFamilies }: Props) {
  const router = useRouter();
  const [families, setFamilies] = useState<MktAssetFamily[]>(initialFamilies);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [scale, setScale] = useState<Scale>('medium');
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<{ root: MktAsset; purpose: AssetPurpose } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setFamilies(initialFamilies), [initialFamilies]);

  const counts = useMemo(() => {
    let g = 0, w = 0, n = 0;
    for (const f of families) {
      if (familyHasPurpose(f, 'global')) g++;
      if (familyHasPurpose(f, 'web')) w++;
      if (familyHasPurpose(f, 'newsletter')) n++;
    }
    return { all: families.length, global: g, web: w, newsletter: n };
  }, [families]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return families.filter((f) => {
      if (tab === 'global' && !familyHasPurpose(f, 'global')) return false;
      if (tab === 'web' && !familyHasPurpose(f, 'web')) return false;
      if (tab === 'newsletter' && !familyHasPurpose(f, 'newsletter')) return false;
      if (!q) return true;
      const matches = (a: MktAsset) =>
        a.filename.toLowerCase().includes(q) ||
        (a.altText ?? '').toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        (a.variantLabel ?? '').toLowerCase().includes(q);
      return matches(f.root) || f.variants.some(matches);
    });
  }, [families, query, tab]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const next: MktAssetFamily[] = [];
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/marketing/assets', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) {
          setError(data.error ?? 'Upload failed');
          continue;
        }
        next.push({ root: data.asset as MktAsset, variants: [] });
      }
      if (next.length > 0) setFamilies((curr) => [...next, ...curr]);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm('Delete this asset? Variants attached to it will go too. Anything referencing the URL will break.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/marketing/assets/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) return;
      // Could be a root or a variant. Reload from server to keep state honest.
      router.refresh();
      const fam = await fetch('/api/marketing/assets/families').then((r) => r.json()).catch(() => null);
      if (fam?.ok) setFamilies(fam.families as MktAssetFamily[]);
      else {
        // Local fallback: drop the row wherever it lives.
        setFamilies((curr) => curr
          .filter((f) => f.root.id !== id)
          .map((f) => ({ ...f, variants: f.variants.filter((v) => v.id !== id) })));
      }
      if (openFamilyId === id) setOpenFamilyId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function runConvert(input: {
    rootId: string;
    width: number;
    height: number | null;
    format: 'jpeg' | 'png' | 'webp' | 'gif';
    purpose: AssetPurpose;
    label: string;
  }) {
    setBusyId(input.rootId);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/assets/${input.rootId}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          width: input.width,
          height: input.height,
          format: input.format,
          purpose: input.purpose,
          label: input.label,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && data.asset) {
        const newVariant = data.asset as MktAsset;
        setFamilies((curr) => curr.map((f) =>
          f.root.id === input.rootId ? { ...f, variants: [...f.variants, newVariant] } : f,
        ));
      } else if (data?.error) {
        setError(data.error);
      }
    } finally {
      setBusyId(null);
      setConvertTarget(null);
    }
  }

  const openFamily = openFamilyId
    ? families.find((f) => f.root.id === openFamilyId) ?? null
    : null;

  return (
    <div className="flex-1 min-h-0 flex bg-evari-ink">
      <div className="flex-1 min-w-0 overflow-auto p-4">
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <input
              type="text"
              placeholder="Search filename, alt text, variant label, or tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-panel bg-evari-surface text-evari-text text-sm placeholder:text-evari-dimmer border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition"
            />
          </div>

          <div className="inline-flex rounded-panel bg-evari-surface border border-evari-edge/30 p-0.5">
            <TabButton active={tab === 'all'} onClick={() => setTab('all')} label={`All ${counts.all}`} />
            <TabButton active={tab === 'global'} onClick={() => setTab('global')} icon={<Layers className="h-3 w-3" />} label={`Global ${counts.global}`} />
            <TabButton active={tab === 'web'} onClick={() => setTab('web')} icon={<Globe className="h-3 w-3" />} label={`Web ${counts.web}`} />
            <TabButton active={tab === 'newsletter'} onClick={() => setTab('newsletter')} icon={<Mail className="h-3 w-3" />} label={`Newsletter ${counts.newsletter}`} />
          </div>

          <div className="inline-flex rounded-panel bg-evari-surface border border-evari-edge/30 p-0.5">
            <ScaleButton active={scale === 'small'} onClick={() => setScale('small')} label="S" title="Small (8 across)" />
            <ScaleButton active={scale === 'medium'} onClick={() => setScale('medium')} label="M" title="Medium (5 across)" />
            <ScaleButton active={scale === 'large'} onClick={() => setScale('large')} label="L" title="Large (3 across)" />
          </div>

          <span className="text-xs text-evari-dimmer tabular-nums">{filtered.length} shown</span>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'rounded-md border-2 border-dashed p-5 text-center cursor-pointer mb-3 transition',
            dragOver ? 'border-evari-gold/60 bg-evari-gold/5' : 'border-evari-edge/40 bg-evari-surface/40 hover:border-evari-edge/60',
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

        {filtered.length === 0 ? (
          <div className="rounded-panel bg-evari-surface border border-evari-edge/30 px-3 py-12 text-center text-evari-dimmer text-sm">
            {families.length === 0 ? 'No assets yet, drop one above to get started.' : 'No assets match that filter.'}
          </div>
        ) : (
          <ul className={cn('grid gap-3', SCALE_GRID[scale])}>
            {filtered.map((f) => (
              <FamilyTile
                key={f.root.id}
                family={f}
                scale={scale}
                busy={busyId === f.root.id}
                selected={openFamilyId === f.root.id}
                onOpen={() => setOpenFamilyId(f.root.id)}
                onConvert={(p) => setConvertTarget({ root: f.root, purpose: p })}
              />
            ))}
          </ul>
        )}
      </div>

      {openFamily ? (
        <FamilyWorkspace
          family={openFamily}
          busy={busyId === openFamily.root.id}
          onClose={() => setOpenFamilyId(null)}
          onConvert={(p) => setConvertTarget({ root: openFamily.root, purpose: p })}
          onDelete={(id) => void deleteAsset(id)}
          onRootUpdated={(updated) => {
            setFamilies((curr) => curr.map((f) =>
              f.root.id === updated.id ? { ...f, root: updated } : f,
            ));
          }}
        />
      ) : null}

      {convertTarget ? (
        <ConvertModal
          asset={convertTarget.root}
          purpose={convertTarget.purpose}
          busy={busyId === convertTarget.root.id}
          onClose={() => setConvertTarget(null)}
          onConfirm={(input) => void runConvert({ ...input, rootId: convertTarget.root.id })}
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
      {icon}{label}
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

function FamilyTile({
  family, scale, busy, selected, onOpen, onConvert,
}: {
  family: MktAssetFamily;
  scale: Scale;
  busy: boolean;
  selected: boolean;
  onOpen: () => void;
  onConvert: (p: AssetPurpose) => void;
}) {
  const a = family.root;
  const isPSD = a.filename.toLowerCase().endsWith('.psd');
  const ext = fileExt(a.filename);
  const variantCount = family.variants.length;
  const hasWeb = familyHasPurpose(family, 'web');
  const hasNewsletter = familyHasPurpose(family, 'newsletter');
  const aspect = scale === 'large' ? 'aspect-square' : 'aspect-[4/3]';

  return (
    <li>
      <div className={cn(
        'rounded-panel overflow-hidden border bg-evari-surface flex flex-col transition',
        selected ? 'border-evari-gold' : 'border-evari-edge/30 hover:border-evari-edge/60',
      )}>
        <button type="button" onClick={onOpen}
          className={cn('relative w-full overflow-hidden bg-[#1a1a1a]', aspect)}
          title={a.filename}
        >
          {isPSD ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-evari-dim gap-1.5">
              <div className="text-[20px] font-bold tabular-nums opacity-60">PSD</div>
              <div className="text-[9px] uppercase tracking-[0.12em]">No browser preview</div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={a.url} alt={a.altText ?? a.filename} loading="lazy"
              className="absolute inset-0 w-full h-full object-cover" />
          )}
          {variantCount > 0 ? (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-evari-gold text-[10px] font-semibold border border-evari-gold/40 backdrop-blur">
              <Layers className="h-2.5 w-2.5" />
              {variantCount} variant{variantCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </button>

        <div className="px-2.5 py-2 space-y-1.5 border-t border-evari-edge/20">
          <div className="text-[11px] text-evari-text font-medium truncate" title={a.filename}>{a.filename}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-evari-dimmer">
            <span className="inline-block px-1.5 py-0.5 rounded bg-evari-edge/30 text-evari-dim font-mono tabular-nums">{ext}</span>
            <span className="font-mono tabular-nums">{formatBytes(a.sizeBytes)}</span>
            {a.width && a.height ? <span className="font-mono tabular-nums">{a.width}×{a.height}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onConvert('web'); }}
              disabled={busy}
              className={cn('inline-flex items-center justify-center gap-1 h-6 px-1 rounded text-[10px] font-medium border transition',
                hasWeb ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40' : 'border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                busy && 'opacity-50')}
              title={hasWeb ? 'A web variant exists. Click to make another.' : 'Make a web-ready variant.'}
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Globe className="h-2.5 w-2.5" />}
              {hasWeb ? 'Web ✓' : 'Web'}
            </button>
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onConvert('newsletter'); }}
              disabled={busy}
              className={cn('inline-flex items-center justify-center gap-1 h-6 px-1 rounded text-[10px] font-medium border transition',
                hasNewsletter ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40' : 'border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40',
                busy && 'opacity-50')}
              title={hasNewsletter ? 'A newsletter variant exists. Click to make another.' : 'Make a newsletter-ready variant.'}
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Mail className="h-2.5 w-2.5" />}
              {hasNewsletter ? 'Newsletter ✓' : 'Newsletter'}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function FamilyWorkspace({
  family, busy, onClose, onConvert, onDelete, onRootUpdated,
}: {
  family: MktAssetFamily;
  busy: boolean;
  onClose: () => void;
  onConvert: (p: AssetPurpose) => void;
  onDelete: (id: string) => void;
  onRootUpdated: (a: MktAsset) => void;
}) {
  const root = family.root;
  const [alt, setAlt] = useState(root.altText ?? '');
  const [tagsStr, setTagsStr] = useState(root.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setAlt(root.altText ?? '');
    setTagsStr(root.tags.filter((t) => !t.startsWith('derived:')).join(', '));
  }, [root.id, root.altText, root.tags]);

  const dirty = alt !== (root.altText ?? '') || tagsStr !== root.tags.filter((t) => !t.startsWith('derived:')).join(', ');
  const isPSD = root.filename.toLowerCase().endsWith('.psd');

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/marketing/assets/${root.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ altText: alt.trim() || null, tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) onRootUpdated(data.asset as MktAsset);
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <aside className="w-[420px] shrink-0 border-l border-evari-edge/30 bg-evari-surface flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Original</div>
          <div className="text-[14px] font-semibold text-evari-text truncate">{root.filename}</div>
        </div>
        <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text shrink-0">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Original preview */}
        <div className="rounded-panel bg-[#1a1a1a] flex items-center justify-center min-h-[180px] overflow-hidden">
          {isPSD ? (
            <div className="text-evari-dim text-center py-10">
              <div className="text-[28px] font-bold opacity-60">PSD</div>
              <div className="text-[10px] uppercase tracking-[0.12em] mt-1">No browser preview</div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={root.url} alt={root.altText ?? root.filename} className="max-h-[280px] w-auto object-contain" />
          )}
        </div>

        {/* Original metadata */}
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-evari-ink p-2">
            <dt className="text-evari-dimmer text-[10px]">Type</dt>
            <dd className="text-evari-text font-mono">{fileExt(root.filename)}</dd>
          </div>
          <div className="rounded bg-evari-ink p-2">
            <dt className="text-evari-dimmer text-[10px]">Size</dt>
            <dd className="text-evari-text font-mono tabular-nums">{formatBytes(root.sizeBytes)}</dd>
          </div>
          {root.width && root.height ? (
            <div className="rounded bg-evari-ink p-2 col-span-2">
              <dt className="text-evari-dimmer text-[10px]">Dimensions</dt>
              <dd className="text-evari-text font-mono tabular-nums">{root.width} × {root.height}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void copyUrl(root.url)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-evari-ink text-evari-text hover:bg-black/40 transition">
            {copied ? <Check className="h-3.5 w-3.5 text-evari-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy URL'}
          </button>
        </div>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Alt text</span>
          <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)}
            placeholder="Describe this image"
            className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Tags</span>
          <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)}
            placeholder="logo, hero, product"
            className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        </label>
        <button type="button" onClick={save} disabled={!dirty || saving}
          className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40 transition">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>

        {/* Variants family */}
        <div className="border-t border-evari-edge/20 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
              Variants {family.variants.length > 0 ? `(${family.variants.length})` : ''}
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => onConvert('web')} disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition disabled:opacity-50">
                <Globe className="h-2.5 w-2.5" /> Web variant
              </button>
              <button type="button" onClick={() => onConvert('newsletter')} disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-evari-edge/40 text-evari-dim hover:text-evari-gold hover:border-evari-gold/40 transition disabled:opacity-50">
                <Mail className="h-2.5 w-2.5" /> Newsletter variant
              </button>
            </div>
          </div>

          {family.variants.length === 0 ? (
            <div className="rounded bg-evari-ink/60 border border-evari-edge/20 px-3 py-4 text-[11px] text-evari-dimmer text-center">
              No variants yet. Click <span className="text-evari-text">Web variant</span> or <span className="text-evari-text">Newsletter variant</span> above to make a smaller named version. Originals stay untouched.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {family.variants.map((v) => (
                <li key={v.id} className="flex items-start gap-2 rounded bg-evari-ink/60 border border-evari-edge/20 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.url} alt={v.variantLabel ?? v.filename}
                    className="h-12 w-12 rounded bg-[#1a1a1a] object-cover shrink-0" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-evari-text truncate">{v.variantLabel ?? v.filename}</span>
                      {v.purposes.includes('web') ? (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium bg-evari-gold/15 text-evari-gold border border-evari-gold/30">
                          <Globe className="h-2 w-2" /> Web
                        </span>
                      ) : null}
                      {v.purposes.includes('newsletter') ? (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium bg-evari-gold/15 text-evari-gold border border-evari-gold/30">
                          <Mail className="h-2 w-2" /> Newsletter
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-evari-dimmer">
                      <span className="font-mono tabular-nums">{fileExt(v.filename)}</span>
                      <span className="font-mono tabular-nums">{formatBytes(v.sizeBytes)}</span>
                      {v.width && v.height ? <span className="font-mono tabular-nums">{v.width}×{v.height}</span> : null}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button type="button" onClick={() => void copyUrl(v.url)}
                        className="inline-flex items-center gap-1 text-[10px] text-evari-dim hover:text-evari-gold transition">
                        <Copy className="h-2.5 w-2.5" /> Copy URL
                      </button>
                      <button type="button" onClick={() => onDelete(v.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-evari-dim hover:text-evari-gold transition ml-auto">
                        <Trash2 className="h-2.5 w-2.5" /> Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center gap-2 shrink-0">
        <button type="button" onClick={() => onDelete(root.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-gold transition">
          <Trash2 className="h-3 w-3" />
          Delete original + variants
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
  onConfirm: (input: { width: number; height: number | null; format: 'jpeg' | 'png' | 'webp' | 'gif'; purpose: AssetPurpose; label: string }) => void;
}) {
  const defaults = purpose === 'newsletter'
    ? { width: 600, format: 'jpeg' as const, label: 'Newsletter' }
    : { width: 1600, format: 'webp' as const, label: 'Web' };

  const [width, setWidth] = useState<number>(Math.min(defaults.width, asset.width ?? defaults.width));
  const [keepAspect, setKeepAspect] = useState(true);
  const [heightOverride, setHeightOverride] = useState<number | null>(null);
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp' | 'gif'>(defaults.format);
  const [label, setLabel] = useState<string>(defaults.label);

  const aspect = asset.width && asset.height ? asset.height / asset.width : null;
  const computedHeight = keepAspect && aspect ? Math.round(width * aspect) : (heightOverride ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-panel bg-evari-surface border border-evari-edge/30 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">
              New {purpose === 'web' ? 'web' : 'newsletter'} variant
            </div>
            <div className="text-[14px] font-semibold text-evari-text truncate mt-0.5">{asset.filename}</div>
          </div>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4 space-y-4">
          {/* Variant name */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Variant name</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Newsletter hero, Mobile thumb, …"
              className="w-full h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50" />
            <div className="text-[10px] text-evari-dimmer mt-1">Identifies this variant inside the family.</div>
          </div>

          {/* Current → New */}
          <div className="rounded bg-evari-ink/40 border border-evari-edge/20 p-3 flex items-center gap-3 text-[11px]">
            <div className="flex-1">
              <div className="text-evari-dimmer text-[10px] uppercase tracking-[0.12em]">Original</div>
              <div className="text-evari-text font-mono tabular-nums mt-0.5">
                {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'unknown'} · {fileExt(asset.filename)} · {formatBytes(asset.sizeBytes)}
              </div>
            </div>
            <div className="text-evari-gold/60 text-[16px]">→</div>
            <div className="flex-1">
              <div className="text-evari-dimmer text-[10px] uppercase tracking-[0.12em]">Variant</div>
              <div className="text-evari-text font-mono tabular-nums mt-0.5">
                {width}{computedHeight ? ` × ${computedHeight}` : ''} · {format.toUpperCase()}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Target width (px)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={width} min={16} max={8000} step={50}
                onChange={(e) => setWidth(Math.max(16, Math.min(8000, Number(e.target.value) || 16)))}
                className="flex-1 h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50 font-mono tabular-nums" />
              <input type="range" min={120} max={Math.max(2400, asset.width ?? 2400)} step={20}
                value={width} onChange={(e) => setWidth(Number(e.target.value))}
                className="flex-1 accent-evari-gold" />
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              {[600, 1200, 1600, 2400].map((preset) => (
                <button key={preset} type="button" onClick={() => setWidth(preset)}
                  className={cn('px-2 py-0.5 rounded text-[10px] font-medium border transition',
                    width === preset ? 'border-evari-gold/50 bg-evari-gold/10 text-evari-gold' : 'border-evari-edge/40 text-evari-dim hover:text-evari-text')}>
                  {preset}px
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-[12px] text-evari-text">
              <input type="checkbox" checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)} className="accent-evari-gold" />
              Keep aspect ratio
            </label>
            {!keepAspect ? (
              <input type="number" placeholder="height (px)" value={heightOverride ?? ''} min={16} max={8000}
                onChange={(e) => setHeightOverride(e.target.value ? Number(e.target.value) : null)}
                className="w-32 h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50 font-mono tabular-nums" />
            ) : (
              <span className="text-[10px] text-evari-dimmer">height auto</span>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">File format</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['jpeg', 'png', 'webp', 'gif'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className={cn('h-9 rounded-md text-[12px] font-medium border transition',
                    format === f ? 'border-evari-gold bg-evari-gold/15 text-evari-gold' : 'border-evari-edge/40 text-evari-dim hover:text-evari-text')}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-evari-dimmer mt-1.5 leading-relaxed">
              {format === 'jpeg' ? 'Smaller files, no transparency. Best for photos in newsletters.' : null}
              {format === 'png' ? 'Lossless with transparency. Best for logos and graphics.' : null}
              {format === 'webp' ? 'Modern format, smaller than JPEG/PNG with transparency. Best for web.' : null}
              {format === 'gif' ? 'Animated or 256-colour. Best for animated source.' : null}
            </div>
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="inline-flex items-center justify-center h-9 px-3 rounded-md text-[12px] font-medium text-evari-dim hover:text-evari-text transition disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm({ width, height: computedHeight, format, purpose, label })}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {busy ? 'Converting…' : 'Add to family'}
          </button>
        </footer>
      </div>
    </div>
  );
}
