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
  FolderInput,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, relativeTime } from '@/lib/utils';
import type { DiscoveredCompany, Lead, LeadNote, LeadStage } from '@/lib/types';
import { LeadConversationPanel } from '@/components/leads/LeadConversationPanel';
import { CompanyPanel } from '@/components/discover/CompanyPanel';
import { FunnelRibbon } from '@/components/nav/FunnelRibbon';
import { ProjectRail } from '@/components/nav/ProjectRail';
import { deriveDomain, leadToDiscoveredCompany } from '@/lib/dashboard/leadViews';
import { STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT } from '@/lib/layout/stageWrapper';

type ManualBucket = 'person' | 'decision_maker' | 'generic';

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

export interface LeadsClientScopedTo { listId: string; listName: string; unpromotedCount: number }

interface Props {
  initialLeads: Lead[];
  /** When the page is filtered to a specific marketing list. The
   *  client surfaces a 'Filtering: <list name>' banner with a back
   *  link to /email/audience/<id> so the operator never feels lost. */
  scopedTo?: LeadsClientScopedTo | null;
}

export function LeadsClient({ initialLeads, scopedTo }: Props) {
  const searchParams = useSearchParams();
  const deepLinkId = searchParams?.get('id') ?? null;
  const playId = searchParams?.get('playId') ?? null;
  // Optional tier filter — 'all' (default) | 'lead' | 'prospect'.
  // Set via the chips above the list, or pre-applied via ?tier=
  // (used by the /prospects redirect that bounces here).
  const initialTier = (searchParams?.get('tier') as 'all' | 'lead' | 'prospect' | null) ?? 'all';
  const [tierFilter, setTierFilter] = useState<'all' | 'lead' | 'prospect'>(initialTier === 'lead' || initialTier === 'prospect' ? initialTier : 'all');

  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);

  // Multi-select for bulk folder moves.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveBusy, setBulkMoveBusy] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
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

  // --- Passive synopsis backfill -------------------------------------------
  // On mount, walk every row that either has no AI synopsis yet OR has a
  // synopsis generated before the prompt-rewrite cutoff (old "Evari sales
  // framing" copy). Regenerate stale ones in-place, sequentially, with a
  // small stagger to stay under the AI gateway rate ceiling.
  useEffect(() => {
    const PROMPT_CUTOFF = Date.parse('2026-04-22T00:00:00Z');
    const needed: Array<{ id: string; regenerate: boolean }> = [];
    for (const l of initialLeads) {
      const missing = !l.synopsis || !l.orgProfile;
      const generatedMs = l.synopsisGeneratedAt
        ? Date.parse(l.synopsisGeneratedAt)
        : 0;
      const stale = !missing && generatedMs < PROMPT_CUTOFF;
      if (missing || stale) needed.push({ id: l.id, regenerate: !missing });
    }
    if (needed.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const { id, regenerate } of needed) {
        if (cancelled) return;
        try {
          const url = regenerate
            ? `/api/leads/${id}/synopsis?regenerate=1`
            : `/api/leads/${id}/synopsis`;
          const res = await fetch(url, { method: 'POST' });
          if (!res.ok) continue;
          const data = (await res.json()) as { ok?: boolean; lead?: Lead };
          if (!data.ok || !data.lead || cancelled) continue;
          setLeads((prev) => prev.map((l) => (l.id === id ? data.lead! : l)));
        } catch {
          // Swallow — backfill is best-effort.
        }
        // Small cool-down between calls.
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount with the initial row set. New rows created later
    // during the session don't need a backfill pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (playId && l.playId !== playId) return false;
      if (tierFilter !== 'all' && l.tier !== tierFilter) return false;
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
  }, [leads, activeFolder, search, playId, tierFilter]);

  useEffect(() => {
    if (!selectedId) return;
    if (!filtered.some((l) => l.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const selected = selectedId ? leads.find((l) => l.id === selectedId) ?? null : null;
  const [engineByDomain, setEngineByDomain] = useState<
    Record<string, DiscoveredCompany>
  >({});
  const selectedCompany = useMemo(() => {
    if (!selected) return null;
    const base = leadToDiscoveredCompany(selected);
    const engine = engineByDomain[base.domain];
    if (!engine) return base;
    return {
      ...base,
      people: engine.people ?? base.people,
      peopleTargetRole: engine.peopleTargetRole ?? base.peopleTargetRole,
      peopleEnrichedAt: engine.peopleEnrichedAt ?? base.peopleEnrichedAt,
      keywords: engine.keywords ?? base.keywords,
      signals: engine.signals ?? base.signals,
      socials: engine.socials ?? base.socials,
    };
  }, [selected, engineByDomain]);

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

  /**
   * Enrich a lead. Hybrid: legacy enrich-contacts drives the visible
   * huntLog + orgProfile.contacts; discover engine runs in parallel to
   * populate engineByDomain so the CompanyPanel's People section lights
   * up with scores + candidates + MX. Engine errors are silent.
   */
  async function enrichContacts(leadId: string) {
    if (huntingId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    streamAbort.current?.abort();
    const ac = new AbortController();
    streamAbort.current = ac;
    setHuntingId(leadId);
    setHuntLog([]);

    const domain = deriveDomain(lead);
    if (domain) {
      const engineUrl =
        '/api/discover/enrich/' + encodeURIComponent(domain) +
        '?force=1' +
        (lead.playId ? '&playId=' + encodeURIComponent(lead.playId) : '');
      void (async () => {
        try {
          const engineRes = await fetch(engineUrl, { method: 'POST' });
          if (!engineRes.ok || !engineRes.body) return;
          const reader = engineRes.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
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
                  company?: DiscoveredCompany;
                };
                if (msg.phase === 'done' && msg.company) {
                  setEngineByDomain((prev) => ({
                    ...prev,
                    [msg.company!.domain]: msg.company!,
                  }));
                }
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // Engine silence is fine.
        }
      })();
    }

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

  // --- Notes CRUD ---------------------------------------------------------

  const [noteBusy, setNoteBusy] = useState(false);

  async function addNote(leadId: string, text: string) {
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Note create failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; lead?: Lead };
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead! : l)));
      }
    } catch (err) {
      console.error('add note', err);
    } finally {
      setNoteBusy(false);
    }
  }

  async function editNote(leadId: string, noteId: string, text: string) {
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId, text }),
      });
      if (!res.ok) throw new Error(`Note update failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; lead?: Lead };
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead! : l)));
      }
    } catch (err) {
      console.error('edit note', err);
    } finally {
      setNoteBusy(false);
    }
  }

  async function deleteNote(leadId: string, noteId: string) {
    const ok = await confirm({
      title: 'Delete this note?',
      description: 'The note will be removed from this lead.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId }),
      });
      if (!res.ok) throw new Error(`Note delete failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; lead?: Lead };
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead! : l)));
      }
    } catch (err) {
      console.error('delete note', err);
    } finally {
      setNoteBusy(false);
    }
  }

  // --- Contact row CRUD ---------------------------------------------------

  const [contactBusy, setContactBusy] = useState(false);

  async function editContact(
    leadId: string,
    email: string,
    patch: {
      name?: string;
      jobTitle?: string;
      newEmail?: string;
      manualBucket?: ManualBucket | null;
    },
  ) {
    setContactBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/contacts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...patch }),
      });
      if (!res.ok) throw new Error(`Contact update failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; lead?: Lead };
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead! : l)));
      }
    } catch (err) {
      console.error('edit contact', err);
    } finally {
      setContactBusy(false);
    }
  }

  async function deleteContact(leadId: string, email: string) {
    const ok = await confirm({
      title: 'Delete this contact?',
      description: `Remove ${email} from this lead.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setContactBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(`Contact delete failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; lead?: Lead };
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead! : l)));
      }
    } catch (err) {
      console.error('delete contact', err);
    } finally {
      setContactBusy(false);
    }
  }

  // --- Save-to-folder ------------------------------------------------------

  async function saveToFolder(leadId: string, folder: string) {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: folder }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = (await res.json()) as { ok: boolean; lead?: Lead };
      if (data.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead! : l)));
        window.dispatchEvent(new Event('evari:nav-counts-dirty'));
      }
    } catch (err) {
      console.error('save folder', err);
    }
  }

  // --- Bulk selection ----------------------------------------------------

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkMoveOpen(false);
  }

  async function bulkMoveTo(folder: string) {
    const target = folder.trim();
    if (!target) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkMoveBusy(true);
    try {
      for (const id of ids) {
        await saveToFolder(id, target);
      }
      setSelectedIds(new Set());
      setBulkMoveOpen(false);
      setNewFolderName('');
    } finally {
      setBulkMoveBusy(false);
    }
  }

  // --- Render -------------------------------------------------------------

  return (
    <div className={STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT}>
      {scopedTo ? (
        <div className="shrink-0 mb-3 rounded-md bg-evari-gold/10 border border-evari-gold/40 px-3 py-2 flex items-center gap-3">
          <a href="/email/audience" className="text-[11px] text-evari-dim hover:text-evari-text inline-flex items-center gap-1">
            ← All lists
          </a>
          <div className="flex-1 text-[12.5px]">
            <span className="text-evari-dim">Showing the people in </span>
            <strong className="text-evari-text">{scopedTo.listName}</strong>
            <span className="text-evari-dim"> only.</span>
            {scopedTo.unpromotedCount > 0 ? (
              <span className="text-evari-warn ml-2">
                {scopedTo.unpromotedCount} contact{scopedTo.unpromotedCount === 1 ? '' : 's'} on this list don&apos;t have a lead record yet — open them from the list page to promote.
              </span>
            ) : null}
          </div>
          <a href={`/email/audience/${scopedTo.listId}`} className="text-[11px] font-semibold text-evari-gold hover:underline whitespace-nowrap">
            Manage list →
          </a>
        </div>
      ) : null}
      {scopedTo ? null : <FunnelRibbon stage="leads" playId={playId ?? ''} />}
      <div className="flex gap-4 flex-1 min-h-0">
      {/* Column 1: projects rail — hidden in scoped mode since the scope IS the project */}
      {scopedTo ? null : <ProjectRail activePlayId={playId} />}

      {/* Columns 2 + 3 — always 50/50 */}
      <div className="flex-1 min-w-0 h-full flex gap-4">
        {/* Column 2: list */}
        <main className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface flex flex-col overflow-hidden">
          <header className="sticky top-0 z-10 shrink-0 bg-evari-surface px-4 py-3 flex items-center gap-3">
            {selectedIds.size > 0 ? (
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-evari-text whitespace-nowrap">
                  {selectedIds.size} selected
                </span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBulkMoveOpen((v) => !v)}
                    disabled={bulkMoveBusy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-evari-line/60 bg-evari-surfaceSoft px-2 py-1 text-[11.5px] font-medium text-evari-text hover:bg-evari-surfaceSoft/70"
                  >
                    {bulkMoveBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <FolderInput className="h-3 w-3" />
                    )}
                    Move to folder
                  </button>
                  {bulkMoveOpen ? (
                    <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-evari-line/60 bg-evari-surface shadow-lg z-20 p-2">
                      <div className="max-h-48 overflow-y-auto">
                        {folderKeys.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11.5px] text-evari-dim">
                            No folders yet.
                          </div>
                        ) : (
                          <ul className="space-y-0.5">
                            {folderKeys.map((k) => (
                              <li key={k}>
                                <button
                                  type="button"
                                  onClick={() => void bulkMoveTo(k)}
                                  className="w-full inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-left text-evari-text hover:bg-evari-surfaceSoft"
                                >
                                  <Folder className="h-3 w-3 text-evari-dimmer" />
                                  <span className="flex-1 truncate">{k}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="mt-1 pt-1 border-t border-evari-line/40 flex items-center gap-1">
                        <Input
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void bulkMoveTo(newFolderName);
                            }
                          }}
                          placeholder="New folder…"
                          className="h-7 text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => void bulkMoveTo(newFolderName)}
                          disabled={!newFolderName.trim() || bulkMoveBusy}
                          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-evari-accent hover:bg-evari-surfaceSoft disabled:opacity-40"
                          title="Create + move"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-evari-dim hover:text-evari-text"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-evari-text truncate">
                    {activeFolder ?? 'All leads'}
                  </div>
                </div>
                <div className="shrink-0 text-[11.5px] text-evari-dim whitespace-nowrap">
                  {filtered.length} lead{filtered.length === 1 ? '' : 's'}
                </div>
              </>
            )}
            {/* Tier chips — All / Leads / Prospects. Both tiers live in
                dashboard_leads (just the 'tier' field differs); the chips
                let the operator scope the view without leaving the page. */}
            <div className="shrink-0 inline-flex rounded-md bg-evari-ink/40 border border-evari-edge/20 p-0.5">
              {([
                { v: 'all', label: 'All' },
                { v: 'lead', label: 'Leads' },
                { v: 'prospect', label: 'Prospects' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTierFilter(opt.v)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] transition-colors',
                    tierFilter === opt.v
                      ? 'bg-evari-gold/20 text-evari-gold'
                      : 'text-evari-dim hover:text-evari-text',
                  )}
                >
                  {opt.label}
                </button>
              ))}
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
              <ul className="space-y-1 px-2 py-2">
                {filtered.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    active={selectedId === l.id}
                    onSelect={() => setSelectedId(l.id)}
                    checked={selectedIds.has(l.id)}
                    onCheck={(v) => toggleSelect(l.id, v)}
                  />
                ))}
              </ul>
            )}
          </div>
        </main>

        {/* Column 3: CompanyPanel */}
        <section className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface overflow-hidden">
          {selected && selectedCompany ? (
            <div className="flex flex-col gap-3 h-full overflow-hidden">
            <CompanyPanel
              key={selected.id}
              domain={selectedCompany.domain}
              company={selectedCompany}
              linkedPlayId={selected.playId ?? null}
              loading={huntingId === selected.id}
              log={huntingId === selected.id ? huntLog : []}
              enrichPassCount={enrichPassById[selected.id] ?? (selected.orgProfile?.contactsEnrichedAt ? 1 : 0)}
              onEnrich={() => void enrichContacts(selected.id)}
              saveToFolder={{
                current: selected.category ?? undefined,
                onPick: (folder) => saveToFolder(selected.id, folder),
                onCreate: (folder) => saveToFolder(selected.id, folder),
              }}
              notes={{
                entries: (selected.noteEntries ?? []) as LeadNote[],
                onAdd: (text) => addNote(selected.id, text),
                onEdit: (id, text) => editNote(selected.id, id, text),
                onDelete: (id) => deleteNote(selected.id, id),
                busy: noteBusy,
              }}
              contactOps={{
                onEdit: (email, patch) => editContact(selected.id, email, patch),
                onDelete: (email) => deleteContact(selected.id, email),
                busy: contactBusy,
              }}
              actions={
                <LeadPanelActions
                  lead={selected}
                  busy={actionBusy[selected.id]}
                  onMoveToProspect={() => void moveToProspect(selected.id)}
                  onDelete={() => void deleteLead(selected.id)}
                />
              }
            />
            {/* Inline email conversation: marketing thread + reply
                composer scoped to this lead's email so the operator
                can read + reply without leaving the page. */}
            <div className="shrink-0">
              <LeadConversationPanel email={selected.email} />
            </div>
            </div>
          ) : (
            <EmptyPanel />
          )}
        </section>
      </div>
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
  checked,
  onCheck,
}: {
  lead: Lead;
  active: boolean;
  onSelect: () => void;
  checked: boolean;
  onCheck: (v: boolean) => void;
}) {
  const domain = useMemo(() => deriveDomainForIcon(lead), [lead]);
  const orgLabel = lead.companyName ?? lead.email.split('@')[1] ?? '—';
  const stage = lead.stage ?? 'new';

  return (
    <li
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-4 rounded-[10px] px-4 py-3 cursor-pointer transition-colors',
        active
          ? 'bg-white/[0.10]'
          : 'bg-white/[0.03] hover:bg-white/[0.06]',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onCheck(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-evari-gold cursor-pointer"
        aria-label="Select row"
      />
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
          {(lead.fullName ? orgLabel : lead.address) ? (
            <span className="text-[12px] text-evari-dimmer truncate">
              {lead.fullName ? orgLabel : lead.address}
            </span>
          ) : null}
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

export function LeadPanelActions({
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
