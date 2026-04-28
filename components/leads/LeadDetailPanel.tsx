'use client';

/**
 * Single source of truth for the lead detail UI. Mounted from
 * /leads (in its right column) AND from /email/audience/[id]
 * (in a slide-over). Both surfaces render IDENTICAL content
 * because they import this component — change it once, both
 * propagate.
 *
 * Self-contained: takes a leadId, fetches the lead, owns its own
 * local state for every action (notes, contact CRUD, enrich,
 * promote/delete). Optional onChanged callback fires after any
 * mutation so the parent can refetch its list.
 *
 * NOTE: For tonight, only ListDetailClient mounts this. LeadsClient
 * still uses its inline rendering — refactoring that to use this
 * shared component is the next planned step. Visual elements
 * (CompanyPanel, LeadConversationPanel) ARE shared via direct
 * imports though, so visual changes propagate today.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { CompanyPanel } from '@/components/discover/CompanyPanel';
import { LeadConversationPanel } from '@/components/leads/LeadConversationPanel';
import { LeadPanelActions } from '@/components/leads/LeadsClient';
import { leadToDiscoveredCompany } from '@/lib/dashboard/leadViews';
import type { DiscoveredCompany, Lead, LeadNote } from '@/lib/types';

type ManualBucket = 'person' | 'decision_maker' | 'generic';

interface Props {
  leadId: string;
  /** Render mode. 'overlay' = slide-over (used by ListDetailClient).
   *  'embed' = inline (used by LeadsClient when it adopts this). */
  mode?: 'overlay' | 'embed';
  onClose?: () => void;
  onChanged?: () => void | Promise<void>;
}

export function LeadDetailPanel({ leadId, mode = 'overlay', onClose, onChanged }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Per-action busy state — mirrors LeadsClient's separation so the
  // CompanyPanel can show the right spinner per affordance.
  const [noteBusy, setNoteBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/leads/${leadId}`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (data?.ok && data.lead) setLead(data.lead as Lead);
    if (onChanged) await onChanged();
  }, [leadId, onChanged]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leads/${leadId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok) throw new Error(d?.error ?? 'Load failed');
        setLead(d.lead as Lead);
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId]);

  // ─── Action handlers (same fetch URLs LeadsClient uses) ─────────

  async function addNote(text: string) {
    setNoteBusy(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const d = await r.json().catch(() => null);
      if (d?.lead) setLead(d.lead as Lead);
      await refresh();
    } finally { setNoteBusy(false); }
  }
  async function editNote(noteId: string, text: string) {
    setNoteBusy(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/notes`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId, text }) });
      const d = await r.json().catch(() => null);
      if (d?.lead) setLead(d.lead as Lead);
      await refresh();
    } finally { setNoteBusy(false); }
  }
  async function deleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return;
    setNoteBusy(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/notes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: noteId }) });
      const d = await r.json().catch(() => null);
      if (d?.lead) setLead(d.lead as Lead);
      await refresh();
    } finally { setNoteBusy(false); }
  }
  async function editContact(email: string, patch: { name?: string; jobTitle?: string; newEmail?: string; manualBucket?: ManualBucket | null }) {
    setContactBusy(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/contacts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...patch }) });
      const d = await r.json().catch(() => null);
      if (d?.lead) setLead(d.lead as Lead);
      await refresh();
    } finally { setContactBusy(false); }
  }
  async function deleteContact(email: string) {
    if (!confirm(`Remove ${email} from this lead?`)) return;
    setContactBusy(true);
    try {
      const r = await fetch(`/api/leads/${leadId}/contacts`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const d = await r.json().catch(() => null);
      if (d?.lead) setLead(d.lead as Lead);
      await refresh();
    } finally { setContactBusy(false); }
  }
  async function enrich() {
    setEnrichBusy(true);
    try {
      await fetch(`/api/leads/${leadId}/enrich-contacts`, { method: 'POST' });
      await refresh();
    } finally { setEnrichBusy(false); }
  }
  async function saveToFolder(folder: string) {
    setActionBusy('busy');
    try {
      await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: folder }) });
      await refresh();
    } finally { setActionBusy(undefined); }
  }
  async function moveToProspect() {
    setActionBusy('busy');
    try {
      await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'prospect' }) });
      await refresh();
    } finally { setActionBusy(undefined); }
  }
  async function deleteLead() {
    if (!confirm(`Delete this lead? It will be removed from the CRM.`)) return;
    setActionBusy('busy');
    try {
      await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      if (onChanged) await onChanged();
      onClose?.();
    } finally { setActionBusy(undefined); }
  }

  // ─── Render ───────────────────────────────────────────────────

  const body = (() => {
    if (loading) {
      return <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading lead…</div>;
    }
    if (loadError || !lead) {
      return <div className="flex-1 flex items-center justify-center text-evari-danger text-sm">{loadError ?? 'Lead not found'}</div>;
    }
    const company: DiscoveredCompany = leadToDiscoveredCompany(lead);
    return (
      <div className="flex flex-col gap-3 h-full overflow-hidden">
        <CompanyPanel
          domain={company.domain}
          company={company}
          linkedPlayId={lead.playId ?? null}
          loading={enrichBusy}
          enrichPassCount={Number(Boolean(lead.orgProfile?.contactsEnrichedAt))}
          onEnrich={() => void enrich()}
          saveToFolder={{
            current: lead.category ?? undefined,
            onPick: (folder) => saveToFolder(folder),
            onCreate: (folder) => saveToFolder(folder),
          }}
          notes={{
            entries: (lead.noteEntries ?? []) as LeadNote[],
            onAdd: (text) => addNote(text),
            onEdit: (id, text) => editNote(id, text),
            onDelete: (id) => deleteNote(id),
            busy: noteBusy,
          }}
          contactOps={{
            onEdit: (email, patch) => editContact(email, patch),
            onDelete: (email) => deleteContact(email),
            busy: contactBusy,
          }}
          actions={
            <LeadPanelActions
              lead={lead}
              busy={actionBusy}
              onMoveToProspect={() => void moveToProspect()}
              onDelete={() => void deleteLead()}
            />
          }
        />
        <div className="shrink-0">
          <LeadConversationPanel email={lead.email} />
        </div>
      </div>
    );
  })();

  if (mode === 'embed') {
    return <div className="h-full overflow-hidden">{body}</div>;
  }

  // overlay mode — slide-over from the right
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-3xl bg-evari-surface border-l border-evari-edge/40 shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-200">
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] text-evari-dimmer">Lead detail</div>
            <h2 className="text-sm font-semibold text-evari-text truncate">{lead?.fullName || lead?.email || 'Loading…'}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden p-3">
          {body}
        </div>
      </aside>
    </>
  );
}
