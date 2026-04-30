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
  /** When true, render without the close-button or commit action. Used
   *  when embedded inside the Brief step: the structured flow owns the
   *  Next/Handoff actions; Spitball is here purely for refinement. */
  compact?: boolean;
}

// Hidden user prompt that kicks off the conversation. Claude already
// knows Evari and the customer (loaded server-side via brand brief);
// this just tells it to convert the pitch directly into a draft
// strategy without asking the user any clarifying questions.
//
// IMPORTANT: ask for plain prose, not markdown. The Spitball renderer
// shows raw text with whitespace-pre-wrap, so any markdown syntax
// (## headers, **bold**, - bullets) appears literally on screen.
const DRAFT_PROMPT = [
  "Draft a prospecting strategy for this idea. Don't ask me clarifying questions, you already know Evari and our customer. Use the pitch as ground truth.",
  '',
  'Reply in two short paragraphs of plain prose. No headings. No bold. No bullet points. No markdown syntax of any kind. No em-dashes (use commas or full stops).',
  '',
  'First paragraph: who we are hunting and why, the role we email, and the angle that opens the conversation. Second paragraph: how we will know it is working in the first 90 days, and the kind of lead we should walk away from.',
  '',
  'Tight sentences. No filler. Calm, direct, founder-to-strategist tone.',
].join('\n');

/**
 * Render chat content with light markdown awareness:
 *   - `## **Title**` or `## Title` lines render as a semibold heading
 *   - inline `**bold**` becomes a <strong> span
 *   - `---` horizontal rules and bullet/number markers are dropped, the
 *     trailing text kept as a plain line
 *   - everything else is plain text, line by line
 *
 * The model occasionally insists on emitting markdown despite the
 * prompt asking for prose. This converts those cases into clean
 * styled output so the user never sees raw `##` or `**` characters.
 */
function renderInline(text: string, baseKey: number): React.ReactNode[] {
  // Split on **...** spans and render each as <strong>.
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts
    .filter((p) => p !== '')
    .map((p, i) => {
      const m = p.match(/^\*\*([^*\n]+)\*\*$/);
      if (m) return <strong key={`${baseKey}-${i}`} className="font-semibold text-evari-text">{m[1]}</strong>;
      return <span key={`${baseKey}-${i}`}>{p}</span>;
    });
}

function renderRich(text: string): React.ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    i++;

    // Horizontal rule, drop entirely.
    if (/^---+$/.test(line)) continue;

    // Blank line, render a small vertical gap.
    if (line.trim() === '') {
      out.push(<div key={`s-${i}`} className="h-2" />);
      continue;
    }

    // ATX heading: "## Title" or "## **Title**" up to six hashes.
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      const cleaned = heading[1].replace(/^\*\*(.+?)\*\*$/, '$1');
      out.push(
        <div key={`h-${i}`} className="font-semibold text-evari-text mt-2 mb-0.5">
          {renderInline(cleaned, i)}
        </div>,
      );
      continue;
    }

    // Bullet list marker: "- foo" or "* foo".
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      out.push(
        <div key={`b-${i}`}>{renderInline(bullet[1], i)}</div>,
      );
      continue;
    }

    // Numbered list marker: "1. foo".
    const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (numbered) {
      out.push(
        <div key={`n-${i}`}>{renderInline(numbered[1], i)}</div>,
      );
      continue;
    }

    // Plain line.
    out.push(<div key={`p-${i}`}>{renderInline(line, i)}</div>);
  }
  return out;
}

export function SpitballPanel({ playId, playTitle, pitch, open, kickoff, onClose, compact }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<SpitballMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const kickoffFired = useRef(false);

  // On mount: fetch the play's existing chat history. If there's a
  // conversation already saved, show it. If not, fire DRAFT_PROMPT so
  // Claude generates a first-pass strategy. This means navigating
  // back to Brief doesn't wipe earlier conversation — the chat
  // continues where the user left it.
  useEffect(() => {
    if (!open) return;
    if (kickoffFired.current) return;
    kickoffFired.current = true;
    void (async () => {
      setBusy(true);
      try {
        // 1. Pull the saved chat from the play row.
        const histRes = await fetch(`/api/plays/${playId}`, { cache: 'no-store' });
        const histJson = await histRes.json().catch(() => ({}));
        const playChat: Array<{ id?: string; role: 'user' | 'assistant'; content: string }> =
          histJson?.ok && histJson.play && Array.isArray(histJson.play.chat)
            ? histJson.play.chat
            : [];

        // Filter out the synthetic DRAFT_PROMPT user turn so the user
        // never sees the hidden seed.
        const visible = playChat.filter((m) => !(m.role === 'user' && m.content.startsWith("Draft a complete prospecting strategy")));

        if (visible.length > 0) {
          setMessages(visible.map((m, i) => ({
            id: m.id ?? 'h-' + i,
            role: m.role,
            content: m.content,
          })));
          setBusy(false);
          return;
        }

        // 2. No saved chat. Auto-draft the strategy.
        const res = await fetch(`/api/plays/${playId}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: DRAFT_PROMPT, history: [] }),
        });
        const json = await res.json();
        if (json?.ok && typeof json.markdown === 'string') {
          setMessages([
            { id: 'a-' + Date.now(), role: 'assistant', content: json.markdown },
          ]);
        } else {
          setMessages([
            {
              id: 'a-err',
              role: 'assistant',
              content:
                'Could not draft a strategy. Type a refinement below or hand off without committing.',
            },
          ]);
        }
      } catch {
        setMessages([
          {
            id: 'a-err',
            role: 'assistant',
            content:
              'Network error loading or drafting the conversation. Try again or refresh.',
          },
        ]);
      } finally {
        setBusy(false);
      }
    })();
  }, [open, playId]);

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

  // Two-stage flow: lock the strategy, then run the auto-scan
  // synchronously. The button label changes mid-flow so the user can
  // see progress. Routing happens once both stages finish.
  const [commitStage, setCommitStage] = useState<'idle' | 'locking' | 'scanning'>('idle');
  const commit = useCallback(async () => {
    if (commitStage !== 'idle') return;
    setCommitting(true);
    setCommitStage('locking');
    try {
      const history = messages.map(({ role, content }) => ({ role, content }));
      const lockRes = await fetch(`/api/plays/${playId}/commit-strategy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const lockJson = await lockRes.json();
      if (!lockJson?.ok) {
        setMessages((cur) => [
          ...cur,
          {
            id: 'err-' + Date.now(),
            role: 'assistant',
            content:
              'Commit failed: ' + (lockJson?.error ?? 'unknown error') +
              '. You can try again, or hand off without committing.',
          },
        ]);
        setCommitStage('idle');
        setCommitting(false);
        return;
      }

      // Strategy is locked. Now fire the auto-scan synchronously so
      // candidates land before we route the user to Discover.
      setCommitStage('scanning');
      try {
        await fetch(`/api/plays/${playId}/auto-scan`, { method: 'POST' });
      } catch {
        // Non-fatal: the user can still go to Discover and add
        // companies manually if the scan fails.
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
      setCommitStage('idle');
      setCommitting(false);
    }
  }, [commitStage, messages, playId, router]);

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
          Strategy: {playTitle}
        </h3>
        {compact ? null : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition"
            title="Hide chat, show structured brief"
          >
            <X className="h-3.5 w-3.5" /> Close
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {/* Centred conversation column. Wider than the floating panel
            so paragraphs breathe. Pitch sits at the top as anchor
            context. */}
        <div className="mx-auto w-full max-w-[760px] px-4 py-5 space-y-4">
          <div className="rounded-panel border border-evari-edge/30 bg-evari-surface px-3 py-2.5 text-[12px] text-evari-text leading-relaxed">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer block mb-1" style={{ fontWeight: 600 }}>Pitch</span>
            <span className="block" style={{ fontWeight: 600 }}>{pitch || '(no pitch on file)'}</span>
          </div>

          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-stretch')}>
              <div className={cn(
                'rounded-panel px-3 py-2 text-[13px] break-words leading-relaxed',
                m.role === 'user'
                  ? 'bg-evari-gold/15 text-evari-text max-w-[85%]'
                  : 'bg-evari-surface text-evari-text border border-evari-edge/30 w-full',
              )}>
                {renderRich(m.content)}
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
              placeholder="Refine the strategy, or hit Lock to commit..."
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
            {compact ? null : (
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
                {commitStage !== 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {commitStage === 'locking' ? 'Locking strategy…' :
                 commitStage === 'scanning' ? 'Finding companies…' :
                 'Lock strategy & start discovery'}
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
