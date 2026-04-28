'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  type Conversation,
  type ConversationStatus,
  type ConversationThread,
  groupThreads,
} from '@/lib/marketing/conversations';

interface Props {
  initialConversations: Conversation[];
  initialCounts: Record<ConversationStatus | 'total', number>;
}

const FOLDERS: Array<{ key: ConversationStatus | 'all'; label: string; Icon: typeof Inbox }> = [
  { key: 'all',      label: 'All',       Icon: Inbox },
  { key: 'unread',   label: 'Unread',    Icon: Mail },
  { key: 'read',     label: 'Read',      Icon: CheckCircle2 },
  { key: 'replied',  label: 'Replied',   Icon: CheckCircle2 },
  { key: 'archived', label: 'Archived',  Icon: Archive },
  { key: 'spam',     label: 'Spam',      Icon: ShieldAlert },
];

/**
 * Three-pane inbox: folder sidebar (status), THREAD list (each row is
 * one thread), thread detail showing every message in chronological
 * order with a reply composer beneath.
 */
export function ConversationsClient({ initialConversations, initialCounts }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [counts, setCounts] = useState(initialCounts);
  const [folder, setFolder] = useState<ConversationStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Build threads from the flat conversation list. Each thread groups
  // every message (inbound + outbound) sharing a thread_key.
  const threads = useMemo(() => groupThreads(conversations), [conversations]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (folder !== 'all' && t.status !== folder) return false;
      if (!q) return true;
      return (
        t.counterpartyEmail.toLowerCase().includes(q) ||
        (t.counterpartyName ?? '').toLowerCase().includes(q) ||
        (t.subject ?? '').toLowerCase().includes(q)
      );
    });
  }, [threads, folder, search]);

  const [selectedKey, setSelectedKey] = useState<string | null>(threads[0]?.threadKey ?? null);
  const selected = useMemo(
    () => threads.find((t) => t.threadKey === selectedKey) ?? null,
    [threads, selectedKey],
  );

  /**
   * Patch the status of every inbound message in a thread (server
   * persists each, then we reflect it locally without a full refresh).
   * Outbound messages keep their 'replied' status.
   */
  async function setThreadStatus(thread: ConversationThread, status: ConversationStatus) {
    const inboundIds = thread.messages.filter((m) => m.direction === 'inbound').map((m) => m.id);
    const updated: Conversation[] = [];
    for (const id of inboundIds) {
      const res = await fetch(`/api/marketing/conversations/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) updated.push(data.conversation as Conversation);
    }
    if (updated.length === 0) return;
    setConversations((cs) => cs.map((c) => updated.find((u) => u.id === c.id) ?? c));
    setCounts((curr) => {
      // Recompute from the patched list — small cost, simpler than
      // delta arithmetic when one thread can carry several messages.
      const next: Record<ConversationStatus | 'total', number> = { unread: 0, read: 0, replied: 0, archived: 0, spam: 0, total: 0 };
      for (const c of conversations.map((c) => updated.find((u) => u.id === c.id) ?? c)) {
        if (c.direction !== 'inbound') continue;
        next[c.status] = (next[c.status] ?? 0) + 1;
        next.total += 1;
      }
      return next;
    });
    router.refresh();
  }

  /** Append the outbound row that the reply endpoint just persisted,
   *  patch the inbound's status to 'replied', so the UI updates inline. */
  function applyReply(updatedInbound: Conversation, outbound: Conversation | null) {
    setConversations((cs) => {
      const patched = cs.map((c) => (c.id === updatedInbound.id ? updatedInbound : c));
      return outbound ? [...patched, outbound] : patched;
    });
    setCounts((curr) => {
      const out = { ...curr };
      const prev = conversations.find((c) => c.id === updatedInbound.id)?.status;
      if (prev && prev !== updatedInbound.status) {
        out[prev] = Math.max(0, (out[prev] ?? 1) - 1);
        out[updatedInbound.status] = (out[updatedInbound.status] ?? 0) + 1;
      }
      return out;
    });
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-evari-ink p-2 flex gap-2">
      {/* LEFT — folder sidebar */}
      <aside className="w-[220px] shrink-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        <div className="px-3 py-2.5 border-b border-evari-edge/20 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-evari-text uppercase tracking-[0.12em]">Inbox</h2>
          <span className="text-[10px] tabular-nums text-evari-dimmer">{counts.total}</span>
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {FOLDERS.map((f) => {
            const active = f.key === folder;
            const count = f.key === 'all' ? counts.total : (counts[f.key] ?? 0);
            const Icon = f.Icon;
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => { setFolder(f.key); setSelectedKey(null); }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-200 text-left',
                    active ? 'bg-evari-ink/60 text-evari-text' : 'text-evari-dim hover:bg-evari-ink/30 hover:text-evari-text',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{f.label}</span>
                  <span className="text-[10px] tabular-nums text-evari-dimmer">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-3 py-2 border-t border-evari-edge/20 text-[10px] text-evari-dimmer leading-snug">
          Replies arrive via the Postmark inbound webhook. Threads group by counterparty + subject so a reply chain reads as one conversation.
        </div>
      </aside>

      {/* MID — thread list */}
      <section className="flex-1 min-w-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        <header className="px-3 py-2 border-b border-evari-edge/20 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-evari-dimmer" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sender, subject…"
            className="flex-1 bg-transparent text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none"
          />
          <span className="text-[10px] text-evari-dimmer tabular-nums">{visible.length} / {threads.length}</span>
        </header>
        {visible.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm text-center px-6">
            {threads.length === 0
              ? "No replies yet — they'll appear here as soon as someone responds to a campaign."
              : 'Nothing matches that filter.'}
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-evari-edge/10">
            {visible.map((t) => (
              <ThreadRow
                key={t.threadKey}
                thread={t}
                active={t.threadKey === selectedKey}
                onClick={() => {
                  setSelectedKey(t.threadKey);
                  if (t.unread) setThreadStatus(t, 'read');
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* RIGHT — thread detail */}
      <aside className="w-[520px] shrink-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        {selected ? (
          <ThreadDetail
            thread={selected}
            onStatus={(s) => setThreadStatus(selected, s)}
            onReplied={(updated, outbound) => applyReply(updated, outbound)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-evari-dimmer text-sm gap-2">
            <Mail className="h-8 w-8 opacity-40" />
            <p>Pick a thread to read it.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function ThreadRow({ thread, active, onClick }: { thread: ConversationThread; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full px-3 py-2 text-left transition-colors duration-150 flex items-start gap-2',
          active ? 'bg-evari-ink/70' : 'hover:bg-evari-ink/30',
        )}
      >
        <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0', thread.unread ? 'bg-evari-gold' : 'bg-transparent')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm truncate', thread.unread ? 'font-semibold text-evari-text' : 'text-evari-text')}>
              {thread.counterpartyName || thread.counterpartyEmail}
            </span>
            {thread.messages.length > 1 ? (
              <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">{thread.messages.length}</span>
            ) : null}
            <span className="ml-auto text-[10px] text-evari-dimmer tabular-nums shrink-0">
              {new Date(thread.lastMessageAt).toLocaleDateString()}
            </span>
          </div>
          <div className={cn('text-[12px] truncate mt-0.5', thread.unread ? 'text-evari-text' : 'text-evari-dim')}>
            {thread.subject || '(no subject)'}
          </div>
          <div className="text-[11px] text-evari-dimmer truncate mt-0.5">
            {thread.preview || '(empty)'}
          </div>
        </div>
      </button>
    </li>
  );
}

function ThreadDetail({ thread, onStatus, onReplied }: { thread: ConversationThread; onStatus: (s: ConversationStatus) => void; onReplied: (updatedInbound: Conversation, outbound: Conversation | null) => void }) {
  const [busy, setBusy] = useState<ConversationStatus | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  async function go(s: ConversationStatus) {
    setBusy(s);
    await onStatus(s);
    setBusy(null);
  }

  // Reply targets the most-recent inbound message in the thread —
  // that's the one the operator is responding to, even if there have
  // already been outbound replies in this thread.
  const replyTargetId = useMemo(() => {
    const inboundOnly = thread.messages.filter((m) => m.direction === 'inbound');
    return inboundOnly[inboundOnly.length - 1]?.id ?? thread.messages[thread.messages.length - 1]?.id ?? null;
  }, [thread]);

  async function sendReply() {
    if (!replyDraft.trim() || sending || !replyTargetId) return;
    setSending(true); setReplyError(null); setJustSent(false);
    try {
      const res = await fetch(`/api/marketing/conversations/${replyTargetId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: replyDraft.trim().replace(/\n/g, '<br/>') }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error ?? 'Send failed');
      onReplied(data.conversation as Conversation, (data.outbound ?? null) as Conversation | null);
      setReplyDraft('');
      setJustSent(true);
      setTimeout(() => setJustSent(false), 3000);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="px-4 py-3 border-b border-evari-edge/20 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-evari-text truncate flex-1">
            {thread.subject || '(no subject)'}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" disabled={!!busy} onClick={() => go('replied')} className="px-2 py-1 rounded text-[11px] bg-evari-ink/60 text-evari-text hover:bg-black/40 transition-colors inline-flex items-center gap-1">
              {busy === 'replied' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Mark replied
            </button>
            <button type="button" disabled={!!busy} onClick={() => go('archived')} className="px-2 py-1 rounded text-[11px] bg-evari-ink/60 text-evari-text hover:bg-black/40 transition-colors inline-flex items-center gap-1">
              {busy === 'archived' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
              Archive
            </button>
          </div>
        </div>
        <p className="text-[12px] text-evari-dim">
          <strong>{thread.counterpartyName || thread.counterpartyEmail}</strong>
          {thread.counterpartyName ? <span className="text-evari-dimmer"> — {thread.counterpartyEmail}</span> : null}
        </p>
        <p className="text-[10px] text-evari-dimmer tabular-nums">
          {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'} · last activity {new Date(thread.lastMessageAt).toLocaleString()}
        </p>
      </header>

      {/* Chronological message list — oldest first, so the thread reads
          top-to-bottom like an email client. Inbound messages sit on
          the left with a soft surface; outbound (us) align to the
          right with a gold accent so the back-and-forth is unmissable. */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {thread.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      <footer className="border-t border-evari-edge/30 p-3 bg-evari-ink/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-evari-dim">
            Reply to <strong className="text-evari-text">{thread.counterpartyName || thread.counterpartyEmail}</strong>
          </span>
          {justSent ? <span className="text-[11px] text-evari-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Sent</span> : null}
        </div>
        <textarea
          value={replyDraft}
          onChange={(e) => setReplyDraft(e.target.value)}
          placeholder="Write your reply…"
          disabled={sending || !replyTargetId}
          className="w-full min-h-[110px] px-2 py-1.5 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none disabled:opacity-60"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendReply();
          }}
        />
        {replyError ? <p className="text-[11px] text-evari-danger mt-1">{replyError}</p> : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-evari-dimmer">⌘↵ to send</span>
          <button
            type="button"
            disabled={sending || !replyDraft.trim() || !replyTargetId}
            onClick={sendReply}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1.5 rounded disabled:opacity-50 hover:brightness-110 transition"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {sending ? 'Sending' : 'Send reply'}
          </button>
        </div>
      </footer>
    </>
  );
}

function MessageBubble({ msg }: { msg: Conversation }) {
  const isUs = msg.direction === 'outbound';
  const body = msg.strippedText || msg.textBody || '';
  return (
    <div className={cn('flex', isUs ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-md px-3 py-2 border',
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
          <div className="rounded bg-zinc-50 text-zinc-900 p-2 text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.htmlBody }} />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{body || '(empty)'}</pre>
        )}
      </div>
    </div>
  );
}
