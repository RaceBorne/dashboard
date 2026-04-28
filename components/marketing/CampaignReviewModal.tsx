'use client';

/**
 * Per-recipient pre-flight review with optional AI safety inspection.
 *
 * Shows one rendered (firstName-merged) email at a time. Bottom bar:
 *
 *   ← Prev   |   ⏸ Hold   |   ✓ Approve   |   Next →
 *
 * AI safety review (advisory):
 *   On open, the modal kicks off /inspect for every recipient. Results
 *   stream back as a flag map keyed by contactId. Each recipient's
 *   panel shows the flags inline, the summary screen counts how many
 *   recipients have flags. The AI never auto-holds anyone, but it does
 *   pre-fill the hold reason if the operator chooses to hold a flagged
 *   recipient.
 *
 * Send semantics on the new model:
 *   On Send, approved recipients fire immediately. Held recipients are
 *   posted to /send under `held: [{ contactId, reason, source, aiFlags }]`
 *   so the server can stash them in dashboard_mkt_held_recipients (the
 *   "holding pen") for later inspection + resend.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Pause,
  Send,
  Shield,
  Sparkles,
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

interface AIFlag {
  severity: 'info' | 'warn' | 'error';
  kind: string;
  message: string;
}

interface HeldPayload {
  contactId: string;
  reason?: string | null;
  source?: 'human' | 'ai' | 'both';
  aiFlags?: AIFlag[] | null;
}

interface Props {
  campaignId: string;
  /** Called when the operator hits Send. Now passes structured held items, not just ids. */
  onSend: (held: HeldPayload[]) => Promise<void>;
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

  // AI inspection state — advisory only, never blocks send.
  const [inspecting, setInspecting] = useState(false);
  const [aiFlags, setAiFlags] = useState<Record<string, AIFlag[]>>({});

  useEffect(() => {
    fetch(`/api/marketing/campaigns/${campaignId}/preview-recipients`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error ?? 'Load failed');
        const recs = d.recipients as PreviewRecipient[];
        setRecipients(recs);
        // Kick AI inspection in the background.
        if (recs.length > 0) runInspection(recs);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Load failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function runInspection(recs: PreviewRecipient[]) {
    setInspecting(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/inspect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipients: recs.map((r) => ({
            contactId: r.contactId,
            email: r.email,
            firstName: r.firstName,
            lastName: r.lastName,
            company: r.company,
            subject: r.subject,
            html: r.html,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; results?: Array<{ contactId: string; flags: AIFlag[] }> }
        | null;
      if (json?.results) {
        const map: Record<string, AIFlag[]> = {};
        for (const r of json.results) {
          if (r.flags && r.flags.length > 0) map[r.contactId] = r.flags;
        }
        setAiFlags(map);
      }
    } catch (e) {
      // Silently swallow — AI is advisory.
      console.warn('[review] ai inspect failed', e);
    } finally {
      setInspecting(false);
    }
  }

  const total = recipients?.length ?? 0;
  const current = recipients?.[idx] ?? null;
  const reviewedCount = approved.size + held.size;
  const remaining = total - reviewedCount;
  const flaggedCount = useMemo(() => Object.keys(aiFlags).length, [aiFlags]);

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
    // If AI flagged it and user didn't type a reason yet, pre-fill from the highest-severity flag.
    const flags = aiFlags[current.contactId];
    if (flags && flags.length > 0 && !holdReason[current.contactId]) {
      const top = [...flags].sort(severityRank)[0];
      setHoldReason((cur) => ({ ...cur, [current.contactId]: top.message }));
    }
    advance();
  }
  function advance() {
    if (!recipients) return;
    if (idx < recipients.length - 1) setIdx(idx + 1);
    else setShowSummary(true);
  }
  function prev() { if (idx > 0) { setIdx(idx - 1); setShowSummary(false); } }

  // Quick action: hold every recipient the AI flagged that hasn't been touched yet.
  function holdAllFlagged() {
    if (!recipients) return;
    const newHeld = new Set(held);
    const newApproved = new Set(approved);
    const newReason = { ...holdReason };
    for (const r of recipients) {
      const flags = aiFlags[r.contactId];
      if (!flags || flags.length === 0) continue;
      newHeld.add(r.contactId);
      newApproved.delete(r.contactId);
      if (!newReason[r.contactId]) {
        const top = [...flags].sort(severityRank)[0];
        newReason[r.contactId] = `[AI] ${top.message}`;
      }
    }
    setHeld(newHeld);
    setApproved(newApproved);
    setHoldReason(newReason);
  }

  async function send() {
    if (!recipients) return;
    setSending(true);
    try {
      const heldPayload: HeldPayload[] = Array.from(held).map((cid) => {
        const flags = aiFlags[cid] ?? null;
        const reason = holdReason[cid] ?? null;
        const source: 'human' | 'ai' | 'both' = flags && reason ? 'both' : flags ? 'ai' : 'human';
        return { contactId: cid, reason, source, aiFlags: flags };
      });
      await onSend(heldPayload);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-stretch p-4" onClick={onClose}>
      <div className="w-full max-w-5xl mx-auto rounded-panel bg-evari-surface border border-evari-edge/40 flex flex-col" onClick={(e) => e.stopPropagation()}>
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
          <div className="ml-auto flex items-center gap-2">
            {/* AI inspection status */}
            {inspecting ? (
              <div className="inline-flex items-center gap-1 text-[11px] text-evari-dim">
                <Sparkles className="h-3 w-3 animate-pulse" /> AI checking
              </div>
            ) : flaggedCount > 0 ? (
              <button
                type="button"
                onClick={holdAllFlagged}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-evari-warn/15 text-evari-warn hover:bg-evari-warn/25 transition"
                title="Hold every recipient AI flagged"
              >
                <Shield className="h-3 w-3" /> Hold all {flaggedCount} flagged
              </button>
            ) : recipients && recipients.length > 0 ? (
              <div className="inline-flex items-center gap-1 text-[11px] text-evari-success">
                <Sparkles className="h-3 w-3" /> AI clean
              </div>
            ) : null}
            <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Body */}
        {loadError ? (
          <div className="flex-1 flex items-center justify-center p-12 text-evari-danger text-sm">
            <AlertTriangle className="h-5 w-5 mr-2" /> {loadError}
          </div>
        ) : !recipients ? (
          <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading every recipient...
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
            aiFlags={aiFlags}
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
            flags={aiFlags[current.contactId] ?? []}
            inspecting={inspecting}
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
              onClick={() => {
                if (idx < (recipients?.length ?? 0) - 1) setIdx(idx + 1);
                else setShowSummary(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
            >
              {idx === recipients.length - 1 ? 'Finish review' : 'Skip ahead'} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function severityRank(a: AIFlag, b: AIFlag): number {
  const order: Record<AIFlag['severity'], number> = { error: 0, warn: 1, info: 2 };
  return order[a.severity] - order[b.severity];
}

function FlagPill({ flag }: { flag: AIFlag }) {
  const cls =
    flag.severity === 'error'
      ? 'bg-evari-danger/15 text-evari-danger border-evari-danger/30'
      : flag.severity === 'warn'
        ? 'bg-evari-warn/15 text-evari-warn border-evari-warn/30'
        : 'bg-evari-ink/40 text-evari-dim border-evari-edge/30';
  const Icon = flag.severity === 'info' ? Info : AlertTriangle;
  return (
    <li className={cn('rounded-md border px-2 py-1.5 text-[11px] flex items-start gap-1.5', cls)}>
      <Icon className="h-3 w-3 mt-0.5 flex-shrink-0" />
      <span>{flag.message}</span>
    </li>
  );
}

function PreviewPane({
  recipient,
  isHeld,
  isApproved,
  holdReason,
  onChangeHoldReason,
  flags,
  inspecting,
}: {
  recipient: PreviewRecipient;
  isHeld: boolean;
  isApproved: boolean;
  holdReason: string;
  onChangeHoldReason: (s: string) => void;
  flags: AIFlag[];
  inspecting: boolean;
}) {
  const fullName = `${recipient.firstName ?? ''} ${recipient.lastName ?? ''}`.trim();
  const sortedFlags = [...flags].sort(severityRank);
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

        {/* AI safety flags — visually loud when present */}
        <div className="mt-4">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5">
            <Sparkles className="h-3 w-3" /> AI safety check
          </div>
          {inspecting && flags.length === 0 ? (
            <div className="text-[11px] text-evari-dim flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Reviewing...
            </div>
          ) : sortedFlags.length === 0 ? (
            <div className="text-[11px] text-evari-success flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" /> No issues spotted
            </div>
          ) : (
            <ul className="space-y-1.5">
              {sortedFlags.map((f, i) => <FlagPill key={i} flag={f} />)}
            </ul>
          )}
        </div>

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

      {/* RIGHT: the email exactly as it would land */}
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

function Summary({
  total,
  approvedCount,
  heldCount,
  heldRecipients,
  holdReason,
  aiFlags,
  onEditHold,
  onSend,
  sending,
}: {
  total: number;
  approvedCount: number;
  heldCount: number;
  heldRecipients: PreviewRecipient[];
  holdReason: Record<string, string>;
  aiFlags: Record<string, AIFlag[]>;
  onEditHold: (contactId: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const willSend = approvedCount;
  const cantSend = total - approvedCount - heldCount;
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h3 className="text-xl font-bold text-evari-text">Review complete</h3>
          <p className="text-[12px] text-evari-dim mt-1">
            Approved recipients send right now. Held ones go to the holding pen for this campaign, where you can fix the issue and send them after.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="Will send now" value={willSend} accent="success" />
          <SummaryStat label="To holding pen" value={heldCount} accent="warn" />
          <SummaryStat label="Not reviewed" value={Math.max(0, cantSend)} accent="mute" />
        </div>

        {heldCount > 0 ? (
          <section className="rounded-md border border-evari-warn/30 bg-evari-warn/5 p-3">
            <div className="text-[12px] font-semibold text-evari-warn mb-2 inline-flex items-center gap-1">
              <Pause className="h-3.5 w-3.5" /> Held for the holding pen ({heldCount})
            </div>
            <ul className="space-y-1.5">
              {heldRecipients.map((r) => {
                const flags = aiFlags[r.contactId] ?? [];
                return (
                  <li key={r.contactId} className="flex items-start gap-2 text-[12px]">
                    <button
                      type="button"
                      onClick={() => onEditHold(r.contactId)}
                      className="text-evari-text hover:text-evari-gold transition-colors text-left flex-1 min-w-0"
                    >
                      <div className="font-medium truncate">{[r.firstName, r.lastName].filter(Boolean).join(' ') || r.email}</div>
                      <div className="text-evari-dim text-[11px] font-mono truncate">{r.email}</div>
                      {holdReason[r.contactId] ? <div className="text-evari-warn text-[11px] mt-0.5">{holdReason[r.contactId]}</div> : null}
                      {flags.length > 0 ? (
                        <div className="text-evari-dim text-[10px] mt-0.5 inline-flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> {flags.length} AI flag{flags.length === 1 ? '' : 's'}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-evari-dimmer mt-3">
              You can re-send these from the campaign report once you have fixed whatever was wrong (e.g., updated their first name on the lead).
            </p>
          </section>
        ) : null}

        <button
          type="button"
          onClick={onSend}
          disabled={sending || (willSend === 0 && heldCount === 0)}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending
            ? 'Sending...'
            : willSend === 0
              ? heldCount > 0
                ? `Park ${heldCount} in holding pen`
                : 'Nothing to send'
              : heldCount > 0
                ? `Send ${willSend} now, hold ${heldCount} for later`
                : `Send to ${willSend} approved recipient${willSend === 1 ? '' : 's'}`}
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
