'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Check, X, Pin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, relativeTime } from '@/lib/utils';
import type { Play } from '@/lib/types';

/**
 * A single row in the /ventures list.
 *
 * Reads as a normal clickable link to the detail page, but on hover reveals
 * inline edit (pencil → title becomes an input, Enter to save) and delete
 * (trash → confirm → DELETE).
 *
 * Right-hand side: three always-visible pipeline counts —
 * prospects, leads, conversations — for the project. They replace the old
 * stage lozenge / inline stage dropdown that used to live there. Stage is
 * still editable from the venture's detail page.
 *
 * All writes go through /api/plays/[id] (PATCH or DELETE) and then
 * router.refresh() so the server-rendered list re-fetches.
 */

interface Props {
  play: Play;
  /**
   * Per-play pipeline counts, computed server-side via getCountsPerPlay().
   * Undefined when a play has no rows (e.g. a fresh idea); render as 0.
   */
  counts?: { prospects: number; leads: number; conversations: number };
}

export function PlayRow({ play, counts }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [title, setTitle] = useState(play.title);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePatch(patch: Partial<Play>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/plays/' + play.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${play.title}"? This can't be undone.`)) return;
    // Optimistically hide so the row vanishes before the refresh lands.
    setDeleted(true);
    try {
      const res = await fetch('/api/plays/' + play.id, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setDeleted(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function commitTitle() {
    const next = title.trim();
    if (!next) {
      setError('Title cannot be empty.');
      return;
    }
    if (next === play.title) {
      setEditing(false);
      return;
    }
    await savePatch({ title: next });
    setEditing(false);
  }

  function cancelEdit() {
    setTitle(play.title);
    setEditing(false);
    setError(null);
  }

  if (deleted) return null;

  const busy = saving || pending;
  const prospects = counts?.prospects ?? 0;
  const leads = counts?.leads ?? 0;
  const conversations = counts?.conversations ?? 0;

  return (
    <li
      className={cn(
        'group bg-evari-surface/60 rounded-md hover:bg-evari-surface transition-colors relative',
        busy ? 'opacity-60' : '',
      )}
    >
      <div className="flex items-start gap-2 p-4">
        {/* Main body — clickable link unless we're editing the title */}
        {editing ? (
          <div className="flex-1 min-w-0 space-y-2 selectable">
            <div className="flex items-center gap-2">
              {play.pinned && (
                <Pin className="h-3 w-3 text-evari-gold shrink-0" />
              )}
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitTitle();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                disabled={saving}
                className="h-7 text-sm"
              />
              <button
                type="button"
                onClick={() => void commitTitle()}
                disabled={saving}
                title="Save"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-evari-success hover:bg-evari-surfaceSoft transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                title="Cancel"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-evari-dim leading-relaxed line-clamp-2 selectable">
              {play.brief}
            </p>
            <RowMeta play={play} />
          </div>
        ) : (
          <Link
            href={'/ideas/' + play.id}
            className="flex-1 min-w-0 rounded-md"
          >
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                {play.pinned && (
                  <Pin className="h-3 w-3 text-evari-gold shrink-0" />
                )}
                <div className="text-sm font-medium text-evari-text truncate selectable">
                  {play.title}
                </div>
              </div>
            </div>
            <p className="text-xs text-evari-dim leading-relaxed line-clamp-2 selectable">
              {play.brief}
            </p>
            <RowMeta play={play} />
          </Link>
        )}

        {/* Right rail — always-visible counts on top, hover-revealed
            edit/trash buttons below. The counts replaced the old "idea"
            stage lozenge so each row tells you at a glance how loaded the
            project is. Stage editing now lives on the detail page. */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-3 text-[11px] text-evari-dim tabular-nums">
            <CountItem n={prospects} label="prospects" />
            <span className="text-evari-line">·</span>
            <CountItem n={leads} label="leads" />
            <span className="text-evari-line">·</span>
            <CountItem n={conversations} label="conversations" />
          </div>

          <div
            className={cn(
              'flex items-center gap-1 transition-opacity',
              editing
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
          >
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy || editing}
              title="Edit title"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              title="Delete venture"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="px-4 pb-2 text-[11px] text-evari-danger selectable">
          {error}
        </div>
      ) : null}
    </li>
  );
}

function CountItem({ n, label }: { n: number; label: string }) {
  return (
    <span>
      <span
        className={cn(
          'font-medium tabular-nums',
          n > 0 ? 'text-evari-text' : 'text-evari-dimmer',
        )}
      >
        {n}
      </span>{' '}
      <span className="text-evari-dimmer">{label}</span>
    </span>
  );
}

function RowMeta({ play }: { play: Play }) {
  // A scan is only considered 'scanning' if its startedAt is fresh.
  // Vercel functions can time out mid-run and leave status='running'
  // without ever writing finishedAt — so we treat anything older than
  // 10 minutes as stale and stop rendering the lozenge. The server-side
  // sweep (clearing status='stale') happens separately via SQL; this
  // just stops false positives in the UI.
  const startedAt = play.autoScan?.startedAt;
  const startedRecently =
    startedAt != null &&
    Date.now() - new Date(startedAt).getTime() < 10 * 60_000;
  const scanning =
    (play.autoScan?.status === 'pending' || play.autoScan?.status === 'running') &&
    startedRecently;
  const recentScan =
    play.autoScan?.status === 'done' &&
    play.autoScan.finishedAt &&
    Date.now() - new Date(play.autoScan.finishedAt).getTime() < 5 * 60_000;
  return (
    <div className="flex items-center gap-3 mt-2 text-[10px] text-evari-dimmer tabular-nums">
      {scanning ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-evari-gold/15 text-evari-gold px-1.5 py-0.5 text-[9px] font-medium">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          scanning
        </span>
      ) : recentScan ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-evari-success/15 text-evari-success px-1.5 py-0.5 text-[9px] font-medium">
          <Check className="h-2.5 w-2.5" />
          {play.autoScan?.inserted ?? 0} auto-sourced
        </span>
      ) : null}
      <span className="ml-auto">updated {relativeTime(play.updatedAt)}</span>
    </div>
  );
}
