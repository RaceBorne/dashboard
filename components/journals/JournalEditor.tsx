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
      <div ref={previewScrollRef} className="flex-1 min-w-0 overflow-y-auto">
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
        <div className="max-w-3xl mx-auto px-10 py-10">
          <ShopifyPreview
            title={title}
            author={author}
            publishedAt={draft.publishedAt}
            coverImageUrl={coverImageUrl}
            blocks={blocks}
            subLabel={laneLabel}
            summary={summary}
          />
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
              <Field label="Meta title" onLabelClick={scrollPreviewToTop}>
                <input
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="Meta description" onLabelClick={scrollPreviewToTop}>
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={4}
                  className={cn(INPUT_CLS, 'resize-y min-h-[108px]')}
                />
              </Field>
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
