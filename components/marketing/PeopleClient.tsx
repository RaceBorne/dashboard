'use client';

/**
 * Person-centric inbox.
 *
 * Left: list of people (search-filterable). Right: when a person is
 * selected, a unified chronological feed pulled from
 * /api/marketing/people/<id> — every email sent, every reply, every
 * recipient event, every prospecting signal already in the system,
 * sorted newest first.
 *
 * Rationale: Klaviyo's mental model is "a campaign and its stats".
 * For a small brand the more useful axis is "this person and what's
 * happening with them". This page is that view.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Eye,
  Loader2,
  Mail,
  MailOpen,
  MousePointerClick,
  Search,
  Send,
  TriangleAlert,
} from 'lucide-react';

import { cn } from '@/lib/utils';

interface Person {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  lastTouchAt: string | null;
}

interface FeedItem {
  id: string;
  at: string;
  kind: 'event' | 'conversation_in' | 'conversation_out' | 'recipient';
  title: string;
  detail?: string | null;
  href?: string | null;
}

const KIND_ICON: Record<FeedItem['kind'], React.ComponentType<{ className?: string }>> = {
  event: Eye,
  conversation_in: ArrowUpRight,
  conversation_out: Send,
  recipient: Mail,
};

export function PeopleClient({ initial }: { initial: Person[] }) {
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<Person[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);

  useEffect(() => {
    if (!search) { setPeople(initial); return; }
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/marketing/people?q=${encodeURIComponent(search)}`, { cache: 'no-store' });
      const json = (await res.json()) as { people?: Person[] };
      setPeople(json.people ?? []);
    }, 200);
    return () => window.clearTimeout(t);
  }, [search, initial]);

  useEffect(() => {
    if (!selectedId) { setFeed(null); return; }
    setFeedLoading(true);
    fetch(`/api/marketing/people/${selectedId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setFeed(d?.feed ?? []))
      .finally(() => setFeedLoading(false));
  }, [selectedId]);

  const selectedPerson = useMemo(() => people.find((p) => p.id === selectedId) ?? null, [people, selectedId]);

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)] divide-x divide-evari-edge/30 bg-evari-ink">
      {/* LEFT: people list */}
      <aside className="flex flex-col min-h-0">
        <header className="px-3 py-2 border-b border-evari-edge/30 flex items-center gap-2 bg-evari-surface">
          <Search className="h-4 w-4 text-evari-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people"
            className="flex-1 bg-transparent text-evari-text text-[12px] focus:outline-none placeholder-evari-dimmer"
          />
        </header>
        <ul className="flex-1 overflow-y-auto">
          {people.map((p) => {
            const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email;
            const active = p.id === selectedId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cn('w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-evari-edge/15 transition-colors',
                    active ? 'bg-evari-gold/10 border-l-2 border-l-evari-gold' : 'hover:bg-evari-surface')}
                >
                  <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-evari-ink/40 text-[10px] font-semibold text-evari-dim uppercase shrink-0">
                    {fullName.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-evari-text truncate">{fullName}</div>
                    <div className="text-[11px] text-evari-dim truncate font-mono">{p.email}</div>
                  </div>
                  {p.status === 'unsubscribed' || p.status === 'suppressed'
                    ? <TriangleAlert className="h-3 w-3 text-evari-warn shrink-0" />
                    : null}
                  <ChevronRight className="h-3.5 w-3.5 text-evari-dimmer shrink-0" />
                </button>
              </li>
            );
          })}
          {people.length === 0 ? <li className="px-3 py-6 text-[12px] text-evari-dim">No matches.</li> : null}
        </ul>
      </aside>

      {/* RIGHT: feed */}
      <section className="flex flex-col min-h-0">
        {selectedPerson ? (
          <>
            <header className="px-4 py-3 border-b border-evari-edge/30 bg-evari-surface flex items-center gap-3">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-evari-ink/40 text-[12px] font-semibold text-evari-dim uppercase">
                {`${selectedPerson.firstName ?? ''} ${selectedPerson.lastName ?? ''}`.trim().slice(0, 2) || selectedPerson.email.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[14px] font-semibold text-evari-text truncate">
                  {`${selectedPerson.firstName ?? ''} ${selectedPerson.lastName ?? ''}`.trim() || selectedPerson.email}
                </h2>
                <div className="text-[11px] text-evari-dim font-mono truncate">{selectedPerson.email}</div>
                {selectedPerson.company ? <div className="text-[11px] text-evari-dim truncate">{selectedPerson.company}</div> : null}
              </div>
              <a
                href={`/leads?id=${encodeURIComponent(selectedPerson.id)}`}
                target="_blank" rel="noopener"
                className="text-[11px] text-evari-gold hover:underline"
              >
                Open lead →
              </a>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {feedLoading ? (
                <div className="flex items-center justify-center py-12 text-evari-dim text-[12px]"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading feed...</div>
              ) : !feed || feed.length === 0 ? (
                <div className="text-[12px] text-evari-dim py-6">No activity recorded for this person yet.</div>
              ) : (
                <ul className="space-y-2 max-w-3xl mx-auto">
                  {feed.map((it) => {
                    const Icon = ICON_FOR_FEED(it);
                    const tone = TONE_FOR_FEED(it);
                    return (
                      <li key={it.id} className={cn('flex items-start gap-3 rounded-md border p-3',
                        tone === 'success' ? 'bg-evari-success/5 border-evari-success/20' :
                        tone === 'warn' ? 'bg-evari-warn/5 border-evari-warn/20' :
                        tone === 'inbound' ? 'bg-evari-gold/5 border-evari-gold/30' :
                        'bg-evari-surface border-evari-edge/30')}>
                        <span className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md shrink-0',
                          tone === 'success' ? 'bg-evari-success/15 text-evari-success' :
                          tone === 'warn' ? 'bg-evari-warn/15 text-evari-warn' :
                          tone === 'inbound' ? 'bg-evari-gold/15 text-evari-gold' :
                          'bg-evari-ink/40 text-evari-dim')}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-semibold text-evari-text">{it.title}</span>
                            <span className="text-[10px] text-evari-dimmer font-mono tabular-nums ml-auto">{new Date(it.at).toLocaleString()}</span>
                          </div>
                          {it.detail ? <div className="text-[11px] text-evari-dim mt-0.5 truncate">{it.detail}</div> : null}
                          {it.href ? <a href={it.href} className="text-[10px] text-evari-gold hover:underline mt-0.5 inline-block">Open →</a> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-evari-dim text-[12px]">Pick someone on the left.</div>
        )}
      </section>
    </div>
  );
}

function ICON_FOR_FEED(it: FeedItem) {
  if (it.kind === 'event') {
    if (it.title === 'Email opened') return MailOpen;
    if (it.title === 'Link clicked') return MousePointerClick;
    if (it.title === 'Email bounced') return TriangleAlert;
    if (it.title === 'Unsubscribed' || it.title === 'Subscription changed' || it.title === 'Spam complaint') return TriangleAlert;
    if (it.title === 'Campaign sent') return Send;
    return CheckCircle2;
  }
  if (it.kind === 'conversation_in') return ArrowUpRight;
  if (it.kind === 'conversation_out') return Send;
  if (it.kind === 'recipient') {
    if (it.title === 'Campaign opened') return MailOpen;
    if (it.title === 'Campaign clicked') return MousePointerClick;
    if (it.title === 'Campaign bounced') return TriangleAlert;
    return Send;
  }
  return Mail;
}

function TONE_FOR_FEED(it: FeedItem): 'default' | 'success' | 'warn' | 'inbound' {
  if (it.kind === 'conversation_in') return 'inbound';
  if (it.title === 'Email opened' || it.title === 'Campaign opened' || it.title === 'Link clicked' || it.title === 'Campaign clicked') return 'success';
  if (it.title.includes('bounced') || it.title.includes('spam') || it.title === 'Unsubscribed' || it.title === 'Subscription changed') return 'warn';
  return 'default';
}
