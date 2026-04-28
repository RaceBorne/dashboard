'use client';

import { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MarketingEvent } from '@/lib/marketing/types';

interface Props {
  contactId: string;
  initialEvents: MarketingEvent[];
}

/**
 * Reverse-chronological event log for a single contact. Initial set
 * is server-rendered; the 'Refresh' button re-fetches without a
 * full page reload so the user can see new events flow in (e.g.
 * after firing a test track from another tab).
 */
export function EventTimeline({ contactId, initialEvents }: Props) {
  const [events, setEvents] = useState<MarketingEvent[]>(initialEvents);
  const [busy, setBusy] = useState(false);

  // Sync if the server prop changes via router.refresh()
  useEffect(() => setEvents(initialEvents), [initialEvents]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/contacts/${contactId}/events`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.events)) setEvents(data.events as MarketingEvent[]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4 lg:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-evari-text inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-evari-dim" />
          Event timeline
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs',
            'bg-evari-ink text-evari-dim hover:text-evari-text disabled:opacity-40',
            'transition-colors duration-500 ease-in-out',
          )}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-evari-dimmer italic">
          No events tracked yet for this contact. Fire one with{' '}
          <code className="px-1.5 py-0.5 rounded bg-evari-ink text-[11px] text-evari-text font-mono">
            POST /api/marketing/events
          </code>
          .
        </p>
      ) : (
        <ol className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-md bg-evari-ink/40 border border-evari-edge/20 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-evari-text">
                  {e.type}
                </span>
                <time
                  dateTime={e.createdAt}
                  className="text-[10px] font-mono tabular-nums text-evari-dimmer shrink-0"
                  title={new Date(e.createdAt).toLocaleString()}
                >
                  {new Date(e.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                </time>
              </div>
              {Object.keys(e.metadata).length > 0 ? (
                <pre className="mt-1.5 text-[11px] font-mono text-evari-dim leading-snug whitespace-pre-wrap break-words bg-evari-ink/40 rounded px-2 py-1 max-h-40 overflow-auto">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
