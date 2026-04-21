'use client';

import { useMemo, useState } from 'react';
import {
  Search as SearchIcon,
  ArrowUpDown,
  X,
  Inbox,
  Flag,
  Rocket,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MailX,
  Clock,
  CircleHelp,
  ThumbsUp,
  Meh,
  ThumbsDown,
  Archive,
  UserCheck,
  Trash2,
  ArrowUpRight,
  Folder,
  Loader2,
  Sparkles,
  ExternalLink,
  Pencil,
  Check,
  Users2,
  Briefcase,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, relativeTime } from '@/lib/utils';
import type { Prospect, ProspectStatus } from '@/lib/types';

const STATUSES: { key: ProspectStatus; label: string; icon: React.ReactNode }[] =
  [
    { key: 'pending', label: 'Pending', icon: <CircleHelp className="h-3.5 w-3.5" /> },
    { key: 'sent', label: 'Sent', icon: <Clock className="h-3.5 w-3.5" /> },
    { key: 'replied_positive', label: 'Replied — positive', icon: <ThumbsUp className="h-3.5 w-3.5" /> },
    { key: 'replied_neutral', label: 'Replied — neutral', icon: <Meh className="h-3.5 w-3.5" /> },
    { key: 'replied_negative', label: 'Replied — negative', icon: <ThumbsDown className="h-3.5 w-3.5" /> },
    { key: 'no_reply', label: 'No reply', icon: <Clock className="h-3.5 w-3.5" /> },
    { key: 'bounced', label: 'Bounced', icon: <MailX className="h-3.5 w-3.5" /> },
    { key: 'qualified', label: 'Qualified', icon: <Flag className="h-3.5 w-3.5" /> },
    { key: 'archived', label: 'Archived', icon: <Archive className="h-3.5 w-3.5" /> },
  ];

const STATUS_TONE: Record<ProspectStatus, string> = {
  pending: 'text-evari-dim bg-evari-surfaceSoft',
  sent: 'bg-sky-400 text-evari-ink',
  replied_positive: 'bg-evari-success text-evari-ink',
  replied_neutral: 'text-evari-dim bg-evari-surfaceSoft',
  replied_negative: 'bg-evari-danger text-white',
  no_reply: 'bg-evari-warn text-evari-goldInk',
  bounced: 'bg-evari-danger text-white',
  qualified: 'bg-evari-gold text-evari-goldInk',
  archived: 'text-evari-dimmer bg-evari-surfaceSoft',
};

type SortKey = 'quality' | 'recent' | 'oldest' | 'status';

export function ProspectsClient({
  initialProspects,
}: {
  initialProspects: Prospect[];
}) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [activeStatuses, setActiveStatuses] = useState<Set<ProspectStatus>>(
    new Set(STATUSES.map((s) => s.key)),
  );
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('quality');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [synopsisLoading, setSynopsisLoading] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const confirm = useConfirm();

  // --- Derived ------------------------------------------------------------
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUSES) c[s.key] = 0;
    for (const p of prospects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [prospects]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of prospects) {
      const key = (p.category ?? '').trim() || 'Uncategorised';
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [prospects]);

  const categoryKeys = useMemo(
    () =>
      Object.keys(categoryCounts).sort((a, b) => {
        if (a === 'Uncategorised') return 1;
        if (b === 'Uncategorised') return -1;
        return a.localeCompare(b);
      }),
    [categoryCounts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const catFilterOn = activeCategories.size > 0;
    return prospects.filter((p) => {
      if (!activeStatuses.has(p.status)) return false;
      if (catFilterOn) {
        const key = (p.category ?? '').trim() || 'Uncategorised';
        if (!activeCategories.has(key)) return false;
      }
      if (q) {
        const hay = [
          p.name,
          p.org ?? '',
          p.email ?? '',
          p.role ?? '',
          p.sourceDetail ?? '',
          p.category ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [prospects, search, activeStatuses, activeCategories]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    switch (sortBy) {
      case 'quality':
        out.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
        break;
      case 'recent':
        out.sort((a, b) => +new Date(b.lastTouchAt ?? b.createdAt) - +new Date(a.lastTouchAt ?? a.createdAt));
        break;
      case 'oldest':
        out.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        break;
      case 'status':
        out.sort((a, b) => a.status.localeCompare(b.status));
        break;
    }
    return out;
  }, [filtered, sortBy]);

  // --- Mutations ----------------------------------------------------------
  function toggleStatus(s: ProspectStatus) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleCategory(key: string) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateStatus(id: string, status: ProspectStatus) {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  function mark(id: string, set: 'action' | 'synopsis', on: boolean) {
    const setter = set === 'action' ? setActionLoading : setSynopsisLoading;
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function promoteToLead(p: Prospect) {
    const ok = await confirm({
      title: 'Promote ' + p.name + ' to Lead?',
      description:
        'Flips this row from the Prospect tier to the Lead tier. It will ' +
        'disappear from this view and appear on /leads under the ' +
        '"' + (p.category ?? 'Uncategorised') + '" funnel.',
      confirmLabel: 'Promote',
    });
    if (!ok) return;
    mark(p.id, 'action', true);
    try {
      const res = await fetch('/api/leads/' + p.id + '/promote', {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || 'Promote failed');
      // The Lead is no longer tier=prospect — drop it from this list.
      setProspects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      console.warn('promote failed', err);
      updateStatus(p.id, 'qualified');
    } finally {
      mark(p.id, 'action', false);
    }
  }

  async function archive(p: Prospect) {
    const ok = await confirm({
      title: 'Archive prospect?',
      description: p.name + ' will be moved to archived. Their outreach history stays on record.',
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;
    mark(p.id, 'action', true);
    try {
      const res = await fetch('/api/leads/' + p.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospectStatus: 'archived' }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || 'Archive failed');
      updateStatus(p.id, 'archived');
    } catch (err) {
      console.warn('archive failed', err);
      updateStatus(p.id, 'archived');
    } finally {
      mark(p.id, 'action', false);
    }
  }


  async function commitCategoryRename() {
    const from = renamingCategory;
    const to = renameValue.trim();
    if (!from) return;
    if (!to || to === from) {
      setRenamingCategory(null);
      setRenameValue('');
      return;
    }
    setBusyCategory(from);
    try {
      const res = await fetch('/api/leads/category', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, tier: 'prospect' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        renamed?: number;
        error?: string;
      };
      if (res.ok) {
        setProspects((prev) =>
          prev.map((p) =>
            ((p.category ?? '').trim() || 'Uncategorised') === from
              ? { ...p, category: to }
              : p,
          ),
        );
        setActiveCategories((prev) => {
          if (!prev.has(from)) return prev;
          const next = new Set(prev);
          next.delete(from);
          next.add(to);
          return next;
        });
      } else {
        console.warn('rename folder failed', data.error);
      }
    } catch (err) {
      console.warn('rename folder failed', err);
    } finally {
      setBusyCategory(null);
      setRenamingCategory(null);
      setRenameValue('');
    }
  }

  async function deleteCategory(category: string) {
    const count = categoryCounts[category] ?? 0;
    const ok = await confirm({
      title: 'Delete "' + category + '" folder?',
      description:
        'Permanently deletes ' +
        count +
        ' prospect' +
        (count === 1 ? '' : 's') +
        ' in this folder. This cannot be undone.',
      confirmLabel: 'Delete folder',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyCategory(category);
    try {
      const res = await fetch('/api/leads/category', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category, tier: 'prospect' }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        deleted?: number;
        error?: string;
      };
      if (res.ok) {
        setProspects((prev) =>
          prev.filter(
            (p) =>
              ((p.category ?? '').trim() || 'Uncategorised') !== category,
          ),
        );
        setActiveCategories((prev) => {
          if (!prev.has(category)) return prev;
          const next = new Set(prev);
          next.delete(category);
          return next;
        });
      } else {
        console.warn('delete folder failed', data.error);
      }
    } catch (err) {
      console.warn('delete folder failed', err);
    } finally {
      setBusyCategory(null);
    }
  }

  async function toggleExpand(p: Prospect) {
    const isOpen = expandedIds.has(p.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    if (!isOpen && !p.synopsis && !synopsisLoading.has(p.id)) {
      mark(p.id, 'synopsis', true);
      try {
        const res = await fetch('/api/leads/' + p.id + '/synopsis', {
          method: 'POST',
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          synopsis?: string;
          orgProfile?: Prospect['orgProfile'];
          error?: string;
        };
        if (data.ok && data.synopsis) {
          setProspects((prev) =>
            prev.map((x) =>
              x.id === p.id
                ? {
                    ...x,
                    synopsis: data.synopsis,
                    synopsisGeneratedAt: new Date().toISOString(),
                    orgProfile: data.orgProfile ?? x.orgProfile,
                  }
                : x,
            ),
          );
        }
      } catch (err) {
        console.warn('synopsis failed', err);
      } finally {
        mark(p.id, 'synopsis', false);
      }
    }
  }

  const allSelected = activeStatuses.size === STATUSES.length;
  const noneSelected = activeStatuses.size === 0;

  return (
    <div className="flex gap-5 p-6">
      {/* Left filter sidebar */}
      <aside className="w-56 shrink-0">
        <div className="sticky top-4 space-y-5">
          {/* All prospects */}
          <div>
            <button
              type="button"
              onClick={() => {
                setActiveStatuses(new Set(STATUSES.map((s) => s.key)));
                setSearch('');
              }}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors text-left',
                allSelected && !search
                  ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
              )}
            >
              <Inbox className="h-4 w-4 shrink-0" />
              <span className="flex-1">All prospects</span>
              <CountPill n={prospects.length} />
            </button>
          </div>

          {/* Status section */}
          <div>
            <div className="flex items-center justify-between px-1 pb-1.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
                Status
              </div>
              <div className="inline-flex items-center gap-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() =>
                    setActiveStatuses(new Set(STATUSES.map((s) => s.key)))
                  }
                  disabled={allSelected}
                  className={cn(
                    'px-1.5 py-0.5 rounded transition-colors',
                    allSelected
                      ? 'text-evari-text bg-evari-surfaceSoft'
                      : 'text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft',
                  )}
                >
                  All
                </button>
                <span className="text-evari-dimmer">·</span>
                <button
                  type="button"
                  onClick={() => setActiveStatuses(new Set())}
                  disabled={noneSelected}
                  className={cn(
                    'px-1.5 py-0.5 rounded transition-colors',
                    noneSelected
                      ? 'text-evari-text bg-evari-surfaceSoft'
                      : 'text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft',
                  )}
                >
                  None
                </button>
              </div>
            </div>
            <div className="space-y-0.5">
              {STATUSES.map((s) => {
                const count = statusCounts[s.key] ?? 0;
                if (count === 0) return null;
                const active = activeStatuses.has(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleStatus(s.key)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors text-left',
                      active
                        ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0',
                        active ? 'text-evari-text' : 'text-evari-dimmer',
                      )}
                    >
                      {s.icon}
                    </span>
                    <span className="flex-1 truncate">{s.label}</span>
                    <CountPill n={count} />
                  </button>
                );
              })}
            </div>
          </div>

          {categoryKeys.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-1 pb-1.5">
                <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
                  Funnel
                </div>
                {activeCategories.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategories(new Set())}
                    className="text-[10px] text-evari-dim hover:text-evari-text px-1.5 py-0.5 rounded hover:bg-evari-surfaceSoft"
                  >
                    clear
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {categoryKeys.map((key) => {
                  const count = categoryCounts[key];
                  const active = activeCategories.has(key);
                  const renaming = renamingCategory === key;
                  const busy = busyCategory === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        'group relative flex items-center rounded-md transition-colors',
                        active
                          ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                          : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
                      )}
                    >
                      {renaming ? (
                        <div className="flex-1 flex items-center gap-2 px-3 py-1 text-sm">
                          <Folder className="h-3.5 w-3.5 shrink-0 text-evari-dimmer" />
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitCategoryRename();
                              if (e.key === 'Escape') {
                                setRenamingCategory(null);
                                setRenameValue('');
                              }
                            }}
                            onBlur={() => void commitCategoryRename()}
                            className="flex-1 min-w-0 bg-transparent text-sm text-evari-text outline-none border-b border-evari-gold/60 focus:border-evari-gold"
                          />
                          {busy && (
                            <Loader2 className="h-3 w-3 animate-spin text-evari-dim" />
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleCategory(key)}
                            className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-1.5 text-sm text-left"
                          >
                            <Folder
                              className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                active ? 'text-evari-text' : 'text-evari-dimmer',
                              )}
                            />
                            <span className="flex-1 truncate">{key}</span>
                            <CountPill n={count} />
                          </button>
                          <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingCategory(key);
                                setRenameValue(key);
                              }}
                              disabled={busy || key === 'Uncategorised'}
                              title={
                                key === 'Uncategorised'
                                  ? 'Cannot rename Uncategorised'
                                  : 'Rename folder'
                              }
                              className="h-6 w-6 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surface/60 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteCategory(key);
                              }}
                              disabled={busy}
                              title="Delete folder + all prospects inside"
                              className="h-6 w-6 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surface/60 disabled:opacity-30"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 space-y-5">
        <div className="rounded-xl bg-evari-surface p-5 space-y-2">
          <div className="text-sm font-medium text-evari-text">
            Testing layer
          </div>
          <p className="text-sm text-evari-dim leading-relaxed max-w-3xl">
            Targets from Campaigns who've had a first-touch outreach. They sit
            here while signals come back — delivery, opens, replies, sentiment
            — and only graduate to <strong className="text-evari-text">Leads</strong>{' '}
            once they pass the quality bar. Keeps the Leads pipeline clean.
          </p>
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <Input
              placeholder="Search name, org, email, source…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown className="h-3.5 w-3.5 text-evari-dimmer" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-evari-surfaceSoft rounded-md px-2 py-1.5 text-xs text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
            >
              <option value="quality">Highest quality</option>
              <option value="recent">Most recent touch</option>
              <option value="oldest">Oldest</option>
              <option value="status">By status</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-evari-dim">
          <span>
            Showing {sorted.length} of {prospects.length}
          </span>
          {(!allSelected || search) && (
            <button
              type="button"
              onClick={() => {
                setActiveStatuses(new Set(STATUSES.map((s) => s.key)));
                setSearch('');
              }}
              className="inline-flex items-center gap-1 text-evari-dim hover:text-evari-text"
            >
              <X className="h-3 w-3" />
              reset filters
            </button>
          )}
        </div>

        {/* Prospect rows */}
        <ul className="space-y-1">
          {sorted.map((p) => {
            const expanded = expandedIds.has(p.id);
            const loadingSynopsis = synopsisLoading.has(p.id);
            const loadingAction = actionLoading.has(p.id);
            return (
            <li
              key={p.id}
              className="bg-evari-surface/60 rounded-md p-4 space-y-3"
            >
              <div
                className="flex items-start justify-between gap-3 cursor-pointer"
                onClick={() => void toggleExpand(p)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void toggleExpand(p);
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleExpand(p);
                      }}
                      title={expanded ? 'Collapse' : 'Expand'}
                      className="h-5 w-5 -ml-1 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                    >
                      {expanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <div className="text-sm font-medium text-evari-text">
                      {p.name}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5',
                        STATUS_TONE[p.status],
                      )}
                    >
                      {p.status.replace(/_/g, ' ')}
                    </span>
                    {p.category && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-evari-dim bg-evari-surfaceSoft rounded-full px-2 py-0.5"
                        title={'Funnel: ' + p.category}
                      >
                        <Folder className="h-2.5 w-2.5" />
                        {p.category}
                      </span>
                    )}
                    <QualityPill score={p.qualityScore ?? 0} />
                  </div>
                  <div className="text-xs text-evari-dim mt-0.5">
                    {p.role}
                    {p.org ? ' · ' + p.org : ''}
                    {p.email ? (
                      <span className="font-mono text-evari-dimmer">
                        {' · ' + p.email}
                        {p.emailInferred && (
                          <span
                            className="ml-1 text-evari-warn"
                            title="Email was inferred — verify before sending"
                          >
                            (inferred)
                          </span>
                        )}
                      </span>
                    ) : null}
                  </div>
                  {p.sourceDetail && (
                    <div className="text-[10px] text-evari-dimmer mt-1">
                      from {p.sourceDetail}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {p.status !== 'qualified' &&
                    p.status !== 'archived' &&
                    p.status !== 'bounced' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void promoteToLead(p);
                        }}
                        disabled={loadingAction}
                      >
                        {loadingAction ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                        Promote to Lead
                      </Button>
                    )}
                  {p.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void archive(p);
                      }}
                      disabled={loadingAction}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft disabled:opacity-50"
                      title="Archive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="rounded-md bg-evari-ink/40 p-3 space-y-3">
                  {p.orgProfile && (
                    <div className="space-y-1.5 pb-2 border-b border-evari-line/40">
                      <div className="flex items-center gap-3 text-[11px] text-evari-dim">
                        {p.orgProfile.orgType && (
                          <span className="inline-flex items-center gap-1 capitalize">
                            <Briefcase className="h-3 w-3 text-evari-dimmer" />
                            {p.orgProfile.orgType}
                          </span>
                        )}
                        {(p.orgProfile.employeeCount ?? p.orgProfile.employeeRange) && (
                          <span className="inline-flex items-center gap-1">
                            <Users2 className="h-3 w-3 text-evari-dimmer" />
                            {p.orgProfile.employeeCount
                              ? p.orgProfile.employeeCount.toLocaleString() + ' employees'
                              : p.orgProfile.employeeRange + ' employees'}
                          </span>
                        )}
                      </div>
                      {p.orgProfile.leaders && p.orgProfile.leaders.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1">
                            {p.orgProfile.orgType === 'club' ||
                            p.orgProfile.orgType === 'nonprofit'
                              ? 'Management team'
                              : p.orgProfile.orgType === 'practice'
                                ? 'Partners'
                                : 'C-suite'}
                          </div>
                          <ul className="space-y-0.5">
                            {p.orgProfile.leaders.map((l, i) => (
                              <li
                                key={l.name + i}
                                className="text-[11px] text-evari-text flex items-baseline gap-1.5"
                              >
                                <span className="font-medium">{l.name}</span>
                                {l.jobTitle && (
                                  <span className="text-evari-dim">— {l.jobTitle}</span>
                                )}
                                {l.linkedinUrl && (
                                  <a
                                    href={l.linkedinUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-evari-gold hover:text-evari-text"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                    <Sparkles className="h-3 w-3" />
                    Synopsis
                    {loadingSynopsis && (
                      <Loader2 className="h-3 w-3 animate-spin text-evari-dim" />
                    )}
                  </div>
                  {p.synopsis ? (
                    <p className="text-xs text-evari-text leading-relaxed whitespace-pre-wrap">
                      {p.synopsis}
                    </p>
                  ) : loadingSynopsis ? (
                    <p className="text-xs text-evari-dim italic">
                      Claude is reading what we know and drafting a summary…
                    </p>
                  ) : (
                    <p className="text-xs text-evari-dimmer italic">
                      No synopsis yet.
                    </p>
                  )}
                  {(p.companyUrl || p.linkedinUrl || p.address) && (
                    <div className="flex flex-wrap items-center gap-3 text-[11px] pt-1">
                      {p.companyUrl && (
                        <a
                          href={p.companyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-evari-gold hover:text-evari-text"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          Website
                        </a>
                      )}
                      {p.linkedinUrl && (
                        <a
                          href={p.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-evari-gold hover:text-evari-text"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          LinkedIn
                        </a>
                      )}
                      {p.address && (
                        <span className="text-evari-dim">{p.address}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Signals strip */}
              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                <Signal label="Valid" on={p.signals?.emailValid} />
                <Signal label="Opened" on={p.signals?.opened} />
                <Signal label="Clicked" on={p.signals?.clicked} />
                <Signal label="Replied" on={p.signals?.replied} />
                {p.signals?.sentiment && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full',
                      p.signals.sentiment === 'positive'
                        ? 'bg-evari-success text-evari-ink'
                        : p.signals.sentiment === 'negative'
                          ? 'bg-evari-danger text-white'
                          : 'bg-evari-surfaceSoft text-evari-dim',
                    )}
                  >
                    {p.signals.sentiment === 'positive' ? (
                      <ThumbsUp className="h-2.5 w-2.5" />
                    ) : p.signals.sentiment === 'negative' ? (
                      <ThumbsDown className="h-2.5 w-2.5" />
                    ) : (
                      <Meh className="h-2.5 w-2.5" />
                    )}
                    {p.signals.sentiment}
                  </span>
                )}
                <span className="ml-auto text-evari-dimmer tabular-nums">
                  {p.lastTouchAt ? relativeTime(p.lastTouchAt) : 'never'}
                </span>
              </div>

              {/* Outreach excerpt */}
              {p.outreach[0]?.replyExcerpt && (
                <div className="rounded-md bg-evari-ink/60 p-3 text-xs italic text-evari-dim leading-relaxed">
                  {p.outreach[0].replyExcerpt}
                </div>
              )}

              {p.notes && (
                <div className="text-[11px] text-evari-dimmer italic">
                  {p.notes}
                </div>
              )}
            </li>
            );
          })}
        </ul>

        {sorted.length === 0 && (
          <div className="rounded-md bg-evari-surface/60 p-10 text-center">
            <div className="text-sm text-evari-dim">No prospects match.</div>
          </div>
        )}
      </main>
    </div>
  );
}

function Signal({ label, on }: { label: string; on?: boolean }) {
  if (on === undefined) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px]',
        on
          ? 'bg-evari-success text-evari-ink'
          : 'bg-evari-surfaceSoft text-evari-dimmer',
      )}
    >
      {on ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
      {label}
    </span>
  );
}

function QualityPill({ score }: { score: number }) {
  const barColor =
    score >= 75
      ? 'bg-evari-success'
      : score >= 50
        ? 'bg-evari-gold'
        : score > 0
          ? 'bg-evari-dim'
          : 'bg-evari-danger';
  const numberColor =
    score >= 75
      ? 'text-evari-success'
      : score >= 50
        ? 'text-evari-gold'
        : score > 0
          ? 'text-evari-dim'
          : 'text-evari-danger';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-evari-surfaceSoft tabular-nums"
      title={`Quality score ${score} / 100`}
    >
      <span className={cn('leading-none', numberColor)}>{score}</span>
      <span className="text-evari-dimmer font-normal">/100</span>
      <span className="w-8 h-1 rounded-full bg-evari-surface/60 overflow-hidden shrink-0">
        <span
          className={cn('block h-full rounded-full transition-all', barColor)}
          style={{ width: Math.max(2, Math.min(100, score)) + '%' }}
        />
      </span>
    </span>
  );
}

function CountPill({ n }: { n: number }) {
  if (n === 0) return null;
  const pad =
    n >= 10000 ? 'px-2.5' : n >= 1000 ? 'px-2' : n >= 100 ? 'px-1.5' : 'px-1';
  return (
    <span
      className={
        'inline-flex items-center justify-center h-5 min-w-[20px] text-[10px] tabular-nums rounded-full bg-evari-surface/60 text-evari-dimmer ' +
        pad
      }
    >
      {n.toLocaleString()}
    </span>
  );
}
