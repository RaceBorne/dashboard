'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AudienceBundle, AudienceEntry, AudienceEntryKind } from '@/lib/marketing/audience';

interface Props { initialBundle: AudienceBundle }

type TypeFilter = 'all' | 'group' | 'segment';

/**
 * Klaviyo-style Lists & Segments table — single page, search box,
 * type filter, member counts. Create dropdown opens a modal that
 * POSTs a new group OR navigates to the segment builder (which
 * already exists at /email/segments).
 */
export function AudienceClient({ initialBundle }: Props) {
  const router = useRouter();
  const [bundle, setBundle] = useState<AudienceBundle>(initialBundle);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AudienceEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AudienceEntry | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function renameList(entry: AudienceEntry, name: string) {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/marketing/groups/${entry.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setRenameTarget(null);
        await refresh();
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteList(entry: AudienceEntry) {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/marketing/groups/${entry.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setDeleteTarget(null);
        await refresh();
      }
    } finally {
      setActionBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bundle.entries.filter((e) => {
      if (filter !== 'all' && e.kind !== filter) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q);
    });
  }, [bundle.entries, filter, search]);

  async function refresh() {
    const r = await fetch('/api/marketing/audience', { cache: 'no-store' });
    const d = await r.json().catch(() => null);
    if (d?.ok) setBundle({ entries: d.entries, totals: d.totals });
    router.refresh();
  }

  async function createList(name: string) {
    setCreatingList(true);
    try {
      const res = await fetch('/api/marketing/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok || data?.group) {
        setCreateOpen(false);
        await refresh();
      }
    } finally {
      setCreatingList(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="rounded-md bg-evari-surface border border-evari-edge/30">
        {/* Toolbar */}
        <header className="flex items-center gap-2 p-3 border-b border-evari-edge/20">
          <div className="flex-1 flex items-center gap-2 max-w-md rounded-md bg-evari-ink border border-evari-edge/30 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-evari-dimmer shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lists & segments…"
              className="flex-1 bg-transparent text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="text-evari-dim hover:text-evari-text">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
            {(['all', 'group', 'segment'] as TypeFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors duration-300',
                  filter === f ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
                )}
              >
                {f === 'all' ? 'All types' : f === 'group' ? 'Lists' : 'Segments'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Create
          </button>
        </header>

        {/* Table */}
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-evari-dimmer">
            {bundle.entries.length === 0
              ? 'No lists or segments yet — create your first list to get started.'
              : 'Nothing matches that filter.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-evari-ink/40 text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left w-24">Type</th>
                <th className="px-3 py-2 text-right w-28">Members</th>
                <th className="px-3 py-2 text-left w-44">Updated</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-evari-edge/10">
              {visible.map((e) => <AudienceRow key={`${e.kind}-${e.id}`} entry={e} onRename={setRenameTarget} onDelete={setDeleteTarget} busy={actionBusy} />)}
            </tbody>
          </table>
        )}
      </div>

      {createOpen ? (
        <CreateModal onClose={() => setCreateOpen(false)} onCreateList={createList} creatingList={creatingList} />
      ) : null}

      {renameTarget ? (
        <RenameModal
          entry={renameTarget}
          busy={actionBusy}
          onClose={() => setRenameTarget(null)}
          onSave={(name) => renameList(renameTarget!, name)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteModal
          entry={deleteTarget}
          busy={actionBusy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteList(deleteTarget!)}
        />
      ) : null}
    </div>
  );
}

function AudienceRow({ entry, onRename, onDelete, busy }: { entry: AudienceEntry; onRename: (entry: AudienceEntry) => void; onDelete: (entry: AudienceEntry) => void; busy: boolean }) {
  const href = entry.kind === 'group' ? `/email/audience/${entry.id}` : `/email/segments/${entry.id}`;
  return (
    <tr className="group hover:bg-evari-ink/30 transition-colors">
      <td className="px-3 py-2">
        <Link href={href} className="inline-flex items-center gap-2 text-evari-text hover:text-evari-gold transition-colors">
          <Star className={cn('h-3.5 w-3.5', entry.kind === 'group' ? 'text-evari-gold' : 'text-evari-dimmer')} />
          <span className="font-medium truncate max-w-[420px]">{entry.name}</span>
        </Link>
        {entry.description ? <div className="text-[11px] text-evari-dimmer truncate mt-0.5 ml-5">{entry.description}</div> : null}
      </td>
      <td className="px-3 py-2 text-evari-dim capitalize">{entry.kind === 'group' ? 'List' : 'Segment'}</td>
      <td className="px-3 py-2 text-right text-evari-text font-mono tabular-nums">{entry.members.toLocaleString()}</td>
      <td className="px-3 py-2 text-evari-dimmer font-mono tabular-nums text-[11px]">
        {new Date(entry.updatedAt).toLocaleString()}
      </td>
      <td className="px-3 py-2 w-20">
        {entry.kind === 'group' ? (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onRename(entry)}
              disabled={busy}
              title="Rename list"
              className="p-1 rounded text-evari-dim hover:text-evari-text hover:bg-evari-ink/60 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry)}
              disabled={busy}
              title="Delete list"
              className="p-1 rounded text-evari-dim hover:text-evari-danger hover:bg-evari-danger/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function CreateModal({ onClose, onCreateList, creatingList }: { onClose: () => void; onCreateList: (name: string) => Promise<void>; creatingList: boolean }) {
  const [tab, setTab] = useState<AudienceEntryKind>('group');
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">Create</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>
        <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5 w-full">
          {(['group', 'segment'] as AudienceEntryKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                'flex-1 px-2.5 py-1 rounded text-xs font-medium transition-colors duration-300',
                tab === k ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
              )}
            >
              {k === 'group' ? 'List' : 'Segment'}
            </button>
          ))}
        </div>
        {tab === 'group' ? (
          <>
            <p className="text-[11px] text-evari-dimmer">A list is a static group people opt into. Use lists for newsletters, beta waitlists, customer cohorts.</p>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">List name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="e.g. Newsletter subscribers"
                className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
              />
            </label>
            <footer className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
              <button
                type="button"
                disabled={!name.trim() || creatingList}
                onClick={() => onCreateList(name.trim())}
                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50"
              >
                {creatingList ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {creatingList ? 'Creating' : 'Create list'}
              </button>
            </footer>
          </>
        ) : (
          <>
            <p className="text-[11px] text-evari-dimmer">A segment is a saved query. Build it from rules — every send re-evaluates the rules so membership stays current.</p>
            <Link
              href="/email/segments"
              className="inline-flex items-center justify-center gap-1 w-full px-3 py-1.5 rounded text-[11px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
            >
              <Filter className="h-3 w-3" /> Open segment builder
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function RenameModal({ entry, busy, onClose, onSave }: { entry: AudienceEntry; busy: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(entry.name);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">Rename list</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); }}
            className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          />
        </label>
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button
            type="button"
            disabled={busy || !name.trim() || name.trim() === entry.name}
            onClick={() => onSave(name.trim())}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function DeleteModal({ entry, busy, onClose, onConfirm }: { entry: AudienceEntry; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">Delete &quot;{entry.name}&quot;?</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>
        <p className="text-[12px] text-evari-dim">
          The list and its {entry.members} membership{entry.members === 1 ? '' : 's'} will be removed. The
          underlying contacts stay — they&apos;re still on any other lists they belong to.
        </p>
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-danger text-white px-3 py-1 rounded disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete
          </button>
        </footer>
      </div>
    </div>
  );
}
