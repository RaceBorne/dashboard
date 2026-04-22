'use client';

/**
 * ProspectsClient — Discover-style layout.
 *
 * Three columns:
 *   1. Folder sidebar (categories + Uncategorised + All)
 *   2. Prospect list (compact row per prospect: favicon, name, org, status)
 *   3. CompanyPanel (Discover's detail panel, rendering the selected row
 *      via leadToDiscoveredCompany)
 *
 * The row panel mirrors /discover exactly — we re-use the same CompanyPanel
 * component, wiring "Find emails & details" to the existing hunt-contacts
 * SSE endpoint and a primary action bar for promote / delete / open thread.
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
  Rocket,
  ExternalLink,
  Inbox,
  FolderInput,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, relativeTime } from '@/lib/utils';
import type { Lead, LeadNote, ProspectStatus } from '@/lib/types';
import { CompanyPanel } from '@/components/discover/CompanyPanel';
import { FunnelRibbon } from '@/components/nav/FunnelRibbon';
import { leadToDiscoveredCompany } from '@/lib/dashboard/leadViews';

type ManualBucket = 'person' | 'decision_maker' | 'generic';

const STATUS_TONE: Record<ProspectStatus, string> = {
  pending: 'bg-evari-surfaceSoft text-evari-dim',
  sent: 'bg-sky-400/20 text-sky-700',
  replied_positive: 'bg-evari-success/20 text-evari-success',
  replied_neutral: 'bg-evari-surfaceSoft text-evari-dim',
  replied_negative: 'bg-evari-danger/15 text-evari-danger',
  no_reply: 'bg-evari-warn/20 text-evari-goldInk',
  bounced: 'bg-evari-danger/15 text-evari-danger',
  qualified: 'bg-evari-gold/25 text-evari-goldInk',
  archived: 'bg-evari-surfaceSoft text-evari-dimmer',
};

const STATUS_LABEL: Record<ProspectStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  replied_positive: 'Replied (+)',
  replied_neutral: 'Replied',
  replied_negative: 'Replied (-)',
  no_reply: 'No reply',
  bounced: 'Bounced',
  qualified: 'Qualified',
  archived: 'Archived',
};

const UNCATEGORISED = 'Uncategorised';

interface Props {
  initialLeads: Lead[];
}

export function ProspectsClient({ initialLeads }: Props) {
  const searchParams = useSearchParams();
  const playId = searchParams?.get('playId') ?? null;
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Multi-select for bulk folder moves.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveBusy, setBulkMoveBusy] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  // Hunt / enrich streaming state — keyed on lead id so the panel can show
  // live log output while a run is in progress.
  const [huntingId, setHuntingId] = useState<string | null>(null);
  const [huntLog, setHuntLog] = useState<string[]>([]);
  const [enrichPassById, setEnrichPassById] = useState<Record<string, number>>({});

  // Folder rename/delete.
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [busyFolder, setBusyFolder] = useState<string | null>(null);

  // Per-lead action state for primary actions.
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

  // --- Derived: folder counts + filtered list ------------------------------

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
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, activeFolder, search]);

  // Keep selection pointed at a valid row.
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

  // --- Actions -------------------------------------------------------------

  async function promoteLead(id: string) {
    setActionBusy((m) => ({ ...m, [id]: 'promote' }));
    try {
      const res = await fetch(`/api/leads/${id}/promote`, { method: 'POST' });
      if (!res.ok) throw new Error(`Promote failed (${res.status})`);
      // Remove from prospects list.
      setLeads((prev) => prev.filter((l) => l.id !== id));
      if (selectedId === id) setSelectedId(null);
      window.dispatchEvent(new Event('evari:nav-counts-dirty'));
    } catch (err) {
      console.error('promote', err);
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
      title: 'Delete this prospect?',
      description: 'This removes the row from the CRM. You can always re-save it from Discover.',
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
        body: JSON.stringify({ from: original, to: cleaned }),
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
      description: `This moves ${count} prospect${count === 1 ? '' : 's'} to Uncategorised.`,
      confirmLabel: 'Delete folder',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyFolder(name);
    try {
      const res = await fetch(
        `/api/leads/category?name=${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setLeads((prev) =>
        prev.map((l) => ((l.category ?? '') === name ? { ...l, category: undefined } : l)),
      );
      if (activeFolder === name) setActiveFolder(null);
    } catch (err) {
      console.error('delete folder', err);
    } finally {
      setBusyFolder(null);
    }
  }

  // --- Enrich contacts (SSE stream) ---------------------------------------
  // Scrape the prospect's own website + run an AI extraction pass to populate
  // orgProfile.contacts. The Discover CompanyPanel's "Find emails & details"
  // CTA triggers this via `onEnrich`.

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
      description: 'The note will be removed from this prospect.',
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
      description: `Remove ${email} from this prospect.`,
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

  // --- Render --------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3 p-4 h-[calc(100vh-56px)] bg-evari-ink">
      {playId ? (
        <FunnelRibbon stage="prospects" playId={playId} />
      ) : null}
      <div className="flex gap-4 flex-1 min-h-0">
      {/* Column 1: folder sidebar */}
      <aside className="w-[340px] shrink-0 rounded-xl bg-evari-surface overflow-hidden flex flex-col">
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
            <span className="flex-1 truncate">All prospects</span>
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
                No folders yet — save a run from{' '}
                <a href="/discover" className="underline hover:text-evari-text">
                  Discover
                </a>
                .
              </li>
            ) : null}
          </ul>
        </div>

        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-evari-line/30">
          <a
            href="/discover"
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-evari-line/60 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text hover:border-evari-dim w-full justify-center"
          >
            <FolderPlus className="h-3 w-3" />
            New folder via Discover
          </a>
        </div>
      </aside>

      {/* Column 2 + 3 — always 50/50 */}
      <div className="flex-1 min-w-0 h-full flex gap-4">
        {/* Column 2: list */}
        <main className="basis-1/2 flex-1 min-w-0 h-full rounded-xl bg-evari-surface flex flex-col overflow-hidden">
          <header className="sticky top-0 z-10 shrink-0 border-b border-evari-line/30 bg-evari-surface px-4 py-3 flex items-center gap-3">
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
                    {activeFolder ?? 'All prospects'}
                  </div>
                </div>
                <div className="shrink-0 text-[11.5px] text-evari-dim whitespace-nowrap">
                  {filtered.length} prospect{filtered.length === 1 ? '' : 's'}
                </div>
              </>
            )}
            <div className="relative w-48 shrink-0">
              <SearchIcon className="h-3.5 w-3.5 text-evari-dimmer absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prospects"
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
                  {leads.length === 0 ? 'No prospects yet' : 'No matches'}
                </div>
                <div className="text-[12px] text-evari-dim max-w-xs">
                  {leads.length === 0
                    ? 'Run a search in Discover and save it to a folder to start populating Prospects.'
                    : 'Try a different folder or clear the search above.'}
                </div>
              </div>
            ) : (
              <ul className="space-y-1 px-2 py-2">
                {filtered.map((l) => (
                  <ProspectRow
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
                <ProspectPanelActions
                  lead={selected}
                  busy={actionBusy[selected.id]}
                  onPromote={() => void promoteLead(selected.id)}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ProspectRow({
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
  const status = lead.prospectStatus ?? 'pending';

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
        className="h-4 w-4 shrink-0 accent-evari-accent cursor-pointer"
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
            STATUS_TONE[status],
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Right-panel action row (promote / delete / open)
// ---------------------------------------------------------------------------

function ProspectPanelActions({
  lead,
  busy,
  onPromote,
  onDelete,
}: {
  lead: Lead;
  busy: string | undefined;
  onPromote: () => void;
  onDelete: () => void;
}) {
  // Prospects can only graduate to Leads once they have a real email on
  // file — no pattern-inferred guesses, no blank addresses.
  const canPromote = !!lead.email && lead.emailInferred !== true;
  return (
    <div className="flex items-center gap-2">
      {canPromote ? (
        <Button
          type="button"
          onClick={onPromote}
          disabled={!!busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-evari-gold text-evari-goldInk hover:bg-evari-gold/90"
        >
          {busy === 'promote' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Rocket className="h-3.5 w-3.5" />
          )}
          Promote to Lead
        </Button>
      ) : (
        <div
          aria-disabled="true"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-evari-surfaceSoft px-3 py-2 text-[12.5px] font-medium text-evari-dim cursor-not-allowed select-none"
          title="Add a real (non-inferred) email before promoting."
        >
          <Rocket className="h-3.5 w-3.5" />
          One contact required to promote to Lead
        </div>
      )}
      {lead.threadId ? (
        <Button
          type="button"
          variant="outline"
          asChild
          className="shrink-0"
        >
          <a href={`/inbox/${lead.threadId}`} className="inline-flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Thread
          </a>
        </Button>
      ) : null}
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
        Pick a prospect
      </div>
      <div className="text-[12px] text-evari-dim max-w-sm">
        Click any row on the left to see company details, contacts, and run
        actions. Hunt for decision-makers or promote straight to Leads when
        they&apos;re ready.
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
