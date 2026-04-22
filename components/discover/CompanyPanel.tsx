'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe,
  Linkedin,
  Facebook,
  Instagram,
  Mail,
  Check,
  X,
  ExternalLink,
  Loader2,
  RefreshCw,
  ChevronDown,
  Filter,
  User2,
  ShieldCheck,
  ShieldOff,
  Search,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoveredCompany, DiscoverEmail, DiscoverSignal } from '@/lib/types';

/**
 * Right-column "company detail" panel — modeled after Hunter.io's company
 * drawer. Shows a hero header (logo / name / email-count pill), a primary
 * CTA row, a two-column company-details block with collapsible keywords,
 * then tabs for Email addresses / Technologies / Signals.
 *
 * The Email addresses tab segments rows into People / Decision makers /
 * Generic and supports an optional picker so operators can check addresses
 * to push into the Prospects table.
 *
 * Used by /discover as the third column; also reusable as a slide-out from
 * Prospects and Leads rows via `mode="overlay"`.
 */
interface Props {
  domain: string;
  company: DiscoveredCompany | null;
  /** Set while an enrichment SSE stream is running. */
  loading?: boolean;
  /** Optional live log from the enrichment stream. */
  log?: string[];
  /** When the panel renders standalone (not inside a grid). */
  mode?: 'inline' | 'overlay';
  onClose?: () => void;
  /** Trigger an enrichment run for this domain. */
  onEnrich?: (opts: { force?: boolean }) => void;
  /** Email picker. When omitted the emails are just listed. */
  picker?: {
    selected: Set<string>;
    onToggle: (email: string) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
  };
  /** Primary CTA — rendered as the big button under the description. */
  actions?: React.ReactNode;
}

type Tab = 'emails' | 'technologies' | 'signals';
type Segment = 'people' | 'decision' | 'generic';

const DECISION_MAKER_RE =
  /\b(ceo|cfo|cto|coo|founder|co-?founder|owner|director|head|chief|president|vp|vice president|managing|partner|principal|chair(man)?)\b/i;

function segmentFor(e: DiscoverEmail): Segment {
  const hasPerson = !!e.name;
  const isDecision = hasPerson && !!e.jobTitle && DECISION_MAKER_RE.test(e.jobTitle);
  if (isDecision) return 'decision';
  if (hasPerson) return 'people';
  return 'generic';
}

function bucketLabel(b?: DiscoverEmail['bucket']): string | null {
  if (!b || b === 'generic' || b === 'personal') return null;
  if (b === 'sales') return 'Sales';
  if (b === 'support') return 'Support';
  if (b === 'media') return 'Media';
  return null;
}

export function CompanyPanel({
  domain,
  company,
  loading = false,
  log = [],
  mode = 'inline',
  onClose,
  onEnrich,
  picker,
  actions,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('emails');
  const [segment, setSegment] = useState<Segment>('generic');
  const [keywordsOpen, setKeywordsOpen] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [nameFilterOpen, setNameFilterOpen] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const emails = company?.emails ?? [];
  const segmented = useMemo(() => {
    const people: DiscoverEmail[] = [];
    const decision: DiscoverEmail[] = [];
    const generic: DiscoverEmail[] = [];
    for (const e of emails) {
      const seg = segmentFor(e);
      if (seg === 'decision') decision.push(e);
      else if (seg === 'people') people.push(e);
      else generic.push(e);
    }
    const sortByAddr = (a: DiscoverEmail, b: DiscoverEmail) => a.address.localeCompare(b.address);
    people.sort(sortByAddr);
    decision.sort(sortByAddr);
    generic.sort(sortByAddr);
    return { people, decision, generic };
  }, [emails]);

  // Reset UI state when the selected company changes. Default to the first
  // populated segment so the user immediately sees content.
  useEffect(() => {
    if (segmented.decision.length) setSegment('decision');
    else if (segmented.people.length) setSegment('people');
    else setSegment('generic');
    setTab('emails');
    setKeywordsOpen(false);
    setNameFilter('');
    setNameFilterOpen(false);
    setOnlyVerified(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  const visibleEmails = useMemo(() => {
    const base = segmented[segment];
    const q = nameFilter.trim().toLowerCase();
    return base.filter((e) => {
      if (onlyVerified && e.confidence !== 'high' && !e.verified) return false;
      if (!q) return true;
      return (
        (e.name ?? '').toLowerCase().includes(q) ||
        (e.jobTitle ?? '').toLowerCase().includes(q) ||
        e.address.toLowerCase().includes(q)
      );
    });
  }, [segmented, segment, onlyVerified, nameFilter]);

  const emailCount = emails.length;

  const body = (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* ---------- Header ---------- */}
        <div className="relative px-5 pt-5 pb-4">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}

          <div className="flex items-start gap-3 pr-10">
            <div className="h-14 w-14 rounded-xl border border-evari-line/40 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  company?.logoUrl ??
                  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
                }
                alt=""
                className={company?.logoUrl ? 'h-full w-full object-cover' : 'h-7 w-7 object-contain'}
              />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-[17px] font-semibold leading-tight text-evari-text break-words">
                {company?.name ?? domain}
              </h3>
              <div className="mt-2">
                <span className="inline-flex items-center rounded-md bg-evari-surfaceSoft px-2 py-0.5 text-[11px] font-medium text-evari-dim">
                  {emailCount === 0
                    ? 'No email addresses'
                    : emailCount + ' email address' + (emailCount === 1 ? '' : 'es')}
                </span>
              </div>
            </div>
          </div>

          {company?.description ? (
            <p className="mt-4 text-[13px] leading-relaxed text-evari-dim">{company.description}</p>
          ) : null}

          {/* Primary CTA row */}
          {actions ? (
            <div className="mt-4">{actions}</div>
          ) : onEnrich ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => onEnrich({ force: true })}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-evari-line/60 bg-white px-3 py-1.5 text-[12px] font-medium text-evari-text hover:border-evari-accent hover:text-evari-accent disabled:opacity-40 shadow-sm"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {loading ? 'Enriching\u2026' : 'Re-enrich'}
              </button>
            </div>
          ) : null}
        </div>

        {/* ---------- Company details ---------- */}
        {company ? (
          <div className="border-t border-evari-line/40 px-5 py-4">
            <div className="text-[13px] font-semibold text-evari-text mb-3">Company details</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-evari-dim">
              <div className="space-y-1.5">
                {company.category ? <div>{company.category}</div> : null}
                {company.employeeCount || company.employeeBand ? (
                  <div>
                    {company.employeeCount
                      ? company.employeeCount.toLocaleString() + ' employees'
                      : company.employeeBand + ' employees'}
                  </div>
                ) : null}
                {company.foundedYear ? <div>Founded in {company.foundedYear}</div> : null}
                {company.phone ? <div>{company.phone}</div> : null}
              </div>
              <div className="space-y-1.5">
                <div>
                  <a
                    href={'https://' + domain}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-evari-text underline underline-offset-2 hover:text-evari-accent break-all"
                  >
                    {domain}
                  </a>
                </div>
                {company.hq?.full ? <div>{company.hq.full}</div> : null}
                {company.socials ? (
                  <div className="flex gap-1 pt-0.5">
                    {socialLinks(company.socials).map((s) => (
                      <a
                        key={s.href}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md bg-evari-surfaceSoft text-evari-dim hover:text-evari-text"
                        title={s.label}
                      >
                        {s.icon}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {company.keywords && company.keywords.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setKeywordsOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[12px] text-evari-dim hover:text-evari-text border-b border-evari-line/60 pb-0.5"
                >
                  Keywords
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform', keywordsOpen && 'rotate-180')}
                  />
                </button>
                {keywordsOpen ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {company.keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center rounded-full border border-evari-line/60 px-2 py-0.5 text-[10px] text-evari-dim"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Tabs ---------- */}
        {company ? (
          <div className="sticky top-0 z-10 border-t border-evari-line/40 bg-white">
            <div className="px-5 flex items-center gap-6">
              {(['emails', 'technologies', 'signals'] as const).map((t) => {
                const labels: Record<Tab, string> = {
                  emails: 'Email addresses',
                  technologies: 'Technologies',
                  signals: 'Signals',
                };
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      'py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors',
                      active
                        ? 'border-evari-accent text-evari-text'
                        : 'border-transparent text-evari-dim hover:text-evari-text',
                    )}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ---------- Tab content ---------- */}
        {company ? (
          <div className="px-5 py-4">
            {tab === 'emails' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[13px] text-evari-text">
                    <span className="font-semibold">
                      {visibleEmails.length} result{visibleEmails.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-evari-dim"> for {domain}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOnlyVerified((v) => !v)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm',
                        onlyVerified
                          ? 'border-evari-accent bg-evari-accent/10 text-evari-accent'
                          : 'border-evari-line/60 bg-white text-evari-dim hover:text-evari-text',
                      )}
                      title="Only show verified addresses"
                    >
                      <Filter className="h-3 w-3" />
                      Filters
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setNameFilterOpen((v) => !v)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm',
                        nameFilterOpen || nameFilter
                          ? 'border-evari-accent bg-evari-accent/10 text-evari-accent'
                          : 'border-evari-line/60 bg-white text-evari-dim hover:text-evari-text',
                      )}
                    >
                      <User2 className="h-3 w-3" />
                      Find by Name
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {nameFilterOpen ? (
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
                    <input
                      type="text"
                      value={nameFilter}
                      onChange={(ev) => setNameFilter(ev.target.value)}
                      placeholder="Filter by name, title, or address"
                      className="w-full rounded-md border border-evari-line/60 bg-white pl-7 pr-2 py-1.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent"
                    />
                  </div>
                ) : null}

                {/* Segment switcher */}
                <div className="grid grid-cols-3 rounded-md bg-evari-surfaceSoft p-1 text-[12px]">
                  {(['people', 'decision', 'generic'] as const).map((s) => {
                    const labels: Record<Segment, string> = {
                      people: 'People',
                      decision: 'Decision makers',
                      generic: 'Generic',
                    };
                    const count = segmented[s].length;
                    const active = segment === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSegment(s)}
                        className={cn(
                          'py-1.5 rounded text-center transition-colors',
                          active
                            ? 'bg-white text-evari-text shadow-sm font-medium'
                            : 'text-evari-dim hover:text-evari-text',
                        )}
                      >
                        {labels[s]} · {count}
                      </button>
                    );
                  })}
                </div>

                {/* Picker helper */}
                {picker && visibleEmails.length > 0 ? (
                  <div className="flex items-center justify-between text-[11px] text-evari-dim">
                    <div>
                      {picker.selected.size > 0
                        ? picker.selected.size + ' selected'
                        : 'Pick addresses to send to Prospects'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={picker.onSelectAll}
                        className="hover:text-evari-text"
                      >
                        All
                      </button>
                      <span className="text-evari-dimmer/60">·</span>
                      <button
                        type="button"
                        onClick={picker.onSelectNone}
                        className="hover:text-evari-text"
                      >
                        None
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Email list */}
                {visibleEmails.length === 0 ? (
                  <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-center text-[12px] text-evari-dim">
                    {emailCount === 0
                      ? 'No emails found yet.'
                      : 'No ' +
                        (segment === 'decision' ? 'decision-maker' : segment) +
                        ' emails in this set.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-evari-line/40 rounded-md border border-evari-line/40 overflow-hidden">
                    {visibleEmails.map((e) => (
                      <EmailRow
                        key={e.address}
                        email={e}
                        segment={segmentFor(e)}
                        picked={picker?.selected.has(e.address)}
                        onToggle={picker ? () => picker.onToggle(e.address) : undefined}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'technologies' ? (
              <div>
                {company.technologies && company.technologies.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {company.technologies.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-full border border-evari-line/60 bg-white px-2.5 py-1 text-[11px] text-evari-dim shadow-sm"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-center text-[12px] text-evari-dim">
                    No technology fingerprints detected yet.
                  </div>
                )}
              </div>
            ) : null}

            {tab === 'signals' ? (
              <div>
                {company.signals && company.signals.length > 0 ? (
                  <ul className="space-y-2">
                    {company.signals.map((s, i) => (
                      <SignalRow key={s.title + i} signal={s} />
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-center text-[12px] text-evari-dim">
                    No recent signals found.
                  </div>
                )}
              </div>
            ) : null}

            {/* Sources footnote */}
            {company.sources && company.sources.length > 0 ? (
              <div className="mt-4 pt-3 border-t border-evari-line/40">
                <div className="text-[11px] font-medium text-evari-dim mb-1">Sources</div>
                <ul className="space-y-0.5">
                  {company.sources.map((u) => (
                    <li key={u} className="text-[11px] truncate">
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{u}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Empty state */}
        {!company && !loading ? (
          <div className="p-5">
            <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-[12px] text-evari-dim">
              Nothing cached for {domain} yet.
              {onEnrich ? (
                <button
                  type="button"
                  onClick={() => onEnrich({ force: false })}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-evari-accent px-2.5 py-1 text-[11px] font-medium text-evari-ink hover:bg-evari-accent/90"
                >
                  <Sparkles className="h-3 w-3" />
                  Enrich now
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Live enrichment log */}
        {log.length > 0 ? (
          <div className="px-5 py-3 border-t border-evari-line/40">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              className="text-[12px] text-evari-dim hover:text-evari-text"
            >
              {logOpen ? 'Hide' : 'Show'} enrichment log · {log.length} line
              {log.length === 1 ? '' : 's'}
            </button>
            {logOpen ? (
              <div
                ref={logRef}
                className="mt-2 max-h-40 overflow-y-auto rounded-md bg-evari-surface p-2 font-mono text-[10px] text-evari-dim whitespace-pre-wrap"
              >
                {log.join('\n')}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (mode === 'overlay') {
    return (
      <div className="fixed inset-0 z-40">
        <div
          className="absolute inset-0 bg-evari-ink/60"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="absolute inset-y-0 right-0 w-full max-w-[520px] bg-white border-l border-evari-line/40 shadow-2xl">
          {body}
        </div>
      </div>
    );
  }
  return <div className="h-full">{body}</div>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmailRow({
  email,
  segment,
  picked,
  onToggle,
}: {
  email: DiscoverEmail;
  segment: Segment;
  picked?: boolean;
  onToggle?: () => void;
}) {
  const isVerified = email.confidence === 'high' || email.verified === true;
  const isMaybe = email.confidence === 'medium';
  const isPerson = segment !== 'generic';
  const roleTag = bucketLabel(email.bucket);

  return (
    <li
      className={cn(
        'px-3 py-2.5 flex items-start gap-3 transition-colors',
        onToggle ? 'cursor-pointer hover:bg-evari-surfaceSoft' : '',
        picked ? 'bg-evari-accent/5' : '',
      )}
      onClick={onToggle}
    >
      {onToggle ? (
        <span
          className={cn(
            'h-4 w-4 mt-0.5 shrink-0 rounded-[3px] border flex items-center justify-center',
            picked ? 'bg-evari-accent border-evari-accent' : 'border-evari-dimmer bg-white',
          )}
        >
          {picked ? <Check className="h-3 w-3 text-evari-ink" /> : null}
        </span>
      ) : (
        <Mail className="h-3.5 w-3.5 text-evari-dimmer shrink-0 mt-0.5" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12px] text-evari-text">
          {isPerson ? (
            <>
              <span className="font-medium truncate">{email.name}</span>
              {email.jobTitle ? (
                <span className="text-evari-dim truncate">· {email.jobTitle}</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-medium">Generic email address</span>
              {roleTag ? <span className="text-evari-dim">· {roleTag}</span> : null}
            </>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
          <span className="font-mono text-evari-dim truncate">{email.address}</span>
          {isVerified ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-evari-success" aria-label="Verified" />
          ) : isMaybe ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-evari-dimmer" aria-label="Unverified" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5 shrink-0 text-evari-dimmer" aria-label="Unverified" />
          )}
        </div>
      </div>
    </li>
  );
}

function SignalRow({ signal }: { signal: DiscoverSignal }) {
  const body = (
    <div className="text-[11px] text-evari-text">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-evari-surfaceSoft px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-evari-dim">
          {signal.type}
        </span>
        {signal.date ? (
          <span className="text-[10px] text-evari-dimmer">{signal.date}</span>
        ) : null}
      </div>
      <div className="mt-0.5 leading-snug">{signal.title}</div>
      {signal.summary ? (
        <div className="mt-0.5 text-[10px] text-evari-dim leading-snug">{signal.summary}</div>
      ) : null}
    </div>
  );
  return signal.url ? (
    <li>
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-evari-surfaceSoft rounded-md -mx-1 px-1 py-0.5"
      >
        {body}
      </a>
    </li>
  ) : (
    <li>{body}</li>
  );
}

function socialLinks(s: NonNullable<DiscoveredCompany['socials']>): Array<{
  href: string;
  label: string;
  icon: React.ReactNode;
}> {
  const out: Array<{ href: string; label: string; icon: React.ReactNode }> = [];
  if (s.linkedin)
    out.push({ href: s.linkedin, label: 'LinkedIn', icon: <Linkedin className="h-3.5 w-3.5" /> });
  if (s.facebook)
    out.push({ href: s.facebook, label: 'Facebook', icon: <Facebook className="h-3.5 w-3.5" /> });
  if (s.instagram)
    out.push({
      href: s.instagram,
      label: 'Instagram',
      icon: <Instagram className="h-3.5 w-3.5" />,
    });
  if (s.twitter)
    out.push({ href: s.twitter, label: 'Twitter / X', icon: <Globe className="h-3.5 w-3.5" /> });
  if (s.youtube)
    out.push({ href: s.youtube, label: 'YouTube', icon: <Globe className="h-3.5 w-3.5" /> });
  if (s.tiktok)
    out.push({ href: s.tiktok, label: 'TikTok', icon: <Globe className="h-3.5 w-3.5" /> });
  return out;
}
