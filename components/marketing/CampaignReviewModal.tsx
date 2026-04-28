'use client';

/**
 * Per-recipient review walk-through. Mounts after the operator
 * clicks "Review each email" on the Send step. Shows one rendered
 * (firstName-merged) email at a time. Bottom controls let them:
 *
 *   ← Prev   |   ✓ Approve   |   ⏸ Hold   |   Next →
 *
 * Held contacts are accumulated client-side; on Send, they're
 * passed to /api/marketing/campaigns/[id]/send as
 * excludeContactIds so the send pipeline skips them entirely
 * (no recipient row, no count, no charge against deliverability).
 *
 * Uses the existing /preview-recipients endpoint which renders
 * each recipient with the same merge substitution sendCampaign
 * would apply, so what the operator reviews IS what would ship.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Send,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface PreviewRecipient {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  leadId: string | null;
  html: string;
  subject: string;
  excludedReason?: string;
}

interface Props {
  campaignId: string;
  /** Called when the operator hits Send — passes the held contact ids. */
  onSend: (excludeContactIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function CampaignReviewModal({ campaignId, onSend, onClose }: Props) {
  const [recipients, setRecipients] = useState<PreviewRecipient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [holdReason, setHoldReason] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/marketing/campaigns/${campaignId}/preview-recipients`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error ?? 'Load failed');
        setRecipients(d.recipients as PreviewRecipient[]);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Load failed'));
  }, [campaignId]);

  const total = recipients?.length ?? 0;
  const current = recipients?.[idx] ?? null;
  const reviewedCount = approved.size + held.size;
  const remaining = total - reviewedCount;

  function approve() {
    if (!current) return;
    const next = new Set(approved); next.add(current.contactId);
    setApproved(next);
    const nh = new Set(held); nh.delete(current.contactId);
    setHeld(nh);
    advance();
  }
  function hold() {
    if (!current) return;
    const next = new Set(held); next.add(current.contactId);
    setHeld(next);
    const na = new Set(approved); na.delete(current.contactId);
    setApproved(na);
    advance();
  }
  function advance() {
    if (!recipients) return;
    if (idx < recipients.length - 1) setIdx(idx + 1);
    else setShowSummary(true);
  }
  function prev() { if (idx > 0) { setIdx(idx - 1); setShowSummary(false); } }

  async function send() {
    setSending(true);
    try {
      await onSend(Array.from(held));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-stretch p-4" onClick={onClose}>
      <div className="w-full max-w-5xl mx-auto rounded-md bg-evari-surface border border-evari-edge/40 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-3">
          <h2 className="text-sm font-semibold text-evari-text">Review each email</h2>
          {recipients ? (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-evari-dim">
                <strong className="text-evari-text">{idx + 1}</strong> of {total}
              </span>
              <span className="text-evari-dimmer">·</span>
              <span className="text-evari-success">{approved.size} approved</span>
              <span className="text-evari-dimmer">·</span>
              <span className="text-evari-warn">{held.size} held</span>
              <span className="text-evari-dimmer">·</span>
              <span className="text-evari-dim">{remaining} to review</span>
            </div>
          ) : null}
          <button type="button" onClick={onClose} className="ml-auto text-evari-dim hover:text-evari-text p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        {loadError ? (
          <div className="flex-1 flex items-center justify-center p-12 text-evari-danger text-sm">
            <AlertTriangle className="h-5 w-5 mr-2" /> {loadError}
          </div>
        ) : !recipients ? (
          <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading every recipient…
          </div>
        ) : recipients.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12 text-evari-dim text-sm">
            No recipients resolved for this campaign. Add members to the list before sending.
          </div>
        ) : showSummary ? (
          <Summary
            total={total}
            approvedCount={approved.size}
            heldCount={held.size}
            heldRecipients={recipients.filter((r) => held.has(r.contactId))}
            holdReason={holdReason}
            onEditHold={(contactId) => {
              const i = recipients.findIndex((r) => r.contactId === contactId);
              if (i >= 0) { setIdx(i); setShowSummary(false); }
            }}
            onSend={send}
            sending={sending}
          />
        ) : current ? (
          <PreviewPane
            recipient={current}
            isHeld={held.has(current.contactId)}
            isApproved={approved.has(current.contactId)}
            holdReason={holdReason[current.contactId] ?? ''}
            onChangeHoldReason={(reason) => setHoldReason((cur) => ({ ...cur, [current.contactId]: reason }))}
          />
        ) : null}

        {/* Footer nav */}
        {recipients && recipients.length > 0 && !showSummary ? (
          <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center gap-2">
            <button
              type="button"
              onClick={prev}
              disabled={idx === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text disabled:opacity-30 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={hold}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors',
                current && held.has(current.contactId)
                  ? 'bg-evari-warn text-evari-ink'
                  : 'bg-evari-warn/15 text-evari-warn hover:bg-evari-warn/25',
              )}
            >
              <Pause className="h-3.5 w-3.5" /> Hold
            </button>
            <button
              type="button"
              onClick={approve}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors',
                current && approved.has(current.contactId)
                  ? 'bg-evari-success text-white'
                  : 'bg-evari-success/15 text-evari-success hover:bg-evari-success/25',
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              type="button"
              onClick={advance}
              disabled={idx === recipients.length - 1 && approved.has(current?.contactId ?? '') === false && held.has(current?.contactId ?? '') === false}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
            >
              {idx === recipients.length - 1 ? 'Finish review' : 'Skip ahead'} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function PreviewPane({ recipient, isHeld, isApproved, holdReason, onChangeHoldReason }: { recipient: PreviewRecipient; isHeld: boolean; isApproved: boolean; holdReason: string; onChangeHoldReason: (s: string) => void }) {
  const fullName = `${recipient.firstName ?? ''} ${recipient.lastName ?? ''}`.trim();
  return (
    <div className="flex-1 min-h-0 grid grid-cols-[280px_minmax(0,1fr)] divide-x divide-evari-edge/20 overflow-hidden">
      {/* LEFT: who this is */}
      <aside className="flex flex-col overflow-y-auto p-4 bg-evari-ink/30">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-evari-surface text-[16px] font-semibold text-evari-dim uppercase mb-3">
          {(fullName || recipient.email).slice(0, 2)}
        </div>
        <div className="text-evari-text font-semibold text-[14px]">{fullName || '(no name on record)'}</div>
        <div className="text-evari-dim text-[11px] font-mono break-all">{recipient.email}</div>
        {recipient.company ? <div className="text-evari-dim text-[12px] mt-2">{recipient.company}</div> : null}
        {recipient.leadId ? (
          <a href={`/leads?id=${encodeURIComponent(recipient.leadId)}`} target="_blank" rel="noopener" className="text-[11px] text-evari-gold hover:underline mt-3 inline-flex items-center gap-1">
            Open full record →
          </a>
        ) : null}
        {recipient.excludedReason ? (
          <div className="mt-4 rounded-md bg-evari-warn/10 border border-evari-warn/30 p-2 text-[11px] text-evari-warn">
            <AlertTriangle className="h-3 w-3 inline-block mr-1" />
            Will be excluded at send: {recipient.excludedReason}
          </div>
        ) : null}
        {/* Status pill */}
        <div className="mt-4">
          {isApproved ? (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-evari-success/15 text-evari-success">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </div>
          ) : isHeld ? (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-evari-warn/15 text-evari-warn">
              <Clock className="h-3 w-3" /> Held
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-evari-ink/40 text-evari-dim">
              Awaiting review
            </div>
          )}
        </div>
        {/* Hold reason — only relevant when held */}
        {isHeld ? (
          <div className="mt-3">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Reason (optional)</span>
            <textarea
              value={holdReason}
              onChange={(e) => onChangeHoldReason(e.target.value)}
              placeholder="Missing first name, typo, wrong company, etc."
              className="w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-warn/60 focus:outline-none min-h-[80px]"
            />
          </div>
        ) : null}
      </aside>

      {/* RIGHT: the email exactly as it'd land */}
      <div className="overflow-y-auto bg-evari-ink/40">
        <div className="px-4 py-3 border-b border-evari-edge/20 bg-evari-surface">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Subject</div>
          <div className="text-[14px] font-semibold text-evari-text mt-0.5">{recipient.subject || <em className="text-evari-dimmer">No subject</em>}</div>
        </div>
        <div className="p-4">
          <div className="rounded-md bg-white text-zinc-900 p-5 max-w-[640px] mx-auto" dangerouslySetInnerHTML={{ __html: recipient.html }} />
        </div>
      </div>
    </div>
  );
}

function Summary({ total, approvedCount, heldCount, heldRecipients, holdReason, onEditHold, onSend, sending }: { total: number; approvedCount: number; heldCount: number; heldRecipients: PreviewRecipient[]; holdReason: Record<string, string>; onEditHold: (contactId: string) => void; onSend: () => void; sending: boolean }) {
  const willSend = approvedCount;
  const cantSend = total - approvedCount - heldCount;
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h3 className="text-xl font-bold text-evari-text">Review complete</h3>
          <p className="text-[12px] text-evari-dim mt-1">Confirm the summary, then send. Held recipients are excluded entirely — no row, no charge, no deliverability hit.</p>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="Will send" value={willSend} accent="success" />
          <SummaryStat label="Held back" value={heldCount} accent="warn" />
          <SummaryStat label="Not reviewed" value={Math.max(0, cantSend)} accent="mute" />
        </div>

        {heldCount > 0 ? (
          <section className="rounded-md border border-evari-warn/30 bg-evari-warn/5 p-3">
            <div className="text-[12px] font-semibold text-evari-warn mb-2 inline-flex items-center gap-1">
              <Pause className="h-3.5 w-3.5" /> Held recipients ({heldCount})
            </div>
            <ul className="space-y-1.5">
              {heldRecipients.map((r) => (
                <li key={r.contactId} className="flex items-start gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => onEditHold(r.contactId)}
                    className="text-evari-text hover:text-evari-gold transition-colors text-left flex-1 min-w-0"
                  >
                    <div className="font-medium truncate">{[r.firstName, r.lastName].filter(Boolean).join(' ') || r.email}</div>
                    <div className="text-evari-dim text-[11px] font-mono truncate">{r.email}</div>
                    {holdReason[r.contactId] ? <div className="text-evari-warn text-[11px] mt-0.5">{holdReason[r.contactId]}</div> : null}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-evari-dimmer mt-3">
              Tip: copy these emails out before sending if you want to follow up manually after fixing whatever's wrong.
            </p>
          </section>
        ) : null}

        <button
          type="button"
          onClick={onSend}
          disabled={sending || willSend === 0}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending…' : willSend === 0 ? 'Nothing approved to send' : `Send to ${willSend} approved recipient${willSend === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent: 'success' | 'warn' | 'mute' }) {
  const cls = accent === 'success' ? 'text-evari-success bg-evari-success/10' : accent === 'warn' ? 'text-evari-warn bg-evari-warn/10' : 'text-evari-dim bg-evari-ink/40';
  return (
    <div className={cn('rounded-md p-3 text-center', cls)}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] mt-0.5 opacity-80">{label}</div>
    </div>
  );
}
