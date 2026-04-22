'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Sparkles, Send, ChevronRight, RefreshCw, AtSign, Pencil, Trash2, Search as SearchIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageResponse } from '@/components/MessageResponse';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, relativeTime } from '@/lib/utils';
import type { Lead, Thread } from '@/lib/types';
import { FunnelRibbon } from '@/components/nav/FunnelRibbon';
import { ProjectRail } from '@/components/nav/ProjectRail';

interface Props {
 threads: Thread[];
 leads: Lead[];
 initialThreadId: string;
}

export function ConversationsClient({ threads: initialThreads, leads, initialThreadId }: Props) {
 const searchParams = useSearchParams();
 const playId = searchParams?.get('playId') ?? null;

 // A thread belongs to a Play iff its associated Lead is bound to that Play.
 const leadPlayById = useMemo(() => {
  const m = new Map<string, string | undefined>();
  for (const l of leads) m.set(l.id, l.playId);
  return m;
 }, [leads]);
 const [threads, setThreads] = useState<Thread[]>(initialThreads);
 const [threadId, setThreadId] = useState(initialThreadId);
 const [draft, setDraft] = useState('');
 const [aiLoading, setAiLoading] = useState(false);
 const [aiMock, setAiMock] = useState(false);
 const [editing, setEditing] = useState<Thread | null>(null);
 const confirm = useConfirm();

 // --- Filter state -------------------------------------------------------
 type StatusFilter = 'all' | 'awaiting_us' | 'awaiting_lead' | 'unread' | 'closed';
 const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
 const [activeLabel, setActiveLabel] = useState<string | null>(null);
 const [search, setSearch] = useState('');

 // All unique labels across threads
 const labels = useMemo(() => {
  const s = new Set<string>();
  for (const t of threads) t.labels.forEach((l) => s.add(l));
  return Array.from(s).sort();
 }, [threads]);

 const filteredThreads = useMemo(() => {
  const q = search.trim().toLowerCase();
  return threads.filter((t) => {
   if (playId) {
    const pid = t.leadId ? leadPlayById.get(t.leadId) : undefined;
    if (pid !== playId) return false;
   }
   if (statusFilter === 'unread' && !t.unread) return false;
   if (statusFilter !== 'all' && statusFilter !== 'unread' && t.status !== statusFilter) return false;
   if (activeLabel && !t.labels.includes(activeLabel)) return false;
   if (q) {
    const hay = [
     t.subject,
     t.participants.map((p) => p.name + ' ' + p.email).join(' '),
     t.labels.join(' '),
    ].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
   }
   return true;
  });
 }, [threads, statusFilter, activeLabel, search, playId, leadPlayById]);

 const sortedThreads = useMemo(
  () => [...filteredThreads].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
  [filteredThreads],
 );

 const statusCounts = useMemo(() => {
  return {
   all: threads.length,
   awaiting_us: threads.filter((t) => t.status === 'awaiting_us').length,
   awaiting_lead: threads.filter((t) => t.status === 'awaiting_lead').length,
   unread: threads.filter((t) => t.unread).length,
   closed: threads.filter((t) => t.status === 'closed').length,
  };
 }, [threads]);
 const thread = threads.find((t) => t.id === threadId);
 const lead = thread?.leadId ? leads.find((l) => l.id === thread.leadId) : undefined;

 async function deleteThread(t: Thread) {
  const ok = await confirm({
   title: 'Delete conversation?',
   description: `"${t.subject}" will be removed permanently.`,
   confirmLabel: 'Delete',
   tone: 'danger',
  });
  if (!ok) return;
  setThreads((prev) => prev.filter((x) => x.id !== t.id));
  if (t.id === threadId) {
   const next = threads.find((x) => x.id !== t.id);
   if (next) setThreadId(next.id);
  }
 }

 function updateThread(id: string, changes: Partial<Pick<Thread, 'subject' | 'labels' | 'status'>>) {
  setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  setEditing(null);
 }

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
  <div className="flex flex-col gap-3 p-4 flex-1 min-h-0 overflow-hidden bg-evari-ink">
   {playId ? (
    <FunnelRibbon stage="conversations" playId={playId} />
   ) : null}
   <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
    <ProjectRail activePlayId={playId} />
   {/* Pane 1 — thread list */}
   <aside className="w-[340px] shrink-0 bg-evari-carbon flex flex-col">
    <div className="px-4 py-3 flex items-center justify-between">
     <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
      Inbox · Evari/Leads
     </div>
     {(statusFilter !== 'all' || activeLabel || search) && (
      <button
       type="button"
       onClick={() => {
        setStatusFilter('all');
        setActiveLabel(null);
        setSearch('');
       }}
       className="text-[10px] text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
      >
       <X className="h-3 w-3" />
       clear
      </button>
     )}
    </div>

    {/* Search */}
    <div className="px-3 pb-2">
     <div className="relative">
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-evari-dimmer" />
      <Input
       placeholder="Search subject, name, label…"
       value={search}
       onChange={(e) => setSearch(e.target.value)}
       className="pl-7 h-8 text-xs"
      />
     </div>
    </div>

    {/* Status tabs */}
    <div className="px-3 pb-2 flex flex-wrap gap-1">
     {(
      [
       { key: 'all', label: 'All' },
       { key: 'unread', label: 'Unread' },
       { key: 'awaiting_us', label: 'Awaiting me' },
       { key: 'awaiting_lead', label: 'Awaiting them' },
       { key: 'closed', label: 'Closed' },
      ] as const
     ).map((s) => {
      const count = statusCounts[s.key];
      const active = statusFilter === s.key;
      return (
       <button
        key={s.key}
        type="button"
        onClick={() => setStatusFilter(s.key)}
        className={cn(
         'inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors',
         active
          ? 'bg-evari-surfaceSoft text-evari-text'
          : 'bg-evari-surface/60 text-evari-dim hover:bg-evari-surfaceSoft',
        )}
       >
        {s.label}
        <span className="text-evari-dimmer tabular-nums">{count}</span>
       </button>
      );
     })}
    </div>

    {/* Label filter */}
    {labels.length > 0 && (
     <div className="px-3 pb-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1">
       Label
      </div>
      <div className="flex flex-wrap gap-1">
       {labels.map((l) => {
        const active = activeLabel === l;
        return (
         <button
          key={l}
          type="button"
          onClick={() => setActiveLabel(active ? null : l)}
          className={cn(
           'text-[10px] px-2 py-0.5 rounded-full transition-colors',
           active
            ? 'bg-evari-surfaceSoft text-evari-text'
            : 'bg-evari-surface/60 text-evari-dim hover:bg-evari-surfaceSoft',
          )}
         >
          {l}
         </button>
        );
       })}
      </div>
     </div>
    )}

    <div className="flex-1 overflow-y-auto p-2 space-y-1">
     {sortedThreads.map((t) => {
      const last = t.messages[t.messages.length - 1];
      const otherName = t.participants.find((p) => p.role === 'lead')?.name ?? 'Unknown';
      const active = t.id === threadId;
      return (
       <div
        key={t.id}
        className={cn(
         'group relative rounded-md transition-colors',
         active ? 'bg-evari-surface' : 'bg-evari-surface/60 hover:bg-evari-surface',
        )}
       >
        <button
        onClick={() => {
         setThreadId(t.id);
         setDraft('');
        }}
        className="w-full text-left px-3 py-2.5"
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
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
         <button
          aria-label="Edit conversation"
          title="Edit"
          onClick={(e) => { e.stopPropagation(); setEditing(t); }}
          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft"
         >
          <Pencil className="h-3 w-3" />
         </button>
         <button
          aria-label="Delete conversation"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); void deleteThread(t); }}
          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-evari-dim hover:text-evari-danger hover:bg-evari-surfaceSoft"
         >
          <Trash2 className="h-3 w-3" />
         </button>
        </div>
       </div>
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
      <div className="px-6 py-4">
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
          href={'/leads?id=' + lead.id}
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
          'rounded-xl p-4',
          m.isFromEvari
           ? 'bg-evari-gold/[0.06] ml-12'
           : 'bg-evari-surface mr-12',
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
      <div className="bg-evari-carbon p-4">
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

   {/* Edit dialog */}
   <Dialog
    open={editing != null}
    onOpenChange={(open) => { if (!open) setEditing(null); }}
   >
    {editing && (
     <DialogContent className="max-w-lg">
      <DialogHeader>
       <DialogTitle>Edit conversation</DialogTitle>
      </DialogHeader>
      <ThreadEditForm
       thread={editing}
       onSubmit={(changes) => updateThread(editing.id, changes)}
       onCancel={() => setEditing(null)}
      />
     </DialogContent>
    )}
   </Dialog>
  </div>
  </div>
 );
}

function ThreadEditForm({
 thread,
 onSubmit,
 onCancel,
}: {
 thread: Thread;
 onSubmit: (changes: Partial<Pick<Thread, 'subject' | 'labels' | 'status'>>) => void;
 onCancel: () => void;
}) {
 const [subject, setSubject] = useState(thread.subject);
 const [labels, setLabels] = useState(thread.labels.join(', '));
 const [status, setStatus] = useState<Thread['status']>(thread.status);

 function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  onSubmit({
   subject: subject.trim(),
   labels: labels
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean),
   status,
  });
 }

 return (
  <form onSubmit={handleSubmit} className="space-y-3">
   <label className="space-y-1 block">
    <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
     Subject
    </span>
    <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
   </label>
   <label className="space-y-1 block">
    <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
     Labels (comma-separated)
    </span>
    <Input value={labels} onChange={(e) => setLabels(e.target.value)} />
   </label>
   <label className="space-y-1 block">
    <span className="block text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
     Status
    </span>
    <select
     value={status}
     onChange={(e) => setStatus(e.target.value as Thread['status'])}
     className="w-full bg-evari-surface/70 rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
    >
     <option value="open">open</option>
     <option value="awaiting_us">awaiting_us</option>
     <option value="awaiting_lead">awaiting_lead</option>
     <option value="closed">closed</option>
    </select>
   </label>
   <div className="flex justify-end gap-2 pt-2">
    <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
     Cancel
    </Button>
    <Button type="submit" size="sm" variant="primary">
     Save changes
    </Button>
   </div>
  </form>
 );
}
