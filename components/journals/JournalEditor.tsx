'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  Loader2,
  X,
  ChevronDown,
  FolderOpen,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Search,
  Lightbulb,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalDraft } from '@/lib/journals/repository';
import type { ShopifyBlog } from '@/lib/shopify';
import { BlockList, type MediaTarget } from './BlockList';
import { MediaLibrary, type MediaFile } from './MediaLibrary';
import { ShopifyPreview, type JournalBlock } from './ShopifyPreview';

interface Props {
  draft: JournalDraft;
  blogs: ShopifyBlog[];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function newId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Remove every HTML tag + entity from a string and collapse
 * whitespace. Used to wash any leaky HTML out of fields that are
 * supposed to be plain text (Summary, Meta description) before
 * they land in a textarea. Cloning a Shopify article as a template
 * was dumping raw <p class='p1'>…</p> into Summary because some of
 * Evari's older imports have HTML in the summary column.
 */
function stripHtml(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/div\s*>/gi, '\n')
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

/**
 * Two-pane composer.
 *
 *  LEFT  — live Shopify-faithful preview of the article as readers
 *          will see it on evari.cc. Title, share strip, cover,
 *          body typography, inset images, the lot.
 *  RIGHT — compact metadata strip + AI Compose button + sortable
 *          stack of block cards. Each card edits one block and
 *          carries its own AI "rewrite this" affordance.
 *
 * Data model stays EditorJS-compatible so `lib/journals/editorToHtml`
 * keeps producing the HTML Shopify's articleCreate consumes.
 */
export function JournalEditor({ draft, blogs }: Props) {
  const router = useRouter();
  const saveTimerRef = useRef<number | null>(null);

  const [title, setTitle] = useState(stripHtml(draft.title));
  const [summary, setSummary] = useState(stripHtml(draft.summary));
  const [tagsText, setTagsText] = useState(draft.tags.join(', '));
  const [coverImageUrl, setCoverImageUrl] = useState(draft.coverImageUrl ?? '');
  const [seoTitle, setSeoTitle] = useState(stripHtml(draft.seoTitle));
  const [seoDescription, setSeoDescription] = useState(stripHtml(draft.seoDescription));
  // AI SEO suggestions — populated by the "Generate SEO" button. Not
  // persisted to the draft (yet) — the user-facing meta title / desc /
  // tags fields below ARE persisted; this object holds the focus
  // keyword + secondary keywords + rationale strings the AI returned.
  const [seoInsights, setSeoInsights] = useState<{
    focusKeyword: string;
    secondaryKeywords: string[];
    rationale: {
      focusKeyword?: string;
      secondaryKeywords?: string;
      tags?: string;
      metaTitle?: string;
      metaDescription?: string;
    };
  } | null>(null);
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [author, setAuthor] = useState(draft.author ?? 'Evari');
  const [blogTarget, setBlogTarget] = useState(draft.blogTarget);

  const initialBlocks = useMemo<JournalBlock[]>(() => {
    const raw = (draft.editorData as { blocks?: unknown }).blocks;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((b): b is { type: string; data?: Record<string, unknown>; id?: string } =>
        Boolean(b) && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string',
      )
      .map((b) => ({
        id: b.id ?? newId(),
        type: b.type,
        data: b.data ?? {},
      }));
  }, [draft.editorData]);
  const [blocks, setBlocks] = useState<JournalBlock[]>(initialBlocks);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'published' | 'error'>(
    draft.shopifyArticleId ? 'published' : 'idle',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Metadata accordion defaults open so Craig lands on editable
  // fields rather than a stack of closed strips. SEO stays closed
  // because it's a power-user tail-end step.
  const [metaOpen, setMetaOpen] = useState(true);
  const [seoOpen, setSeoOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBrief, setComposeBrief] = useState('');
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  /**
   * Media library state. `mediaTarget` tells us what the user is
   * trying to insert into:
   *   - `{ kind: 'cover' }`     → set coverImageUrl
   *   - `{ kind: 'new' }`       → append a new image/video block
   *   - `{ kind: 'block', ... }` → update an existing block's URL slot
   *
   * If `mediaTarget` is null the drawer is closed.
   */
  type MediaTargetState =
    | { kind: 'cover' }
    | { kind: 'new'; accept: 'image' | 'video' | 'any' }
    | { kind: 'block'; blockId: string; slot?: 'left' | 'right'; accept: 'image' | 'video' | 'any' };
  const [mediaTarget, setMediaTarget] = useState<MediaTargetState | null>(null);

  const tags = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  const lanes = useMemo(() => {
    const csPlus = blogs.find(
      (b) =>
        /cs\s*\+|cs-plus|bike\s*build/i.test(b.title) ||
        /cs-plus|bike-build|cs_plus/.test(b.handle),
    );
    const blogsBlog = blogs.find(
      (b) =>
        /^blogs?$/i.test(b.title) ||
        /^blogs?$/i.test(b.handle) ||
        /journal/i.test(b.handle),
    );
    return [
      { key: 'cs_plus', label: 'CS+ | Bike Builds', blogId: csPlus?.id },
      { key: 'blogs', label: 'Blogs', blogId: blogsBlog?.id ?? blogs[0]?.id },
    ];
  }, [blogs]);
  const laneLabel = lanes.find((l) => l.key === blogTarget)?.label ?? blogTarget;

  // ─── Save helpers ────────────────────────────────────────────────
  const persist = useCallback(
    async (overrides: Record<string, unknown> = {}) => {
      setSaveState('saving');
      try {
        const body = {
          title,
          summary,
          tags,
          coverImageUrl: coverImageUrl || null,
          seoTitle: seoTitle || null,
          seoDescription: seoDescription || null,
          author: author || null,
          blogTarget,
          editorData: { blocks },
          ...overrides,
        };
        const res = await fetch(`/api/journals/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1500);
      } catch (err) {
        console.error('[JournalEditor] save failed', err);
        setSaveState('error');
        setErrorMsg(err instanceof Error ? err.message : 'Save failed');
      }
    },
    [author, blogTarget, blocks, coverImageUrl, draft.id, seoDescription, seoTitle, summary, tags, title],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persist();
    }, 800);
  }, [persist]);

  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, summary, tagsText, coverImageUrl, seoTitle, seoDescription, author, blogTarget, blocks]);

  async function runSeo() {
    setSeoBusy(true);
    setSeoError(null);
    try {
      const res = await fetch('/api/journals/ai-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary,
          blocks,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error ?? 'SEO generation failed');
      }
      // Auto-populate the editable fields.
      if (Array.isArray(data.tags)) setTagsText(data.tags.join(', '));
      if (typeof data.metaTitle === 'string') setSeoTitle(data.metaTitle);
      if (typeof data.metaDescription === 'string') setSeoDescription(data.metaDescription);
      // Keep the focus + secondary keywords + rationale in panel state.
      setSeoInsights({
        focusKeyword: typeof data.focusKeyword === 'string' ? data.focusKeyword : '',
        secondaryKeywords: Array.isArray(data.secondaryKeywords) ? data.secondaryKeywords : [],
        rationale: data.rationale ?? {},
      });
      // Open the SEO accordion so the user lands on the populated fields.
      setSeoOpen(true);
    } catch (err) {
      setSeoError(err instanceof Error ? err.message : 'SEO generation failed');
    } finally {
      setSeoBusy(false);
    }
  }

  async function runCompose() {
    if (!composeBrief.trim()) return;
    setComposing(true);
    setComposeError(null);
    try {
      const res = await fetch('/api/journals/ai-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'outline',
          brief: composeBrief,
          context: {
            articleTitle: title,
            blogLane: laneLabel,
          },
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
      const generated: JournalBlock[] = data.blocks.map((b) => ({
        id: newId(),
        type: b.type,
        data: b.data ?? {},
      }));
      // Append rather than replace — the user can delete existing
      // blocks first if they want a clean slate.
      setBlocks((prev) => [...prev, ...generated]);
      setComposeOpen(false);
      setComposeBrief('');
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Compose failed');
    } finally {
      setComposing(false);
    }
  }

  /**
   * A file got picked from the Shopify media library. Route the URL
   * into the right place based on mediaTarget. Supports cover, new
   * block, or existing block (image or doubleImage slot, or video).
   */
  function handleMediaPick(file: MediaFile) {
    const url = file.url ?? file.previewUrl ?? '';
    if (!url || !mediaTarget) {
      setMediaTarget(null);
      return;
    }
    if (mediaTarget.kind === 'cover') {
      setCoverImageUrl(url);
      setMediaTarget(null);
      return;
    }
    if (mediaTarget.kind === 'new') {
      if (file.kind === 'video') {
        setBlocks((prev) => [
          ...prev,
          {
            id: newId(),
            type: 'video',
            data: { url, poster: file.previewUrl ?? '', caption: file.alt ?? '' },
          },
        ]);
      } else {
        setBlocks((prev) => [
          ...prev,
          {
            id: newId(),
            type: 'image',
            data: { file: { url }, caption: file.alt ?? '' },
          },
        ]);
      }
      setMediaTarget(null);
      return;
    }
    // Update an existing block.
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== mediaTarget.blockId) return b;
        if (b.type === 'image') {
          return {
            ...b,
            data: { ...b.data, file: { url }, caption: b.data.caption ?? file.alt ?? '' },
          };
        }
        if (b.type === 'doubleImage' && mediaTarget.slot) {
          const side = mediaTarget.slot;
          const existing =
            (b.data[side] as { url?: string; caption?: string } | undefined) ?? {};
          return {
            ...b,
            data: {
              ...b.data,
              [side]: { ...existing, url, caption: existing.caption || file.alt || '' },
            },
          };
        }
        if (b.type === 'video') {
          return {
            ...b,
            data: {
              ...b.data,
              url,
              poster: b.data.poster || file.previewUrl || '',
              caption: b.data.caption || file.alt || '',
            },
          };
        }
        return b;
      }),
    );
    setMediaTarget(null);
  }

  function openLibraryFromBlock(target: MediaTarget) {
    setMediaTarget({ kind: 'block', ...target });
  }

  /**
   * When a block card on the right is clicked / focused, smooth-
   * scroll the matching preview element on the left into view and
   * flash a brief accent ring around it so the connection between
   * the two panes is obvious.
   *
   * Debounced (via the 600ms highlight class timer) so rapid
   * focus-jumps across inputs in the same card don't stack
   * animations.
   */
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  /**
   * Width-popover state. When the user clicks an image / video /
   * double-image figure in the preview, we capture the block id +
   * the figure's bounding rect so the popover can position itself
   * just above the clicked element. Click-outside or Escape closes.
   */
  const [widthPopover, setWidthPopover] = useState<
    | { blockId: string; left: number; top: number }
    | null
  >(null);
  function openWidthPopover(blockId: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const containerRect = previewScrollRef.current?.getBoundingClientRect();
    setWidthPopover({
      blockId,
      // Position relative to the preview scroll container so the
      // popover travels with the page scroll naturally.
      left: rect.left - (containerRect?.left ?? 0) + rect.width / 2,
      top: rect.top - (containerRect?.top ?? 0) + (previewScrollRef.current?.scrollTop ?? 0),
    });
  }
  function setBlockWidth(blockId: string, width: 'sm' | 'md' | 'lg' | 'full') {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, data: { ...b.data, width } } : b)),
    );
  }
  function setBlockAlign(blockId: string, align: 'left' | 'center' | 'right') {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, data: { ...b.data, align } } : b)),
    );
  }
  // Close the popover on Escape or any click outside the figure +
  // popover (caught at the document level).
  useEffect(() => {
    if (!widthPopover) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setWidthPopover(null);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Clicks on a figure or inside the popover keep it open.
      if (t.closest('[data-width-popover]')) return;
      if (t.closest('.shopify-preview__figure--clickable')) return;
      setWidthPopover(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [widthPopover]);
  function scrollPreviewToBlock(blockId: string) {
    const root = previewScrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`#j-block-${blockId}`);
    if (!el) return;
    // Smooth-scroll so the block lands in the viewport's vertical
    // middle — 'center' feels intentional, 'nearest' can be a
    // no-op when the block is already partly visible.
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Strip any existing highlight before re-adding so consecutive
    // clicks re-trigger the CSS animation.
    el.classList.remove('shopify-preview__highlight');
    // Force reflow so the animation restarts cleanly.
    void el.offsetWidth;
    el.classList.add('shopify-preview__highlight');
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      el.classList.remove('shopify-preview__highlight');
    }, 1400);
  }
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  /**
   * Smooth-scroll the left preview to its top. Used when the user
   * clicks the Article metadata or SEO accordion headers so the
   * cover + title area — which those fields control — comes into
   * view at the same time as the fields themselves.
   */
  function scrollPreviewToTop() {
    previewScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handlePublish() {
    setErrorMsg(null);
    setPublishState('publishing');
    try {
      await persist();
      const res = await fetch(`/api/journals/${draft.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Publish failed');
      setPublishState('published');
      router.refresh();
    } catch (err) {
      setPublishState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] bg-evari-ink">
      {/* ── LEFT: live Shopify preview ───────────────────────────── */}
      <div ref={previewScrollRef} className="relative flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-4 border-b border-white/5 sticky top-0 bg-evari-ink z-10">
          <button
            onClick={() => router.push('/journals')}
            className="inline-flex items-center gap-1.5 text-xs text-evari-dim hover:text-evari-text transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Journals
          </button>
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
            Live preview · Shopify layout
          </span>
          <div className="flex items-center gap-3">
            <SaveBadge state={saveState} />
          </div>
        </div>
        <div className="w-full">
          <ShopifyPreview
            title={title}
            author={author}
            publishedAt={draft.publishedAt}
            coverImageUrl={coverImageUrl}
            blocks={blocks}
            subLabel={laneLabel}
            summary={summary}
            onImageClick={openWidthPopover}
            // Drag-reorder in the preview keeps the BlockList on the
            // right authoritative: we re-sequence by id so the same
            // block objects (with all their data) come back in the
            // new order. BlockList's own DndContext handles the
            // sidebar side of reordering separately.
            onReorder={(orderedIds) => {
              setBlocks((prev) => {
                const byId = new Map(prev.map((b) => [b.id, b]));
                return orderedIds
                  .map((id) => byId.get(id))
                  .filter((b): b is JournalBlock => Boolean(b));
              });
            }}
          />
          {widthPopover ? (
            <div
              data-width-popover
              style={{
                position: 'absolute',
                left: widthPopover.left,
                top: widthPopover.top,
                transform: 'translate(-50%, calc(-100% - 12px))',
                zIndex: 30,
              }}
              className="shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            >
              <WidthPopover
                value={
                  ((blocks.find((b) => b.id === widthPopover.blockId)?.data
                    .width as string | undefined) ?? 'full') as
                    | 'sm'
                    | 'md'
                    | 'lg'
                    | 'full'
                }
                align={
                  ((blocks.find((b) => b.id === widthPopover.blockId)?.data
                    .align as string | undefined) ?? 'center') as
                    | 'left'
                    | 'center'
                    | 'right'
                }
                onChange={(w) => setBlockWidth(widthPopover.blockId, w)}
                onAlign={(a) => setBlockAlign(widthPopover.blockId, a)}
              />
            </div>
          ) : null}
          {errorMsg ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-evari-warn">
              <AlertCircle className="h-4 w-4" />
              {errorMsg}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── RIGHT: block composer + metadata ──────────────────────── */}
      <aside className="w-[460px] shrink-0 border-l border-evari-edge bg-evari-carbon overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Publish CTA + title */}
          <section className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              className={cn(
                INPUT_CLS,
                // Tracks the preview's .shopify-preview__title so what
                // you type feels like the real headline.
                'text-xl font-bold py-3 tracking-tight',
              )}
            />
            <button
              onClick={handlePublish}
              disabled={publishState === 'publishing'}
              className="w-full inline-flex items-center justify-center gap-2 bg-evari-gold text-evari-goldInk text-sm font-semibold px-4 py-2.5 rounded-md hover:brightness-105 transition disabled:opacity-60 shadow-[0_1px_0_rgba(0,0,0,0.06)]"
            >
              <Send className="h-4 w-4" />
              {publishState === 'publishing'
                ? 'Publishing…'
                : draft.shopifyArticleId
                  ? 'Update on Shopify'
                  : 'Publish to Shopify'}
            </button>
          </section>

          {/* Metadata */}
          <Accordion
            label="Article metadata"
            open={metaOpen}
            onToggle={() => setMetaOpen((v) => !v)}
            onHeaderClick={scrollPreviewToTop}
          >
            <div className="space-y-4">
              <Field label="Destination" onLabelClick={scrollPreviewToTop}>
                <SelectInput
                  value={blogTarget}
                  onChange={setBlogTarget}
                  options={lanes.map((l) => ({ value: l.key, label: l.label }))}
                />
              </Field>
              <Field label="Cover image" onLabelClick={scrollPreviewToTop}>
                <div className="space-y-2">
                  {coverImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={coverImageUrl}
                      alt=""
                      // Sidebar cover preview matches the main
                      // article preview's 16:10 hero crop, so what
                      // Craig sees on the right is framed exactly
                      // like what will render on the left + the
                      // storefront.
                      className="w-full object-cover rounded-md"
                      style={{ aspectRatio: '16 / 10' }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMediaTarget({ kind: 'cover' })}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {coverImageUrl ? 'Change cover' : 'Pick from Shopify library'}
                  </button>
                </div>
              </Field>
              <Field label="Summary" onLabelClick={scrollPreviewToTop}>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                  className={cn(INPUT_CLS, 'resize-y min-h-[108px]')}
                />
              </Field>
              <Field label="Tags" onLabelClick={scrollPreviewToTop}>
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Author" onLabelClick={scrollPreviewToTop}>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
            </div>
          </Accordion>

          {/* SEO */}
          <Accordion
            label="SEO"
            open={seoOpen}
            onToggle={() => setSeoOpen((v) => !v)}
            onHeaderClick={scrollPreviewToTop}
          >
            <div className="space-y-4">
              {/* Generate SEO — Claude reads the title + body + summary
                  and proposes meta title, meta description, tags, AND a
                  focus keyword + secondary keywords with rationale.
                  Auto-populates the fields below; rationale shows in the
                  Keywords panel underneath. */}
              <button
                type="button"
                onClick={runSeo}
                disabled={seoBusy || !title.trim()}
                className="w-full inline-flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-md bg-evari-gold/15 text-evari-gold hover:bg-evari-gold/20 disabled:opacity-60 transition-colors"
              >
                {seoBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {seoBusy ? 'Generating SEO…' : 'Generate SEO from article'}
              </button>
              {seoError ? (
                <p className="text-[11px] text-evari-danger leading-snug">
                  {seoError}
                </p>
              ) : null}
              <Field label="Meta title" onLabelClick={scrollPreviewToTop}>
                <input
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  className={INPUT_CLS}
                />
                <p className="mt-1 text-[10px] text-evari-dimmer tabular-nums">
                  {seoTitle.length}/60 characters
                </p>
              </Field>
              <Field label="Meta description" onLabelClick={scrollPreviewToTop}>
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={4}
                  className={cn(INPUT_CLS, 'resize-y min-h-[108px]')}
                />
                <p className="mt-1 text-[10px] text-evari-dimmer tabular-nums">
                  {seoDescription.length}/160 characters
                </p>
              </Field>
              {/* Keywords + rationale — only shown after Generate SEO has
                  been clicked and returned. The focus keyword is the
                  primary search term we're targeting; secondary keywords
                  are the supporting long-tail terms. Rationale is the
                  AI's one-sentence reasoning for each pick, so the user
                  can sanity-check whether the SEO direction matches the
                  article's actual intent. */}
              {seoInsights ? (
                <section className="rounded-panel ring-1 ring-evari-edge bg-evari-surface/40 p-3 space-y-3">
                  <header className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-evari-gold font-semibold">
                    <Lightbulb className="h-3 w-3" />
                    SEO insights
                  </header>
                  {seoInsights.focusKeyword ? (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
                        <Search className="h-3 w-3" /> Focus keyword
                      </div>
                      <div className="mt-1 inline-flex items-center px-2 py-1 rounded bg-evari-gold text-evari-goldInk text-xs font-semibold">
                        {seoInsights.focusKeyword}
                      </div>
                      {seoInsights.rationale.focusKeyword ? (
                        <p className="mt-1.5 text-[11px] text-evari-dim leading-snug">
                          {seoInsights.rationale.focusKeyword}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {seoInsights.secondaryKeywords.length > 0 ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
                        Secondary keywords
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {seoInsights.secondaryKeywords.map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-evari-surface/80 text-evari-text text-[11px]"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                      {seoInsights.rationale.secondaryKeywords ? (
                        <p className="mt-1.5 text-[11px] text-evari-dim leading-snug">
                          {seoInsights.rationale.secondaryKeywords}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {(seoInsights.rationale.metaTitle ||
                    seoInsights.rationale.metaDescription ||
                    seoInsights.rationale.tags) ? (
                    <div className="border-t border-evari-edge/60 pt-2 space-y-1.5">
                      {seoInsights.rationale.tags ? (
                        <p className="text-[11px] text-evari-dim leading-snug">
                          <span className="text-evari-dimmer">Tags — </span>
                          {seoInsights.rationale.tags}
                        </p>
                      ) : null}
                      {seoInsights.rationale.metaTitle ? (
                        <p className="text-[11px] text-evari-dim leading-snug">
                          <span className="text-evari-dimmer">Meta title — </span>
                          {seoInsights.rationale.metaTitle}
                        </p>
                      ) : null}
                      {seoInsights.rationale.metaDescription ? (
                        <p className="text-[11px] text-evari-dim leading-snug">
                          <span className="text-evari-dimmer">Meta description — </span>
                          {seoInsights.rationale.metaDescription}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </Accordion>

          {/* Shopify media library quick-open */}
          <button
            onClick={() => setMediaTarget({ kind: 'new', accept: 'any' })}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-dim hover:text-evari-text hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
            type="button"
          >
            <FolderOpen className="h-4 w-4" />
            Shopify media library
          </button>

          {/* AI compose */}
          {composeOpen ? (
            <section className="rounded-lg bg-evari-gold/10 ring-1 ring-evari-gold/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-evari-gold">
                  <Sparkles className="h-3.5 w-3.5" />
                  Compose from a brief
                </span>
                <button
                  onClick={() => setComposeOpen(false)}
                  className="text-evari-dimmer hover:text-evari-text"
                  aria-label="Close compose"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={composeBrief}
                onChange={(e) => setComposeBrief(e.target.value)}
                rows={5}
                placeholder={
                  'A few bullets about what the article should cover. e.g.\n- CS+ Samurai paintjob with Kustomflow\n- Jaw Droppers show at Alexandra Palace\n- How Tom and Craig developed the purple and black colourway'
                }
                className={cn(INPUT_CLS, 'resize-y')}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-evari-dim leading-snug">
                  {composeError ?? 'Adds generated blocks to the end of the article.'}
                </span>
                <button
                  onClick={runCompose}
                  disabled={composing || !composeBrief.trim()}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-evari-gold text-evari-goldInk disabled:opacity-60 shrink-0"
                >
                  {composing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {composing ? 'Composing…' : 'Compose'}
                </button>
              </div>
            </section>
          ) : (
            <button
              onClick={() => setComposeOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md bg-evari-gold/15 text-evari-gold hover:bg-evari-gold/20 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              AI Compose article
            </button>
          )}

          {/* Blocks */}
          <section className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dim font-semibold">
                Blocks
              </span>
              <span className="text-[10px] text-evari-dimmer tabular-nums">
                {blocks.length}
              </span>
            </div>
            <BlockList
              blocks={blocks}
              onChange={setBlocks}
              articleTitle={title}
              articleSummary={summary}
              blogLane={laneLabel}
              onOpenMediaLibrary={openLibraryFromBlock}
              onFocusBlock={scrollPreviewToBlock}
            />
          </section>
        </div>
      </aside>

      {/* Shopify media library drawer — overlays everything when open */}
      <MediaLibrary
        open={mediaTarget !== null}
        accept={
          mediaTarget?.kind === 'block' || mediaTarget?.kind === 'new'
            ? mediaTarget.accept
            : 'image'
        }
        onClose={() => setMediaTarget(null)}
        onPick={handleMediaPick}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Shared input chrome. Uses the app-wide input-fill tokens so inputs
 * sit a notch darker than the panel in light mode and a notch brighter
 * in dark mode, without any visible border. Focus state brightens the
 * fill further. No outline ring, per the input-chrome convention
 * established in task #196.
 */
const INPUT_CLS = [
  'w-full rounded-md px-3 py-2 text-sm',
  'bg-[rgb(var(--evari-input-fill))]',
  'text-evari-text placeholder:text-evari-dimmer',
  'focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))]',
  'transition-colors',
].join(' ');

/**
 * Label-only field wrapper.
 *
 * Clicking the label scrolls:
 *   - itself to the top of the right pane (so the field you want
 *     to work in sits at the top of your editing viewport)
 *   - the left preview to its top (so the cover + title + summary
 *     area these metadata fields control is visible)
 *
 * The anchor is a ref on the wrapper <label>, not a DOM id, so the
 * behaviour is self-contained and can't collide with other pages.
 *
 * Label chrome: 10px top/bottom, 20px left, 5px right per Craig.
 */
function Field({
  label,
  children,
  onLabelClick,
}: {
  label: string;
  children: React.ReactNode;
  onLabelClick?: () => void;
}) {
  const labelRef = useRef<HTMLLabelElement | null>(null);
  function handleHeaderClick() {
    labelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onLabelClick?.();
  }
  return (
    <label ref={labelRef} className="block">
      <button
        type="button"
        onClick={handleHeaderClick}
        className="w-full text-left pt-[10px] pb-[10px] pl-[20px] pr-[5px] text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold cursor-pointer hover:text-evari-text transition-colors"
      >
        {label}
      </button>
      {children}
    </label>
  );
}

/**
 * Custom select — drops the native chevron and focus ring for a
 * clean look that matches the rest of the app's input chrome.
 */
function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          INPUT_CLS,
          'appearance-none pr-9 cursor-pointer',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dim" />
    </div>
  );
}

/**
 * Accordion section inside the right pane. Uses the same pill-style
 * header + subtle trough for the body that the app uses elsewhere.
 *
 * Clicking the header also scrolls the left preview up to its top
 * so the user jumps to "the place this accordion is about" —
 * Metadata and SEO both concern the article's title + cover area,
 * so both scroll to the top of the preview.
 */
function Accordion({
  label,
  open,
  onToggle,
  onHeaderClick,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onHeaderClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-evari-surface/40 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          onHeaderClick?.();
          onToggle();
        }}
        aria-expanded={open}
        className="w-full flex items-center gap-2 p-[5px] px-3 py-2.5 text-[11px] uppercase tracking-[0.14em] text-evari-dim font-semibold hover:text-evari-text transition-colors"
      >
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform',
            open ? '' : '-rotate-90',
          )}
        />
        <span className="flex-1 text-left">{label}</span>
      </button>
      {open ? <div className="px-3 pb-3 pt-1">{children}</div> : null}
    </div>
  );
}

/**
 * Floating popover anchored above a clicked figure in the live
 * preview. Four width pills + a small caret arrow pointing at the
 * image. Mirrors the sidebar WidthPills control so editing from
 * either side hits the same value.
 */
function WidthPopover({
  value,
  align,
  onChange,
  onAlign,
}: {
  value: 'sm' | 'md' | 'lg' | 'full';
  align: 'left' | 'center' | 'right';
  onChange: (next: 'sm' | 'md' | 'lg' | 'full') => void;
  onAlign: (next: 'left' | 'center' | 'right') => void;
}) {
  const widthOpts: Array<{ key: 'sm' | 'md' | 'lg' | 'full'; label: string }> = [
    { key: 'sm', label: 'Small' },
    { key: 'md', label: 'Half' },
    { key: 'lg', label: 'Wide' },
    { key: 'full', label: 'Full' },
  ];
  const alignOpts: Array<{ key: 'left' | 'center' | 'right'; Icon: typeof AlignLeft; label: string }> = [
    { key: 'left', Icon: AlignLeft, label: 'Range left' },
    { key: 'center', Icon: AlignCenter, label: 'Centre' },
    { key: 'right', Icon: AlignRight, label: 'Range right' },
  ];
  // Alignment is a no-op visually at full width, so we dim the row.
  const alignActive = value !== 'full';
  return (
    <div className="relative bg-evari-carbon ring-1 ring-evari-edge rounded-lg px-2 py-2 flex flex-col items-center gap-1.5">
      {/* Width row */}
      <div className="inline-flex items-center gap-0.5">
        {widthOpts.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.14em] font-semibold transition-colors',
              value === o.key
                ? 'bg-evari-gold text-evari-goldInk'
                : 'text-evari-dim hover:text-evari-text hover:bg-evari-surface/40',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* Alignment row */}
      <div className={cn('inline-flex items-center gap-0.5', alignActive ? '' : 'opacity-50')}>
        {alignOpts.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onAlign(o.key)}
            disabled={!alignActive}
            aria-label={o.label}
            title={alignActive ? o.label : `${o.label} (only applies when width < Full)`}
            className={cn(
              'h-7 w-9 inline-flex items-center justify-center rounded-md transition-colors',
              align === o.key
                ? 'bg-evari-gold text-evari-goldInk'
                : 'text-evari-dim hover:text-evari-text hover:bg-evari-surface/40 disabled:hover:bg-transparent',
            )}
          >
            <o.Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      {/* Down-pointing caret connecting popover to the image */}
      <span
        aria-hidden
        className="absolute left-1/2 -translate-x-1/2 top-full"
        style={{
          width: 0,
          height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '7px solid rgb(var(--evari-carbon))',
        }}
      />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const label = {
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }[state];
  const colour = {
    saving: 'text-evari-dimmer',
    saved: 'text-evari-success',
    error: 'text-evari-warn',
  }[state];
  return (
    <span className={cn('text-xs tabular-nums transition-colors', colour)}>
      {label}
    </span>
  );
}
