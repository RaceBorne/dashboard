'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save,
  Send,
  ArrowLeft,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { JournalDraft } from '@/lib/journals/repository';
import type { ShopifyBlog } from '@/lib/shopify';

interface Props {
  draft: JournalDraft;
  blogs: ShopifyBlog[];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * EditorJS-backed composer for a single Journal draft.
 *
 * The editor itself mounts once on first render against a detached
 * DOM node, loads the block tools (paragraph, header, list, image,
 * quote, delimiter, and a custom doubleImage), and wires a debounced
 * onChange that PATCH'es `/api/journals/[id]` with the latest
 * `editorData`. All other sidebar fields (title, summary, tags, cover
 * image, SEO) PATCH the same endpoint when they change.
 *
 * We load EditorJS via dynamic import so the 70KB+ of editor + tools
 * only ships to this route (keeps the main bundle lean).
 */
export function JournalEditor({ draft, blogs }: Props) {
  const router = useRouter();
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  // Keep a handle on the live EditorJS instance so we can call
  // `.save()` and `.destroy()` across effects without re-creating.
  const editorRef = useRef<EditorJSInstance | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const [title, setTitle] = useState(draft.title);
  const [summary, setSummary] = useState(draft.summary ?? '');
  const [tagsText, setTagsText] = useState(draft.tags.join(', '));
  const [coverImageUrl, setCoverImageUrl] = useState(draft.coverImageUrl ?? '');
  const [seoTitle, setSeoTitle] = useState(draft.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(
    draft.seoDescription ?? '',
  );
  const [author, setAuthor] = useState(draft.author ?? 'Evari');
  const [blogTarget, setBlogTarget] = useState(draft.blogTarget);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [publishState, setPublishState] = useState<
    'idle' | 'publishing' | 'published' | 'error'
  >(draft.shopifyArticleId ? 'published' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tags = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  // ─── EditorJS boot ────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRootRef.current) return;
    let cancelled = false;
    (async () => {
      const [
        { default: EditorJS },
        { default: Header },
        { default: Paragraph },
        { default: List },
        { default: ImageTool },
        { default: Quote },
        { default: Delimiter },
        { default: InlineCode },
      ] = await Promise.all([
        import('@editorjs/editorjs'),
        import('@editorjs/header'),
        import('@editorjs/paragraph'),
        import('@editorjs/list'),
        import('@editorjs/image'),
        import('@editorjs/quote'),
        import('@editorjs/delimiter'),
        import('@editorjs/inline-code'),
      ]);
      if (cancelled || !editorRootRef.current) return;

      const editor = new EditorJS({
        holder: editorRootRef.current,
        placeholder: 'Start writing, or drag a block into this column…',
        minHeight: 400,
        autofocus: false,
        // Cast through `unknown` — EditorJS's `OutputData` type is
        // strict about block shape but at runtime it accepts any
        // serialisable shape, which is what we've got on disk.
        data: (draft.editorData as unknown as import('@editorjs/editorjs').OutputData | undefined) ?? { blocks: [] },
        tools: {
          header: {
            class: Header as unknown as import('@editorjs/editorjs').ToolConstructable,
            config: { placeholder: 'Section heading', levels: [2, 3, 4], defaultLevel: 2 },
            inlineToolbar: true,
          },
          paragraph: {
            class: Paragraph as unknown as import('@editorjs/editorjs').ToolConstructable,
            inlineToolbar: true,
          },
          list: {
            class: List as unknown as import('@editorjs/editorjs').ToolConstructable,
            inlineToolbar: true,
          },
          image: {
            class: ImageTool as unknown as import('@editorjs/editorjs').ToolConstructable,
            config: {
              // URL-only mode for v1. Users paste an image URL; no
              // upload endpoint yet. Add onUploadByFile later when we
              // wire up a Supabase Storage bucket.
              uploader: {
                uploadByUrl: async (url: string) =>
                  ({ success: 1, file: { url } }) as unknown as {
                    success: 1;
                    file: { url: string };
                  },
              },
            },
          },
          doubleImage: {
            class: DoubleImageTool as unknown as import('@editorjs/editorjs').ToolConstructable,
          },
          quote: {
            class: Quote as unknown as import('@editorjs/editorjs').ToolConstructable,
            inlineToolbar: true,
          },
          delimiter: Delimiter as unknown as import('@editorjs/editorjs').ToolConstructable,
          inlineCode: {
            class: InlineCode as unknown as import('@editorjs/editorjs').ToolConstructable,
          },
        },
        onChange: () => scheduleSave(),
      }) as unknown as EditorJSInstance;
      editorRef.current = editor;
    })().catch((err: unknown) => {
      console.error('[JournalEditor] init failed', err);
      setErrorMsg('Editor failed to load. Refresh to try again.');
    });
    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.destroy?.();
        editorRef.current = null;
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
    // Intentionally ignore deps — we never re-init the editor mid-life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Save helpers ────────────────────────────────────────────────
  const persist = useCallback(
    async (overrides: Record<string, unknown> = {}) => {
      setSaveState('saving');
      try {
        let editorData: Record<string, unknown> | null = null;
        if (editorRef.current) {
          try {
            editorData = await editorRef.current.save();
          } catch {
            editorData = null;
          }
        }
        const body = {
          title,
          summary,
          tags,
          coverImageUrl: coverImageUrl || null,
          seoTitle: seoTitle || null,
          seoDescription: seoDescription || null,
          author: author || null,
          blogTarget,
          ...(editorData ? { editorData } : {}),
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
    [
      author,
      blogTarget,
      coverImageUrl,
      draft.id,
      seoDescription,
      seoTitle,
      summary,
      tags,
      title,
    ],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persist();
    }, 800);
  }, [persist]);

  useEffect(() => {
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    summary,
    tagsText,
    coverImageUrl,
    seoTitle,
    seoDescription,
    author,
    blogTarget,
  ]);

  async function handlePublish() {
    setErrorMsg(null);
    setPublishState('publishing');
    try {
      // Ensure latest state is saved first.
      await persist();
      const res = await fetch(`/api/journals/${draft.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!data.ok) throw new Error(data.error ?? 'Publish failed');
      setPublishState('published');
      router.refresh();
    } catch (err) {
      console.error('[JournalEditor] publish failed', err);
      setPublishState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Publish failed');
    }
  }

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

  return (
    <div className="flex h-[calc(100vh-56px)] bg-evari-ink">
      {/* Left column — the content canvas */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-4 border-b border-white/5">
          <button
            onClick={() => router.push('/journals')}
            className="inline-flex items-center gap-1.5 text-xs text-evari-dim hover:text-evari-text transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Journals
          </button>
          <div className="flex items-center gap-3">
            <SaveBadge state={saveState} />
            <button
              onClick={handlePublish}
              disabled={publishState === 'publishing'}
              className="inline-flex items-center gap-2 bg-evari-gold text-evari-goldInk text-sm font-medium px-4 py-1.5 rounded-md hover:opacity-90 transition disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {publishState === 'publishing'
                ? 'Publishing…'
                : draft.shopifyArticleId
                  ? 'Update on Shopify'
                  : 'Publish to Shopify'}
            </button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-10 py-10">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="w-full bg-transparent text-3xl font-semibold text-evari-text placeholder:text-evari-dimmer outline-none mb-4"
          />
          <div ref={editorRootRef} className="journals-editor-root" />
          {errorMsg ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-evari-warn">
              <AlertCircle className="h-4 w-4" />
              {errorMsg}
            </div>
          ) : null}
        </div>
      </div>

      {/* Right sidebar — metadata, SEO, publishing */}
      <aside className="w-80 shrink-0 border-l border-white/5 bg-evari-carbon/40 overflow-y-auto">
        <div className="p-5 space-y-5">
          <Field label="Destination">
            <select
              value={blogTarget}
              onChange={(e) => setBlogTarget(e.target.value)}
              className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
            >
              {lanes.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                  {l.blogId ? '' : ' (will match by tag)'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Summary" hint="Shown under the title on blog listings">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text resize-none"
              placeholder="One-sentence summary (leave blank to auto-extract)"
            />
          </Field>

          <Field label="Cover image" hint="Used on Shopify article + journal grid">
            {coverImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={coverImageUrl}
                alt=""
                className="w-full h-32 object-cover rounded-md border border-white/5 mb-2"
              />
            ) : (
              <div className="w-full h-32 rounded-md border border-white/5 bg-evari-surface/40 flex items-center justify-center mb-2">
                <ImageIcon className="h-5 w-5 text-evari-dimmer" />
              </div>
            )}
            <input
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text"
            />
          </Field>

          <Field label="Tags" hint="Comma-separated — e.g. bike-builds, cs-plus, ice">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. cs-plus, bike-build"
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

          <div className="border-t border-white/5 pt-5 space-y-3">
            <h3 className="text-[10px] uppercase tracking-[0.16em] text-evari-dim font-medium">
              SEO metadata
            </h3>
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
                rows={3}
                placeholder="Defaults to summary"
                className="w-full bg-evari-surface/60 border border-white/5 rounded-md px-3 py-2 text-sm text-evari-text resize-none"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => void persist()}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-md transition-colors',
              'text-evari-dim hover:text-evari-text bg-evari-surface/40 hover:bg-evari-surface/60',
            )}
          >
            <Save className="h-3.5 w-3.5" />
            Save now
          </button>
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
        <span className="text-xs text-evari-dim font-medium">{label}</span>
        {hint ? (
          <span className="text-[10px] text-evari-dimmer truncate ml-2">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </label>
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

// ─────────────────────────────────────────────────────────────────────
// DoubleImageTool — a custom EditorJS block for side-by-side images
// ─────────────────────────────────────────────────────────────────────

interface EditorJSInstance {
  save: () => Promise<Record<string, unknown>>;
  destroy?: () => void;
}

interface DoubleImageData {
  left?: { url?: string; caption?: string };
  right?: { url?: string; caption?: string };
}

/**
 * Minimal EditorJS block tool: two image URL slots side by side with
 * captions. Renders a simple 2-column form inside the block body; we
 * rely on the parent editor for drag-reorder and deletion. Output
 * data matches the shape consumed by `editorDataToHtml`.
 */
class DoubleImageTool {
  static get toolbox() {
    return {
      title: 'Double image',
      // Minimal inline SVG so EditorJS's block selector picks it up.
      icon: '<svg width="18" height="14" viewBox="0 0 18 14"><rect x="0" y="0" width="8" height="14" rx="1" fill="currentColor"/><rect x="10" y="0" width="8" height="14" rx="1" fill="currentColor"/></svg>',
    };
  }
  private data: DoubleImageData;
  private wrapper: HTMLDivElement | null = null;
  constructor({ data }: { data: DoubleImageData }) {
    this.data = data || {};
  }
  render(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'flex gap-3 items-start py-2';
    root.appendChild(this.buildSlot('left'));
    root.appendChild(this.buildSlot('right'));
    this.wrapper = root;
    return root;
  }
  private buildSlot(side: 'left' | 'right'): HTMLElement {
    const slot = document.createElement('div');
    slot.style.flex = '1 1 0';
    slot.style.minWidth = '0';
    const img = document.createElement('div');
    img.style.aspectRatio = '4 / 3';
    img.style.background = 'rgba(255,255,255,0.04)';
    img.style.borderRadius = '8px';
    img.style.display = 'flex';
    img.style.alignItems = 'center';
    img.style.justifyContent = 'center';
    img.style.overflow = 'hidden';
    img.style.border = '1px solid rgba(255,255,255,0.05)';
    const el = this.data[side];
    if (el?.url) {
      const i = document.createElement('img');
      i.src = el.url;
      i.style.width = '100%';
      i.style.height = '100%';
      i.style.objectFit = 'cover';
      img.appendChild(i);
    } else {
      img.textContent = 'Paste image URL below';
      img.style.color = 'rgba(255,255,255,0.3)';
      img.style.fontSize = '12px';
    }
    const url = document.createElement('input');
    url.value = el?.url ?? '';
    url.placeholder = `${side} image URL`;
    url.style.width = '100%';
    url.style.marginTop = '6px';
    url.style.padding = '6px 8px';
    url.style.background = 'rgba(255,255,255,0.04)';
    url.style.border = '1px solid rgba(255,255,255,0.08)';
    url.style.borderRadius = '6px';
    url.style.color = '#fff';
    url.style.fontSize = '12px';
    url.oninput = () => {
      const d = (this.data[side] ??= {});
      d.url = url.value;
      // Rerender the preview block in place.
      if (url.value) {
        img.innerHTML = '';
        const i = document.createElement('img');
        i.src = url.value;
        i.style.width = '100%';
        i.style.height = '100%';
        i.style.objectFit = 'cover';
        img.appendChild(i);
      }
    };
    const caption = document.createElement('input');
    caption.value = el?.caption ?? '';
    caption.placeholder = 'Caption (optional)';
    caption.style.width = '100%';
    caption.style.marginTop = '6px';
    caption.style.padding = '6px 8px';
    caption.style.background = 'rgba(255,255,255,0.04)';
    caption.style.border = '1px solid rgba(255,255,255,0.08)';
    caption.style.borderRadius = '6px';
    caption.style.color = '#fff';
    caption.style.fontSize = '12px';
    caption.oninput = () => {
      const d = (this.data[side] ??= {});
      d.caption = caption.value;
    };
    slot.appendChild(img);
    slot.appendChild(url);
    slot.appendChild(caption);
    return slot;
  }
  save(): DoubleImageData {
    return this.data;
  }
  static get sanitize() {
    return {
      left: { url: false, caption: false },
      right: { url: false, caption: false },
    };
  }
}
