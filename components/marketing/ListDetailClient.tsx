'use client';

/**
 * List detail page — built around the operator's mental model:
 *
 *   • Top: list identity (inline-editable name + description), the
 *     two member counts (approved / pending) shown as gold + amber
 *     stats, and the primary 'Add members' action.
 *   • Tabs: All / Approved / Pending review with badges.
 *   • Body: members table with multi-select. Hovering a row reveals
 *     individual remove + promote actions; selecting multiple rows
 *     surfaces a sticky action bar at the bottom (Gmail-style).
 *   • The 'Add members' button slides a panel in from the right
 *     with three focused workflows: paste emails, drop a CSV, or
 *     import from prospects (which arrive with status='pending').
 *
 * Drag-and-drop is used for: dropping a CSV file onto the upload
 * zone in the add panel, and reordering rows in the members table
 * isn't supported (lists don't carry order — they're sets) so we
 * deliberately avoid drag-handles on rows to not promise behaviour
 * we don't have.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  FileText,
  Filter,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Group } from '@/lib/marketing/types';
import type { ListMember } from '@/lib/marketing/groups';
import { ContactEditDrawer } from './ContactEditDrawer';

interface Props {
  group: Group;
  initialMembers: ListMember[];
}

type TabKey = 'all' | 'approved' | 'pending';

export function ListDetailClient({ group: initialGroup, initialMembers }: Props) {
  const router = useRouter();
  const [group, setGroup] = useState(initialGroup);
  const [members, setMembers] = useState(initialMembers);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ListMember | null>(null);

  const counts = useMemo(() => {
    const out = { all: members.length, approved: 0, pending: 0, suppressed: 0, sendable: 0 };
    for (const m of members) {
      out[m.status] += 1;
      if (m.isSuppressed) out.suppressed += 1;
    }
    out.sendable = Math.max(0, out.approved - out.suppressed);
    return out;
  }, [members]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (tab !== 'all' && m.status !== tab) return false;
      if (!q) return true;
      const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.toLowerCase();
      return m.email.toLowerCase().includes(q) || name.includes(q);
    });
  }, [members, tab, search]);

  // Toast helper — auto-clears after 2.5s.
  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function refresh() {
    const res = await fetch(`/api/marketing/groups/${group.id}/members`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setMembers(data.members as ListMember[]);
      setSelected(new Set());
    }
    router.refresh();
  }

  async function saveName(next: string) {
    if (next === group.name || !next.trim()) { setEditingName(false); setName(group.name); return; }
    setBusy(true);
    const res = await fetch(`/api/marketing/groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next.trim() }),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setGroup(data.group);
      setName(data.group.name);
      flash('List renamed');
      router.refresh();
    } else {
      setName(group.name);
    }
    setEditingName(false);
    setBusy(false);
  }

  async function saveDesc(next: string) {
    const trimmed = next.trim();
    if (trimmed === (group.description ?? '')) { setEditingDesc(false); return; }
    setBusy(true);
    const res = await fetch(`/api/marketing/groups/${group.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: trimmed || null }),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setGroup(data.group);
      setDescription(data.group.description ?? '');
      flash('Description saved');
      router.refresh();
    } else {
      setDescription(group.description ?? '');
    }
    setEditingDesc(false);
    setBusy(false);
  }

  async function deleteList() {
    setBusy(true);
    const res = await fetch(`/api/marketing/groups/${group.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (data?.ok) router.push('/email/audience');
    else setBusy(false);
  }

  async function bulkPromote() {
    if (selected.size === 0) return;
    setBusy(true);
    const res = await fetch(`/api/marketing/groups/${group.id}/promote`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: Array.from(selected) }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) {
      flash(`Promoted ${data.promoted} to approved`);
      await refresh();
    }
  }

  async function bulkRemove() {
    if (selected.size === 0) return;
    setBusy(true);
    const res = await fetch(`/api/marketing/groups/${group.id}/remove`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: Array.from(selected) }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) {
      flash(`Removed ${data.removed} from list`);
      await refresh();
    }
  }

  function toggleAll() {
    if (selected.size === visible.length && visible.length > 0) setSelected(new Set());
    else setSelected(new Set(visible.map((m) => m.contactId)));
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Back link */}
        <Link href="/email/audience" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> All lists
        </Link>

        {/* Hero — list identity + stats + primary action */}
        <header className="rounded-md bg-evari-surface border border-evari-edge/30 p-5 mb-3">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {/* Inline-editable name */}
              {editingName ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => saveName(name)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(name); if (e.key === 'Escape') { setName(group.name); setEditingName(false); } }}
                  className="w-full px-2 py-1 -mx-2 -my-1 rounded bg-evari-ink text-evari-text text-2xl font-bold border border-evari-gold/60 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="group inline-flex items-center gap-2 text-2xl font-bold text-evari-text hover:text-evari-gold transition-colors"
                >
                  {group.name}
                  <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}

              {/* Inline-editable description */}
              {editingDesc ? (
                <input
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => saveDesc(description)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveDesc(description); if (e.key === 'Escape') { setDescription(group.description ?? ''); setEditingDesc(false); } }}
                  placeholder="Add a description"
                  className="w-full mt-1 px-2 py-1 -mx-2 rounded bg-evari-ink text-evari-text text-[12px] border border-evari-gold/60 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDesc(true)}
                  className="group inline-flex items-center gap-2 text-[12px] text-evari-dim hover:text-evari-text mt-1 transition-colors"
                >
                  {group.description || <span className="italic text-evari-dimmer">Add a description</span>}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}

              {/* Stats: approved + pending */}
              <div className="flex items-center gap-4 mt-3">
                <Stat label="Will receive sends" value={counts.sendable} accent="gold" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                <Stat label="Pending review" value={counts.pending} accent={counts.pending > 0 ? 'amber' : 'mute'} icon={<Clock className="h-3.5 w-3.5" />} />
                {counts.suppressed > 0 ? (
                  <Stat label="Suppressed" value={counts.suppressed} accent="danger" icon={<ShieldAlert className="h-3.5 w-3.5" />} />
                ) : null}
                <Stat label="Total" value={counts.all} accent="mute" icon={<Users className="h-3.5 w-3.5" />} />
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                title="Delete list"
                className="inline-flex items-center justify-center h-8 w-8 rounded-md text-evari-dim hover:text-evari-danger hover:bg-evari-danger/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add members
              </button>
            </div>
          </div>
        </header>

        {/* Tabs + search */}
        <div className="rounded-md bg-evari-surface border border-evari-edge/30 mb-2">
          <div className="flex items-stretch border-b border-evari-edge/20">
            <Tab active={tab === 'all'}      onClick={() => setTab('all')}      label="All"      count={counts.all} />
            <Tab active={tab === 'approved'} onClick={() => setTab('approved')} label="Approved" count={counts.approved} accent="gold" />
            <Tab active={tab === 'pending'}  onClick={() => setTab('pending')}  label="Pending review" count={counts.pending} accent="amber" />
            <div className="flex-1" />
            <div className="flex items-center px-3 gap-2 min-w-[260px]">
              <Search className="h-3.5 w-3.5 text-evari-dimmer" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or name…"
                className="flex-1 bg-transparent text-[12px] text-evari-text placeholder:text-evari-dimmer focus:outline-none"
              />
            </div>
          </div>

          {/* Members table */}
          {visible.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Users className="h-8 w-8 text-evari-dimmer mx-auto mb-3" />
              <p className="text-[13px] text-evari-dim mb-1">
                {members.length === 0
                  ? "This list is empty. Add a couple of members to get started."
                  : tab === 'pending'
                    ? "Nothing pending review."
                    : tab === 'approved'
                      ? "No approved members yet — promote pending ones or add directly."
                      : "Nothing matches that search."}
              </p>
              {members.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1 mt-2 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add your first member
                </button>
              ) : null}
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
                <tr>
                  <th className="w-8 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === visible.length && visible.length > 0}
                      ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < visible.length; }}
                      onChange={toggleAll}
                      className="accent-evari-gold cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Member</th>
                  <th className="px-3 py-2 text-left w-32">Status</th>
                  <th className="px-3 py-2 text-left w-32">Source</th>
                  <th className="px-3 py-2 text-left w-44">Added</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-evari-edge/10">
                {visible.map((m) => (
                  <MemberRow
                    key={m.contactId}
                    member={m}
                    selected={selected.has(m.contactId)}
                    onOpen={() => setEditTarget(m)}
                    onToggle={() => toggleOne(m.contactId)}
                    onPromote={async () => {
                      setBusy(true);
                      const res = await fetch(`/api/marketing/groups/${group.id}/promote`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contactIds: [m.contactId] }),
                      });
                      const d = await res.json().catch(() => null);
                      setBusy(false);
                      if (d?.ok) { flash('Promoted'); await refresh(); }
                    }}
                    onRemove={async () => {
                      setBusy(true);
                      const res = await fetch(`/api/marketing/groups/${group.id}/remove`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contactIds: [m.contactId] }),
                      });
                      const d = await res.json().catch(() => null);
                      setBusy(false);
                      if (d?.ok) { flash('Removed'); await refresh(); }
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sticky bulk action bar — slides up when rows are selected */}
      {selected.size > 0 ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-md bg-evari-surface border border-evari-gold/40 shadow-2xl flex items-center gap-2 px-3 py-2 animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-[12px] text-evari-text font-medium">
            <strong>{selected.size}</strong> selected
          </span>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[10px] text-evari-dim hover:text-evari-text underline underline-offset-2">Clear</button>
          <div className="h-4 w-px bg-evari-edge/40 mx-1" />
          <button
            type="button"
            onClick={bulkPromote}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-evari-gold bg-evari-gold/10 hover:bg-evari-gold/20 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="h-3 w-3" /> Promote
          </button>
          <button
            type="button"
            onClick={bulkRemove}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-evari-danger bg-evari-danger/10 hover:bg-evari-danger/20 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Remove from list
          </button>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="fixed top-16 right-4 z-40 rounded-md bg-evari-success/15 border border-evari-success/40 px-3 py-2 text-[12px] text-evari-success animate-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="h-3.5 w-3.5 inline-block mr-1" /> {toast}
        </div>
      ) : null}

      {/* Add members slide-over */}
      {addOpen ? (
        <AddMembersPanel
          groupId={group.id}
          onClose={() => setAddOpen(false)}
          onDone={async (msg) => { flash(msg); await refresh(); setAddOpen(false); }}
        />
      ) : null}

      {/* Delete confirm */}
      {editTarget ? (
        <ContactEditDrawer
          contactId={editTarget.contactId}
          leadId={editTarget.leadId}
          onClose={() => setEditTarget(null)}
          onSaved={async () => { await refresh(); flash('Contact updated'); }}
          onRemoveFromList={async () => {
            const target = editTarget;
            setEditTarget(null);
            const res = await fetch(`/api/marketing/groups/${group.id}/remove`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contactIds: [target.contactId] }),
            });
            const d = await res.json().catch(() => null);
            if (d?.ok) { flash(`Removed ${target.email} from this list`); await refresh(); }
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-evari-text">Delete &quot;{group.name}&quot;?</h3>
            <p className="text-[12px] text-evari-dim mt-2">
              The list and its {counts.all} membership{counts.all === 1 ? '' : 's'} will be removed. The
              underlying contacts stay — they&apos;re still on any other lists they belong to.
            </p>
            <footer className="flex items-center justify-end gap-2 mt-4">
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-[12px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
              <button
                type="button"
                onClick={deleteList}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-danger text-white px-3 py-1 rounded disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Delete list
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function Stat({ label, value, accent, icon }: { label: string; value: number; accent: 'gold' | 'amber' | 'mute' | 'danger'; icon: React.ReactNode }) {
  const accentCls = accent === 'gold' ? 'text-evari-gold' : accent === 'amber' ? 'text-evari-warn' : accent === 'danger' ? 'text-evari-danger' : 'text-evari-dimmer';
  return (
    <div className="inline-flex items-center gap-2">
      <span className={cn('inline-flex items-center justify-center h-6 w-6 rounded-md', accent === 'gold' ? 'bg-evari-gold/15' : accent === 'amber' ? 'bg-evari-warn/15' : accent === 'danger' ? 'bg-evari-danger/15' : 'bg-evari-ink/40', accentCls)}>
        {icon}
      </span>
      <div>
        <div className={cn('text-[16px] font-bold tabular-nums leading-none', accentCls)}>{value.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, label, count, accent }: { active: boolean; onClick: () => void; label: string; count: number; accent?: 'gold' | 'amber' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors',
        active
          ? 'border-evari-gold text-evari-text'
          : 'border-transparent text-evari-dim hover:text-evari-text',
      )}
    >
      <span>{label}</span>
      <span className={cn(
        'ml-2 inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-mono tabular-nums rounded-full',
        accent === 'gold'  ? 'bg-evari-gold/20 text-evari-gold' :
        accent === 'amber' ? 'bg-evari-warn/20 text-evari-warn' :
        active             ? 'bg-evari-text/10 text-evari-text' :
                             'bg-evari-ink/40 text-evari-dimmer',
      )}>{count}</span>
    </button>
  );
}

function MemberRow({ member, selected, onOpen, onToggle, onPromote, onRemove }: { member: ListMember; selected: boolean; onOpen: () => void; onToggle: () => void; onPromote: () => void; onRemove: () => void }) {
  const fullName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();
  const isPending = member.status === 'pending';
  // Click opens the inline ContactEditDrawer (handled by parent)
  // so the operator can fix names / emails / status without bouncing
  // to the heavy /leads CRM surface. The drawer surfaces a deep link
  // back to /leads for prospecting-mirrored contacts when the rich
  // record is genuinely needed.
  return (
    <tr className={cn('group transition-colors', selected ? 'bg-evari-gold/5' : 'hover:bg-evari-ink/30')}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-evari-gold cursor-pointer" />
      </td>
      <td className="px-3 py-2">
        <button type="button" onClick={onOpen} className="flex items-center gap-2.5 min-w-0 hover:text-evari-gold transition-colors text-left w-full" title="Edit contact">
          <div className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-evari-ink text-[10px] font-semibold text-evari-dim uppercase">
            {(fullName || member.email).slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="text-evari-text truncate font-medium">{fullName || smartFallbackName(member.email)}</div>
            <div className="text-[11px] text-evari-dim truncate font-mono">
              {member.email}{member.company ? <span className="text-evari-dimmer"> · {member.company}</span> : null}
            </div>
          </div>
        </button>
      </td>
      <td className="px-3 py-2">
        {member.isSuppressed ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-evari-danger/15 text-evari-danger" title="This contact is on the suppression list and will not be sent to.">
            <ShieldAlert className="h-3 w-3" /> Suppressed
          </span>
        ) : isPending ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-evari-warn/15 text-evari-warn">
            <Clock className="h-3 w-3" /> Pending
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-evari-gold/15 text-evari-gold">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-evari-dim text-[11px] capitalize">{member.addedBySource?.replace('_', ' ') ?? '—'}</td>
      <td className="px-3 py-2 text-evari-dimmer text-[11px] font-mono tabular-nums">{new Date(member.addedAt).toLocaleString()}</td>
      <td className="px-2 py-2">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 justify-end">
          {isPending ? (
            <button type="button" onClick={onPromote} title="Promote to approved" className="p-1 rounded text-evari-gold hover:bg-evari-gold/10">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button type="button" onClick={onRemove} title="Remove from list" className="p-1 rounded text-evari-dim hover:text-evari-danger hover:bg-evari-danger/10">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Add members slide-over ──────────────────────────────────

type AddTab = 'manual' | 'csv' | 'leads';

function AddMembersPanel({ groupId, onClose, onDone }: { groupId: string; onClose: () => void; onDone: (msg: string) => Promise<void> | void }) {
  const [tab, setTab] = useState<AddTab>('manual');
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-evari-surface border-l border-evari-edge/40 shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-200">
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-evari-text flex-1">Add members</h2>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Source tabs */}
        <div className="px-3 pt-3">
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-md bg-evari-ink/40 border border-evari-edge/30">
            <SourceTab active={tab === 'manual'} onClick={() => setTab('manual')} icon={<Mail className="h-3.5 w-3.5" />} label="Manual" />
            <SourceTab active={tab === 'csv'}    onClick={() => setTab('csv')}    icon={<Upload className="h-3.5 w-3.5" />} label="CSV" />
            <SourceTab active={tab === 'leads'}  onClick={() => setTab('leads')}  icon={<Users className="h-3.5 w-3.5" />} label="From prospects" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {tab === 'manual' ? (
            <ManualPanel groupId={groupId} onDone={onDone} />
          ) : tab === 'csv' ? (
            <CsvPanel groupId={groupId} onDone={onDone} />
          ) : (
            <LeadsPanel groupId={groupId} onDone={onDone} />
          )}
        </div>
      </aside>
    </>
  );
}

function SourceTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[11px] font-medium transition-colors',
        active ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text',
      )}
    >
      {icon} {label}
    </button>
  );
}

// ─── Manual paste ─────────────────────────────────────────────

function ManualPanel({ groupId, onDone }: { groupId: string; onDone: (msg: string) => Promise<void> | void }) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const emails = useMemo(() => {
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }, [raw]);
  const dupes = emails.length - new Set(emails).size;
  const uniqueCount = new Set(emails).size;

  async function submit() {
    if (uniqueCount === 0 || busy) return;
    setBusy(true);
    const members = Array.from(new Set(emails)).map((email) => ({ email }));
    const res = await fetch(`/api/marketing/groups/${groupId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manual', members }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) {
      await onDone(`Added ${data.added}, ${data.alreadyMember} already on list`);
    }
  }

  return (
    <div className="space-y-3">
      <header>
        <h3 className="text-[13px] font-semibold text-evari-text">Paste email addresses</h3>
        <p className="text-[11px] text-evari-dim mt-0.5">One per line, comma-separated, or both. Anything that doesn&apos;t look like an email is dropped silently.</p>
      </header>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="alice@example.com&#10;bob@example.com&#10;cara@example.com"
        className="w-full min-h-[180px] px-3 py-2 rounded-md bg-evari-ink text-evari-text text-[12px] font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
      />
      <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-2.5 text-[11px] text-evari-dim">
        <span className="text-evari-text font-mono tabular-nums">{uniqueCount}</span> unique address{uniqueCount === 1 ? '' : 'es'} ready
        {dupes > 0 ? <span className="text-evari-dimmer ml-2">({dupes} duplicate{dupes === 1 ? '' : 's'} ignored)</span> : null}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy || uniqueCount === 0}
        className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Add {uniqueCount > 0 ? `${uniqueCount} ` : ''}as approved
      </button>
    </div>
  );
}

// ─── CSV upload with drag-and-drop + preview ─────────────────

interface CsvRow { email: string; firstName?: string; lastName?: string; company?: string }

function CsvPanel({ groupId, onDone }: { groupId: string; onDone: (msg: string) => Promise<void> | void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<CsvRow[] | null>(null);
  const [invalid, setInvalid] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    const text = await f.text();
    const { rows, invalid } = parseCsv(text);
    setParsed(rows);
    setInvalid(invalid);
  }

  async function submit() {
    if (!parsed || parsed.length === 0 || busy) return;
    setBusy(true);
    const members = parsed.map((r) => ({
      email: r.email,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      company: r.company ?? null,
    }));
    const res = await fetch(`/api/marketing/groups/${groupId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'csv', members }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) await onDone(`Added ${data.added} from ${file?.name ?? 'CSV'}`);
  }

  return (
    <div className="space-y-3">
      <header>
        <h3 className="text-[13px] font-semibold text-evari-text">Upload a CSV</h3>
        <p className="text-[11px] text-evari-dim mt-0.5">First row should be headers. We&apos;ll look for <code className="font-mono text-evari-text">email</code>, optional <code className="font-mono text-evari-text">first_name</code>, <code className="font-mono text-evari-text">last_name</code>, <code className="font-mono text-evari-text">company</code>.</p>
      </header>

      {/* Drag-and-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-md border-2 border-dashed px-4 py-8 text-center transition-all',
          dragOver
            ? 'border-evari-gold bg-evari-gold/10'
            : file
              ? 'border-evari-success/50 bg-evari-success/5'
              : 'border-evari-edge/40 hover:border-evari-gold/40 bg-evari-ink/30',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {file ? (
          <>
            <FileText className="h-7 w-7 text-evari-success mx-auto mb-2" />
            <p className="text-[12px] text-evari-text font-medium">{file.name}</p>
            <p className="text-[10px] text-evari-dim mt-0.5">{(file.size / 1024).toFixed(1)} KB · click to choose another</p>
          </>
        ) : (
          <>
            <Upload className={cn('h-7 w-7 mx-auto mb-2 transition-colors', dragOver ? 'text-evari-gold' : 'text-evari-dim')} />
            <p className="text-[12px] text-evari-text font-medium">{dragOver ? 'Drop it' : 'Drop a CSV here'}</p>
            <p className="text-[10px] text-evari-dim mt-0.5">or click to choose a file</p>
          </>
        )}
      </div>

      {/* Preview */}
      {parsed ? (
        parsed.length === 0 ? (
          <div className="rounded-md bg-evari-danger/10 border border-evari-danger/30 px-3 py-2 text-[12px] text-evari-danger">
            No valid email addresses found. {invalid > 0 ? `${invalid} row${invalid === 1 ? '' : 's'} dropped.` : 'Check the CSV has an email column.'}
          </div>
        ) : (
          <>
            <div className="rounded-md bg-evari-ink/40 border border-evari-edge/20 p-2.5 text-[11px] text-evari-dim">
              <span className="text-evari-text font-mono tabular-nums">{parsed.length}</span> valid row{parsed.length === 1 ? '' : 's'}
              {invalid > 0 ? <span className="text-evari-dimmer ml-2">({invalid} dropped)</span> : null}
            </div>
            <div className="rounded-md border border-evari-edge/20 max-h-[180px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[10px] uppercase text-evari-dimmer bg-evari-ink/40 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Email</th>
                    <th className="px-2 py-1.5 text-left">Name</th>
                    <th className="px-2 py-1.5 text-left">Company</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-evari-edge/10">
                  {parsed.slice(0, 25).map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 font-mono text-evari-text">{r.email}</td>
                      <td className="px-2 py-1 text-evari-dim">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-2 py-1 text-evari-dim">{r.company ?? '—'}</td>
                    </tr>
                  ))}
                  {parsed.length > 25 ? (
                    <tr><td colSpan={3} className="px-2 py-1.5 text-center text-evari-dimmer text-[10px]">+ {parsed.length - 25} more</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Import {parsed.length} as approved
            </button>
          </>
        )
      ) : null}
    </div>
  );
}

function parseCsv(text: string): { rows: CsvRow[]; invalid: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], invalid: 0 };
  const split = (line: string) => line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const idx = {
    email: headers.findIndex((h) => h === 'email' || h === 'email_address'),
    firstName: headers.findIndex((h) => h === 'first_name' || h === 'firstname' || h === 'fname'),
    lastName:  headers.findIndex((h) => h === 'last_name'  || h === 'lastname'  || h === 'lname'  || h === 'surname'),
    company:   headers.findIndex((h) => h === 'company' || h === 'company_name' || h === 'organisation' || h === 'organization'),
  };
  // If no header row was supplied, assume the first column is email.
  const startAt = idx.email === -1 ? 0 : 1;
  const validRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const out: CsvRow[] = [];
  let invalid = 0;
  for (let i = startAt; i < lines.length; i++) {
    const cols = split(lines[i]!);
    const email = (idx.email === -1 ? cols[0] : cols[idx.email])?.toLowerCase() ?? '';
    if (!validRe.test(email)) { invalid += 1; continue; }
    out.push({
      email,
      firstName: idx.firstName >= 0 ? cols[idx.firstName] : undefined,
      lastName:  idx.lastName  >= 0 ? cols[idx.lastName]  : undefined,
      company:   idx.company   >= 0 ? cols[idx.company]   : undefined,
    });
  }
  return { rows: out, invalid };
}

// ─── Import from prospects ────────────────────────────────────

interface LeadLite { id: string; email: string; fullName: string; companyName: string | null; tier: string }

function LeadsPanel({ groupId, onDone }: { groupId: string; onDone: (msg: string) => Promise<void> | void }) {
  const [leads, setLeads] = useState<LeadLite[] | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/contacts/leads', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const all = (d?.contacts ?? d?.leads ?? []) as Array<{ id: string; email: string; fullName: string; companyName: string | null; tier: string }>;
        setLeads(all.map((c) => ({ id: c.id, email: c.email ?? '', fullName: c.fullName ?? '', companyName: c.companyName ?? null, tier: c.tier ?? 'prospect' })));
      })
      .catch(() => setError('Could not load prospects.'));
  }, []);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (!q) return true;
      return l.email.toLowerCase().includes(q) || l.fullName.toLowerCase().includes(q) || (l.companyName ?? '').toLowerCase().includes(q);
    });
  }, [leads, search]);

  async function submit() {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    const res = await fetch(`/api/marketing/groups/${groupId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'from_leads', leadIds: Array.from(picked) }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) await onDone(`Added ${data.added} as pending review`);
  }

  return (
    <div className="space-y-3">
      <header>
        <h3 className="text-[13px] font-semibold text-evari-text">Pick prospects to import</h3>
        <p className="text-[11px] text-evari-dim mt-0.5">These arrive as <strong className="text-evari-warn">Pending review</strong> — they won&apos;t be sent to until you promote them.</p>
      </header>

      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-evari-ink border border-evari-edge/30">
        <Search className="h-3.5 w-3.5 text-evari-dimmer" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prospect name, email, company…"
          className="flex-1 bg-transparent text-[12px] text-evari-text placeholder:text-evari-dimmer focus:outline-none"
        />
      </div>

      {error ? <p className="text-[11px] text-evari-danger">{error}</p> : null}
      {!leads ? (
        <div className="py-12 text-center text-evari-dimmer text-sm inline-flex items-center gap-2 w-full justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="text-[12px] text-evari-dimmer text-center py-6">{leads.length === 0 ? 'No prospects yet — head to /discover to source some.' : 'Nothing matches that search.'}</p>
      ) : (
        <ul className="rounded-md border border-evari-edge/20 max-h-[320px] overflow-y-auto divide-y divide-evari-edge/10">
          {filtered.map((l) => (
            <li key={l.id}>
              <label className="flex items-center gap-2 px-2.5 py-2 hover:bg-evari-ink/40 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={picked.has(l.id)}
                  onChange={() => {
                    const next = new Set(picked);
                    if (next.has(l.id)) next.delete(l.id);
                    else next.add(l.id);
                    setPicked(next);
                  }}
                  className="accent-evari-gold cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-evari-text truncate font-medium">{l.fullName || l.email}</div>
                  <div className="text-[10px] text-evari-dim truncate font-mono">{l.email}{l.companyName ? <span className="text-evari-dimmer"> · {l.companyName}</span> : null}</div>
                </div>
                <span className={cn('text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0',
                  l.tier === 'lead' ? 'bg-evari-gold/15 text-evari-gold' : 'bg-evari-ink/40 text-evari-dim',
                )}>{l.tier}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {picked.size > 0 ? (
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Import {picked.size} as pending
        </button>
      ) : null}
    </div>
  );
}

void Filter; void Plus; void ArrowLeft; void MoreHorizontal;

/**
 * Soft fallback when a contact has no first/last name set. Instead of
 * showing the full email (which looks ugly in a list view), surface
 * the local-part (before @) with a yellow indicator that the operator
 * needs to fix it. The drawer they open also flags this loudly.
 */
function smartFallbackName(email: string): string {
  if (!email) return '(unnamed)';
  const local = email.split('@')[0] ?? email;
  return `${local} (unnamed)`;
}
