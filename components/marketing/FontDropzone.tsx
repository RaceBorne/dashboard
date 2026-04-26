'use client';

import { useEffect, useRef, useState } from 'react';
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

  async function handleRemove(name: string) {
    if (!confirm(`Remove "${name}"? Existing campaigns referencing it will fall back to the system font.`)) return;
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

      {/* Uploaded list */}
      {fonts.length > 0 ? (
        <ul className="rounded-md border border-evari-edge/30 divide-y divide-evari-edge/20 overflow-hidden">
          {fonts.map((f) => (
            <li key={`${f.name}-${f.weight}-${f.style}`} className="px-3 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-evari-text truncate" style={{ fontFamily: `'${f.name}', sans-serif` }}>
                  {f.name} — The quick brown fox
                </div>
                <div className="text-[10px] text-evari-dimmer font-mono tabular-nums truncate">
                  {f.weight} {f.style} · {f.format} · {f.filename}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(f.name)}
                className="px-2 py-1 rounded-md text-xs text-evari-dim hover:text-evari-danger transition-colors inline-flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
