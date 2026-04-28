'use client';

/**
 * Audience power tool — the home for managing every list / segment
 * the operator builds. Two columns:
 *
 *   LEFT — Browser. Filterable + sortable list of every list AND
 *          segment. Each row is draggable. Inline rename + delete +
 *          quick stats (members, approved/pending split, last
 *          updated).
 *
 *   RIGHT — Workspace. Drop one or more lists into the well to
 *           combine them. Live overlap stats compute as soon as ≥2
 *           lists are present (union, intersection, subtract counts
 *           with member-id math). Pick a name, pick an operation,
 *           hit Create — server materialises the new group via
 *           POST /api/marketing/groups/combine.
 *
 * Why drag-and-drop: the operator's actual mental model is "I'd
 * like to merge these two warm lists together" — a verb, not a
 * form. Dragging maps directly to that verb.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Filter,
  GripVertical,
  Loader2,
  MinusCircle,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  SortAsc,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AudienceBundle, AudienceEntry } from '@/lib/marketing/audience';
import type { ListMember } from '@/lib/marketing/groups';

interface Props { initialBundle: AudienceBundle }

type SortKey = 'updated' | 'name' | 'members';
type Op = 'union' | 'intersection' | 'subtract';

export function AudiencePowerClient({ initialBundle }: Props) {
  const router = useRouter();
  const [bundle, setBundle] = useState<AudienceBundle>(initialBundle);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [showSegments, setShowSegments] = useState(true);
  const [showEmpty, setShowEmpty] = useState(true);
  // Lists currently in the workspace (right column). Order matters for
  // 'subtract' — the first item is the base set; subsequent items are
  // subtracted from it.
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<AudienceEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AudienceEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function refresh() {
    const r = await fetch('/api/marketing/audience', { cache: 'no-store' });
    const d = await r.json().catch(() => null);
    if (d?.ok) setBundle({ entries: d.entries, totals: d.totals });
    router.refresh();
  }

  // --- Filter + sort the left column ------------------------------------
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = bundle.entries.filter((e) => {
      if (!showSegments && e.kind === 'segment') return false;
      if (!showEmpty && e.members === 0) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q);
    });
    out = [...out].sort((a, b) => {
      if (sort === 'name')    return a.name.localeCompare(b.name);
      if (sort === 'members') return b.members - a.members;
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    });
    return out;
  }, [bundle.entries, search, sort, showSegments, showEmpty]);

  // --- Drag end → add to workspace --------------------------------------
  function onDragEnd(e: DragEndEvent) {
    if (e.over?.id !== 'workspace') return;
    const dragged = String(e.active.id);
    setWorkspaceIds((cur) => (cur.includes(dragged) ? cur : [...cur, dragged]));
  }
  function removeFromWorkspace(id: string) {
    setWorkspaceIds((cur) => cur.filter((x) => x !== id));
  }
  function clearWorkspace() { setWorkspaceIds([]); }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex-1 min-h-0 overflow-hidden bg-evari-ink p-3 grid grid-cols-[minmax(380px,1fr)_minmax(420px,1fr)] gap-3">
        {/* LEFT — browser */}
        <BrowserPane
          entries={visible}
          totalEntries={bundle.entries.length}
          search={search} setSearch={setSearch}
          sort={sort} setSort={setSort}
          showSegments={showSegments} setShowSegments={setShowSegments}
          showEmpty={showEmpty} setShowEmpty={setShowEmpty}
          onCreate={() => setCreateOpen(true)}
          onRename={(e) => setRenameTarget(e)}
          onDelete={(e) => setDeleteTarget(e)}
          inWorkspace={(id) => workspaceIds.includes(id)}
        />

        {/* RIGHT — workspace */}
        <WorkspacePane
          workspaceIds={workspaceIds}
          allEntries={bundle.entries}
          onRemove={removeFromWorkspace}
          onClear={clearWorkspace}
          onCreated={async () => { await refresh(); setWorkspaceIds([]); }}
        />
      </div>

      {/* Modals */}
      {createOpen ? (
        <CreateListModal onClose={() => setCreateOpen(false)} onCreated={refresh} />
      ) : null}
      {renameTarget ? (
        <RenameListModal entry={renameTarget} onClose={() => setRenameTarget(null)} onSaved={refresh} />
      ) : null}
      {deleteTarget ? (
        <DeleteListModal entry={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}
    </DndContext>
  );
}

// ─── LEFT pane: list browser ────────────────────────────────────

function BrowserPane({
  entries, totalEntries, search, setSearch, sort, setSort,
  showSegments, setShowSegments, showEmpty, setShowEmpty,
  onCreate, onRename, onDelete, inWorkspace,
}: {
  entries: AudienceEntry[]; totalEntries: number;
  search: string; setSearch: (s: string) => void;
  sort: SortKey; setSort: (s: SortKey) => void;
  showSegments: boolean; setShowSegments: (b: boolean) => void;
  showEmpty: boolean; setShowEmpty: (b: boolean) => void;
  onCreate: () => void;
  onRename: (e: AudienceEntry) => void;
  onDelete: (e: AudienceEntry) => void;
  inWorkspace: (id: string) => boolean;
}) {
  return (
    <section className="rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col min-h-0 overflow-hidden">
      <header className="px-3 py-2.5 border-b border-evari-edge/20 flex items-center gap-2 shrink-0">
        <Boxes className="h-4 w-4 text-evari-gold" />
        <h2 className="text-[13px] font-semibold text-evari-text flex-1">All audiences <span className="text-evari-dim">({totalEntries})</span></h2>
        <button type="button" onClick={onCreate} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110">
          <Plus className="h-3 w-3" /> New
        </button>
      </header>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-evari-edge/20 space-y-2 shrink-0">
        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-evari-ink border border-evari-edge/30">
          <Search className="h-3.5 w-3.5 text-evari-dimmer shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lists & segments…"
            className="flex-1 bg-transparent text-[12px] text-evari-text placeholder:text-evari-dimmer focus:outline-none"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="text-evari-dim hover:text-evari-text"><X className="h-3 w-3" /></button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <SortAsc className="h-3 w-3 text-evari-dimmer" />
          <span className="text-evari-dimmer">Sort</span>
          <SortChip active={sort === 'updated'} onClick={() => setSort('updated')}>Recent</SortChip>
          <SortChip active={sort === 'name'}    onClick={() => setSort('name')}>A-Z</SortChip>
          <SortChip active={sort === 'members'} onClick={() => setSort('members')}>Size</SortChip>
          <span className="mx-1 text-evari-dimmer">·</span>
          <Filter className="h-3 w-3 text-evari-dimmer" />
          <SortChip active={showSegments} onClick={() => setShowSegments(!showSegments)}>Segments</SortChip>
          <SortChip active={showEmpty}    onClick={() => setShowEmpty(!showEmpty)}>Empty</SortChip>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-evari-dimmer text-center px-6">
          {totalEntries === 0
            ? 'No lists or segments yet — click New to create your first.'
            : 'Nothing matches your filters.'}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-evari-edge/10">
          {entries.map((e) => (
            <DraggableEntryRow
              key={`${e.kind}-${e.id}`}
              entry={e}
              inWorkspace={inWorkspace(e.id)}
              onRename={() => onRename(e)}
              onDelete={() => onDelete(e)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SortChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-1.5 py-0.5 rounded transition-colors',
        active ? 'bg-evari-gold/20 text-evari-gold' : 'text-evari-dim hover:text-evari-text',
      )}
    >
      {children}
    </button>
  );
}

function DraggableEntryRow({ entry, inWorkspace, onRename, onDelete }: { entry: AudienceEntry; inWorkspace: boolean; onRename: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.id, data: { entry } });
  const isSegment = entry.kind === 'segment';
  return (
    <li
      ref={setNodeRef}
      // Whole row is draggable. PointerSensor's 4px activation distance
      // means a plain click still navigates (handled by the Link below);
      // any movement past that threshold initiates the drag.
      {...attributes}
      {...listeners}
      className={cn(
        'group flex items-stretch transition-colors touch-none select-none',
        isDragging ? 'opacity-40' : '',
        inWorkspace ? 'bg-evari-gold/5' : 'hover:bg-evari-ink/30',
        'cursor-grab active:cursor-grabbing',
      )}
    >
      {/* Visual grip — just an indicator now, the whole row catches the drag */}
      <div className="px-2 flex items-center text-evari-dimmer group-hover:text-evari-gold transition-colors pointer-events-none">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Body */}
      <Link
        href={isSegment ? `/email/segments/${entry.id}` : `/leads?listId=${entry.id}`}
        // Stop the click from bubbling up to the draggable parent —
        // dnd-kit's pointer listener doesn't swallow click but the
        // browser's drag preview will fight with the Link's
        // navigation if we don't preventDefault on actual drag.
        // (Safe: a non-drag click still triggers the Link.)
        className="flex-1 min-w-0 px-2 py-2.5 flex items-center gap-2.5"
      >
        <span className={cn('shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md',
          isSegment ? 'bg-evari-edge/30 text-evari-dim' : 'bg-evari-gold/15 text-evari-gold',
        )}>
          {isSegment ? <Sparkles className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-evari-text font-medium truncate">{entry.name}</div>
          <div className="text-[10px] text-evari-dim font-mono tabular-nums truncate">
            {isSegment ? 'Segment · ' : 'List · '}{entry.members.toLocaleString()} member{entry.members === 1 ? '' : 's'}
            <span className="text-evari-dimmer"> · {new Date(entry.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        {inWorkspace ? (
          <span className="shrink-0 text-[10px] text-evari-gold font-semibold uppercase tracking-[0.1em]">In workspace</span>
        ) : null}
      </Link>

      {/* Per-row actions (only on lists — segments are managed in their own builder) */}
      {!isSegment ? (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center pr-2 gap-0.5">
          <button type="button" onClick={onRename} className="p-1 rounded text-evari-dim hover:text-evari-text hover:bg-evari-ink/60" title="Rename"><Pencil className="h-3 w-3" /></button>
          <button type="button" onClick={onDelete} className="p-1 rounded text-evari-dim hover:text-evari-danger hover:bg-evari-danger/10" title="Delete"><Trash2 className="h-3 w-3" /></button>
        </div>
      ) : null}
    </li>
  );
}

// ─── RIGHT pane: combine workspace ─────────────────────────────

function WorkspacePane({ workspaceIds, allEntries, onRemove, onClear, onCreated }: { workspaceIds: string[]; allEntries: AudienceEntry[]; onRemove: (id: string) => void; onClear: () => void; onCreated: () => Promise<void> | void }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'workspace' });
  const items = useMemo(() => workspaceIds.map((id) => allEntries.find((e) => e.id === id)).filter((x): x is AudienceEntry => !!x), [workspaceIds, allEntries]);

  // Fetch member contactIds per list so we can compute set ops client-side.
  const [membersByList, setMembersByList] = useState<Record<string, Set<string>>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    for (const id of workspaceIds) {
      if (membersByList[id] || loadingIds.has(id)) continue;
      // Mark loading immediately to dedupe.
      setLoadingIds((prev) => new Set(prev).add(id));
      fetch(`/api/marketing/groups/${id}/members`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!d?.ok) throw new Error(d?.error ?? 'Load failed');
          const approved = ((d.members ?? []) as ListMember[]).filter((m) => m.status === 'approved' && !m.isSuppressed);
          setMembersByList((cur) => ({ ...cur, [id]: new Set(approved.map((m) => m.contactId)) }));
        })
        .catch(() => {
          setMembersByList((cur) => ({ ...cur, [id]: new Set() }));
        })
        .finally(() => {
          setLoadingIds((cur) => { const n = new Set(cur); n.delete(id); return n; });
        });
    }
  }, [workspaceIds, membersByList, loadingIds]);

  // Compute set ops once we have everyone's members.
  const allLoaded = workspaceIds.every((id) => !!membersByList[id]);
  const stats = useMemo(() => {
    if (!allLoaded || workspaceIds.length === 0) return null;
    const sets = workspaceIds.map((id) => membersByList[id]!);
    const union = new Set<string>();
    for (const s of sets) for (const x of s) union.add(x);
    let intersection = new Set<string>();
    if (sets.length > 0) {
      const sorted = [...sets].sort((a, b) => a.size - b.size);
      const seed = sorted[0]!;
      intersection = new Set<string>(seed);
      for (let i = 1; i < sorted.length; i++) {
        for (const x of intersection) if (!sorted[i]!.has(x)) intersection.delete(x);
      }
    }
    return { union: union.size, intersection: intersection.size, sizes: sets.map((s) => s.size) };
  }, [workspaceIds, membersByList, allLoaded]);

  // Combine action state
  const [op, setOp] = useState<Op>('union');
  const [name, setName] = useState('');
  // Auto-name policy: until the operator types into the field, the
  // suggested name tracks the workspace as a pipe-joined list of
  // source names ('Yachts | Warm | Pre-launch'). The moment they
  // type, we lock to whatever they typed (so we don't fight with
  // their input).
  const [nameTouched, setNameTouched] = useState(false);
  const autoName = useMemo(() => items.map((e) => e.name).join(' | '), [items]);
  useEffect(() => {
    if (!nameTouched) setName(autoName);
  }, [autoName, nameTouched]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Subtract requires an explicit base. Default to first item.
  const subtractFromId = workspaceIds[0] ?? null;

  async function combine() {
    if (workspaceIds.length < 2 || !name.trim() || creating) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch('/api/marketing/groups/combine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: workspaceIds,
          operation: op,
          name: name.trim(),
          subtractFromId: op === 'subtract' ? subtractFromId : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error ?? 'Combine failed');
      setName('');
      setNameTouched(false);
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Combine failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'rounded-md border flex flex-col min-h-0 overflow-hidden transition-colors',
        isOver ? 'border-evari-gold bg-evari-gold/5' : 'border-evari-edge/30 bg-evari-surface',
      )}
    >
      <header className="px-3 py-2.5 border-b border-evari-edge/20 flex items-center gap-2 shrink-0">
        <Sparkles className="h-4 w-4 text-evari-gold" />
        <h2 className="text-[13px] font-semibold text-evari-text flex-1">Workspace <span className="text-evari-dim">({workspaceIds.length} list{workspaceIds.length === 1 ? '' : 's'})</span></h2>
        {workspaceIds.length > 0 ? (
          <button type="button" onClick={onClear} className="text-[11px] text-evari-dim hover:text-evari-text underline-offset-2 hover:underline">Clear</button>
        ) : null}
      </header>

      {workspaceIds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-2">
          <div className={cn('h-16 w-16 rounded-full inline-flex items-center justify-center transition-all', isOver ? 'bg-evari-gold/30 scale-110' : 'bg-evari-ink/40')}>
            <Boxes className={cn('h-7 w-7 transition-colors', isOver ? 'text-evari-gold' : 'text-evari-dimmer')} />
          </div>
          <h3 className="text-[14px] font-semibold text-evari-text">{isOver ? 'Drop to add' : 'Drag a list here'}</h3>
          <p className="text-[12px] text-evari-dim max-w-md">
            Drop one or more lists into this workspace to combine them. The system computes
            union, intersection, and difference as you drop, then materialises the result
            into a fresh list.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          {/* Picked lists */}
          <ul className="space-y-1.5">
            {items.map((e, i) => {
              const isBase = op === 'subtract' && e.id === subtractFromId;
              return (
                <li key={e.id} className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-md border transition-colors',
                  isBase ? 'border-evari-gold/60 bg-evari-gold/5' : 'border-evari-edge/30 bg-evari-ink/30',
                )}>
                  <span className="shrink-0 text-[10px] text-evari-dimmer font-mono tabular-nums w-4 text-right">{i + 1}</span>
                  <Users className="h-3.5 w-3.5 text-evari-dim shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-evari-text font-medium truncate">{e.name}</div>
                    <div className="text-[10px] text-evari-dim font-mono tabular-nums">
                      {membersByList[e.id] ? `${membersByList[e.id]!.size} approved` : <span className="inline-flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> loading…</span>}
                    </div>
                  </div>
                  {isBase ? <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-evari-gold font-semibold">Base</span> : null}
                  <button type="button" onClick={() => onRemove(e.id)} className="shrink-0 text-evari-dim hover:text-evari-danger p-1 rounded">
                    <X className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>

          {workspaceIds.length === 1 ? (
            <div className="rounded-md border border-dashed border-evari-edge/40 px-3 py-4 text-center text-[11px] text-evari-dimmer">
              Drag at least one more list in to combine.
            </div>
          ) : null}

          {/* Op picker + stats + create */}
          {workspaceIds.length >= 2 ? (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <OpCard active={op === 'union'}        onClick={() => setOp('union')}        title="Combine"   sub="A or B"      icon={<Plus className="h-4 w-4" />} />
                <OpCard active={op === 'intersection'} onClick={() => setOp('intersection')} title="Overlap"   sub="A and B"     icon={<Sparkles className="h-4 w-4" />} />
                <OpCard active={op === 'subtract'}     onClick={() => setOp('subtract')}     title="Subtract"  sub="A minus B"   icon={<MinusCircle className="h-4 w-4" />} />
              </div>

              {/* Live stats */}
              <div className="rounded-md border border-evari-edge/20 bg-evari-ink/30 p-3">
                {stats ? (
                  <>
                    <div className="text-[11px] text-evari-dim mb-2">If you create this list now it will contain:</div>
                    <div className="text-[28px] font-bold tabular-nums text-evari-gold leading-none">
                      {op === 'union' ? stats.union :
                       op === 'intersection' ? stats.intersection :
                       Math.max(0, (membersByList[subtractFromId!]?.size ?? 0) - workspaceIds.filter((id) => id !== subtractFromId).reduce((acc, id) => acc + Array.from(membersByList[id] ?? []).filter((c) => membersByList[subtractFromId!]?.has(c)).length, 0))}
                    </div>
                    <div className="text-[10px] text-evari-dim mt-1.5 font-mono tabular-nums">
                      Source sizes: {stats.sizes.join(' · ')} · Union: {stats.union} · Overlap: {stats.intersection}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-evari-dimmer inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Computing overlap…
                  </div>
                )}
              </div>

              {op === 'subtract' ? (
                <p className="text-[10px] text-evari-dim">
                  Subtract removes everyone in the lower lists from the top one. Reorder by removing + re-dragging if you need to change which is the base.
                </p>
              ) : null}

              {/* Name + create */}
              <div className="space-y-1.5">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Name the new list</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
                    placeholder={autoName || (op === 'union' ? 'Combined warm + cold' : op === 'intersection' ? 'In both warm and active' : 'Warm minus suppressed')}
                    className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
                  />
                </label>
                {error ? <p className="text-[11px] text-evari-danger">{error}</p> : null}
                <button
                  type="button"
                  onClick={combine}
                  disabled={creating || !name.trim() || !stats}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {creating ? 'Creating…' : 'Create combined list'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function OpCard({ active, onClick, title, sub, icon }: { active: boolean; onClick: () => void; title: string; sub: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border p-2 text-center transition-colors',
        active ? 'border-evari-gold bg-evari-gold/10 text-evari-text' : 'border-evari-edge/30 bg-evari-ink/30 text-evari-dim hover:text-evari-text hover:border-evari-gold/40',
      )}
    >
      <div className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md mx-auto mb-1', active ? 'bg-evari-gold/30 text-evari-gold' : 'bg-evari-ink text-evari-dim')}>
        {icon}
      </div>
      <div className="text-[12px] font-semibold">{title}</div>
      <div className="text-[10px] text-evari-dim font-mono">{sub}</div>
    </button>
  );
}

// ─── Modals (create / rename / delete) ──────────────────────────

function CreateListModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-evari-text">New list</h3>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP / Newsletter / Beta…" className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button type="button" disabled={busy || !name.trim()} onClick={async () => {
            setBusy(true);
            const res = await fetch('/api/marketing/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            const d = await res.json().catch(() => null);
            setBusy(false);
            if (d?.ok || d?.group) { onCreated(); onClose(); }
          }} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50">Create list</button>
        </footer>
      </div>
    </div>
  );
}

function RenameListModal({ entry, onClose, onSaved }: { entry: AudienceEntry; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(entry.name);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-evari-text">Rename list</h3>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button type="button" disabled={busy || !name.trim() || name.trim() === entry.name} onClick={async () => {
            setBusy(true);
            const res = await fetch(`/api/marketing/groups/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
            const d = await res.json().catch(() => null);
            setBusy(false);
            if (d?.ok) { onSaved(); onClose(); }
          }} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50">Save</button>
        </footer>
      </div>
    </div>
  );
}

function DeleteListModal({ entry, onClose, onDeleted }: { entry: AudienceEntry; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-evari-text">Delete &quot;{entry.name}&quot;?</h3>
        <p className="text-[12px] text-evari-dim">The list and its {entry.members} membership{entry.members === 1 ? '' : 's'} are removed. The underlying contacts stay — they remain on any other lists they belong to.</p>
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            const res = await fetch(`/api/marketing/groups/${entry.id}`, { method: 'DELETE' });
            const d = await res.json().catch(() => null);
            setBusy(false);
            if (d?.ok) { onDeleted(); onClose(); }
          }} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-danger text-white px-3 py-1 rounded disabled:opacity-50"><Trash2 className="h-3 w-3" /> Delete list</button>
        </footer>
      </div>
    </div>
  );
}

void ArrowLeft; void ShieldAlert;
