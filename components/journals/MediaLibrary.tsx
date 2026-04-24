'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Search,
  UploadCloud,
  Image as ImageIcon,
  Film,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export interface MediaFile {
  id: string;
  kind: 'image' | 'video' | 'generic';
  filename: string;
  alt: string | null;
  createdAt: string;
  fileStatus: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  url: string | null;
  previewUrl: string | null;
  width?: number;
  height?: number;
  mimeType?: string;
  videoSources?: Array<{ url: string; mimeType: string; format: string; height: number; width: number }>;
}

type Filter = 'all' | 'image' | 'video';

interface Props {
  open: boolean;
  accept: 'image' | 'video' | 'any';
  onClose: () => void;
  /** Called when the user picks a file. Pass the full MediaFile so
   *  the caller can use url / previewUrl / kind. */
  onPick: (file: MediaFile) => void;
}

/**
 * Slide-over drawer that lists every file in the Shopify Files
 * library (Content → Files in the Shopify admin). Supports search,
 * filter by type, drag-and-drop upload, and click-to-insert.
 *
 * The parent decides what "insert" means — it hands this component
 * an onPick callback that receives the picked MediaFile.
 */
export function MediaLibrary({ open, accept, onClose, onPick }: Props) {
  const [filter, setFilter] = useState<Filter>(
    accept === 'video' ? 'video' : accept === 'image' ? 'image' : 'all',
  );
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputFileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(
    async (replace = true) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filter !== 'all') params.set('type', filter);
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
        if (!data.ok) throw new Error(data.error ?? 'Failed to load library');
        setFiles(replace ? data.files ?? [] : [...files, ...(data.files ?? [])]);
        setHasNextPage(Boolean(data.hasNextPage));
        setCursor(data.endCursor ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, query, cursor],
  );

  // Reload when the panel opens or filters change.
  useEffect(() => {
    if (!open) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter]);

  // Debounce search queries — 400ms.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(true), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleUpload(filesToUpload: FileList | File[]) {
    setUploading(true);
    setError(null);
    try {
      const arr = Array.from(filesToUpload);
      // Fan out uploads sequentially so each one has a clear result
      // and we don't overwhelm Shopify's rate limits.
      for (const f of arr) {
        const form = new FormData();
        form.append('file', f);
        form.append('alt', f.name);
        const res = await fetch('/api/shopify/files/upload', {
          method: 'POST',
          body: form,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          file?: MediaFile;
          error?: string;
        };
        if (!data.ok || !data.file) throw new Error(data.error ?? 'Upload failed');
        setFiles((prev) => [data.file as MediaFile, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      void handleUpload(e.dataTransfer.files);
    }
  }

  if (!open) return null;

  const filtered = files.filter((f) => {
    if (accept === 'image' && f.kind !== 'image') return false;
    if (accept === 'video' && f.kind !== 'video') return false;
    return true;
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[560px] bg-evari-ink z-50 shadow-[-8px_0_32px_rgba(0,0,0,0.4)] flex flex-col"
        role="dialog"
        aria-label="Shopify media library"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-evari-edge">
          <div>
            <h2 className="text-base font-semibold text-evari-text">
              Shopify media library
            </h2>
            <p className="text-xs text-evari-dim mt-0.5">
              Every file in Content → Files. Click to insert.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-evari-dim hover:text-evari-text hover:bg-evari-surface/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 space-y-3 border-b border-evari-edge">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by alt text or filename…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-[rgb(var(--evari-input-fill))] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:bg-[rgb(var(--evari-input-fill-focus))]"
            />
          </div>
          {/* Filter pill group */}
          {accept === 'any' ? (
            <div className="pill-group">
              {(['all', 'image', 'video'] as Filter[]).map((f) => (
                <button
                  key={f}
                  data-active={filter === f}
                  onClick={() => setFilter(f)}
                  className="pill-tab"
                  type="button"
                >
                  {f === 'all' ? 'All' : f === 'image' ? 'Images' : 'Videos'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Upload drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'mx-5 mt-3 rounded-md border border-dashed transition-colors cursor-pointer',
            dragging
              ? 'border-evari-gold bg-evari-gold/10'
              : 'border-evari-edge hover:border-evari-gold/60',
          )}
          onClick={() => inputFileRef.current?.click()}
        >
          <input
            ref={inputFileRef}
            type="file"
            className="hidden"
            accept={
              accept === 'image'
                ? 'image/*'
                : accept === 'video'
                  ? 'video/*'
                  : 'image/*,video/*'
            }
            multiple
            onChange={(e) => {
              if (e.target.files?.length) void handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="py-4 px-4 flex items-center justify-center gap-2 text-sm text-evari-dim">
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading to Shopify…
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                Drop files here, or click to upload to Shopify
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="mx-5 mt-3 inline-flex items-center gap-2 text-xs text-evari-warn px-3 py-2 rounded-md bg-evari-warn/10">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        ) : null}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-evari-dim">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading library…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-evari-dim">
              No files match. Upload one above, or clear the search.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((f) => (
                <FileTile key={f.id} file={f} onPick={onPick} />
              ))}
            </div>
          )}
          {hasNextPage ? (
            <button
              onClick={() => void load(false)}
              disabled={loading}
              className="w-full mt-4 py-2 text-xs font-medium text-evari-dim hover:text-evari-text rounded-md bg-[rgb(var(--evari-input-fill))] hover:bg-[rgb(var(--evari-input-fill-focus))] transition-colors"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function FileTile({ file, onPick }: { file: MediaFile; onPick: (f: MediaFile) => void }) {
  const isProcessing = file.fileStatus === 'PROCESSING';
  const isReady = file.fileStatus === 'READY' || file.fileStatus === 'UPLOADED';
  const disabled = !isReady && !isProcessing ? true : false;
  return (
    <button
      type="button"
      onClick={() => (isReady ? onPick(file) : undefined)}
      disabled={disabled || isProcessing}
      className={cn(
        'group text-left rounded-md overflow-hidden bg-evari-surface/40 hover:bg-evari-surface transition-colors',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      )}
    >
      <div className="aspect-[4/3] bg-[rgb(var(--evari-input-fill))] flex items-center justify-center relative">
        {file.previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={file.previewUrl}
            alt={file.alt ?? file.filename}
            className="w-full h-full object-cover"
          />
        ) : file.kind === 'video' ? (
          <Film className="h-6 w-6 text-evari-dimmer" />
        ) : (
          <ImageIcon className="h-6 w-6 text-evari-dimmer" />
        )}
        {file.kind === 'video' ? (
          <span className="absolute bottom-1 right-1 text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-black/60 text-white">
            Video
          </span>
        ) : null}
        {isProcessing ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing
          </span>
        ) : null}
        {file.fileStatus === 'READY' ? (
          <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5 text-evari-success opacity-0 group-hover:opacity-100 transition-opacity" />
        ) : null}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-xs text-evari-text truncate">{file.filename}</div>
        {file.width && file.height ? (
          <div className="text-[10px] text-evari-dimmer tabular-nums">
            {file.width} × {file.height}
          </div>
        ) : null}
      </div>
    </button>
  );
}
