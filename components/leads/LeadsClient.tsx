'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Pencil,
  Trash2,
  Search as SearchIcon,
  ArrowUpDown,
  X,
  Users,
  Layers,
  Inbox,
} from 'lucide-react';
import { StageBadge } from '@/components/leads/StageBadge';
import {
  SourceBadge,
  SOURCE_CATEGORY_META,
  SOURCE_CATEGORY_ORDER,
} from '@/components/leads/SourceBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatGBP, relativeTime, cn } from '@/lib/utils';
import {
  sourceCategoryFor,
  type Lead,
  type LeadStage,
  type LeadSourceCategory,
} from '@/lib/types';

const STAGES: LeadStage[] = [
  'new',
  'contacted',
  'discovery',
  'configuring',
  'quoted',
  'won',
  'lost',
  'cold',
];

type SortKey = 'newest' | 'oldest' | 'lastTouch' | 'value' | 'stage';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'lastTouch', label: 'Last touch' },
  { value: 'value', label: 'Highest value' },
  { value: 'stage', label: 'By stage' },
];

export function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [editing, setEditing] = useState<Lead | null>(null);
  const confirm = useConfirm();

  // --- Filter state --------------------------------------------------------
  // Default: every option ticked = everything visible. Click to exclude.
  // "All" ticks every option. "None" unticks every option (clean slate).
  const [search, setSearch] = useState('');
  const [activeCategories, setActiveCategories] = useState<
    Set<LeadSourceCategory>
  >(new Set(SOURCE_CATEGORY_ORDER));
  const [activeStages, setActiveStages] = useState<Set<LeadStage>>(
    new Set(STAGES),
  );
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  function toggleCategory(c: LeadSourceCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }
  function toggleStage(s: LeadStage) {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }
  function allSourcesOn() {
    setActiveCategories(new Set(SOURCE_CATEGORY_ORDER));
  }
  function allSourcesOff() {
    setActiveCategories(new Set());
  }
  function allStagesOn() {
    setActiveStages(new Set(STAGES));
  }
  function allStagesOff() {
    setActiveStages(new Set());
  }
  function resetFilters() {
    setSearch('');
    allSourcesOn();
    allStagesOn();
  }

  // --- Derived -------------------------------------------------------------
  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const k of SOURCE_CATEGORY_ORDER) c[k] = 0;
    for (const l of leads) {
      const cat = l.sourceCategory ?? sourceCategoryFor(l.source);
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [leads]);

  const stageCounts = useMemo(() => {
    return STAGES.reduce<Record<string, number>>((a, s) => {
      a[s] = leads.filter((l) => l.stage === s).length;
      return a;
    }, {});
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      const cat = l.sourceCategory ?? sourceCategoryFor(l.source);
      if (!activeCategories.has(cat)) return false;
      if (!activeStages.has(l.stage)) return false;
      if (q) {
        const hay = [
          l.fullName,
          l.email,
          l.location ?? '',
          l.productInterest ?? '',
          l.sourceDetail ?? '',
          l.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, activeCategories, activeStages]);

  const sorted = useMemo(() => {
    const stageOrder: Record<string, number> = {
      new: 0,
      configuring: 1,
      discovery: 2,
      quoted: 3,
      contacted: 4,
      won: 5,
      cold: 6,
      lost: 7,
    };
    const out = [...filtered];
    switch (sortBy) {
      case 'newest':
        out.sort(
          (a, b) => +new Date(b.firstSeenAt) - +new Date(a.firstSeenAt),
        );
        break;
      case 'oldest':
        out.sort(
          (a, b) => +new Date(a.firstSeenAt) - +new Date(b.firstSeenAt),
        );
        break;
      case 'lastTouch':
        out.sort(
          (a, b) => +new Date(b.lastTouchAt) - +new Date(a.lastTouchAt),
        );
        break;
      case 'value':
        out.sort(
          (a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0),
        );
        break;
      case 'stage':
        out.sort((a, b) => {
          if (stageOrder[a.stage] !== stageOrder[b.stage])
            return stageOrder[a.stage] - stageOrder[b.stage];
          return (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0);
        });
        break;
    }
    return out;
  }, [filtered, sortBy]);

  const totalValue = leads
    .filter((l) => !['won', 'lost', 'cold'].includes(l.stage))
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);

  // --- Mutations -----------------------------------------------------------
  async function deleteLead(lead: Lead) {
    const ok = await confirm({
      title: 'Delete lead?',
      description: `${lead.fullName} will be removed permanently.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
  }

  function updateLead(
    id: string,
    changes: Partial<
      Pick<
        Lead,
        | 'fullName'
        | 'email'
        | 'phone'
        | 'stage'
        | 'estimatedValue'
        | 'productInterest'
        | 'location'
        | 'sourceDetail'
      >
    >,
  ) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, ...changes, lastTouchAt: new Date().toISOString() }
          : l,
      ),
    );
    setEditing(null);
  }

  const allSourcesSelected = activeCategories.size === SOURCE_CATEGORY_ORDER.length;
  const allStagesSelected = activeStages.size === STAGES.length;
  const filtersActive = !allSourcesSelected || !allStagesSelected;

  return (
    <div className="flex gap-5 p-6 max-w-[1400px]">
      {/* Left filter sidebar — matches Tasks page pattern */}
      <aside className="w-56 shrink-0">
        <div className="sticky top-4 space-y-5">
          {/* All leads entry — resets both sections to "all on" */}
          <div>
            <button
              type="button"
              onClick={resetFilters}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors text-left',
                !filtersActive
                  ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'text-evari-dim hover:bg-evari-surface/60 hover:text-evari-text',
              )}
            >
              <Inbox className="h-4 w-4 shrink-0" />
              <span className="flex-1">All leads</span>
              <CountPill n={leads.length} />
            </button>
          </div>

          {/* Source section */}
          <FilterSection
            label="Source"
            icon={<Users className="h-3 w-3" />}
            onAllOn={allSourcesOn}
            onAllOff={allSourcesOff}
            allSelected={allSourcesSelected}
            noneSelected={activeCategories.size === 0}
          >
            {SOURCE_CATEGORY_ORDER.map((c) => {
              const count = categoryCounts[c] ?? 0;
              if (count === 0) return null;
              const meta = SOURCE_CATEGORY_META[c];
              const Icon = meta.Icon;
              const active = activeCategories.has(c);
              return (
                <FilterRow
                  key={c}
                  icon={<Icon className="h-4 w-4" />}
                  label={meta.label}
                  count={count}
                  active={active}
                  onClick={() => toggleCategory(c)}
                />
              );
            })}
          </FilterSection>

          {/* Stage section */}
          <FilterSection
            label="Stage"
            icon={<Layers className="h-3 w-3" />}
            onAllOn={allStagesOn}
            onAllOff={allStagesOff}
            allSelected={allStagesSelected}
            noneSelected={activeStages.size === 0}
          >
            {STAGES.map((s) => {
              const count = stageCounts[s] ?? 0;
              if (count === 0) return null;
              const active = activeStages.has(s);
              return (
                <FilterRow
                  key={s}
                  icon={<StageDot stage={s} />}
                  label={s}
                  capitalize
                  count={count}
                  active={active}
                  onClick={() => toggleStage(s)}
                />
              );
            })}
          </FilterSection>
        </div>
      </aside>

      {/* Main list */}
      <main className="flex-1 min-w-0 space-y-5">
        {/* Pipeline summary */}
        <div className="rounded-xl bg-evari-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Open pipeline
            </div>
            <div className="text-sm font-mono tabular-nums text-evari-text">
              {formatGBP(totalValue)}
            </div>
          </div>
          <div className="flex gap-1.5">
            {STAGES.filter((s) => !['lost', 'cold'].includes(s)).map((s) => {
              const total = leads.filter(
                (l) => !['lost', 'cold'].includes(l.stage),
              ).length;
              const pct = total ? (stageCounts[s] / total) * 100 : 0;
              return (
                <div
                  key={s}
                  className="flex-1 h-2 rounded-full bg-evari-edge overflow-hidden"
                  title={s + ': ' + stageCounts[s]}
                >
                  <div
                    className="h-full bg-evari-gold"
                    style={{ width: pct + '%' }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Search + sort + result count */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
            <Input
              placeholder="Search name, email, location, interest, source, tag…"
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
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-evari-dim gap-3">
          <span className="shrink-0">
            Showing {sorted.length} of {leads.length}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-evari-dim hover:text-evari-text shrink-0"
            >
              <X className="h-3 w-3" />
              reset filters
            </button>
          )}
        </div>

        {/* List */}
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            <div className="col-span-4">Lead</div>
            <div className="col-span-3">Interest</div>
            <div className="col-span-2">Source</div>
            <div className="col-span-1 text-right">Value</div>
            <div className="col-span-1 text-right">First seen</div>
            <div className="col-span-1 text-right">Stage</div>
          </div>

          <ul className="space-y-1">
            {sorted.map((l) => (
              <li
                key={l.id}
                className="group relative bg-evari-surface/60 rounded-md hover:bg-evari-surface transition-colors"
              >
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    aria-label="Edit lead"
                    title="Edit"
                    onClick={() => setEditing(l)}
                    className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    aria-label="Delete lead"
                    title="Delete"
                    onClick={() => void deleteLead(l)}
                    className="h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                <Link
                  href={'/leads/' + l.id}
                  className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center rounded-md pr-12"
                >
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-evari-surfaceSoft flex items-center justify-center text-[10px] text-evari-dim font-medium uppercase shrink-0">
                      {l.fullName
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-evari-text truncate">
                        {l.fullName}
                      </div>
                      <div className="text-xs text-evari-dim truncate">
                        {l.email}
                        {l.location ? ' · ' + l.location : ''}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3 text-xs text-evari-dim truncate">
                    {l.productInterest ?? (
                      <span className="italic text-evari-dimmer">
                        unspecified
                      </span>
                    )}
                    {l.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {l.tags.slice(0, 2).map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[9px] py-0"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 min-w-0">
                    <SourceBadge source={l.source} />
                    {l.sourceDetail && (
                      <div className="text-[10px] text-evari-dimmer truncate mt-0.5">
                        {l.sourceDetail}
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 text-right text-xs font-mono tabular-nums text-evari-text">
                    {l.estimatedValue ? formatGBP(l.estimatedValue) : '—'}
                  </div>
                  <div className="col-span-1 text-right text-xs text-evari-dim font-mono tabular-nums">
                    {relativeTime(l.firstSeenAt)}
                  </div>
                  <div className="col-span-1 flex justify-end items-center gap-1.5">
                    <StageBadge stage={l.stage} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {sorted.length === 0 && (
            <div className="rounded-md bg-evari-surface/60 p-10 text-center">
              <div className="text-sm text-evari-dim">No leads match.</div>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-2 text-xs text-evari-gold hover:text-evari-text"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Edit dialog */}
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit lead</DialogTitle>
            </DialogHeader>
            <LeadEditForm
              lead={editing}
              onSubmit={(changes) => updateLead(editing.id, changes)}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sidebar sub-components

function FilterSection({
  label,
  icon,
  onAllOn,
  onAllOff,
  allSelected,
  noneSelected,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  onAllOn: () => void;
  onAllOff: () => void;
  allSelected: boolean;
  noneSelected: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="inline-flex items-center gap-0.5 text-[10px]">
          <button
            type="button"
            onClick={onAllOn}
            disabled={allSelected}
            className={cn(
              'px-1.5 py-0.5 rounded transition-colors',
              allSelected
                ? 'text-evari-text bg-evari-surfaceSoft'
                : 'text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft',
            )}
            title="Turn every option on"
          >
            All
          </button>
          <span className="text-evari-dimmer">·</span>
          <button
            type="button"
            onClick={onAllOff}
            disabled={noneSelected}
            className={cn(
              'px-1.5 py-0.5 rounded transition-colors',
              noneSelected
                ? 'text-evari-text bg-evari-surfaceSoft'
                : 'text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft',
            )}
            title="Turn every option off"
          >
            None
          </button>
        </div>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterRow({
  icon,
  label,
  count,
  active,
  onClick,
  capitalize,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  capitalize?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        {icon}
      </span>
      <span className={cn('flex-1 truncate', capitalize && 'capitalize')}>
        {label}
      </span>
      <CountPill n={count} />
    </button>
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

function StageDot({ stage }: { stage: LeadStage }) {
  const tone: Record<LeadStage, string> = {
    new: 'bg-evari-warn',
    contacted: 'bg-sky-400',
    discovery: 'bg-evari-gold',
    configuring: 'bg-evari-gold',
    quoted: 'bg-evari-gold',
    won: 'bg-evari-success',
    lost: 'bg-evari-dimmer',
    cold: 'bg-evari-dimmer',
  };
  return <span className={cn('h-2 w-2 rounded-full', tone[stage])} />;
}

// ----------------------------------------------------------------------------
// Edit form (unchanged)

function LeadEditForm({
  lead,
  onSubmit,
  onCancel,
}: {
  lead: Lead;
  onSubmit: (
    changes: Partial<
      Pick<
        Lead,
        | 'fullName'
        | 'email'
        | 'phone'
        | 'stage'
        | 'estimatedValue'
        | 'productInterest'
        | 'location'
        | 'sourceDetail'
      >
    >,
  ) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(lead.fullName);
  const [email, setEmail] = useState(lead.email);
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [location, setLocation] = useState(lead.location ?? '');
  const [productInterest, setProductInterest] = useState(
    lead.productInterest ?? '',
  );
  const [sourceDetail, setSourceDetail] = useState(lead.sourceDetail ?? '');
  const [stage, setStage] = useState<LeadStage>(lead.stage);
  const [estimatedValue, setEstimatedValue] = useState(
    lead.estimatedValue?.toString() ?? '',
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      location: location.trim() || undefined,
      productInterest: productInterest.trim() || undefined,
      sourceDetail: sourceDetail.trim() || undefined,
      stage,
      estimatedValue: estimatedValue
        ? Number(estimatedValue.replace(/[^0-9.]/g, '')) || undefined
        : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Location">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <Field label="Product interest">
          <Input
            value={productInterest}
            onChange={(e) => setProductInterest(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Source detail (who / where from)">
        <Input
          value={sourceDetail}
          onChange={(e) => setSourceDetail(e.target.value)}
          placeholder="e.g. Whitfield Cyclery, Oxford — or Dr Sarah Mitchell, Aurora Physio"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as LeadStage)}
            className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimated value (£)">
          <Input
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            placeholder="e.g. 8500"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="primary">
          Save changes
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}
