'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Search,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  GripVertical,
  Trash2,
  ArrowRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MediaFile } from './MediaLibrary';

interface Props {
  open: boolean;
  laneKey: string;
  laneLabel: string;
  onClose: () => void;
  /** Called when the wizard finishes a successful Compose. The
   *  parent creates the draft (POST /api/journals with the seeded
   *  content) and navigates to /journals/[id]. */
  onComplete: (payload: {
    title: string;
    summary: string;
    blocks: Array<{ type: string; data: Record<string, unknown> }>;
    coverImageUrl?: string;
  }) => Promise<void> | void;
}

type Step = 1 | 2 | 3;

/**
 * Three-step wizard for creating a new Journal article from scratch:
 *
 *   1. Title + brief description (what the blog is about)
 *   2. Pick + sequence images from the Shopify Files library
 *   3. Compose — AI takes title + brief + image sequence and writes
 *      the full article: H1/H2/H3 hierarchy, paragraphs interleaved
 *      with images at chosen widths/alignments, ready to publish to
 *      Shopify natively.
 *
 * The wizard does not write the draft itself — it hands the final
 * payload to the parent's onComplete which is responsible for
 * creating the draft and navigating into the editor. This keeps
 * the wizard a pure UI component.
 */
export function NewJournalWizard({
  open,
  laneKey,
  laneLabel,
  onClose,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [picked, setPicked] = useState<MediaFile[]>([]);

  // Step-2 library state
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hasNextPage, setHasNextPage] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const loadFiles = useCallback(
    async (replace = true) => {
      setFilesLoading(true);
      setFilesError(null);
      try {
        const params = new URLSearchParams({ type: 'image' });
        if (query) params.set('query', query);
        if (!replace && cursor) params.set('cursor', cursor);
        const res = await fetch(`/api/shopify/files?${params.toString()}`);
        const data = (await res.json()) as {
          ok?: boolean;
          files?: MediaFile[];
          hasNextPage?: boolean;
          endCursor?: string | null;
          error?: string;
        };
        if (!data.ok) throw new Error(data.error ?? 'Library failed to load');
        setFiles((prev) => (replace ? data.files ?? [] : [...prev, ...(data.files ?? [])]));
        setHasNextPage(Boolean(data.hasNextPage));
        setCursor(data.endCursor ?? null);
      } catch (err) {
        setFilesError(err instanceof Error ? err.message : 'Library failed');
      } finally {
        setFilesLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, cursor],
  );

  useEffect(() => {
    if (open && step === 2) void loadFiles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Debounced search
  useEffect(() => {
    if (!open || step !== 2) return;
    const t = setTimeout(() => void loadFiles(true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Step-3 compose state
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setTitle('');
    setBrief('');
    setPicked([]);
    setQuery('');
    setComposeError(null);
  }

  function close() {
    onClose();
    // Defer reset so the modal exit animation sees the populated state.
    setTimeout(reset, 200);
  }

  function pickFile(file: MediaFile) {
    if (!file.url) return;
    if (picked.some((f) => f.id === file.id)) return;
    setPicked((prev) => [...prev, file]);
  }
  function unpickFile(id: string) {
    setPicked((prev) => prev.filter((f) => f.id !== id));
  }
  function moveFile(id: string, direction: -1 | 1) {
    setPicked((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  async function runCompose() {
    setComposing(true);
    setComposeError(null);
    try {
      const res = await fetch('/api/journals/ai-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'wizard',
          title: title.trim(),
          brief: brief.trim(),
          images: picked.map((f) => ({ url: f.url, alt: f.alt ?? f.filename })),
          context: { blogLane: laneLabel, articleTitle: title.trim() },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        blocks?: Array<{ type: string; data: Record<string, unknown> }>;
        error?: string;
      };
      if (!data.ok || !Array.isArray(data.blocks)) {
        throw new Error(data.error ?? 'AI returned nothing');
      }
      // Cover image: the first picked image (if any) is also a sensible default
      // for the article's cover thumbnail.
      const cover = picked[0]?.url ?? undefined;
      // Summary: the first ~160 chars of the brief, lightly cleaned.
      const summary = brief.trim().slice(0, 200);
      await onComplete({
        title: title.trim(),
        summary,
        blocks: data.blocks,
        coverImageUrl: cover,
      });
      // close happens after parent's redirect; reset for next time
      setTimeout(reset, 400);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Compose failed');
    } finally {
      setComposing(false);
    }
  }

  if (!open) return null;
  // Step-by-step gating
  const canStep2 = title.trim().length > 0 && brief.trim().length > 0;
  const canStep3 = canStep2 && picked.length > 0;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={composing ? undefined : close}
        aria-hidden
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-3xl h-[80vh] max-h-[800px] bg-evari-ink rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden ring-1 ring-evari-edge">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-evari-edge">
            <div className="flex items-center gap-3">
              <Stepper step={step} />
            </div>
            <h2 className="text-sm font-semibold text-evari-text">
              New article — {laneLabel}
            </h2>
            <button
              onClick={close}
              disabled={composing}
              className="p-1.5 rounded-md text-evari-dim hover:text-evari-text hover:bg-evari-surface/40 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {step === 1 ? (
              <Step1
                title={title}
                onTitleChange={setTitle}
                brief={brief}
                onBriefChange={setBrief}
              />
            ) : step === 2 ? (
              <Step2
                files={files}
                loading={filesLoading}
                error={filesError}
                query={query}
                onQueryChange={setQuery}
                hasNextPage={hasNextPage}
                onLoadMore={() => void loadFiles(false)}
                picked={picked}
                onPick={pickFile}
                onUnpick={unpickFile}
                onMove={moveFile}
              />
            ) : (
              <Step3
                title={title}
                brief={brief}
                pickedCount={picked.length}
                composing={composing}
                error={composeError}
              />
            )}
          </div>

          {/* Footer — back / next / compose */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-evari-edge bg-evari-carbon/40">
            <button
              type="button"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
              disabled={step === 1 || composing}
              className="inline-flex items-center gap-1.5 text-sm text-evari-dim hover:text-evari-text px-3 py-1.5 rounded-md disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
              Step {step} of 3
            </span>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s < 3 ? ((s + 1) as Step) : s))}
                disabled={(step === 1 && !canStep2) || (step === 2 && !canStep3)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-md bg-evari-gold text-evari-goldInk disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runCompose()}
                disabled={composing || !canStep3}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-md bg-evari-gold text-evari-goldInk disabled:opacity-60"
              >
                {composing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {composing ? 'Composing…' : 'Compose article'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const labels = ['Brief', 'Images', 'Compose'];
  return (
    <div className="inline-flex items-center gap-1.5">
      {labels.map((l, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={l} className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-5 w-5 inline-flex items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors',
                done
                  ? 'bg-evari-gold text-evari-goldInk'
                  : active
                    ? 'bg-evari-gold text-evari-goldInk'
                    : 'bg-evari-surface text-evari-dim',
              )}
            >
              {idx}
            </span>
            <span
              className={cn(
                'text-[11px] uppercase tracking-[0.14em] font-semibold',
                active ? 'text-evari-text' : 'text-evari-dim',
              )}
            >
              {l}
            </span>
            {idx < labels.length ? (
              <ChevronRight className="h-3 w-3 text-evari-dimmer" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — title + brief
// ─────────────────────────────────────────────────────────────────────

function Step1({
  title,
  onTitleChange,
  brief,
  onBriefChange,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  brief: string;
  onBriefChange: (v: string) => void;
}) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <label className="block text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[10px]">
          Article title
        </label>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder=""
          className="w-full rounded-md px-3 py-3 text-lg font-semibold bg-[rgb(var(--evari-input-fill))] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
        />
      </div>
      <div>
        <label className="block text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[10px]">
          What is this article about?
        </label>
        <textarea
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          rows={8}
          placeholder=""
          className="w-full rounded-md px-3 py-3 text-sm bg-[rgb(var(--evari-input-fill))] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))] transition-colors resize-y min-h-[200px]"
        />
        <p className="mt-2 text-xs text-evari-dim leading-snug px-1">
          A few sentences or bullet points. The AI will use this plus the
          images you pick next to write the whole article.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — pick + sequence images
// ─────────────────────────────────────────────────────────────────────

function Step2({
  files,
  loading,
  error,
  query,
  onQueryChange,
  hasNextPage,
  onLoadMore,
  picked,
  onPick,
  onUnpick,
  onMove,
}: {
  files: MediaFile[];
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (v: string) => void;
  hasNextPage: boolean;
  onLoadMore: () => void;
  picked: MediaFile[];
  onPick: (file: MediaFile) => void;
  onUnpick: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const pickedIds = new Set(picked.map((p) => p.id));
  return (
    <div className="grid grid-cols-[1fr_280px] h-full">
      {/* Left: library */}
      <div className="border-r border-evari-edge flex flex-col min-h-0">
        <div className="p-4 border-b border-evari-edge">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search Shopify files…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-evari-dim">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading library…
            </div>
          ) : error ? (
            <div className="inline-flex items-center gap-2 text-xs text-evari-warn px-3 py-2 rounded-md bg-evari-warn/10">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-10 text-sm text-evari-dim">
              No files match. Adjust the search.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {files.map((f) => {
                const already = pickedIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onPick(f)}
                    disabled={already}
                    className={cn(
                      'group relative rounded-panel overflow-hidden bg-evari-surface/40 ring-1 ring-transparent transition-all',
                      already
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:ring-evari-gold/60 cursor-pointer',
                    )}
                  >
                    <div className="aspect-[4/3]" style={{ aspectRatio: '4 / 3' }}>
                      {f.previewUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={f.previewUrl}
                          alt={f.alt ?? f.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-evari-dimmer" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {hasNextPage ? (
            <button
              onClick={onLoadMore}
              disabled={loading}
              className="w-full mt-3 py-2 text-xs font-medium text-evari-dim hover:text-evari-text rounded-md bg-[rgb(var(--evari-input-fill))] hover:bg-[rgb(var(--evari-input-fill-focus))]"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Right: picked sequence */}
      <div className="flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-evari-edge">
          <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dim font-semibold">
            Sequence ({picked.length})
          </div>
          <p className="mt-1 text-xs text-evari-dim leading-snug">
            Click images on the left to add. Drag the handle or use arrows
            to reorder. The first image becomes the hero.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {picked.length === 0 ? (
            <div className="text-center py-10 text-xs text-evari-dim">
              No images picked yet.
            </div>
          ) : (
            picked.map((f, i) => (
              <div
                key={f.id}
                className="flex items-center gap-2 p-2 rounded-panel bg-evari-surface/40"
              >
                <GripVertical className="h-3.5 w-3.5 text-evari-dimmer shrink-0" />
                {f.previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.previewUrl}
                    alt=""
                    className="h-10 w-12 object-cover rounded"
                  />
                ) : (
                  <div className="h-10 w-12 bg-evari-surface rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-evari-text truncate">
                    {i === 0 ? 'Hero · ' : ''}
                    {f.filename}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => onMove(f.id, -1)}
                    disabled={i === 0}
                    title="Move up"
                    className="p-1 rounded text-evari-dim hover:text-evari-text disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMove(f.id, 1)}
                    disabled={i === picked.length - 1}
                    title="Move down"
                    className="p-1 rounded text-evari-dim hover:text-evari-text disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => onUnpick(f.id)}
                    title="Remove"
                    className="p-1 rounded text-evari-dimmer hover:text-evari-warn"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — compose preview
// ─────────────────────────────────────────────────────────────────────

function Step3({
  title,
  brief,
  pickedCount,
  composing,
  error,
}: {
  title: string;
  brief: string;
  pickedCount: number;
  composing: boolean;
  error: string | null;
}) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[6px]">
          Title
        </div>
        <div className="text-lg font-semibold text-evari-text px-3 py-2 rounded-md bg-[rgb(var(--evari-input-fill))]">
          {title}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[6px]">
          Brief
        </div>
        <div className="text-sm text-evari-text px-3 py-2 rounded-md bg-[rgb(var(--evari-input-fill))] whitespace-pre-line leading-snug">
          {brief}
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold pl-[20px] pt-[10px] pb-[6px]">
          Image sequence
        </div>
        <div className="text-sm text-evari-dim px-3 py-2 rounded-md bg-[rgb(var(--evari-input-fill))]">
          {pickedCount} image{pickedCount === 1 ? '' : 's'}
          {pickedCount > 0 ? ' · first becomes the hero' : ''}
        </div>
      </div>
      <div className="rounded-lg bg-evari-gold/10 ring-1 ring-evari-gold/30 p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-evari-gold shrink-0 mt-0.5" />
          <div className="text-sm text-evari-text leading-snug">
            <span className="font-semibold">Ready to compose.</span>{' '}
            <span className="text-evari-dim">
              The AI will use your brief + images to write the article — H1/
              H2/H3 hierarchy, body paragraphs, and image placements (width
              and alignment) chosen to match the story. You can edit any
              block in the composer afterwards.
            </span>
          </div>
        </div>
      </div>
      {composing ? (
        <div className="inline-flex items-center gap-2 text-sm text-evari-dim">
          <Loader2 className="h-4 w-4 animate-spin" />
          Composing…
        </div>
      ) : null}
      {error ? (
        <div className="inline-flex items-center gap-2 text-xs text-evari-warn px-3 py-2 rounded-md bg-evari-warn/10">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

// Minimal cn-compatible re-import marker so eslint's unused-import doesn't
// flag the tabular ArrowRight import — only used in a placeholder
// commented above. Drop if formal lint complains.
void ArrowRight;
