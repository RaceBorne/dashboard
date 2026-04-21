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
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('quality');
  const confirm = useConfirm();

  // --- Derived ------------------------------------------------------------
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STATUSES) c[s.key] = 0;
    for (const p of prospects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [prospects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (!activeStatuses.has(p.status)) return false;
      if (q) {
        const hay = [p.name, p.org ?? '', p.email ?? '', p.role ?? '', p.sourceDetail ?? '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [prospects, search, activeStatuses]);

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

  function updateStatus(id: string, status: ProspectStatus) {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  async function promoteToLead(p: Prospect) {
    const ok = await confirm({
      title: `Promote ${p.name} to Lead?`,
      description: `Creates a Lead record on /leads carrying the campaign source. ${p.name} will be marked as qualified and removed from the active test pool.`,
      confirmLabel: 'Promote',
    });
    if (!ok) return;
    updateStatus(p.id, 'qualified');
    // TODO (when Supabase wires): actually insert into leads table.
  }

  async function archive(p: Prospect) {
    const ok = await confirm({
      title: 'Archive prospect?',
      description: `${p.name} will be moved to archived. Their outreach history stays on record.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;
    updateStatus(p.id, 'archived');
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
          {sorted.map((p) => (
            <li
              key={p.id}
              className="bg-evari-surface/60 rounded-md p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
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
                    <QualityPill score={p.qualityScore ?? 0} />
                  </div>
                  <div className="text-xs text-evari-dim mt-0.5">
                    {p.role}
                    {p.org ? ' · ' + p.org : ''}
                    {p.email ? (
                      <span className="font-mono text-evari-dimmer"> · {p.email}</span>
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
                        onClick={() => void promoteToLead(p)}
                      >
                        <UserCheck className="h-3 w-3" />
                        Promote to Lead
                      </Button>
                    )}
                  {p.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => void archive(p)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
                      title="Archive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

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
          ))}
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
  return (
    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-[10px] tabular-nums rounded-full bg-evari-surface/60 text-evari-dimmer">
      {n > 99 ? '99+' : n}
    </span>
  );
}
