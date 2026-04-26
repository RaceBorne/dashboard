'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CustomFont } from '@/lib/marketing/types';

interface Props {
  initialFonts: CustomFont[];
  /** Called when the parent should refresh fonts in its dropdown. */
  onChange?: (fonts: CustomFont[]) => void;
}

const ACCEPTED = ['.woff2', '.woff', '.ttf', '.otf'];

/**
 * Drag-and-drop zone for uploading custom brand fonts. Files go to
 * the public mkt-brand-fonts Supabase bucket; the metadata is appended
 * to dashboard_mkt_brand.custom_fonts so other parts of the app
 * (typography selectors, sender @font-face injection, builder previews)
 * can reach them.
 *
 * Each uploaded font is loaded into the browser document via FontFace
 * API on mount, so the live preview rendering uses the actual file
 * the recipient will see.
 */
export function FontDropzone({ initialFonts, onChange }: Props) {
  const router = useRouter();
  // Controlled — fonts come from props; mutations go straight back through onChange.
  // Removed the prop-mirror + onChange-mirror effects that re-fired every parent
  // render and were starving the main thread (each cycle reloaded 25 FontFaces).
  const fonts = initialFonts;
  const setFonts = (next: CustomFont[]) => onChange?.(next);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-upload form state — name/weight/style applied to the next dropped file.
  const [pendingName, setPendingName] = useState('');
  const [pendingWeight, setPendingWeight] = useState<string>('');  // '' = auto-detect from filename
  const [pendingStyle, setPendingStyle] = useState<string>('');     // '' = auto-detect from filename
  const fileRef = useRef<HTMLInputElement>(null);

  // Track which font URLs we've already injected as FontFace so we don't
  // re-load on every render — this was the second main-thread starver.
  const loadedUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    fonts.forEach((f) => {
      if (loadedUrls.current.has(f.url)) return;
      loadedUrls.current.add(f.url);
      const ff = new FontFace(f.name, `url(${f.url}) format('${f.format}')`, {
        weight: String(f.weight),
        style: f.style,
        display: 'swap',
      });
      ff.load().then((loaded) => {
        (document as Document & { fonts: FontFaceSet }).fonts.add(loaded);
      }).catch(() => { /* ignore — preview falls back */ });
    });
  }, [fonts]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || uploading) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const ext = file.name.toLowerCase().split('.').pop() ?? '';
        if (!ACCEPTED.includes('.' + ext)) {
          setError(`Skipped ${file.name} — only ${ACCEPTED.join(', ')} are accepted`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        if (pendingName.trim()) fd.append('name', pendingName.trim());
        if (pendingWeight) fd.append('weight', pendingWeight);
        if (pendingStyle)  fd.append('style', pendingStyle);
        const res = await fetch('/api/marketing/brand/fonts', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) {
          setError(data.error ?? 'Upload failed');
          continue;
        }
        const others = fonts.filter((c) => c.name !== data.font.name);
        setFonts([...others, data.font as CustomFont]);
      }
      setPendingName('');
      setPendingWeight('');
      setPendingStyle('');
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveVariant(font: CustomFont) {
    if (!confirm(`Remove "${font.name}" ${font.weight} ${font.style}? Existing emails referencing this exact variant will fall back to the next weight/style or the system font.`)) return;
    const url = `/api/marketing/brand/fonts/${encodeURIComponent(font.name)}?weight=${font.weight}&style=${font.style}`;
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setFonts(fonts.filter((f) => !(f.name === font.name && f.weight === font.weight && f.style === font.style)));
      router.refresh();
    }
  }

  async function handleRemoveFamily(name: string) {
    if (!confirm(`Remove every variant of "${name}"? All weights and styles will be deleted.`)) return;
    const res = await fetch(`/api/marketing/brand/fonts/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setFonts(fonts.filter((f) => f.name !== name));
      router.refresh();
    }
  }

  async function handleRenameFamily(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const res = await fetch(`/api/marketing/brand/fonts/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setFonts(fonts.map((f) => (f.name === oldName ? { ...f, name: trimmed } : f)));
      router.refresh();
    } else {
      setError(data.error ?? 'Rename failed');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-evari-text uppercase tracking-[0.12em]">Custom fonts</h3>
        <span className="text-[10px] text-evari-dimmer tabular-nums">{fonts.length} uploaded</span>
      </div>

      {/* 2-column layout: uploader on the LEFT (~40%), uploaded font list
          stacked on the RIGHT (~60%) so we don't waste vertical real estate. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,40%)_minmax(0,1fr)] gap-3">
        <div className="space-y-2">

      {/* Per-upload metadata */}
      <div className="grid grid-cols-3 gap-1">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Family name (optional)</span>
          <input
            type="text"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="(auto-detect from filename)"
            className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Weight</span>
          <select
            value={pendingWeight}
            onChange={(e) => setPendingWeight(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full"
          >
            <option value="">Auto (from filename)</option>
            {[100,200,300,400,500,600,700,800,900].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Style</span>
          <select
            value={pendingStyle}
            onChange={(e) => setPendingStyle(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full"
          >
            <option value="">Auto (from filename)</option>
            <option value="normal">normal</option>
            <option value="italic">italic</option>
          </select>
        </label>
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
          'rounded-md border-2 border-dashed p-4 text-center cursor-pointer transition-colors duration-300 ease-in-out',
          dragOver
            ? 'border-evari-gold/60 bg-evari-gold/5'
            : 'border-evari-edge/40 bg-evari-ink/40 hover:border-evari-edge/60 hover:bg-evari-ink/60',
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-2 text-evari-dim">
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-evari-gold" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
          <p className="text-sm text-evari-text font-medium">
            {uploading ? 'Uploading…' : 'Drop a font file here or click to browse'}
          </p>
          <p className="text-[11px] text-evari-dimmer">
            .woff2 / .woff / .ttf / .otf · max 5 MB · family + weight + style auto-detected from filename — override above if needed
          </p>
        </div>
      </div>

      {error ? <p className="text-xs text-evari-danger">{error}</p> : null}
        </div>

        {/* RIGHT column — family list, each row's preview line uses the
            actual @font-face so heights/widths match what subscribers see. */}
        <div className="min-h-0">
          <FontFamilyList
            fonts={fonts}
            onRemoveVariant={handleRemoveVariant}
            onRemoveFamily={handleRemoveFamily}
            onRenameFamily={handleRenameFamily}
          />
        </div>
      </div>
    </div>
  );
}

interface FamilyListProps {
  fonts: CustomFont[];
  onRemoveVariant: (font: CustomFont) => void;
  onRemoveFamily: (name: string) => void;
  onRenameFamily: (oldName: string, newName: string) => void;
}

/**
 * Renders one row per font family. Inside each, a select lets the user
 * pick which variant to preview (weight + style); the preview line
 * renders 'The quick brown fox' in that exact variant. Per-variant
 * remove via the trash icon next to the select; whole-family remove
 * via the small 'Remove all' link at the right of the row.
 */
function FontFamilyList({ fonts, onRemoveVariant, onRemoveFamily, onRenameFamily }: FamilyListProps) {
  const families = useMemo(() => {
    const m = new Map<string, CustomFont[]>();
    for (const f of fonts) {
      if (!m.has(f.name)) m.set(f.name, []);
      m.get(f.name)!.push(f);
    }
    // Sort variants by weight ascending then style.
    for (const list of m.values()) {
      list.sort(
        (a, b) => a.weight - b.weight || a.style.localeCompare(b.style),
      );
    }
    return [...m.entries()];
  }, [fonts]);

  if (families.length === 0) return null;

  return (
    <ul className="rounded-md border border-evari-edge/30 divide-y divide-evari-edge/20 overflow-hidden">
      {families.map(([name, variants]) => (
        <FamilyRow
          key={name}
          name={name}
          variants={variants}
          onRemoveVariant={onRemoveVariant}
          onRemoveFamily={onRemoveFamily}
          onRenameFamily={onRenameFamily}
        />
      ))}
    </ul>
  );
}

interface FamilyRowProps {
  name: string;
  variants: CustomFont[];
  onRemoveVariant: (font: CustomFont) => void;
  onRemoveFamily: (name: string) => void;
  onRenameFamily: (oldName: string, newName: string) => void;
}

function FamilyRow({ name, variants, onRemoveVariant, onRemoveFamily, onRenameFamily }: FamilyRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  // Default selected variant: pick weight closest to 400 + normal style.
  const defaultIdx = (() => {
    let bestIdx = 0;
    let bestScore = Infinity;
    variants.forEach((v, i) => {
      const score = Math.abs(v.weight - 400) + (v.style === 'normal' ? 0 : 50);
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    });
    return bestIdx;
  })();
  const [activeKey, setActiveKey] = useState<string>(`${variants[defaultIdx].weight}-${variants[defaultIdx].style}`);
  const active = variants.find(
    (v) => `${v.weight}-${v.style}` === activeKey,
  ) ?? variants[0];

  return (
    <li className="group/family px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRenameFamily(name, draftName);
                    setRenaming(false);
                  } else if (e.key === 'Escape') {
                    setDraftName(name);
                    setRenaming(false);
                  }
                }}
                className="flex-1 px-2 py-1 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-gold/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => { onRenameFamily(name, draftName); setRenaming(false); }}
                className="p-1 text-evari-success hover:bg-black/30 rounded"
                title="Save"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setDraftName(name); setRenaming(false); }}
                className="p-1 text-evari-dim hover:text-evari-text rounded"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div
                className="text-base text-evari-text truncate leading-tight"
                style={{ fontFamily: `'${name}', sans-serif`, fontWeight: active.weight, fontStyle: active.style }}
              >
                {name} — The quick brown fox jumps over the lazy dog
              </div>
              <button
                type="button"
                onClick={() => { setDraftName(name); setRenaming(true); }}
                className="opacity-0 group-hover/family:opacity-100 p-0.5 text-evari-dim hover:text-evari-text transition-opacity"
                title={`Rename "${name}" — merge variants by typing another family's name`}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="text-[10px] text-evari-dimmer font-mono tabular-nums truncate mt-0.5">
            {variants.length} variant{variants.length === 1 ? '' : 's'} · {active.format} · {active.filename}
          </div>
        </div>
        <select
          value={activeKey}
          onChange={(e) => setActiveKey(e.target.value)}
          className="px-2 py-1 rounded-md bg-evari-ink text-evari-text text-xs border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          aria-label={`${name} variants`}
        >
          {variants.map((v) => (
            <option key={`${v.weight}-${v.style}`} value={`${v.weight}-${v.style}`}>
              {v.weight} {v.style}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onRemoveVariant(active)}
          className="px-2 py-1 rounded-md text-xs text-evari-dim hover:text-evari-danger transition-colors inline-flex items-center gap-1"
          title={`Remove ${name} ${active.weight} ${active.style}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {variants.length > 1 ? (
        <div className="mt-1.5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => onRemoveFamily(name)}
            className="text-[10px] text-evari-dimmer hover:text-evari-danger underline underline-offset-2 transition-colors"
          >
            Remove all variants
          </button>
        </div>
      ) : null}
    </li>
  );
}
