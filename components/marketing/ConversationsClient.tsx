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
  ShieldAlert,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Conversation, ConversationStatus } from '@/lib/marketing/conversations';

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
 * Three-pane inbox: folder sidebar (status), conversation list (filtered),
 * conversation detail with read/replied/archive controls + a deep-link
 * to the originating contact when we have one.
 */
export function ConversationsClient({ initialConversations, initialCounts }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [counts, setCounts] = useState(initialCounts);
  const [folder, setFolder] = useState<ConversationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (folder !== 'all' && c.status !== folder) return false;
      if (!q) return true;
      return (
        c.fromEmail.toLowerCase().includes(q) ||
        (c.fromName ?? '').toLowerCase().includes(q) ||
        (c.subject ?? '').toLowerCase().includes(q)
      );
    });
  }, [conversations, folder, search]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  async function setStatus(id: string, status: ConversationStatus) {
    const res = await fetch(`/api/marketing/conversations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) return;
    setConversations((cs) => cs.map((c) => (c.id === id ? data.conversation : c)));
    setCounts((curr) => {
      const prev = conversations.find((c) => c.id === id)?.status;
      const next = { ...curr };
      if (prev) next[prev] = Math.max(0, (next[prev] ?? 1) - 1);
      next[status] = (next[status] ?? 0) + 1;
      return next;
    });
    router.refresh();
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
                  onClick={() => { setFolder(f.key); setSelectedId(null); }}
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
          Replies arrive via the Postmark inbound webhook — once configured, every reply to a campaign or outreach lands here automatically.
        </div>
      </aside>

      {/* MID — list */}
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
          <span className="text-[10px] text-evari-dimmer tabular-nums">{visible.length} / {conversations.length}</span>
        </header>
        {visible.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm text-center px-6">
            {conversations.length === 0
              ? 'No replies yet — they’ll appear here as soon as someone responds to a campaign.'
              : 'Nothing matches that filter.'}
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-evari-edge/10">
            {visible.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === selectedId}
                onClick={() => {
                  setSelectedId(c.id);
                  if (c.status === 'unread') setStatus(c.id, 'read');
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* RIGHT — detail */}
      <aside className="w-[480px] shrink-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        {selected ? (
          <ConversationDetail conversation={selected} onStatus={(s) => setStatus(selected.id, s)} />
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

function ConversationRow({ conversation, active, onClick }: { conversation: Conversation; active: boolean; onClick: () => void }) {
  const isUnread = conversation.status === 'unread';
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
        <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0', isUnread ? 'bg-evari-gold' : 'bg-transparent')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-evari-text' : 'text-evari-text')}>
              {conversation.fromName || conversation.fromEmail}
            </span>
            <span className="ml-auto text-[10px] text-evari-dimmer tabular-nums shrink-0">
              {new Date(conversation.receivedAt).toLocaleDateString()}
            </span>
          </div>
          <div className={cn('text-[12px] truncate mt-0.5', isUnread ? 'text-evari-text' : 'text-evari-dim')}>
            {conversation.subject || '(no subject)'}
          </div>
          <div className="text-[11px] text-evari-dimmer truncate mt-0.5">
            {(conversation.strippedText || conversation.textBody || '').slice(0, 120)}
          </div>
        </div>
      </button>
    </li>
  );
}

function ConversationDetail({ conversation, onStatus }: { conversation: Conversation; onStatus: (s: ConversationStatus) => void }) {
  const [busy, setBusy] = useState<ConversationStatus | null>(null);
  async function go(s: ConversationStatus) {
    setBusy(s);
    await onStatus(s);
    setBusy(null);
  }
  const body = conversation.strippedText || conversation.textBody || '';
  return (
    <>
      <header className="px-4 py-3 border-b border-evari-edge/20 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-evari-text truncate flex-1">
            {conversation.subject || '(no subject)'}
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
          <strong>{conversation.fromName || conversation.fromEmail}</strong>
          {conversation.fromName ? <span className="text-evari-dimmer"> — {conversation.fromEmail}</span> : null}
        </p>
        <p className="text-[10px] text-evari-dimmer tabular-nums">
          {new Date(conversation.receivedAt).toLocaleString()}
          {conversation.toEmail ? <span> · to {conversation.toEmail}</span> : null}
        </p>
        <div className="flex items-center gap-2 pt-1">
          {conversation.contactId ? (
            <a href="/email/contacts" className="text-[11px] text-evari-gold hover:underline">→ View contact</a>
          ) : <span className="text-[11px] text-evari-dimmer">Unmatched contact</span>}
          {conversation.campaignId ? (
            <a href={`/email/campaigns/${conversation.campaignId}`} className="text-[11px] text-evari-gold hover:underline">→ View campaign</a>
          ) : null}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {conversation.htmlBody ? (
          <div className="rounded-md bg-zinc-50 text-zinc-900 p-4" dangerouslySetInnerHTML={{ __html: conversation.htmlBody }} />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm text-evari-text leading-relaxed">{body || '(empty body)'}</pre>
        )}
      </div>
    </>
  );
}
