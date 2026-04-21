'use client';

/**
 * DraftsPane — Phase 2 dry-run queue surface.
 *
 * Lives inside a Play's detail page as a tab. Fetches `/api/drafts?playId=…`,
 * renders the queue, and wires up:
 *   - "Generate drafts" (POST /api/plays/[id]/dry-run) — fill the queue from
 *     the play's current targets.
 *   - Inline edit of subject + body (PATCH /api/drafts/[id]).
 *   - Approve / reject (PATCH with status).
 *   - Delete (DELETE /api/drafts/[id]).
 *   - Regenerate a single draft (POST dry-run with targetIds + regenerate).
 *
 * We deliberately don't show a "send" button here — that lives in Phase 3's
 * approval queue route once the send + compliance checks are wired.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, relativeTime } from '@/lib/utils';
import type { DraftMessage, DraftMessageStatus, Play } from '@/lib/types';

const STATUS_TONE: Record<DraftMessageStatus, string> = {
  draft: 'bg-evari-surfaceSoft text-evari-dim',
  approved: 'bg-evari-success text-evari-ink',
  sent: 'bg-sky-400 text-evari-ink',
  rejected: 'bg-evari-surfaceSoft text-evari-dimmer line-through',
  failed: 'bg-evari-warn text-evari-goldInk',
};

export function DraftsPane({ play }: { play: Play }) {
  const [drafts, setDrafts] = useState<DraftMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drafts?playId=' + encodeURIComponent(play.id));
      const json = (await res.json()) as { ok: boolean; drafts?: DraftMessage[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'load failed');
      setDrafts(json.drafts ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [play.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const targetsById = useMemo(() => {
    const m = new Map<string, (typeof play.targets)[number]>();
    for (const t of play.targets) m.set(t.id, t);
    return m;
  }, [play.targets]);

  const counts = useMemo(() => {
    const c: Record<DraftMessageStatus, number> = {
      draft: 0, approved: 0, sent: 0, rejected: 0, failed: 0,
    };
    for (const d of drafts) c[d.status]++;
    return c;
  }, [drafts]);

  async function runDryRun(opts: { targetIds?: string[]; regenerate?: boolean } = {}) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/plays/' + encodeURIComponent(play.id) + '/dry-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const json = (await res.json()) as {
        ok: boolean;
        drafts?: DraftMessage[];
        skipped?: Array<{ targetId: string; reason: string }>;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? 'dry-run failed');
      const generated = json.drafts?.length ?? 0;
      const skipped = json.skipped?.length ?? 0;
      setLastRunSummary(
        generated + ' draft' + (generated === 1 ? '' : 's') + ' generated' +
          (skipped > 0 ? ', ' + skipped + ' skipped' : ''),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function patchDraft(
    id: string,
    body: Partial<Pick<DraftMessage, 'subject' | 'body' | 'status' | 'reviewerNotes'>>,
  ) {
    markBusy(id, true);
    try {
      const res = await fetch('/api/drafts/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; draft?: DraftMessage; error?: string };
      if (!json.ok || !json.draft) throw new Error(json.error ?? 'patch failed');
      setDrafts((prev) => prev.map((d) => (d.id === id ? json.draft! : d)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(id, false);
    }
  }

  async function deleteDraft(id: string) {
    markBusy(id, true);
    try {
      const res = await fetch('/api/drafts/' + encodeURIComponent(id), { method: 'DELETE' });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? 'delete failed');
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(id, false);
    }
  }

  async function sendDraft(id: string) {
    markBusy(id, true);
    try {
      const res = await fetch('/api/drafts/' + encodeURIComponent(id) + '/send', {
        method: 'POST',
      });
      const json = (await res.json()) as {
        ok: boolean;
        draft?: DraftMessage;
        error?: string;
        gmail?: { messageId: string; threadId: string };
      };
      if (!json.ok) {
        if (json.draft) {
          setDrafts((prev) => prev.map((d) => (d.id === id ? json.draft! : d)));
        }
        throw new Error(json.error ?? 'send failed');
      }
      if (json.draft) {
        setDrafts((prev) => prev.map((d) => (d.id === id ? json.draft! : d)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(id, false);
    }
  }

  function startEdit(d: DraftMessage) {
    setEditingId(d.id);
    setEditSubject(d.subject);
    setEditBody(d.body);
  }

  async function saveEdit(id: string) {
    await patchDraft(id, { subject: editSubject.trim(), body: editBody.trim() });
    setEditingId(null);
  }

  const eligibleTargetCount = play.targets.filter((t) => !!t.email).length;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-xl bg-evari-surface p-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
            Draft queue
          </div>
          <div className="text-sm text-evari-text mt-1">
            {drafts.length} draft{drafts.length === 1 ? '' : 's'} ·{' '}
            <span className="text-evari-dim">
              {counts.draft} pending · {counts.approved} approved · {counts.sent} sent · {counts.rejected} rejected
            </span>
          </div>
          <div className="text-[11px] text-evari-dimmer mt-1">
            {eligibleTargetCount} of {play.targets.length} targets have an email on file.
            {lastRunSummary ? ' · ' + lastRunSummary : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void runDryRun()}
            disabled={generating || eligibleTargetCount === 0}
          >
            {generating ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1.5" />
                Generate drafts
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-evari-warn/10 border border-evari-warn/30 px-3 py-2 text-[12px] text-evari-warn">
          {error}
        </div>
      )}

      {loading && drafts.length === 0 && (
        <div className="rounded-md bg-evari-surface/60 p-6 text-center text-xs text-evari-dimmer">
          Loading drafts…
        </div>
      )}

      {!loading && drafts.length === 0 && (
        <div className="rounded-md bg-evari-surface/60 p-8 text-center">
          <div className="text-sm text-evari-dim">No drafts yet.</div>
          <div className="text-xs text-evari-dimmer mt-1">
            Click <span className="text-evari-text">Generate drafts</span> to draft a
            first-touch email for every target with an address.
          </div>
        </div>
      )}

      <ul className="space-y-1.5">
        {drafts.map((d) => {
          const target = d.targetId ? targetsById.get(d.targetId) : undefined;
          const busy = busyIds.has(d.id);
          const isEditing = editingId === d.id;
          const locked = d.status === 'sent' || d.status === 'failed';
          return (
            <li
              key={d.id}
              className={cn(
                'rounded-md bg-evari-surface/60 p-4 space-y-3',
                busy && 'opacity-60',
                locked && 'opacity-80',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-evari-text truncate">
                    {d.toName}
                    {d.toOrg ? (
                      <span className="text-evari-dim"> · {d.toOrg}</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] font-mono text-evari-dimmer truncate">
                    {d.toEmail}
                    {target?.role ? ' · ' + target.role : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.sequenceStep && d.sequenceStep > 1 ? (
                    <Badge
                      className="text-[9px] uppercase tracking-wider bg-evari-surfaceSoft text-evari-dim"
                      title="Generated by the follow-up scheduler from an earlier sent draft."
                    >
                      follow-up {d.sequenceStep}
                    </Badge>
                  ) : null}
                  <Badge
                    className={cn(
                      'text-[9px] uppercase tracking-wider',
                      STATUS_TONE[d.status],
                    )}
                  >
                    {d.status}
                  </Badge>
                  <span className="text-[10px] text-evari-dimmer tabular-nums">
                    {relativeTime(d.updatedAt)}
                  </span>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Subject"
                    className="text-sm"
                  />
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={8}
                    className="text-sm font-mono leading-relaxed"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void saveEdit(d.id)}
                      disabled={busy || !editSubject.trim() || !editBody.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-sm font-medium text-evari-text">
                    {d.subject}
                  </div>
                  <p className="text-[13px] text-evari-dim whitespace-pre-wrap leading-relaxed selectable">
                    {d.body}
                  </p>
                  {d.rationale && (
                    <div className="text-[11px] text-evari-dimmer italic pt-1">
                      Why this angle: {d.rationale}
                    </div>
                  )}
                  {d.reviewerNotes && (
                    <div className="text-[11px] text-evari-warn pt-1">
                      Note: {d.reviewerNotes}
                    </div>
                  )}
                  {d.status === 'failed' && d.lastError && (
                    <div className="text-[11px] text-evari-warn pt-1">
                      Send failed: {d.lastError}
                    </div>
                  )}
                  {d.status === 'sent' && d.sentAt && (
                    <div className="text-[11px] text-evari-success pt-1">
                      Sent {relativeTime(d.sentAt)}.
                      {d.lastReplyClassification ? (
                        <span className="text-evari-dim">
                          {' '}Reply: {d.lastReplyClassification}
                          {d.lastReplyAt ? ' (' + relativeTime(d.lastReplyAt) + ')' : ''}.
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {!isEditing && !locked && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {d.status === 'draft' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void patchDraft(d.id, { status: 'approved' })}
                      disabled={busy}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                  )}
                  {d.status === 'approved' && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void sendDraft(d.id)}
                        disabled={busy}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        Send now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void patchDraft(d.id, { status: 'draft' })}
                        disabled={busy}
                      >
                        <Undo2 className="h-3 w-3 mr-1" />
                        Un-approve
                      </Button>
                    </>
                  )}
                  {d.status !== 'rejected' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void patchDraft(d.id, { status: 'rejected' })}
                      disabled={busy}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  )}
                  {d.status === 'rejected' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void patchDraft(d.id, { status: 'draft' })}
                      disabled={busy}
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(d)}
                    disabled={busy}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  {d.targetId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void runDryRun({ targetIds: [d.targetId!], regenerate: true })
                      }
                      disabled={generating || busy}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Regenerate
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteDraft(d.id)}
                    disabled={busy}
                    className="text-evari-warn hover:text-evari-warn"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
