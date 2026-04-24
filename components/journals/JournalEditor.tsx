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
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalDraft } from '@/lib/journals/repository';
import type { ShopifyBlog } from '@/lib/shopify';
import { BlockList } from './BlockList';
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

  const [title, setTitle] = useState(draft.title);
  const [summary, setSummary] = useState(draft.summary ?? '');
  const [tagsText, setTagsText] = useState(draft.tags.join(', '));
  const [coverImageUrl, setCoverImageUrl] = useState(draft.coverImageUrl ?? '');
  const [seoTitle, setSeoTitle] = useState(draft.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(draft.seoDescription ?? '');
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
  const [metaOpen, setMetaOpen] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBrief, setComposeBrief] = useState('');
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

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
      <div className="flex-1 min-w-0 overflow-y-auto">
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
      <aside className="w-[420px] shrink-0 border-l border-white/5 bg-evari-carbon/40 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Publish + title */}
          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              className="w-full bg-transparent text-lg font-semibold text-evari-text placeholder:text-evari-dimmer outline-none"
            />
            <button
              onClick={handlePublish}
              disabled={publishState === 'publishing'}
              className="w-full inline-flex items-center justify-center gap-2 bg-evari-gold text-evari-goldInk text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {publishState === 'publishing'
                ? 'Publishing…'
                : draft.shopifyArticleId
                  ? 'Update on Shopify'
                  : 'Publish to Shopify'}
            </button>
          </div>

          {/* Metadata accordion */}
          <Accordion
            label="Article metadata"
            open={metaOpen}
            onToggle={() => setMetaOpen((v) => !v)}
          >
            <div className="space-y-3">
              <Field label="Destination">
                <select
                  value={blogTarget}
                  onChange={(e) => setBlogTarget(e.target.value)}
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
                >
                  {lanes.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cover image URL">
                <input
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
                />
              </Field>
              <Field label="Summary" hint="Shown under the title on listings">
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  placeholder="One-sentence summary"
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text resize-none"
                />
              </Field>
              <Field label="Tags" hint="Comma-separated">
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="cs-plus, bike-build"
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
                />
              </Field>
              <Field label="Author">
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
                />
              </Field>
            </div>
          </Accordion>

          <Accordion label="SEO" open={seoOpen} onToggle={() => setSeoOpen((v) => !v)}>
            <div className="space-y-3">
              <Field label="Meta title">
                <input
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="Defaults to article title"
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
                />
              </Field>
              <Field label="Meta description">
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  rows={2}
                  placeholder="Defaults to summary"
                  className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text resize-none"
                />
              </Field>
            </div>
          </Accordion>

          {/* AI compose article */}
          {composeOpen ? (
            <div className="rounded-lg border border-evari-gold/30 bg-evari-gold/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-evari-gold">
                  <Sparkles className="h-3.5 w-3.5" />
                  Compose from a brief
                </span>
                <button
                  onClick={() => setComposeOpen(false)}
                  className="text-evari-dimmer hover:text-evari-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={composeBrief}
                onChange={(e) => setComposeBrief(e.target.value)}
                rows={5}
                placeholder={
                  'A few bullets about what the article should cover. e.g.\n- CS+ Samurai paintjob with Kustomflow\n- Jaw Droppers show at Alexandra Palace\n- How Tom and Craig developed the purple + black colourway'
                }
                className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text resize-y"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-evari-dimmer">
                  {composeError ?? 'Adds generated blocks to the end of the current article.'}
                </span>
                <button
                  onClick={runCompose}
                  disabled={composing || !composeBrief.trim()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-evari-gold text-evari-goldInk disabled:opacity-60"
                >
                  {composing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {composing ? 'Composing…' : 'Compose'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setComposeOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-2 text-sm rounded-md border border-evari-gold/30 text-evari-gold hover:bg-evari-gold/10 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              AI Compose article
            </button>
          )}

          {/* Blocks */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dim font-medium">
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
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dim font-medium">
          {label}
        </span>
        {hint ? (
          <span className="text-[10px] text-evari-dimmer truncate ml-2">{hint}</span>
        ) : null}
      </div>
      {children}
    </label>
  );
}

function Accordion({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/5 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-evari-dim font-medium hover:text-evari-text"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
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
