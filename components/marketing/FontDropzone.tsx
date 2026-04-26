'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Upload } from 'lucide-react';

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
  const [fonts, setFonts] = useState<CustomFont[]>(initialFonts);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-upload form state — name/weight/style applied to the next dropped file.
  const [pendingName, setPendingName] = useState('');
  const [pendingWeight, setPendingWeight] = useState(400);
  const [pendingStyle, setPendingStyle] = useState<'normal' | 'italic'>('normal');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setFonts(initialFonts), [initialFonts]);
  useEffect(() => onChange?.(fonts), [fonts, onChange]);

  // Live-load each custom font into the document so previews render
  // using the actual file rather than a system fallback.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    fonts.forEach((f) => {
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
        fd.append('weight', String(pendingWeight));
        fd.append('style', pendingStyle);
        const res = await fetch('/api/marketing/brand/fonts', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) {
          setError(data.error ?? 'Upload failed');
          continue;
        }
        setFonts((curr) => {
          const others = curr.filter((c) => c.name !== data.font.name);
          return [...others, data.font as CustomFont];
        });
      }
      setPendingName('');
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
      setFonts((curr) =>
        curr.filter((f) => !(f.name === font.name && f.weight === font.weight && f.style === font.style)),
      );
      router.refresh();
    }
  }

  async function handleRemoveFamily(name: string) {
    if (!confirm(`Remove every variant of "${name}"? All weights and styles will be deleted.`)) return;
    const res = await fetch(`/api/marketing/brand/fonts/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setFonts((curr) => curr.filter((f) => f.name !== name));
      router.refresh();
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-evari-text uppercase tracking-[0.12em]">Custom fonts</h3>
        <span className="text-[10px] text-evari-dimmer tabular-nums">{fonts.length} uploaded</span>
      </div>

      {/* Per-upload metadata */}
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Family name (optional)</span>
          <input
            type="text"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="(use filename)"
            className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Weight</span>
          <select
            value={pendingWeight}
            onChange={(e) => setPendingWeight(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full"
          >
            {[100,200,300,400,500,600,700,800,900].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Style</span>
          <select
            value={pendingStyle}
            onChange={(e) => setPendingStyle(e.target.value as 'normal' | 'italic')}
            className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none w-full"
          >
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
          'rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors duration-300 ease-in-out',
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
            .woff2 / .woff / .ttf / .otf · max 5 MB · weight + style apply to the next dropped file
          </p>
        </div>
      </div>

      {error ? <p className="text-xs text-evari-danger">{error}</p> : null}

      {/* Uploaded — grouped by family */}
      <FontFamilyList
        fonts={fonts}
        onRemoveVariant={handleRemoveVariant}
        onRemoveFamily={handleRemoveFamily}
      />
    </div>
  );
}

interface FamilyListProps {
  fonts: CustomFont[];
  onRemoveVariant: (font: CustomFont) => void;
  onRemoveFamily: (name: string) => void;
}

/**
 * Renders one row per font family. Inside each, a select lets the user
 * pick which variant to preview (weight + style); the preview line
 * renders 'The quick brown fox' in that exact variant. Per-variant
 * remove via the trash icon next to the select; whole-family remove
 * via the small 'Remove all' link at the right of the row.
 */
function FontFamilyList({ fonts, onRemoveVariant, onRemoveFamily }: FamilyListProps) {
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
}

function FamilyRow({ name, variants, onRemoveVariant, onRemoveFamily }: FamilyRowProps) {
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
    <li className="px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div
            className="text-base text-evari-text truncate leading-tight"
            style={{ fontFamily: `'${name}', sans-serif`, fontWeight: active.weight, fontStyle: active.style }}
          >
            {name} — The quick brown fox jumps over the lazy dog
          </div>
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
