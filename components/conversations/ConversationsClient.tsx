'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Sparkles, Send, ChevronRight, RefreshCw, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageResponse } from '@/components/MessageResponse';
import { cn, relativeTime } from '@/lib/utils';
import type { Lead, Thread } from '@/lib/types';

interface Props {
  threads: Thread[];
  leads: Lead[];
  initialThreadId: string;
}

export function ConversationsClient({ threads, leads, initialThreadId }: Props) {
  const [threadId, setThreadId] = useState(initialThreadId);
  const [draft, setDraft] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMock, setAiMock] = useState(false);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
    [threads],
  );
  const thread = threads.find((t) => t.id === threadId);
  const lead = thread?.leadId ? leads.find((l) => l.id === thread.leadId) : undefined;

  async function suggestReply() {
    if (!thread) return;
    setAiLoading(true);
    setDraft('');
    try {
      const res = await fetch('/api/conversations/' + thread.id + '/suggest-reply', {
        method: 'POST',
      });
      const data = (await res.json()) as { markdown: string; mock: boolean };
      setDraft(data.markdown);
      setAiMock(data.mock);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Pane 1 — thread list */}
      <aside className="w-[320px] shrink-0 border-r border-evari-edge bg-evari-carbon flex flex-col">
        <div className="px-4 py-3 border-b border-evari-edge text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Inbox · Evari/Leads
        </div>
        <div className="flex-1 overflow-y-auto">
          {sortedThreads.map((t) => {
            const last = t.messages[t.messages.length - 1];
            const otherName = t.participants.find((p) => p.role === 'lead')?.name ?? 'Unknown';
            const active = t.id === threadId;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setThreadId(t.id);
                  setDraft('');
                }}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-evari-edge transition-colors',
                  active ? 'bg-evari-surface' : 'hover:bg-evari-surface/40',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {t.unread && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  <div
                    className={cn(
                      'text-sm font-medium truncate flex-1 min-w-0',
                      t.unread ? 'text-evari-text' : 'text-evari-dim',
                    )}
                  >
                    {otherName}
                  </div>
                  <div className="text-[10px] text-evari-dimmer font-mono tabular-nums shrink-0">
                    {relativeTime(t.lastMessageAt)}
                  </div>
                </div>
                <div className="text-xs text-evari-text truncate">{t.subject}</div>
                <div className="text-[11px] text-evari-dimmer truncate mt-1">
                  {last.bodyMarkdown.replace(/[#*`>_-]/g, '').slice(0, 80)}…
                </div>
                <div className="flex gap-1 mt-2">
                  {t.status === 'awaiting_us' && (
                    <Badge variant="warning" className="text-[9px]">
                      awaiting reply
                    </Badge>
                  )}
                  {t.status === 'awaiting_lead' && (
                    <Badge variant="muted" className="text-[9px]">
                      awaiting them
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Pane 2 — thread view */}
      <section className="flex-1 min-w-0 flex flex-col bg-evari-ink">
        {!thread ? (
          <div className="flex-1 flex items-center justify-center text-evari-dim text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="border-b border-evari-edge px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-evari-text truncate">
                    {thread.subject}
                  </h2>
                  <div className="mt-1 text-xs text-evari-dim flex items-center gap-2 flex-wrap">
                    <AtSign className="h-3 w-3" />
                    {thread.participants
                      .map((p) => p.name + ' <' + p.email + '>')
                      .join(', ')}
                  </div>
                </div>
                {lead && (
                  <Link
                    href={'/leads/' + lead.id}
                    className="text-xs text-evari-dim hover:text-evari-text inline-flex items-center gap-1 shrink-0"
                  >
                    Lead profile <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {thread.messages.map((m) => (
                <article
                  key={m.id}
                  className={cn(
                    'rounded-lg border p-4',
                    m.isFromEvari
                      ? 'border-primary/20 bg-primary/[0.04] ml-12'
                      : 'border-evari-edge bg-evari-surface mr-12',
                  )}
                >
                  <header className="flex items-center justify-between mb-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium uppercase',
                          m.isFromEvari
                            ? 'bg-primary/20 text-primary'
                            : 'bg-evari-edge text-evari-dim',
                        )}
                      >
                        {m.from.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-medium text-evari-text">{m.from.name}</span>
                      <span className="text-evari-dimmer">→ {m.to.map((t) => t.name).join(', ')}</span>
                    </div>
                    <span className="text-evari-dimmer font-mono tabular-nums">
                      {format(new Date(m.sentAt), 'd LLL HH:mm')}
                    </span>
                  </header>
                  <MessageResponse>{m.bodyMarkdown}</MessageResponse>
                </article>
              ))}
            </div>

            {/* Pane 3 — reply composer */}
            <div className="border-t border-evari-edge bg-evari-carbon p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                  Reply
                </div>
                <div className="flex items-center gap-2">
                  {aiMock && draft && (
                    <Badge variant="warning" className="text-[10px]">fallback</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void suggestReply()}
                    disabled={aiLoading}
                  >
                    {aiLoading ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI suggest in your voice
                  </Button>
                </div>
              </div>
              <Textarea
                placeholder="Write a reply, or ask the AI to draft one in your voice…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[140px] font-sans"
              />
              <div className="flex justify-between items-center mt-2">
                <div className="text-[11px] text-evari-dimmer">
                  {draft.length} chars · sent via Gmail when connected
                </div>
                <Button size="sm" disabled={!draft.trim()}>
                  <Send className="h-3 w-3" />
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
