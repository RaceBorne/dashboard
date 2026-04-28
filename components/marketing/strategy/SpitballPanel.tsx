'use client';

/**
 * Spitball with Claude — the rapid-fire kickoff conversation that turns a
 * one-line idea pitch into a committed strategy.
 *
 * Mounts on the right side of the Strategy page when ?kickoff=1 is in the
 * URL, OR when the user manually opens it via the Spitball button.
 *
 * On first mount in kickoff mode, auto-fires the opener so Claude is
 * already engaging by the time the page paints. The opener asks three
 * sharp questions chosen to fill the brief skeleton: success in 90 days,
 * exact target role and sector, and the angle that makes them care.
 *
 * The single decisive action is "Commit and start discovery". It runs the
 * commit-strategy endpoint (which now also kicks off autoScanForPlay in
 * the background) and routes to /discover with ?autoScanned=1 so the
 * Discover page can paint a "searching..." banner.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpitballMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  playId: string;
  playTitle: string;
  pitch: string;
  open: boolean;
  kickoff: boolean;
  onClose: () => void;
}

const OPENER = [
  "I've got the pitch. Three quick questions to lock the brief, then I'll find you companies:",
  '',
  '1. What does success look like in 90 days, in numbers? (e.g. 30 booked calls, 5 paid pilots)',
  '2. Who *exactly* are we trying to reach: role, seniority, and the kind of company they sit in?',
  "3. What's the wedge, the one angle that makes them care enough to reply?",
  '',
  "Hit me with all three in one go. I'll fold them into the brief.",
].join('\n');

export function SpitballPanel({ playId, playTitle, pitch, open, kickoff, onClose }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<SpitballMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const kickoffFired = useRef(false);

  // Auto-fire the opener whenever the panel is open and the chat is
  // empty, regardless of kickoff. Synthetic assistant message so the
  // user sees Claude's framing instantly with no network round trip.
  // The first real LLM call happens when they reply. The kickoff flag
  // is now informational only — the opener fires for fresh ideas and
  // for existing ideas without prior chat alike.
  useEffect(() => {
    if (!open) return;
    if (kickoffFired.current) return;
    if (messages.length > 0) return;
    kickoffFired.current = true;
    const opener: SpitballMessage = {
      id: 'opener-' + Date.now(),
      role: 'assistant',
      content: OPENER,
    };
    setMessages([opener]);
  }, [open, messages.length]);

  // Stick to bottom on new messages.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const userMsg: SpitballMessage = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: trimmed,
    };
    setMessages((cur) => [...cur, userMsg]);
    setInput('');
    try {
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const res = await fetch(`/api/plays/${playId}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const json = await res.json();
      if (json?.ok && typeof json.markdown === 'string') {
        setMessages((cur) => [
          ...cur,
          { id: 'a-' + Date.now(), role: 'assistant', content: json.markdown },
        ]);
      } else {
        setMessages((cur) => [
          ...cur,
          {
            id: 'err-' + Date.now(),
            role: 'assistant',
            content: 'Something went wrong. Try again or skip ahead and commit.',
          },
        ]);
      }
    } catch {
      setMessages((cur) => [
        ...cur,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: 'Network error. Try again or skip ahead and commit.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, messages, playId]);

  const commit = useCallback(async () => {
    if (committing) return;
    setCommitting(true);
    try {
      const history = messages.map(({ role, content }) => ({ role, content }));
      const res = await fetch(`/api/plays/${playId}/commit-strategy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setMessages((cur) => [
          ...cur,
          {
            id: 'err-' + Date.now(),
            role: 'assistant',
            content:
              'Commit failed: ' + (json?.error ?? 'unknown error') +
              '. You can try again, or hand off to Discovery without committing.',
          },
        ]);
        setCommitting(false);
        return;
      }
      router.push(`/discover?playId=${playId}&autoScanned=1`);
    } catch (err) {
      setMessages((cur) => [
        ...cur,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content:
            'Commit failed: ' + (err instanceof Error ? err.message : String(err)),
        },
      ]);
      setCommitting(false);
    }
  }, [committing, messages, playId, router]);

  if (!open) return null;

  return (
    // Inline panel: takes the full centre of the Strategy page when
    // open. The seven-step rail content is hidden behind it; the
    // bottom timeline stays available for navigation.
    <section className="h-full w-full flex flex-col bg-evari-ink">
      <header className="shrink-0 px-4 h-11 flex items-center gap-2 border-b border-evari-edge/30">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[13px] font-semibold text-evari-text flex-1 truncate">
          Spitball: {playTitle}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition"
          title="Close Spitball, return to Brief"
        >
          <X className="h-3.5 w-3.5" /> Close
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {/* Centred conversation column. Wider than the floating panel
            so paragraphs breathe. Pitch sits at the top as anchor
            context. */}
        <div className="mx-auto w-full max-w-[760px] px-4 py-5 space-y-4">
          <div className="rounded-panel border border-evari-edge/30 bg-evari-surface px-3 py-2.5 text-[12px] text-evari-dim leading-relaxed">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer block mb-1">Pitch</span>
            {pitch || '(no pitch on file)'}
          </div>

          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'rounded-panel px-3 py-2 text-[13px] max-w-[85%] whitespace-pre-wrap break-words leading-relaxed',
                m.role === 'user'
                  ? 'bg-evari-gold/15 text-evari-text'
                  : 'bg-evari-surface text-evari-text border border-evari-edge/30',
              )}>
                {m.content}
              </div>
            </div>
          ))}

          {busy ? (
            <div className="flex items-center gap-2 text-[12px] text-evari-dim">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer: input + commit. Centred to match the conversation column. */}
      <div className="shrink-0 border-t border-evari-edge/30 bg-evari-ink">
        <div className="mx-auto w-full max-w-[760px] px-4 py-3 space-y-2">
          <form
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Reply to Claude..."
              disabled={busy || committing}
              className="flex-1 h-10 px-3 rounded-panel bg-evari-surface text-evari-text text-[13px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy || committing}
              className="inline-flex items-center justify-center h-10 w-10 rounded-panel bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
              title="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={committing}
              className={cn(
                'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-panel text-[12px] font-semibold transition',
                'bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-60 disabled:cursor-wait',
              )}
              title="Lock the strategy and start finding companies"
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {committing ? 'Locking…' : 'Commit & start discovery'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
