'use client';

/**
 * Holding Pen panel for the campaign report.
 *
 * Shows every recipient who was held back during the pre-flight review,
 * grouped by source (AI flagged, human held, or both). Each row offers:
 *   - Open lead -> jump to the lead page so the operator can fix the
 *     underlying data (missing first name, wrong company, etc).
 *   - Send now  -> dispatches /send-held with this single contactId.
 *   - Discard   -> removes from the holding pen without sending.
 *
 * Bulk actions: Send all, Discard all.
 *
 * Self-contained: fetches its own data on mount + after every action.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Pause,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface AIFlag {
  severity: 'info' | 'warn' | 'error';
  kind: string;
  message: string;
}

interface HeldRecipient {
  id: string;
  campaignId: string;
  contactId: string;
  reason: string | null;
  source: 'human' | 'ai' | 'both';
  aiFlags: AIFlag[] | null;
  heldAt: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
}

interface Props {
  campaignId: string;
}

export function HoldingPenPanel({ campaignId }: Props) {
  const [held, setHeld] = useState<HeldRecipient[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/holding-pen`, { cache: 'no-store' });
      const json = (await res.json()) as { ok?: boolean; held?: HeldRecipient[] };
      setHeld(json?.held ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }, [campaignId]);

  useEffect(() => { void load(); }, [load]);

  async function sendOne(contactId: string) {
    setBusy(`send:${contactId}`); setError(null); setLastResult(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/send-held`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      const json = await res.json();
      if (!json.ok && !json.attempted) throw new Error(json.error ?? 'Send failed');
      setLastResult(`Sent ${json.sent ?? 0}, failed ${json.failed ?? 0}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(null);
    }
  }

  async function sendAll() {
    if (!held || held.length === 0) return;
    setBusy('send:all'); setError(null); setLastResult(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/send-held`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      setLastResult(`Sent ${json.sent ?? 0} of ${json.attempted ?? 0}, failed ${json.failed ?? 0}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusy(null);
    }
  }

  async function discard(contactId: string) {
    setBusy(`discard:${contactId}`); setError(null);
    try {
      await fetch(`/api/marketing/campaigns/${campaignId}/holding-pen`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusy(null);
    }
  }

  async function discardAll() {
    if (!held || held.length === 0) return;
    if (!window.confirm(`Discard all ${held.length} held recipients without sending?`)) return;
    setBusy('discard:all'); setError(null);
    try {
      await fetch(`/api/marketing/campaigns/${campaignId}/holding-pen`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusy(null);
    }
  }

  if (held === null) {
    return (
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 p-6 text-[13px] text-evari-dim flex items-center gap-2 mb-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading holding pen...
      </div>
    );
  }

  if (held.length === 0) {
    return null;
  }

  return (
    <div className="rounded-panel bg-evari-surface border border-evari-warn/30 mb-3">
      <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-3">
        <div className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-evari-warn/15 text-evari-warn">
          <Pause className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-evari-text">Holding pen</h3>
          <p className="text-[11px] text-evari-dim mt-0.5">
            {held.length} recipient{held.length === 1 ? '' : 's'} held back during review. Fix the issue, then send them. Or discard.
          </p>
        </div>
        <button
          type="button"
          onClick={sendAll}
          disabled={busy === 'send:all'}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
        >
          {busy === 'send:all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send all
        </button>
        <button
          type="button"
          onClick={discardAll}
          disabled={busy === 'discard:all'}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-dim hover:text-evari-danger disabled:opacity-50 transition"
        >
          {busy === 'discard:all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Discard all
        </button>
      </header>

      {(lastResult || error) ? (
        <div className={cn('px-4 py-2 text-[11px] border-b border-evari-edge/30',
          error ? 'bg-evari-danger/10 text-evari-danger' : 'bg-evari-success/10 text-evari-success')}>
          {error ?? lastResult}
        </div>
      ) : null}

      <ul className="divide-y divide-evari-edge/20">
        {held.map((h) => {
          const fullName = `${h.firstName ?? ''} ${h.lastName ?? ''}`.trim();
          const flags = h.aiFlags ?? [];
          return (
            <li key={h.id} className="px-4 py-3 flex items-start gap-3">
              <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-evari-ink/40 text-[11px] font-semibold text-evari-dim uppercase mt-0.5 shrink-0">
                {(fullName || h.email || '?').slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-semibold text-evari-text truncate">{fullName || '(no name)'}</div>
                  <SourceBadge source={h.source} />
                </div>
                <div className="text-[11px] text-evari-dim font-mono truncate">{h.email}</div>
                {h.reason ? (
                  <div className="mt-1.5 text-[11px] text-evari-warn flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{h.reason}</span>
                  </div>
                ) : null}
                {flags.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {flags.slice(0, 3).map((f, i) => (
                      <li key={i} className={cn('text-[11px] flex items-start gap-1',
                        f.severity === 'error' ? 'text-evari-danger' : f.severity === 'warn' ? 'text-evari-warn' : 'text-evari-dim')}>
                        {f.severity === 'info'
                          ? <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          : <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                        <span>{f.message}</span>
                      </li>
                    ))}
                    {flags.length > 3 ? (
                      <li className="text-[10px] text-evari-dimmer">+ {flags.length - 3} more flag{flags.length - 3 === 1 ? '' : 's'}</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => sendOne(h.contactId)}
                  disabled={busy === `send:${h.contactId}` || busy === 'send:all'}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-evari-gold/15 text-evari-gold hover:bg-evari-gold/25 disabled:opacity-50 transition"
                >
                  {busy === `send:${h.contactId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send now
                </button>
                <a
                  href={`/leads?id=${encodeURIComponent(h.contactId)}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-text transition"
                >
                  <User className="h-3 w-3" /> Open
                </a>
                <button
                  type="button"
                  onClick={() => discard(h.contactId)}
                  disabled={busy === `discard:${h.contactId}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-danger disabled:opacity-50 transition"
                >
                  {busy === `discard:${h.contactId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Discard
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SourceBadge({ source }: { source: 'human' | 'ai' | 'both' }) {
  if (source === 'ai') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-evari-warn/15 text-evari-warn">
        <Sparkles className="h-2.5 w-2.5" /> AI
      </span>
    );
  }
  if (source === 'both') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-evari-gold/15 text-evari-gold">
        <Sparkles className="h-2.5 w-2.5" /> AI + you
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-evari-ink/40 text-evari-dim">
      <CheckCircle2 className="h-2.5 w-2.5" /> You
    </span>
  );
}
