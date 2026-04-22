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
  Save,
  Plus,
  Pencil,
  Trash2,
  FolderPlus,
  Folder,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoveredCompany, DiscoverEmail, LeadNote } from '@/lib/types';

/**
 * Right-column "company detail" panel — shared between /discover, /prospects
 * and /leads. Shows a hero header (logo / name / contact-count pill + optional
 * Save-to-folder button), a primary CTA row, a two-column company-details
 * block with collapsible keywords, then tabs for Contacts + Notes.
 *
 * The Contacts tab segments rows into People / Decision makers / Generic and
 * supports an optional picker (Discover) or per-row edit/delete/nominate
 * (Prospects + Leads). The Notes tab holds per-lead timestamped bubbles.
 */
type ManualBucket = 'person' | 'decision_maker' | 'generic';

interface FolderEntry {
  name: string;
  count: number;
}

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
  /** Number of enrichment passes completed for this domain. */
  enrichPassCount?: number;
  /** Email picker. When omitted the emails are just listed. */
  picker?: {
    selected: Set<string>;
    onToggle: (email: string) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
  };
  /** Primary CTA — rendered as the big button under the description. */
  actions?: React.ReactNode;

  /**
   * Save-to-folder popover. Omit to hide the Save button in the top right.
   * Only rendered on Prospects + Leads surfaces.
   */
  saveToFolder?: {
    /** Current folder (category) this row is saved into, if any. */
    current?: string;
    /** Called when the operator picks an existing folder. */
    onPick: (folder: string) => void | Promise<void>;
    /** Called when the operator creates a new folder. */
    onCreate: (folder: string) => void | Promise<void>;
  };

  /**
   * Notes tab wiring. When omitted the Notes tab shows a read-only
   * empty-state explaining notes live on Prospect/Lead rows.
   */
  notes?: {
    entries: LeadNote[];
    onAdd: (text: string) => void | Promise<void>;
    onEdit: (id: string, text: string) => void | Promise<void>;
    onDelete: (id: string) => void | Promise<void>;
    busy?: boolean;
  };

  /**
   * Contact row CRUD. When omitted the rows are read-only. The Discover
   * surface uses the `picker` prop for multi-select; Prospects + Leads use
   * this for per-row inline edit + delete + bucket nomination.
   */
  contactOps?: {
    onEdit: (
      email: string,
      patch: {
        name?: string;
        jobTitle?: string;
        newEmail?: string;
        manualBucket?: ManualBucket | null;
      },
    ) => void | Promise<void>;
    onDelete: (email: string) => void | Promise<void>;
    busy?: boolean;
  };
}

type Tab = 'contacts' | 'notes';
type Segment = 'people' | 'decision' | 'generic';

const DECISION_MAKER_RE =
  /\b(ceo|cfo|cto|coo|founder|co-?founder|owner|director|head|chief|president|vp|vice president|managing|partner|principal|chair(man)?)\b/i;

function segmentFor(e: DiscoverEmail): Segment {
  if (e.manualBucket === 'decision_maker') return 'decision';
  if (e.manualBucket === 'person') return 'people';
  if (e.manualBucket === 'generic') return 'generic';
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
  enrichPassCount = 0,
  picker,
  actions,
  saveToFolder,
  notes,
  contactOps,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('contacts');
  const [segment, setSegment] = useState<Segment>('generic');
  const [keywordsOpen, setKeywordsOpen] = useState(false);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [nameFilterOpen, setNameFilterOpen] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);

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
    setTab('contacts');
    setKeywordsOpen(false);
    setNameFilter('');
    setNameFilterOpen(false);
    setOnlyVerified(false);
    setSavePopoverOpen(false);
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
          <div className="absolute right-3 top-3 flex items-center gap-1">
            {saveToFolder ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSavePopoverOpen((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors',
                    saveToFolder.current
                      ? 'bg-evari-accent/10 text-evari-accent hover:bg-evari-accent/15'
                      : 'bg-evari-surfaceSoft text-evari-dim hover:text-evari-text',
                  )}
                  title={
                    saveToFolder.current
                      ? `Saved in ${saveToFolder.current}`
                      : 'Save to a folder'
                  }
                >
                  {saveToFolder.current ? (
                    <Folder className="h-3.5 w-3.5" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span className="max-w-[120px] truncate">
                    {saveToFolder.current ?? 'Save'}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {savePopoverOpen ? (
                  <SavePopover
                    current={saveToFolder.current}
                    onPick={async (folder) => {
                      await saveToFolder.onPick(folder);
                      setSavePopoverOpen(false);
                    }}
                    onCreate={async (folder) => {
                      await saveToFolder.onCreate(folder);
                      setSavePopoverOpen(false);
                    }}
                    onClose={() => setSavePopoverOpen(false)}
                  />
                ) : null}
              </div>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex items-start gap-3 pr-28">
            <div className="h-14 w-14 rounded-xl border border-evari-line/40 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  company?.logoUrl ??
                  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
                }
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-[17px] font-semibold leading-tight text-evari-text break-words">
                {company?.name ?? domain}
              </h3>
              <div className="mt-2">
                <span className="inline-flex items-center rounded-md bg-evari-surfaceSoft px-2 py-0.5 text-[11px] font-medium text-evari-dim">
                  {emailCount === 0
                    ? 'No contacts'
                    : emailCount + ' contact' + (emailCount === 1 ? '' : 's')}
                </span>
              </div>
            </div>
          </div>

          {company?.description ? (
            <p className="mt-4 text-[13px] leading-relaxed text-evari-dim">{company.description}</p>
          ) : null}

          {/* Primary CTA row: explicit Enrich action + any picker actions. */}
          {onEnrich ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => onEnrich({ force: true })}
                disabled={loading}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold shadow-sm transition-colors',
                  loading
                    ? 'bg-evari-surfaceSoft text-evari-dim cursor-wait'
                    : enrichPassCount === 0
                      ? 'bg-evari-gold text-evari-goldInk hover:bg-evari-gold/90'
                      : 'bg-white border border-evari-line/60 text-evari-text hover:border-evari-accent hover:text-evari-accent',
                )}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : enrichPassCount === 0 ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {loading
                  ? enrichPassCount === 0
                    ? 'Finding contacts\u2026'
                    : 'Going deeper\u2026'
                  : enrichPassCount === 0
                    ? 'Find contacts & details'
                    : 'Enrich again \u00b7 go deeper'}
              </button>
              {!loading && enrichPassCount === 0 ? (
                <p className="mt-1.5 text-[10.5px] text-evari-dimmer">
                  Runs a bounded 8-page agent pass. Re-run for a wider search.
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ? <div className="mt-3">{actions}</div> : null}
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
              {(['contacts', 'notes'] as const).map((t) => {
                const labels: Record<Tab, string> = {
                  contacts: 'Contacts',
                  notes: 'Notes',
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
                    {t === 'notes' && notes && notes.entries.length > 0 ? (
                      <span className="ml-1 text-evari-dimmer">· {notes.entries.length}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ---------- Tab content ---------- */}
        {company ? (
          <div className="px-5 py-4">
            {tab === 'contacts' ? (
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
                      {onlyVerified ? 'Verified only' : 'Filters'}
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

                {/* Contact list */}
                {visibleEmails.length === 0 ? (
                  <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-center text-[12px] text-evari-dim">
                    {emailCount === 0
                      ? 'No contacts found yet.'
                      : 'No ' +
                        (segment === 'decision' ? 'decision-maker' : segment) +
                        ' contacts in this set.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-evari-line/40 rounded-md border border-evari-line/40 overflow-hidden">
                    {visibleEmails.map((e) => (
                      <ContactRow
                        key={e.address}
                        email={e}
                        segment={segmentFor(e)}
                        picked={picker?.selected.has(e.address)}
                        onToggle={picker ? () => picker.onToggle(e.address) : undefined}
                        ops={contactOps}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {tab === 'notes' ? <NotesTab notes={notes} /> : null}

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
              Click &ldquo;Find contacts &amp; details&rdquo; to pull this company&rsquo;s public profile.
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
// Contact row — with optional inline edit / delete / bucket nomination
// ---------------------------------------------------------------------------

function ContactRow({
  email,
  segment,
  picked,
  onToggle,
  ops,
}: {
  email: DiscoverEmail;
  segment: Segment;
  picked?: boolean;
  onToggle?: () => void;
  ops?: Props['contactOps'];
}) {
  const isVerified = email.confidence === 'high' || email.verified === true;
  const isMaybe = email.confidence === 'medium';
  const isPerson = segment !== 'generic';
  const roleTag = bucketLabel(email.bucket);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(email.name ?? '');
  const [editTitle, setEditTitle] = useState(email.jobTitle ?? '');
  const [editAddress, setEditAddress] = useState(email.address);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setEditName(email.name ?? '');
    setEditTitle(email.jobTitle ?? '');
    setEditAddress(email.address);
  }, [email.address, email.name, email.jobTitle]);

  async function saveEdit() {
    if (!ops) return;
    const patch: Parameters<NonNullable<Props['contactOps']>['onEdit']>[1] = {};
    if (editName.trim() !== (email.name ?? '')) patch.name = editName.trim();
    if (editTitle.trim() !== (email.jobTitle ?? '')) patch.jobTitle = editTitle.trim();
    const nextAddr = editAddress.trim().toLowerCase();
    if (nextAddr && nextAddr !== email.address.toLowerCase()) patch.newEmail = nextAddr;
    await ops.onEdit(email.address, patch);
    setEditing(false);
  }

  async function nominate(bucket: ManualBucket | null) {
    if (!ops) return;
    setMenuOpen(false);
    await ops.onEdit(email.address, { manualBucket: bucket });
  }

  async function handleDelete() {
    if (!ops) return;
    setMenuOpen(false);
    await ops.onDelete(email.address);
  }

  if (editing) {
    return (
      <li className="px-3 py-3 bg-evari-accent/5">
        <div className="grid grid-cols-1 gap-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Full name"
            className="rounded-md border border-evari-line/60 bg-white px-2 py-1.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent"
          />
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Job title"
            className="rounded-md border border-evari-line/60 bg-white px-2 py-1.5 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent"
          />
          <input
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="email@example.com"
            className="rounded-md border border-evari-line/60 bg-white px-2 py-1.5 font-mono text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              className="inline-flex items-center gap-1 rounded-md bg-evari-accent px-3 py-1 text-[11.5px] font-semibold text-evari-ink hover:bg-evari-accent/90"
            >
              <Check className="h-3 w-3" />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditName(email.name ?? '');
                setEditTitle(email.jobTitle ?? '');
                setEditAddress(email.address);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-evari-line/60 bg-white px-3 py-1 text-[11.5px] text-evari-dim hover:text-evari-text"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'group px-3 py-2.5 flex items-start gap-3 transition-colors',
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
              <span className="font-medium truncate">{email.name || 'Unnamed contact'}</span>
              {email.jobTitle ? (
                <span className="text-evari-dim truncate">· {email.jobTitle}</span>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-medium">{email.name || 'Generic email address'}</span>
              {email.jobTitle ? (
                <span className="text-evari-dim truncate">· {email.jobTitle}</span>
              ) : roleTag ? (
                <span className="text-evari-dim">· {roleTag}</span>
              ) : null}
            </>
          )}
          {email.manualBucket ? (
            <span
              className={cn(
                'ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em]',
                email.manualBucket === 'decision_maker'
                  ? 'bg-evari-gold/25 text-evari-goldInk'
                  : email.manualBucket === 'person'
                    ? 'bg-evari-accent/10 text-evari-accent'
                    : 'bg-evari-surfaceSoft text-evari-dim',
              )}
              title="Operator-set classification"
            >
              {email.manualBucket === 'decision_maker'
                ? 'DM'
                : email.manualBucket === 'person'
                  ? 'Person'
                  : 'Generic'}
            </span>
          ) : null}
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

      {ops ? (
        <div
          className="relative shrink-0 self-start"
          onClick={(ev) => ev.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft opacity-0 group-hover:opacity-100 transition-opacity"
            title="Row actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen ? (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-7 z-40 w-52 rounded-lg border border-evari-line/40 bg-white shadow-lg py-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-evari-surfaceSoft inline-flex items-center gap-2 text-evari-text"
                >
                  <Pencil className="h-3 w-3" />
                  Edit contact
                </button>
                <div className="my-1 border-t border-evari-line/30" />
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-evari-dimmer">
                  Nominate as
                </div>
                <BucketItem
                  label="Decision maker"
                  active={email.manualBucket === 'decision_maker'}
                  onClick={() => void nominate('decision_maker')}
                />
                <BucketItem
                  label="Person"
                  active={email.manualBucket === 'person'}
                  onClick={() => void nominate('person')}
                />
                <BucketItem
                  label="Generic"
                  active={email.manualBucket === 'generic'}
                  onClick={() => void nominate('generic')}
                />
                {email.manualBucket ? (
                  <BucketItem
                    label="Clear nomination"
                    active={false}
                    onClick={() => void nominate(null)}
                  />
                ) : null}
                <div className="my-1 border-t border-evari-line/30" />
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="w-full text-left px-3 py-1.5 hover:bg-evari-danger/5 inline-flex items-center gap-2 text-evari-danger"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete contact
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function BucketItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-1.5 hover:bg-evari-surfaceSoft inline-flex items-center gap-2',
        active ? 'text-evari-accent font-medium' : 'text-evari-text',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-evari-accent' : 'bg-evari-line')} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Notes tab — timestamped bubbles with add / edit / delete.
// ---------------------------------------------------------------------------

function NotesTab({ notes }: { notes?: Props['notes'] }) {
  const [composerText, setComposerText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  if (!notes) {
    return (
      <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-center text-[12px] text-evari-dim">
        Notes live on prospect + lead rows. Open this company from Prospects or Leads to take notes.
      </div>
    );
  }

  async function addNote() {
    if (!notes) return;
    const text = composerText.trim();
    if (!text) return;
    await notes.onAdd(text);
    setComposerText('');
  }

  async function saveEdit(id: string) {
    if (!notes) return;
    const text = editingText.trim();
    if (!text) return;
    await notes.onEdit(id, text);
    setEditingId(null);
    setEditingText('');
  }

  const entries = [...notes.entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-evari-line/60 bg-white p-2">
        <textarea
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          placeholder="Add a note — context, next step, dealbreaker…"
          rows={2}
          className="w-full resize-none px-2 py-1 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void addNote();
            }
          }}
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[10.5px] text-evari-dimmer">⌘ + Enter to save</span>
          <button
            type="button"
            onClick={() => void addNote()}
            disabled={!composerText.trim() || notes.busy}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
              composerText.trim() && !notes.busy
                ? 'bg-evari-accent text-evari-ink hover:bg-evari-accent/90'
                : 'bg-evari-surfaceSoft text-evari-dimmer',
            )}
          >
            {notes.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add note
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-center text-[12px] text-evari-dim">
          No notes yet. First one above.
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-evari-line/40 bg-evari-surfaceSoft/50 px-3 py-2"
            >
              {editingId === n.id ? (
                <div>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-md border border-evari-line/60 bg-white px-2 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:border-evari-accent"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit(n.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-evari-accent px-2.5 py-1 text-[11.5px] font-semibold text-evari-ink hover:bg-evari-accent/90"
                    >
                      <Check className="h-3 w-3" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditingText('');
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-evari-line/60 bg-white px-2.5 py-1 text-[11.5px] text-evari-dim hover:text-evari-text"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap text-[13px] text-evari-text leading-relaxed">
                    {n.text}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-evari-dimmer">
                    <span>
                      {formatTimestamp(n.createdAt)}
                      {n.updatedAt ? ` · edited ${formatTimestamp(n.updatedAt)}` : ''}
                    </span>
                    <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditingText(n.text);
                        }}
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:text-evari-text hover:bg-evari-surfaceSoft"
                        title="Edit note"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void notes.onDelete(n.id)}
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:text-evari-danger hover:bg-evari-surfaceSoft"
                        title="Delete note"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = Math.abs(now - d.getTime());
  const oneDay = 24 * 60 * 60 * 1000;
  const opts: Intl.DateTimeFormatOptions =
    diff < oneDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  return d.toLocaleString(undefined, opts);
}

// ---------------------------------------------------------------------------
// Save-to-folder popover (Prospects/Leads only)
// ---------------------------------------------------------------------------

function SavePopover({
  current,
  onPick,
  onCreate,
  onClose,
}: {
  current?: string;
  onPick: (folder: string) => void | Promise<void>;
  onCreate: (folder: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<FolderEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/prospects/folders', { cache: 'no-store' });
        const data = (await res.json()) as { folders?: FolderEntry[]; error?: string };
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setFolders([]);
        } else {
          setFolders(data.folders ?? []);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load folders');
        setFolders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!folders) return [];
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, filter]);

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />
      <div className="absolute right-0 top-8 z-40 w-72 rounded-lg border border-evari-line/40 bg-white shadow-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-evari-line/30 flex items-center gap-2">
          <Folder className="h-3.5 w-3.5 text-evari-dimmer" />
          <span className="text-[12px] font-semibold text-evari-text">Save to folder</span>
        </div>

        <div className="px-3 py-2 border-b border-evari-line/30">
          {creating ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolder.trim()) {
                    e.preventDefault();
                    void onCreate(newFolder.trim());
                  } else if (e.key === 'Escape') {
                    setCreating(false);
                    setNewFolder('');
                  }
                }}
                placeholder="New folder name"
                className="flex-1 min-w-0 rounded-md border border-evari-line/60 bg-white px-2 py-1 text-[12px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent"
              />
              <button
                type="button"
                onClick={() => newFolder.trim() && void onCreate(newFolder.trim())}
                disabled={!newFolder.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-evari-accent px-2 py-1 text-[11.5px] font-semibold text-evari-ink hover:bg-evari-accent/90 disabled:opacity-40"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full inline-flex items-center gap-1.5 rounded-md border border-dashed border-evari-line/60 px-2 py-1.5 text-[12px] text-evari-dim hover:text-evari-text hover:border-evari-dim"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Create new folder
            </button>
          )}
        </div>

        <div className="px-3 py-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-evari-dimmer" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter folders"
              className="w-full rounded-md border border-evari-line/60 bg-white pl-6 pr-2 py-1 text-[11.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-evari-accent"
            />
          </div>

          {loading ? (
            <div className="inline-flex items-center gap-1.5 text-[11.5px] text-evari-dim py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading folders…
            </div>
          ) : error ? (
            <div className="text-[11.5px] text-evari-danger">{error}</div>
          ) : shown.length === 0 ? (
            <div className="text-[11.5px] text-evari-dim py-1">
              {folders && folders.length === 0
                ? 'No folders yet. Create one above.'
                : 'No matches.'}
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto -mx-1">
              {shown.map((f) => {
                const active = f.name === current;
                return (
                  <li key={f.name}>
                    <button
                      type="button"
                      onClick={() => void onPick(f.name)}
                      className={cn(
                        'w-full inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-left',
                        active
                          ? 'bg-evari-accent/10 text-evari-accent font-medium'
                          : 'text-evari-text hover:bg-evari-surfaceSoft',
                      )}
                    >
                      <Folder className="h-3 w-3 shrink-0 text-evari-dimmer" />
                      <span className="flex-1 min-w-0 truncate">{f.name}</span>
                      <span className="text-[10.5px] text-evari-dimmer">{f.count}</span>
                      {active ? <Check className="h-3 w-3 text-evari-accent" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Socials
// ---------------------------------------------------------------------------

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
