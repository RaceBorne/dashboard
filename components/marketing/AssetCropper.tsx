'use client';

/**
 * Full-screen asset workspace with an interactive cropper, social
 * preset chooser, and the variant family.
 *
 * Layout:
 *   ┌────────────────────────┬────────────────┬──────────────────┐
 *   │ Source preview         │ Cropper canvas │ Right rail       │
 *   │ + meta + alt/tags      │ (drag + zoom)  │ - Preset picker  │
 *   │                        │                │ - Variants list  │
 *   └────────────────────────┴────────────────┴──────────────────┘
 *
 * Interaction:
 *   - Pick a preset chip on the right → crop frame snaps to that
 *     aspect ratio.
 *   - Drag the frame inside the source to position the crop.
 *   - Zoom slider scales the frame larger or smaller (maintaining
 *     aspect).
 *   - Click "Save crop" → server runs sharp.extract → resize → reformat,
 *     creates a new variant with the preset's label, prepends it to
 *     the family on the right.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Copy, Globe, Layers, Loader2, Mail, Plus, Scissors, Trash2, X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AssetPurpose, MktAsset, MktAssetFamily } from '@/lib/marketing/types';
import {
  SOCIAL_PRESETS, presetsByPlatform, presetLabel,
  type SocialPlatform, type SocialPreset,
} from '@/lib/marketing/socialPresets';

interface Props {
  family: MktAssetFamily;
  busy: boolean;
  onClose: () => void;
  onRootUpdated: (a: MktAsset) => void;
  onVariantAdded: (rootId: string, v: MktAsset) => void;
  onDelete: (id: string) => void;
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

const PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];

export function AssetCropper({
  family, busy, onClose, onRootUpdated, onVariantAdded, onDelete,
}: Props) {
  const root = family.root;
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>('instagram');
  const [activePreset, setActivePreset] = useState<SocialPreset | null>(null);
  const [labelOverride, setLabelOverride] = useState('');
  const [purpose, setPurpose] = useState<AssetPurpose>('global');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both rendered (display) and natural (source) dimensions of the
  // image. Natural dims come from <img>.naturalWidth which works
  // for any decoded image even when the DB row has null dimensions
  // (older uploads pre-dated metadata capture).
  const [imgRect, setImgRect] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Crop frame in DISPLAY pixels (top-left x/y, width/height).
  const [cropDisp, setCropDisp] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // When the preset changes (or the image rect changes), recompute a
  // sensible default frame: largest possible centered crop at the
  // preset's aspect ratio, scaled down 10% so the user has room to
  // drag without immediately hitting an edge.
  useEffect(() => {
    if (!imgRect || !activePreset) {
      setCropDisp(null);
      return;
    }
    const ratio = activePreset.ratio;
    const fit = fitFrame(imgRect.width, imgRect.height, ratio, 0.9);
    setCropDisp({
      x: (imgRect.width - fit.width) / 2,
      y: (imgRect.height - fit.height) / 2,
      width: fit.width,
      height: fit.height,
    });
  }, [imgRect, activePreset]);

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    setImgRect({ width: el.clientWidth, height: el.clientHeight });
    if (el.naturalWidth > 0 && el.naturalHeight > 0) {
      setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight });
    }
  }
  // Re-measure on window resize so the frame stays aligned.
  useEffect(() => {
    function measure() {
      if (imgRef.current) {
        setImgRect({ width: imgRef.current.clientWidth, height: imgRef.current.clientHeight });
      }
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Drag handlers for the crop frame.
  function startDrag(e: React.PointerEvent) {
    if (!cropDisp) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: cropDisp.x, origY: cropDisp.y };
  }
  function onDrag(e: React.PointerEvent) {
    if (!dragRef.current || !cropDisp || !imgRect) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nx = Math.max(0, Math.min(imgRect.width - cropDisp.width, dragRef.current.origX + dx));
    const ny = Math.max(0, Math.min(imgRect.height - cropDisp.height, dragRef.current.origY + dy));
    setCropDisp({ ...cropDisp, x: nx, y: ny });
  }
  function endDrag(e: React.PointerEvent) {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  // Zoom slider 0..100 → frame size as a fraction of max-fit.
  const [zoom, setZoom] = useState(90);
  useEffect(() => {
    if (!imgRect || !activePreset || !cropDisp) return;
    const fit = fitFrame(imgRect.width, imgRect.height, activePreset.ratio, zoom / 100);
    // Re-centre on the existing frame's centre to keep what the user
    // was looking at roughly in view.
    const cx = cropDisp.x + cropDisp.width / 2;
    const cy = cropDisp.y + cropDisp.height / 2;
    const newX = Math.max(0, Math.min(imgRect.width - fit.width, cx - fit.width / 2));
    const newY = Math.max(0, Math.min(imgRect.height - fit.height, cy - fit.height / 2));
    setCropDisp({ x: newX, y: newY, width: fit.width, height: fit.height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Convert the display crop back to source pixels. Prefer the
  // browser-decoded naturalSize over the DB row's width/height since
  // older uploads have null dims in the DB but always have valid
  // natural dims in the rendered <img>.
  const sourceCrop = useMemo(() => {
    if (!cropDisp || !imgRect) return null;
    const srcW = naturalSize?.width ?? root.width;
    const srcH = naturalSize?.height ?? root.height;
    if (!srcW || !srcH) return null;
    const sx = srcW / imgRect.width;
    const sy = srcH / imgRect.height;
    return {
      x: Math.round(cropDisp.x * sx),
      y: Math.round(cropDisp.y * sy),
      width: Math.round(cropDisp.width * sx),
      height: Math.round(cropDisp.height * sy),
    };
  }, [cropDisp, imgRect, naturalSize, root.width, root.height]);

  async function saveCrop() {
    if (!activePreset) {
      setError('Pick a preset on the right first.');
      return;
    }
    if (!sourceCrop) {
      setError('Crop frame not ready yet. Wait for the image to load and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/assets/${root.id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          width: activePreset.width,
          height: activePreset.height,
          format: activePreset.format,
          purpose,
          label: labelOverride.trim() || presetLabel(activePreset),
          crop: sourceCrop,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error ?? 'Save failed');
      onVariantAdded(root.id, data.asset as MktAsset);
      setLabelOverride('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const platformPresets = useMemo(() => presetsByPlatform()[activePlatform], [activePlatform]);
  const isPSD = root.filename.toLowerCase().endsWith('.psd');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-evari-ink/95 backdrop-blur" onClick={onClose}>
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-3 border-b border-evari-edge/30 bg-evari-surface/80 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Asset workspace</div>
            <div className="text-[15px] font-semibold text-evari-text truncate">{root.filename}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-evari-dimmer hidden md:inline">
              {root.width && root.height ? `${root.width}×${root.height}` : ''} · {fileExt(root.filename)} · {formatBytes(root.sizeBytes)}
            </span>
            <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text transition" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Body: 3 columns */}
        <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr_360px]">
          {/* Left: meta + alt/tags editor */}
          <LeftPane root={root} onRootUpdated={onRootUpdated} onDelete={() => onDelete(root.id)} />

          {/* Centre: cropper canvas */}
          <div className="bg-[#0e0e0e] flex flex-col min-h-0 border-x border-evari-edge/30">
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6">
              <div className="relative inline-block">
                {isPSD ? (
                  <div className="text-evari-dim text-center py-20 px-10">
                    <div className="text-[32px] font-bold opacity-60">PSD</div>
                    <div className="text-[11px] uppercase tracking-[0.12em] mt-2">No browser preview, cannot crop</div>
                  </div>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={imgRef}
                      src={root.url}
                      alt={root.altText ?? root.filename}
                      onLoad={onImgLoad}
                      draggable={false}
                      className="block max-w-full max-h-[calc(100vh-220px)] object-contain select-none pointer-events-none"
                      style={{ background: '#1a1a1a' }}
                    />
                    {cropDisp && imgRect && activePreset ? (
                      <CropFrame
                        cropDisp={cropDisp}
                        ratio={activePreset.ratio}
                        onPointerDown={startDrag}
                        onPointerMove={onDrag}
                        onPointerUp={endDrag}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Zoom slider + save button */}
            {!isPSD ? (
              <div className="px-6 py-3 border-t border-evari-edge/30 bg-evari-surface/40 flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer w-14">Frame size</span>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-evari-gold"
                    disabled={!activePreset}
                  />
                  <span className="text-[10px] text-evari-dim font-mono tabular-nums w-10 text-right">{zoom}%</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-evari-dimmer">
                  {activePreset && sourceCrop ? (
                    <span className="font-mono tabular-nums">
                      Crop {sourceCrop.width}×{sourceCrop.height} → {activePreset.width}×{activePreset.height}
                    </span>
                  ) : !activePreset ? (
                    <span>Pick a preset on the right</span>
                  ) : (
                    <span className="text-evari-dimmer">Loading image…</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void saveCrop()}
                  disabled={saving || !activePreset}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
                  {saving ? 'Saving…' : 'Save crop'}
                </button>
              </div>
            ) : null}
            {error ? <div className="px-6 py-2 text-[11px] text-evari-warning border-t border-evari-edge/30">{error}</div> : null}
          </div>

          {/* Right: preset chooser + variants */}
          <div className="bg-evari-surface/40 flex flex-col min-h-0">
            {/* Platform tabs */}
            <div className="flex items-center border-b border-evari-edge/30">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePlatform(p)}
                  className={cn(
                    'flex-1 px-2 py-2.5 text-[11px] font-medium transition border-b-2',
                    activePlatform === p
                      ? 'border-evari-gold text-evari-gold'
                      : 'border-transparent text-evari-dim hover:text-evari-text',
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Presets */}
              <div className="p-3 space-y-1.5 border-b border-evari-edge/30">
                <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5">Crop presets</div>
                {platformPresets.map((p) => {
                  const active = activePreset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePreset(p)}
                      className={cn(
                        'w-full text-left rounded-md p-2 transition border',
                        active ? 'bg-evari-gold/10 border-evari-gold/40' : 'border-evari-edge/30 hover:border-evari-edge/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium text-evari-text">{p.label}</div>
                        <div className="text-[10px] text-evari-dim font-mono tabular-nums">{p.width}×{p.height}</div>
                      </div>
                      <div className="text-[10px] text-evari-dimmer leading-relaxed mt-0.5">{p.use}</div>
                    </button>
                  );
                })}
              </div>

              {/* Save settings */}
              {activePreset ? (
                <div className="p-3 space-y-2.5 border-b border-evari-edge/30">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Save as</div>
                  <input
                    value={labelOverride}
                    onChange={(e) => setLabelOverride(e.target.value)}
                    placeholder={presetLabel(activePreset)}
                    className="w-full h-8 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-2.5 text-[11px] text-evari-text focus:outline-none focus:border-evari-gold/50"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPurpose('global')}
                      className={cn('flex-1 h-7 rounded-md text-[10px] font-medium border transition',
                        purpose === 'global' ? 'border-evari-gold bg-evari-gold/15 text-evari-gold' : 'border-evari-edge/40 text-evari-dim hover:text-evari-text')}
                    >
                      <Layers className="h-2.5 w-2.5 inline mr-1" /> Global
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurpose('web')}
                      className={cn('flex-1 h-7 rounded-md text-[10px] font-medium border transition',
                        purpose === 'web' ? 'border-evari-gold bg-evari-gold/15 text-evari-gold' : 'border-evari-edge/40 text-evari-dim hover:text-evari-text')}
                    >
                      <Globe className="h-2.5 w-2.5 inline mr-1" /> Web
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurpose('newsletter')}
                      className={cn('flex-1 h-7 rounded-md text-[10px] font-medium border transition',
                        purpose === 'newsletter' ? 'border-evari-gold bg-evari-gold/15 text-evari-gold' : 'border-evari-edge/40 text-evari-dim hover:text-evari-text')}
                    >
                      <Mail className="h-2.5 w-2.5 inline mr-1" /> Newsletter
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Variants list */}
              <div className="p-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5 flex items-center justify-between">
                  <span>Variants ({family.variants.length})</span>
                </div>
                {family.variants.length === 0 ? (
                  <div className="text-[10px] text-evari-dimmer italic py-3 text-center">
                    Pick a preset, drag the crop frame, hit Save crop.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {family.variants.map((v) => (
                      <VariantRow key={v.id} variant={v} onDelete={() => onDelete(v.id)} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fitFrame(boxW: number, boxH: number, ratio: number, scale = 1): { width: number; height: number } {
  const boxRatio = boxW / boxH;
  let w: number; let h: number;
  if (ratio > boxRatio) {
    w = boxW * scale;
    h = w / ratio;
  } else {
    h = boxH * scale;
    w = h * ratio;
  }
  return { width: w, height: h };
}

function CropFrame({ cropDisp, ratio, onPointerDown, onPointerMove, onPointerUp }: {
  cropDisp: { x: number; y: number; width: number; height: number };
  ratio: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  return (
    <>
      {/* Dim overlay everywhere except inside the frame, achieved via
          four boxes around the frame edges. */}
      <div
        className="absolute pointer-events-none bg-black/60"
        style={{ left: 0, top: 0, right: 0, height: cropDisp.y }}
      />
      <div
        className="absolute pointer-events-none bg-black/60"
        style={{ left: 0, top: cropDisp.y + cropDisp.height, right: 0, bottom: 0 }}
      />
      <div
        className="absolute pointer-events-none bg-black/60"
        style={{ left: 0, top: cropDisp.y, width: cropDisp.x, height: cropDisp.height }}
      />
      <div
        className="absolute pointer-events-none bg-black/60"
        style={{ left: cropDisp.x + cropDisp.width, top: cropDisp.y, right: 0, height: cropDisp.height }}
      />

      {/* Frame border + drag handle. The whole frame is the drag
          target so users can grab anywhere inside. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute border-2 border-evari-gold cursor-move shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        style={{ left: cropDisp.x, top: cropDisp.y, width: cropDisp.width, height: cropDisp.height }}
        title={`Drag to reposition. Aspect ratio ${ratio.toFixed(2)}:1`}
      >
        {/* Rule-of-thirds gridlines so the user can compose. */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 border-l border-evari-gold/40" />
          <div className="absolute left-2/3 top-0 bottom-0 border-l border-evari-gold/40" />
          <div className="absolute top-1/3 left-0 right-0 border-t border-evari-gold/40" />
          <div className="absolute top-2/3 left-0 right-0 border-t border-evari-gold/40" />
        </div>
        {/* Corner markers */}
        <CornerMarker pos="tl" />
        <CornerMarker pos="tr" />
        <CornerMarker pos="bl" />
        <CornerMarker pos="br" />
      </div>
    </>
  );
}

function CornerMarker({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const cls = {
    tl: '-top-1 -left-1',
    tr: '-top-1 -right-1',
    bl: '-bottom-1 -left-1',
    br: '-bottom-1 -right-1',
  }[pos];
  return <div className={cn('absolute h-3 w-3 bg-evari-gold rounded-full pointer-events-none', cls)} />;
}

function VariantRow({ variant, onDelete }: { variant: MktAsset; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(variant.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <li className="flex items-start gap-2 rounded bg-evari-ink/60 border border-evari-edge/20 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={variant.url} alt={variant.variantLabel ?? variant.filename}
        className="h-12 w-12 rounded bg-[#1a1a1a] object-cover shrink-0" loading="lazy" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-evari-text truncate">{variant.variantLabel ?? variant.filename}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-evari-dimmer">
          <span className="font-mono tabular-nums">{fileExt(variant.filename)}</span>
          <span className="font-mono tabular-nums">{formatBytes(variant.sizeBytes)}</span>
          {variant.width && variant.height ? <span className="font-mono tabular-nums">{variant.width}×{variant.height}</span> : null}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <button type="button" onClick={copy}
            className="inline-flex items-center gap-1 text-[10px] text-evari-dim hover:text-evari-gold transition">
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? 'Copied' : 'Copy URL'}
          </button>
          <button type="button" onClick={onDelete}
            className="inline-flex items-center gap-1 text-[10px] text-evari-dim hover:text-evari-gold transition ml-auto">
            <Trash2 className="h-2.5 w-2.5" /> Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function LeftPane({ root, onRootUpdated, onDelete }: {
  root: MktAsset;
  onRootUpdated: (a: MktAsset) => void;
  onDelete: () => void;
}) {
  const [alt, setAlt] = useState(root.altText ?? '');
  const [tagsStr, setTagsStr] = useState(root.tags.filter((t) => !t.startsWith('derived:')).join(', '));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setAlt(root.altText ?? '');
    setTagsStr(root.tags.filter((t) => !t.startsWith('derived:')).join(', '));
  }, [root.id, root.altText, root.tags]);

  const dirty = alt !== (root.altText ?? '') || tagsStr !== root.tags.filter((t) => !t.startsWith('derived:')).join(', ');

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

  return (
    <aside className="bg-evari-surface/40 flex flex-col min-h-0 overflow-y-auto p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Original</div>
      <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
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

      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Alt text</span>
        <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)}
          placeholder="Describe this image"
          className="w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Tags</span>
        <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)}
          placeholder="logo, hero, product"
          className="w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
      </label>
      <button type="button" onClick={save} disabled={!dirty || saving}
        className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40 transition">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
      </button>

      <button type="button" onClick={onDelete}
        className="mt-auto inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] text-evari-dim hover:text-evari-gold transition">
        <Trash2 className="h-3 w-3" />
        Delete original + variants
      </button>
    </aside>
  );
}
