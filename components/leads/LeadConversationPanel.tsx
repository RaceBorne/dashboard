'use client';

/**
 * Inline email-conversation panel for the Leads detail surface. Mounted
 * under the CompanyPanel on /leads when a lead is selected; pulls every
 * marketing conversation row matching the lead's email, groups them
 * into a thread, and renders the back-and-forth + a reply composer
 * right there on the page so the operator never has to context-switch.
 *
 * Lives separately from marketing/ConversationsClient so the Leads
 * page doesn't depend on the inbox shell, but uses the same
 * thread-grouping helper from lib/marketing/conversations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Send, CheckCircle2, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  type Conversation,
  type ConversationThread,
  groupThreads,
} from '@/lib/marketing/conversations';

interface Props {
  /** Lead's primary email — used to scope the conversation fetch. */
  email: string;
}

export function LeadConversationPanel({ email }: Props) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async (signal?: AbortSignal) => {
    if (!email) {
      setConversations([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/marketing/conversations?q=${encodeURIComponent(email)}`, {
        cache: 'no-store',
        signal,
      });
      const data = await res.json().catch(() => null) as { ok: boolean; conversations?: Conversation[] } | null;
      if (!data?.ok) throw new Error('Load failed');
      // The endpoint matches on from_email OR subject; tighten to rows
      // that actually involve this lead (from OR to).
      const lower = email.toLowerCase();
      const matching = (data.conversations ?? []).filter((c) => {
        const from = (c.fromEmail ?? '').toLowerCase();
        const to   = (c.toEmail   ?? '').toLowerCase();
        return from === lower || to === lower;
      });
      setConversations(matching);
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [email]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchConversations(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchConversations]);

  const threads = useMemo(() => (conversations ? groupThreads(conversations) : []), [conversations]);

  function refresh() {
    setRefreshing(true);
    fetchConversations();
  }

  if (loading) {
    return (
      <div className="rounded-md border border-evari-edge/20 bg-evari-surface px-3 py-3 inline-flex items-center gap-2 text-evari-dimmer text-[12px]">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading conversation…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-evari-danger/30 bg-evari-danger/5 px-3 py-2 text-evari-danger text-[12px]">
        {error} <button type="button" onClick={refresh} className="ml-2 underline">Retry</button>
      </div>
    );
  }
  if (!threads.length) {
    return (
      <div className="rounded-md border border-evari-edge/20 bg-evari-surface px-3 py-3 text-evari-dimmer text-[12px] inline-flex items-center gap-2">
        <Mail className="h-3.5 w-3.5" /> No email exchanges with {email} yet.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-evari-edge/20 bg-evari-surface flex flex-col">
      {threads.map((thread) => (
        <ThreadView
          key={thread.threadKey}
          thread={thread}
          onChanged={(updated, outbound) => {
            setConversations((cs) => {
              const base = cs ?? [];
              const patched = base.map((c) => (c.id === updated.id ? updated : c));
              return outbound ? [...patched, outbound] : patched;
            });
          }}
          onRefresh={refresh}
          refreshing={refreshing}
        />
      ))}
    </div>
  );
}

function ThreadView({
  thread,
  onChanged,
  onRefresh,
  refreshing,
}: {
  thread: ConversationThread;
  onChanged: (updatedInbound: Conversation, outbound: Conversation | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  // Reply targets the most-recent inbound — that's the message the
  // operator is responding to in the conversation.
  const replyTargetId = useMemo(() => {
    const inboundOnly = thread.messages.filter((m) => m.direction === 'inbound');
    return inboundOnly[inboundOnly.length - 1]?.id ?? thread.messages[thread.messages.length - 1]?.id ?? null;
  }, [thread]);

  async function send() {
    if (!draft.trim() || sending || !replyTargetId) return;
    setSending(true); setError(null); setJustSent(false);
    try {
      const res = await fetch(`/api/marketing/conversations/${replyTargetId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: draft.trim().replace(/\n/g, '<br/>') }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error ?? 'Send failed');
      onChanged(data.conversation as Conversation, (data.outbound ?? null) as Conversation | null);
      setDraft('');
      setJustSent(true);
      setTimeout(() => setJustSent(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col">
      <header className="px-3 py-2 border-b border-evari-edge/20 flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-evari-dimmer" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-evari-text truncate">
            {thread.subject || '(no subject)'}
          </div>
          <div className="text-[10px] text-evari-dimmer tabular-nums">
            {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'} · last activity {new Date(thread.lastMessageAt).toLocaleString()}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-evari-dim hover:text-evari-text p-1 rounded disabled:opacity-50"
          title="Refresh"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </button>
      </header>

      {/* Message bubbles. Inbound on the left, outbound (us) on the
          right with a gold accent. Cap height so the panel doesn't
          dominate the page; users scroll within the section. */}
      <div className="max-h-[360px] overflow-y-auto p-3 space-y-2">
        {thread.messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} />
        ))}
      </div>

      <footer className="border-t border-evari-edge/20 p-3 bg-evari-ink/30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-evari-dim">
            Reply to <strong className="text-evari-text">{thread.counterpartyName || thread.counterpartyEmail}</strong>
          </span>
          {justSent ? (
            <span className="text-[11px] text-evari-success inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Sent
            </span>
          ) : null}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write your reply…"
          disabled={sending || !replyTargetId}
          className="w-full min-h-[80px] px-2 py-1.5 rounded bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none disabled:opacity-60"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
          }}
        />
        {error ? <p className="text-[11px] text-evari-danger mt-1">{error}</p> : null}
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-evari-dimmer">⌘↵ to send</span>
          <button
            type="button"
            disabled={sending || !draft.trim() || !replyTargetId}
            onClick={send}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-2.5 py-1 rounded disabled:opacity-50 hover:brightness-110 transition"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {sending ? 'Sending' : 'Send reply'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Bubble({ msg }: { msg: Conversation }) {
  const isUs = msg.direction === 'outbound';
  const body = msg.strippedText || msg.textBody || '';
  return (
    <div className={cn('flex', isUs ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-md px-2.5 py-1.5 border',
          isUs
            ? 'bg-evari-gold/10 border-evari-gold/30 text-evari-text'
            : 'bg-evari-ink/40 border-evari-edge/20 text-evari-text',
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-[10px] uppercase tracking-[0.1em] font-semibold', isUs ? 'text-evari-gold' : 'text-evari-dim')}>
            {isUs ? 'You' : (msg.fromName || msg.fromEmail)}
          </span>
          <span className="text-[10px] text-evari-dimmer tabular-nums ml-auto">
            {new Date(msg.receivedAt).toLocaleString()}
          </span>
        </div>
        {msg.htmlBody ? (
          <div className="rounded bg-zinc-50 text-zinc-900 p-2 text-[12px] leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.htmlBody }} />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed">{body || '(empty)'}</pre>
        )}
      </div>
    </div>
  );
}
