'use client';

/**
 * LeadsClient — Discover-style layout.
 *
 * Three columns:
 *   1. Folder sidebar (categories + Uncategorised + All)
 *   2. Lead list (compact row per lead: favicon, name, org, stage)
 *   3. CompanyPanel (Discover's detail panel, rendering the selected lead
 *      via leadToDiscoveredCompany)
 *
 * Row panel mirrors /discover exactly — we re-use the same CompanyPanel,
 * wiring "Find emails & details" to enrich-contacts SSE and a primary
 * action bar for open thread / move-to-prospect / delete.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search as SearchIcon,
  X,
  Folder,
  FolderPlus,
  Loader2,
  Check,
  Trash2,
  Users2,
  MapPin,
  Pencil,
  ArrowDownLeft,
  ExternalLink,
  Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, relativeTime } from '@/lib/utils';
import type { Lead, LeadStage } from '@/lib/types';
import { CompanyPanel } from '@/components/discover/CompanyPanel';
import { leadToDiscoveredCompany } from '@/lib/dashboard/leadViews';

const STAGE_TONE: Record<LeadStage, string> = {
  new: 'bg-evari-surfaceSoft text-evari-dim',
  contacted: 'bg-sky-400/20 text-sky-700',
  discovery: 'bg-indigo-400/20 text-indigo-700',
  configuring: 'bg-evari-gold/20 text-evari-goldInk',
  quoted: 'bg-evari-accent/20 text-evari-accent',
  won: 'bg-evari-success/20 text-evari-success',
  lost: 'bg-evari-danger/15 text-evari-danger',
  cold: 'bg-evari-surfaceSoft text-evari-dimmer',
};

const STAGE_LABEL: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  discovery: 'Discovery',
  configuring: 'Configuring',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
  cold: 'Cold',
};

const UNCATEGORISED = 'Uncategorised';

interface Props {
  initialLeads: Lead[];
}

export function LeadsClient({ initialLeads }: Props) {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams?.get('id') ?? null;
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);

  // Honour ?id=X in the URL so links from Home / Conversations can deep-link
  // straight to a specific lead with the panel pre-opened.
  useEffect(() => {
    if (!deepLinkId) return;
    if (!initialLeads.some((l) => l.id === deepLinkId)) return;
    setSelectedId(deepLinkId);
  }, [deepLinkId, initialLeads]);

  const [huntingId, setHuntingId] = useState<string | null>(null);
  const [huntLog, setHuntLog] = useState<string[]>([]);
  const [enrichPassById, setEnrichPassById] = useState<Record<string, number>>({});

  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [busyFolder, setBusyFolder] = useState<string | null>(null);

  const [actionBusy, setActionBusy] = useState<Record<string, string>>({});

  const confirm = useConfirm();
  const streamAbort = useRef<AbortController | null>(null);

  // --- Derived ------------------------------------------------------------

  const folderCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) {
      const key = (l.category ?? '').trim() || UNCATEGORISED;
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [leads]);

  const folderKeys = useMemo(() => {
    return Object.keys(folderCounts).sort((a, b) => {
      if (a === UNCATEGORISED) return 1;
      if (b === UNCATEGORISED) return -1;
      return a.localeCompare(b);
    });
  }, [folderCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (activeFolder) {
        const key = (l.category ?? '').trim() || UNCATEGORISED;
        if (key !== activeFolder) return false;
      }
      if (q) {
        const hay = [
          l.fullName,
          l.companyName ?? '',
          l.email,
          l.address ?? '',
          l.category ?? '',
          l.jobTitle ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, activeFolder, search]);

  useEffect(() => {
    if (!selectedId) return;
    if (!filtered.some((l) => l.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const selected = selectedId ? leads.find((l) => l.id === selectedId) ?? null : null;
  const selectedCompany = useMemo(
    () => (selected ? leadToDiscoveredCompany(selected) : null),
    [selected],
  );

  // --- Actions ------------------------------------------------------------

  async function moveToProspect(id: string) {
    const ok = await confirm({
      title: 'Move back to Prospect?',
      description: 'This removes the lead from the Leads CRM and returns it to the Prospect pool.',
      confirmLabel: 'Move to Prospect',
    });
    if (!ok) return;
    setActionBusy((m) => ({ ...m, [id]: 'demote' }));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'prospect' }),
      });
      if (!res.ok) throw new Error(`Demote failed (${res.status})`);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      if (selectedId === id) setSelectedId(null);
      window.dispatchEvent(new Event('evari:nav-counts-dirty'));
    } catch (err) {
      console.error('demote', err);
    } finally {
      setActionBusy((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
  }

  async function deleteLead(id: string) {
    const ok = await confirm({
      title: 'Delete this lead?',
      description: 'This removes the row from the CRM and cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setActionBusy((m) => ({ ...m, [id]: 'delete' }));
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      if (selectedId === id) setSelectedId(null);
      window.dispatchEvent(new Event('evari:nav-counts-dirty'));
    } catch (err) {
      console.error('delete', err);
    } finally {
      setActionBusy((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
  }

  async function renameFolder(original: string, next: string) {
    const cleaned = next.trim();
    if (!cleaned || cleaned === original) {
      setRenamingFolder(null);
      return;
    }
    setBusyFolder(original);
    try {
      const res = await fetch('/api/leads/category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: original, to: cleaned, tier: 'lead' }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
      setLeads((prev) =>
        prev.map((l) =>
          (l.category ?? '') === original ? { ...l, category: cleaned } : l,
        ),
      );
      if (activeFolder === original) setActiveFolder(cleaned);
    } catch (err) {
      console.error('rename folder', err);
    } finally {
      setBusyFolder(null);
      setRenamingFolder(null);
    }
  }

  async function deleteFolder(name: string) {
    const count = folderCounts[name] ?? 0;
    const ok = await confirm({
      title: `Delete folder "${name}"?`,
      description: `This deletes ${count} lead${count === 1 ? '' : 's'} in this folder. This cannot be undone.`,
      confirmLabel: 'Delete folder',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyFolder(name);
    try {
      const res = await fetch('/api/leads/category', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: name, tier: 'lead' }),
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setLeads((prev) =>
        prev.filter((l) => ((l.category ?? '').trim() || UNCATEGORISED) !== name),
      );
      if (activeFolder === name) setActiveFolder(null);
    } catch (err) {
      console.error('delete folder', err);
    } finally {
      setBusyFolder(null);
    }
  }

  async function enrichContacts(leadId: string) {
    if (huntingId) return;
    streamAbort.current?.abort();
    const ac = new AbortController();
    streamAbort.current = ac;
    setHuntingId(leadId);
    setHuntLog([]);

    try {
      const res = await fetch(`/api/leads/${leadId}/enrich-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Enrich failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const msg = JSON.parse(payload) as {
              phase?: string;
              message?: string;
              lead?: Lead;
            };
            if (msg.phase && msg.phase !== 'done' && msg.phase !== 'error') {
              setHuntLog((prev) => [
                ...prev,
                msg.message ? `${msg.phase}: ${msg.message}` : msg.phase!,
              ]);
            }
            if (msg.phase === 'done' && msg.lead) {
              setLeads((prev) => prev.map((l) => (l.id === leadId ? msg.lead! : l)));
            }
            if (msg.phase === 'error') {
              setHuntLog((prev) => [...prev, `error: ${msg.message ?? 'failed'}`]);
            }
          } catch {
            setHuntLog((prev) => [...prev, payload]);
          }
        }
      }

      setEnrichPassById((prev) => ({ ...prev, [leadId]: (prev[leadId] ?? 0) + 1 }));
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('enrich-contacts', err);
    } finally {
      if (streamAbort.current === ac) streamAbort.current = null;
      setHuntingId((cur) => (cur === leadId ? null : cur));
    }
  }

  // --- Render -------------------------------------------------------------

  return (
    <div className="flex gap-4 p-4 h-[calc(100vh-56px)] bg-evari-ink">
      {/* Column 1: folder sidebar */}
      <aside className="w-[260px] shrink-0 rounded-xl bg-evari-surface overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 pt-4 pb-2">
          <div className="text-[11px] uppercase tracking-wide text-evari-dimmer mb-2">
            Folders
          </div>
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className={cn(
              'w-full inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-left',
              activeFolder === null
                ? 'bg-evari-accent/10 text-evari-accent font-medium'
                : 'text-evari-text hover:bg-evari-surfaceSoft',
            )}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">All leads</span>
            <span className="text-[11px] text-evari-dim">{leads.length}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <ul className="space-y-0.5">
            {folderKeys.map((k) => {
              const active = activeFolder === k;
              const isRenaming = renamingFolder === k;
              return (
                <li key={k} className="group flex items-center gap-1">
                  {isRenaming ? (
                    <div className="flex-1 flex items-center gap-1 px-2">
                      <Input
                        autoFocus
                        value={folderRenameValue}
                        onChange={(e) => setFolderRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void renameFolder(k, folderRenameValue);
                          } else if (e.key === 'Escape') {
                            setRenamingFolder(null);
                          }
                        }}
                        className="h-7 text-[12px]"
                      />
                      <button
                        type="button"
                        onClick={() => void renameFolder(k, folderRenameValue)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-accent hover:bg-evari-surfaceSoft"
                        disabled={busyFolder === k}
                      >
                        {busyFolder === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveFolder(k)}
                        className={cn(
                          'flex-1 inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-left',
                          active
                            ? 'bg-evari-accent/10 text-evari-accent font-medium'
                            : 'text-evari-text hover:bg-evari-surfaceSoft',
                        )}
                      >
                        <Folder className="h-3.5 w-3.5" />
                        <span className="flex-1 truncate">{k}</span>
                        <span className="text-[11px] text-evari-dim">
                          {folderCounts[k]}
                        </span>
                      </button>
                      {k !== UNCATEGORISED ? (
                        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFolder(k);
                              setFolderRenameValue(k);
                            }}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                            title="Rename folder"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteFolder(k)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-danger hover:bg-evari-surfaceSoft"
                            title="Delete folder"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
            {folderKeys.length === 0 ? (
              <li className="px-2.5 py-2 text-[12px] text-evari-dim">
                No leads yet — promote prospects from the{' '}
                <a href="/prospects" className="underline hover:text-evari-text">
                  Prospects
                </a>{' '}
                tab.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-evari-line/30">
          <a
            href="/prospects"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-evari-line/60 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text hover:border-evari-dim w-full justify-center"
          >
            <FolderPlus className="h-3 w-3" />
            Promote from Prospects
          </a>
        </div>
      </aside>

      {/* Columns 2 + 3 — always 50/50 */}
      <div className="flex-1 min-w-0 h-full flex gap-4">
        {/* Column 2: list */}
        <main className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface flex flex-col overflow-hidden">
          <header className="shrink-0 border-b border-evari-line/30 px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-evari-text truncate">
                {activeFolder ?? 'All leads'}
              </div>
              <div className="text-[11.5px] text-evari-dim">
                {filtered.length} lead{filtered.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="relative w-48 shrink-0">
              <SearchIcon className="h-3.5 w-3.5 text-evari-dimmer absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads"
                className="h-8 pl-7 pr-7 text-[12.5px]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center px-8 text-center">
                <Inbox className="h-8 w-8 text-evari-dimmer mb-3" />
                <div className="text-[14px] font-semibold text-evari-text mb-1">
                  {leads.length === 0 ? 'No leads yet' : 'No matches'}
                </div>
                <div className="text-[12px] text-evari-dim max-w-xs">
                  {leads.length === 0
                    ? 'Promote a Prospect once they have a verified email to start your Leads CRM.'
                    : 'Try a different folder or clear the search above.'}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-evari-line/40">
                {filtered.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    active={selectedId === l.id}
                    onSelect={() => setSelectedId(l.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </main>

        {/* Column 3: CompanyPanel */}
        <section className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface overflow-hidden">
          {selected && selectedCompany ? (
            <CompanyPanel
              key={selected.id}
              domain={selectedCompany.domain}
              company={selectedCompany}
              loading={huntingId === selected.id}
              log={huntingId === selected.id ? huntLog : []}
              enrichPassCount={enrichPassById[selected.id] ?? (selected.orgProfile?.contactsEnrichedAt ? 1 : 0)}
              onEnrich={() => void enrichContacts(selected.id)}
              actions={
                <LeadPanelActions
                  lead={selected}
                  busy={actionBusy[selected.id]}
                  onMoveToProspect={() => void moveToProspect(selected.id)}
                  onDelete={() => void deleteLead(selected.id)}
                />
              }
            />
          ) : (
            <EmptyPanel />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function LeadRow({
  lead,
  active,
  onSelect,
}: {
  lead: Lead;
  active: boolean;
  onSelect: () => void;
}) {
  const domain = useMemo(() => deriveDomainForIcon(lead), [lead]);
  const orgLabel = lead.companyName ?? lead.email.split('@')[1] ?? '—';
  const stage = lead.stage ?? 'new';

  return (
    <li
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors',
        active
          ? 'bg-evari-accent/5 border-l-2 border-evari-accent -ml-[2px] pl-[calc(1.25rem-2px)]'
          : 'hover:bg-evari-surface/60',
      )}
    >
      <div className="h-11 w-11 shrink-0 rounded-md bg-white border border-evari-line/40 flex items-center justify-center overflow-hidden p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[14px] font-semibold text-evari-text truncate">
            {lead.fullName || orgLabel}
          </span>
          <span className="text-[12px] text-evari-dimmer truncate">{orgLabel}</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-evari-dim mt-1">
          {lead.jobTitle ? (
            <span className="truncate max-w-[180px]">{lead.jobTitle}</span>
          ) : null}
          {lead.orgProfile?.employeeRange ? (
            <span className="inline-flex items-center gap-1">
              <Users2 className="h-3 w-3 text-evari-dimmer" />
              {lead.orgProfile.employeeRange}
            </span>
          ) : null}
          {lead.address ? (
            <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
              <MapPin className="h-3 w-3 text-evari-dimmer" />
              {lead.address}
            </span>
          ) : null}
          {lead.lastTouchAt ? (
            <span className="text-evari-dimmer">{relativeTime(lead.lastTouchAt)}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
            STAGE_TONE[stage],
          )}
        >
          {STAGE_LABEL[stage]}
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Right-panel action row (thread / demote / delete)
// ---------------------------------------------------------------------------

function LeadPanelActions({
  lead,
  busy,
  onMoveToProspect,
  onDelete,
}: {
  lead: Lead;
  busy: string | undefined;
  onMoveToProspect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {lead.threadId ? (
        <Button
          type="button"
          asChild
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-evari-accent text-evari-ink hover:bg-evari-accent/90"
        >
          <a href={`/inbox/${lead.threadId}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open thread
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          disabled
          className="flex-1 inline-flex items-center justify-center gap-1.5"
          variant="outline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          No thread yet
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={onMoveToProspect}
        disabled={!!busy}
        className="shrink-0"
      >
        {busy === 'demote' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onDelete}
        disabled={!!busy}
        className="shrink-0 text-evari-danger hover:text-evari-danger"
      >
        {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty detail placeholder
// ---------------------------------------------------------------------------

function EmptyPanel() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 text-center">
      <div className="h-12 w-12 rounded-full bg-evari-surfaceSoft inline-flex items-center justify-center mb-4">
        <Folder className="h-5 w-5 text-evari-dimmer" />
      </div>
      <div className="text-[14px] font-semibold text-evari-text mb-1">
        Pick a lead
      </div>
      <div className="text-[12px] text-evari-dim max-w-sm">
        Click any row on the left to see company details, contacts, and recent
        activity. Open the thread to jump back into the conversation.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveDomainForIcon(lead: Lead): string {
  const url = lead.companyUrl ?? '';
  if (url) {
    const d = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (d) return d;
  }
  const at = lead.email.indexOf('@');
  if (at > -1) return lead.email.slice(at + 1).toLowerCase();
  return 'unknown.local';
}
