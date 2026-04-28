'use client';

/**
 * Inbox card on the campaigns list. Renders the pending follow-up
 * suggestions that the smart-followups scan generated. Each row gives
 * Accept (creates draft direct-message campaign) and Dismiss.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Send, Sparkles, X } from 'lucide-react';

interface Suggestion {
  id: string;
  campaignId: string;
  campaignName: string;
  reason: string;
  openRate: number;
  recipientCount: number;
  nonOpenerCount: number;
  draftSubject: string;
  draftBody: string;
  status: 'pending' | 'dismissed' | 'sent';
  createdAt: string;
}

export function FollowupInbox() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/marketing/followups', { cache: 'no-store' });
    const json = (await res.json()) as { ok?: boolean; suggestions?: Suggestion[] };
    setItems(json?.suggestions ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function dismiss(id: string) {
    setBusy(`dismiss:${id}`);
    try {
      await fetch(`/api/marketing/followups/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }) });
      await load();
    } finally { setBusy(null); }
  }

  async function accept(id: string) {
    setBusy(`accept:${id}`);
    try {
      const res = await fetch(`/api/marketing/followups/${id}/accept`, { method: 'POST' });
      const json = await res.json();
      if (json?.campaignId) window.location.href = `/email/campaigns/${json.campaignId}`;
      else await load();
    } finally { setBusy(null); }
  }

  if (items === null || items.length === 0) return null;

  return (
    <div className="rounded-panel bg-evari-surface border border-evari-gold/30 p-3 mb-3">
      <header className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-evari-gold/15 text-evari-gold">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-evari-text">Smart follow-ups</h3>
          <p className="text-[11px] text-evari-dim">{items.length} suggestion{items.length === 1 ? '' : 's'} from low-engagement sends.</p>
        </div>
      </header>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className="rounded-md bg-evari-ink/30 border border-evari-edge/30 p-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/email/campaigns/${s.campaignId}`} className="text-[13px] font-semibold text-evari-text hover:text-evari-gold truncate block">{s.campaignName}</Link>
                <p className="text-[11px] text-evari-dim mt-0.5">{s.reason}. {s.nonOpenerCount} non-opener{s.nonOpenerCount === 1 ? '' : 's'}.</p>
                {s.draftSubject ? <p className="text-[12px] text-evari-text mt-1.5 italic truncate"><span className="text-evari-dimmer">Draft subject:</span> {s.draftSubject}</p> : null}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => accept(s.id)}
                  disabled={busy === `accept:${s.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
                >
                  {busy === `accept:${s.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Accept
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(s.id)}
                  disabled={busy === `dismiss:${s.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-danger disabled:opacity-50 transition"
                >
                  {busy === `dismiss:${s.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />} Dismiss
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FollowupInboxBadge() {
  // (Reserved hook for future top-bar count.)
  return <CheckCircle2 className="hidden" />;
}
