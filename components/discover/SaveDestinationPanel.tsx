'use client';

/**
 * SaveDestinationPanel
 *
 * Non-blocking right-column panel that appears while the Discover hero
 * agent is running. Lets the operator pick an existing Prospects folder
 * or create a new one — every company the agent finds will then be
 * auto-saved into that folder as a shell prospect.
 *
 * The panel can be dismissed ("Just browse") without picking a folder;
 * in that case the results still stream into the list but nothing is
 * persisted until the operator explicitly triggers a save.
 */

import { useEffect, useState } from 'react';
import { FolderPlus, Folder, Loader2, X, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FolderEntry {
  name: string;
  count: number;
}

interface Props {
  /** Current save target, if any. */
  saveTarget: string | null;
  /** Number of companies already auto-saved in this run. */
  savedCount: number;
  /** True while the hero agent is still streaming. */
  busy: boolean;
  /** User's latest hero prompt — used to suggest a folder name. */
  prompt: string;
  /** Called when the operator picks an existing folder. */
  onPick: (folder: string) => void;
  /** Called when the operator creates a new folder with the given name. */
  onCreate: (folder: string) => void;
  /** Called when the operator dismisses the panel without picking. */
  onDismiss: () => void;
}

export function SaveDestinationPanel({
  saveTarget,
  savedCount,
  busy,
  prompt,
  onPick,
  onCreate,
  onDismiss,
}: Props) {
  const [folders, setFolders] = useState<FolderEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch folders on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/prospects/folders', { cache: 'no-store' });
        const data = (await res.json()) as { folders?: FolderEntry[]; error?: string };
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setFolders([]);
        } else {
          setFolders(data.folders ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load folders');
        setFolders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Seed the new-folder input with a snappy suggestion derived from the prompt.
  useEffect(() => {
    if (!prompt || newFolder) return;
    const suggestion = suggestFolderName(prompt);
    if (suggestion) setNewFolder(suggestion);
  }, [prompt, newFolder]);

  function handleCreate() {
    const name = newFolder.trim();
    if (!name) return;
    onCreate(name);
  }

  // -------------------------------------------------------------------------
  // Confirmed mode — we have a saveTarget, show saved count + controls.
  // -------------------------------------------------------------------------

  if (saveTarget) {
    return (
      <div className="h-full flex flex-col bg-evari-surface">
        <header className="shrink-0 border-b border-evari-line/30 px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-evari-accent/15 text-evari-accent inline-flex items-center justify-center shrink-0">
            <Folder className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-evari-dimmer">Saving to folder</div>
            <div className="text-[14px] font-semibold text-evari-text truncate">{saveTarget}</div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div className="rounded-lg bg-evari-accent/5 border border-evari-accent/20 px-4 py-3">
            <div className="flex items-center gap-2 text-[12.5px] text-evari-text">
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-evari-accent" />
                  <span>
                    Auto-saving as the agent finds matches
                    {savedCount > 0 ? ` · ${savedCount} saved` : ''}
                  </span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 text-evari-success" />
                  <span>
                    Run complete · {savedCount} compan{savedCount === 1 ? 'y' : 'ies'} saved
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] text-evari-dim">
              You can review, prune, or enrich them in Prospects → {saveTarget}.
            </p>
          </div>

          <div className="text-[11.5px] text-evari-dim leading-relaxed">
            Every new company on the left is added as a shell prospect in this folder.
            Click a company to view details; use the panel CTAs to find emails.
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Picker mode — no saveTarget yet.
  // -------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col bg-evari-surface">
      <header className="shrink-0 border-b border-evari-line/30 px-5 py-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-evari-gold/20 text-evari-goldInk inline-flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-evari-text">Save results to a folder?</div>
          <div className="text-[11.5px] text-evari-dim">
            {busy ? 'Agent is running — pick a destination and every match goes straight in.' : 'Pick a folder to save this run, or just browse.'}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Create-new block */}
        <section>
          <div className="text-[11px] uppercase tracking-wide text-evari-dimmer mb-2">
            New folder
          </div>
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  } else if (e.key === 'Escape') {
                    setCreating(false);
                  }
                }}
                placeholder="e.g. UK Knee Clinics"
                className="flex-1 min-w-0 rounded-md border border-evari-line/40 bg-white px-3 py-2 text-[13px] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:border-evari-accent"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newFolder.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-evari-accent px-3 py-2 text-[12px] font-semibold text-evari-ink hover:bg-evari-accent/90 disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" />
                Create
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full inline-flex items-center gap-2 rounded-md border border-dashed border-evari-line/60 bg-white/40 px-3 py-2.5 text-[12.5px] text-evari-text hover:border-evari-accent hover:text-evari-accent"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Create new folder
              {newFolder ? (
                <span className="ml-auto text-[11px] text-evari-dim truncate">
                  suggested: {newFolder}
                </span>
              ) : null}
            </button>
          )}
        </section>

        {/* Existing folders */}
        <section>
          <div className="text-[11px] uppercase tracking-wide text-evari-dimmer mb-2">
            Existing folders
          </div>
          {loading ? (
            <div className="inline-flex items-center gap-2 text-[12px] text-evari-dim py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="text-[12px] text-evari-danger">{error}</div>
          ) : folders && folders.length > 0 ? (
            <ul className="space-y-1">
              {folders.map((f) => (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() => onPick(f.name)}
                    className={cn(
                      'w-full inline-flex items-center gap-2 rounded-md border border-evari-line/40 bg-white px-3 py-2 text-left text-[12.5px] text-evari-text hover:border-evari-accent hover:text-evari-accent',
                    )}
                  >
                    <Folder className="h-3.5 w-3.5 text-evari-dimmer" />
                    <span className="flex-1 min-w-0 truncate">{f.name}</span>
                    <span className="text-[11px] text-evari-dim">
                      {f.count} prospect{f.count === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[12px] text-evari-dim">
              No folders yet — create your first one above.
            </div>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-evari-line/30 px-5 py-3">
        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-[12px] text-evari-dim hover:text-evari-text py-1.5"
        >
          Just browse — don&apos;t save anything
        </button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Suggest a concise folder name from the operator's hero prompt.
 * We keep this heuristic — a snappy default the operator can accept
 * or overwrite in the create-folder input.
 */
function suggestFolderName(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  // Drop common intro stems so "find me UK private knee clinics" -> "UK private knee clinics".
  const trimmed = cleaned.replace(
    /^(find|search|look|get|pull|show)\s+(me|us)?\s*/i,
    '',
  );
  // Title-case the first 6 words.
  const words = trimmed.split(' ').slice(0, 6);
  const titled = words
    .map((w, i) => {
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      if (w.length <= 2) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
  return titled.slice(0, 48);
}
