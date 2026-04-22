'use client';

import { useState } from 'react';
import {
  MapPin,
  Briefcase,
  Hash,
  Building2,
  Users2,
  Sparkles,
  BookmarkCheck,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoverFilters, DiscoverFilterGroup } from '@/lib/types';

/**
 * Left column of /discover. Mirrors the filters column from the reference UI:
 * each group has an include list (chips) and an exclude list (chips), plus
 * bespoke controls for size bands, year range, saved-only, etc.
 */
interface Props {
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
  /** Called when the user submits the AI refine prompt. */
  onAiRefine: (prompt: string) => Promise<void> | void;
  /** Wipe every filter back to an empty state. */
  onClearAll: () => void;
  aiBusy?: boolean;
}

const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'];
const COMPANY_TYPES = ['corporation', 'club', 'nonprofit', 'practice', 'other'];

export function DiscoverFilters({ filters, onChange, onAiRefine, onClearAll, aiBusy = false }: Props) {
  const [aiPrompt, setAiPrompt] = useState('');

  function setGroup(key: 'location' | 'industry' | 'keywords' | 'companyName' | 'companyType', next: DiscoverFilterGroup) {
    onChange({ ...filters, [key]: next });
  }

  const hasAnyFilters =
    (filters.location?.include?.length ?? 0) > 0 ||
    (filters.location?.exclude?.length ?? 0) > 0 ||
    (filters.industry?.include?.length ?? 0) > 0 ||
    (filters.industry?.exclude?.length ?? 0) > 0 ||
    (filters.keywords?.include?.length ?? 0) > 0 ||
    (filters.keywords?.exclude?.length ?? 0) > 0 ||
    (filters.companyName?.include?.length ?? 0) > 0 ||
    (filters.companyName?.exclude?.length ?? 0) > 0 ||
    (filters.companyType?.include?.length ?? 0) > 0 ||
    (filters.sizeBands?.length ?? 0) > 0 ||
    (filters.similarTo?.length ?? 0) > 0 ||
    Boolean(filters.savedOnly);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Sticky header with global clear */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-evari-surface border-b border-evari-line/40 px-4 py-3">
        <div className="flex items-center gap-3 text-sm text-evari-text">
          Filters
        </div>
        <button
          type="button"
          onClick={() => onClearAll()}
          disabled={!hasAnyFilters}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-evari-dim"
          title="Clear every filter"
        >
          <RotateCcw className="h-3 w-3" />
          Clear all
        </button>
      </div>

      {/* AI refine */}
      <Section title="AI refine" icon={<Sparkles className="h-4 w-4" />} defaultOpen>
        <div className="space-y-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            placeholder="UK-based sports clubs between 50 and 200 people, drop anything in London"
            className="w-full rounded-lg bg-white border border-evari-line/40 px-3 py-2.5 text-[13px] text-evari-ink placeholder:text-evari-dimmer focus:outline-none focus:border-evari-accent shadow-sm resize-none"
          />
          <button
            type="button"
            disabled={aiBusy || !aiPrompt.trim()}
            onClick={async () => {
              const p = aiPrompt.trim();
              if (!p) return;
              await onAiRefine(p);
              setAiPrompt('');
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-evari-gold px-3 py-2.5 text-[13px] font-semibold text-evari-goldInk hover:bg-evari-gold/90 disabled:opacity-40 shadow-sm"
          >
            {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Refine filters
          </button>
        </div>
      </Section>

      {/* Saved / similar */}
      <Section title="Saved & similar" icon={<BookmarkCheck className="h-4 w-4" />}>
        <label className="flex items-center gap-2 text-[12px] text-evari-text">
          <input
            type="checkbox"
            checked={Boolean(filters.savedOnly)}
            onChange={(e) => onChange({ ...filters, savedOnly: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-evari-line/60 accent-evari-accent"
          />
          Only saved companies
        </label>
        <div className="mt-2">
          <ChipInput
            label="Similar to (domains)"
            values={filters.similarTo ?? []}
            onChange={(next) => onChange({ ...filters, similarTo: next })}
            placeholder="evari.cc"
          />
        </div>
      </Section>

      <IncludeExcludeSection
        title="Location"
        icon={<MapPin className="h-4 w-4" />}
        group={filters.location}
        onChange={(g) => setGroup('location', g)}
        placeholder="United Kingdom"
      />
      <IncludeExcludeSection
        title="Industry"
        icon={<Briefcase className="h-4 w-4" />}
        group={filters.industry}
        onChange={(g) => setGroup('industry', g)}
        placeholder="Sports Teams and Clubs"
      />
      <IncludeExcludeSection
        title="Keywords"
        icon={<Hash className="h-4 w-4" />}
        group={filters.keywords}
        onChange={(g) => setGroup('keywords', g)}
        placeholder="mountain biking"
      />
      <IncludeExcludeSection
        title="Company name"
        icon={<Building2 className="h-4 w-4" />}
        group={filters.companyName}
        onChange={(g) => setGroup('companyName', g)}
        placeholder="Acme Sports"
      />

      <Section title="Size" icon={<Users2 className="h-4 w-4" />}>
        <div className="flex flex-wrap gap-1">
          {SIZE_BANDS.map((band) => {
            const on = filters.sizeBands?.includes(band);
            return (
              <button
                key={band}
                type="button"
                onClick={() => {
                  const set = new Set(filters.sizeBands ?? []);
                  if (set.has(band)) set.delete(band);
                  else set.add(band);
                  onChange({ ...filters, sizeBands: Array.from(set) });
                }}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] border transition-colors',
                  on
                    ? 'bg-evari-accent text-evari-ink border-evari-accent'
                    : 'border-evari-line/60 text-evari-dim hover:border-evari-dimmer',
                )}
              >
                {band}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Company type" icon={<Building2 className="h-4 w-4" />}>
        <div className="flex flex-wrap gap-1">
          {COMPANY_TYPES.map((ct) => {
            const on = filters.companyType?.include?.includes(ct);
            return (
              <button
                key={ct}
                type="button"
                onClick={() => {
                  const prev = new Set(filters.companyType?.include ?? []);
                  if (prev.has(ct)) prev.delete(ct);
                  else prev.add(ct);
                  onChange({
                    ...filters,
                    companyType: {
                      include: Array.from(prev),
                      exclude: filters.companyType?.exclude ?? [],
                    },
                  });
                }}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] border capitalize transition-colors',
                  on
                    ? 'bg-evari-accent text-evari-ink border-evari-accent'
                    : 'border-evari-line/60 text-evari-dim hover:border-evari-dimmer',
                )}
              >
                {ct}
              </button>
            );
          })}
        </div>
      </Section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections + inputs
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-evari-line/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-evari-text hover:text-evari-text"
      >
        <span className="text-evari-dim flex items-center justify-center">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-evari-dimmer" /> : <ChevronRight className="h-4 w-4 text-evari-dimmer" />}
      </button>
      {open ? <div className="px-4 pb-4 pt-0.5">{children}</div> : null}
    </div>
  );
}

function IncludeExcludeSection({
  title,
  icon,
  group,
  onChange,
  placeholder,
}: {
  title: string;
  icon: React.ReactNode;
  group: DiscoverFilterGroup | undefined;
  onChange: (next: DiscoverFilterGroup) => void;
  placeholder: string;
}) {
  const include = group?.include ?? [];
  const exclude = group?.exclude ?? [];
  return (
    <Section title={title} icon={icon}>
      <div className="space-y-2">
        <ChipInput
          label="Include"
          values={include}
          onChange={(next) => onChange({ include: next, exclude })}
          placeholder={placeholder}
          tone="include"
        />
        <ChipInput
          label="Exclude"
          values={exclude}
          onChange={(next) => onChange({ include, exclude: next })}
          placeholder={placeholder}
          tone="exclude"
        />
      </div>
    </Section>
  );
}

function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  tone = 'neutral',
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  tone?: 'include' | 'exclude' | 'neutral';
}) {
  const [text, setText] = useState('');
  function add() {
    const t = text.trim();
    if (!t) return;
    if (values.map((v) => v.toLowerCase()).includes(t.toLowerCase())) {
      setText('');
      return;
    }
    onChange([...values, t]);
    setText('');
  }
  return (
    <div>
      {label ? (
        <div className="text-[12px] font-medium text-evari-dim mb-1.5">
          {label}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg bg-white border border-evari-line/40 px-3 py-2.5 text-[13px] text-evari-ink placeholder:text-evari-dimmer focus:outline-none focus:border-evari-accent shadow-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          className="h-[40px] w-[40px] shrink-0 inline-flex items-center justify-center rounded-lg border border-evari-line/40 bg-white text-evari-dim hover:text-evari-accent hover:border-evari-accent disabled:opacity-30 shadow-sm"
          title="Add"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {values.map((v) => (
            <span
              key={v}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                tone === 'include'
                  ? 'bg-evari-success/10 text-evari-success border border-evari-success/30'
                  : tone === 'exclude'
                    ? 'bg-evari-danger/10 text-evari-danger border border-evari-danger/30'
                    : 'bg-evari-surfaceSoft text-evari-dim border border-evari-line/40',
              )}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="opacity-60 hover:opacity-100"
                title="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
