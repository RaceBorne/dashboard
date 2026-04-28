'use client';

/**
 * Persistent AI Assistant pane for any dashboard surface.
 *
 * Mounts on the right of the page. Knows what surface it's on via a
 * Provider context, finds-or-creates a thread, renders quick actions
 * the surface registered, and supports free-form chat.
 *
 * Quick actions are little gold-bordered cards that pre-fill a user
 * prompt and submit on click. Surfaces register them by calling
 * setSuggestions() from inside their tree.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Maximize2, Minimize2, Send, Sparkles, X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface QuickAction {
  /** Display label (line 1, bold). */
  title: string;
  /** Display subline (line 2, dim). */
  subtitle?: string;
  /** What to send to the assistant when clicked. */
  prompt: string;
}

interface AIPaneContextValue {
  surface: string;
  scopeId: string | null;
  context: Record<string, unknown> | null;
  suggestions: QuickAction[];
  setSurface: (surface: string, scopeId?: string | null, context?: Record<string, unknown> | null) => void;
  setSuggestions: (actions: QuickAction[]) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
}

const AIPaneContext = createContext<AIPaneContextValue | null>(null);

export function AIPaneProvider({ children }: { children: ReactNode }) {
  const [surface, setSurfaceState] = useState<string>('home');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [suggestions, setSuggestions] = useState<QuickAction[]>([]);
  const [open, setOpen] = useState<boolean>(true);

  // Persist open/closed across navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('evari-ai-pane-open');
    if (stored === '0') setOpen(false);
    if (stored === '1') setOpen(true);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('evari-ai-pane-open', open ? '1' : '0');
  }, [open]);

  const setSurface = useCallback((s: string, sid?: string | null, ctx?: Record<string, unknown> | null) => {
    setSurfaceState(s);
    setScopeId(sid ?? null);
    setContext(ctx ?? null);
    // Reset registered suggestions on navigation; surfaces will re-register.
    setSuggestions([]);
  }, []);

  return (
    <AIPaneContext.Provider value={{ surface, scopeId, context, suggestions, setSurface, setSuggestions, open, setOpen }}>
      {children}
    </AIPaneContext.Provider>
  );
}

export function useAIPane() {
  const ctx = useContext(AIPaneContext);
  if (!ctx) throw new Error('useAIPane must be used inside AIPaneProvider');
  return ctx;
}

/**
 * Lightweight registration helper for surfaces. Call inside a page or
 * client component to set the surface key + suggested quick-actions.
 *
 *   useAISurface({
 *     surface: 'campaigns',
 *     scopeId: campaignId,
 *     context: { campaignName, audience },
 *     suggestions: [{ title: 'Optimise subject', prompt: '...' }, ...],
 *   });
 */
export function useAISurface(opts: {
  surface: string;
  scopeId?: string | null;
  context?: Record<string, unknown> | null;
  suggestions?: QuickAction[];
}) {
  const { setSurface, setSuggestions } = useAIPane();
  // Stable string key for context + suggestions so we only re-register on real changes.
  const ctxKey = JSON.stringify(opts.context ?? null);
  const sugKey = JSON.stringify(opts.suggestions ?? []);
  useEffect(() => {
    setSurface(opts.surface, opts.scopeId ?? null, opts.context ?? null);
    setSuggestions(opts.suggestions ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.surface, opts.scopeId, ctxKey, sugKey]);
}

interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export function AIAssistantPane() {
  const { surface, scopeId, context, suggestions, open, setOpen } = useAIPane();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load thread when surface changes.
  useEffect(() => {
    if (!open) return;
    const u = new URLSearchParams({ surface });
    if (scopeId) u.set('scopeId', scopeId);
    fetch(`/api/ai/assistant?${u.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setMessages(d.messages ?? []); })
      .catch(() => {});
  }, [surface, scopeId, open]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  async function send(userText: string) {
    if (!userText.trim() || busy) return;
    setBusy(true);
    // Optimistic user message.
    const optimistic: Message = { id: `tmp:${Date.now()}`, threadId: '', role: 'user', content: userText, createdAt: new Date().toISOString() };
    setMessages((cur) => [...cur, optimistic]);
    setInput('');
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ surface, scopeId, context, userText }),
      });
      const json = await res.json();
      if (json?.ok) {
        // Replace optimistic with persisted user + assistant.
        setMessages((cur) => {
          const next = cur.filter((m) => m.id !== optimistic.id);
          if (json.user) next.push(json.user);
          if (json.assistant) next.push(json.assistant);
          return next;
        });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 bottom-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-evari-gold/40 bg-evari-surface text-evari-gold hover:brightness-110 shadow-lg transition text-[11px] font-semibold"
      >
        <Sparkles className="h-3.5 w-3.5" /> AI Assistant
      </button>
    );
  }

  return (
    <aside className={cn('flex flex-col border-l border-evari-edge/30 bg-evari-surface min-h-0 flex-shrink-0 transition-all',
      expanded ? 'w-[520px]' : 'w-[320px]')}>
      <header className="px-3 py-2.5 border-b border-evari-edge/30 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[12px] font-semibold text-evari-text flex-1">AI Assistant</h3>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-evari-dim hover:text-evari-text p-1 rounded transition">
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-evari-dim hover:text-evari-text p-1 rounded transition" title="Hide">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-[11px] text-evari-dim">
            I can help you with this {humaniseSurface(surface)} screen. Ask me anything, or pick a suggestion below.
          </div>
        ) : null}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {busy ? (
          <div className="flex items-center gap-2 text-[11px] text-evari-dim">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
          </div>
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <div className="px-3 pb-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Quick actions</div>
          {suggestions.map((sg, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void send(sg.prompt)}
              disabled={busy}
              className="w-full text-left rounded-md border border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition p-2 disabled:opacity-50"
            >
              <div className="text-[12px] font-semibold text-evari-text">{sg.title}</div>
              {sg.subtitle ? <div className="text-[11px] text-evari-dim">{sg.subtitle}</div> : null}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="px-3 py-2 border-t border-evari-edge/30 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI anything..."
          className="flex-1 px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
      <div className="px-3 pb-2 text-[10px] text-evari-dimmer">AI responses may be inaccurate.</div>
    </aside>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('rounded-md px-2.5 py-1.5 text-[12px] max-w-[85%] whitespace-pre-wrap break-words leading-relaxed',
        isUser ? 'bg-evari-gold/15 text-evari-text' : 'bg-evari-ink/40 text-evari-text border border-evari-edge/30')}>
        {message.content}
      </div>
    </div>
  );
}

function humaniseSurface(s: string): string {
  const base = s.split(':')[0];
  return base.replace(/[-_]/g, ' ');
}
