'use client';

/**
 * Mojito AI Assistant pane.
 *
 * Conversational control surface for the entire dashboard. Streams
 * model output token-by-token, shows tool-call pills as the model
 * works, accepts voice input via Whisper, and drives the rest of the
 * app (navigation, edits, sends) by way of clientActions returned
 * from server tools.
 *
 * Backed by /api/ai/chat (streaming UIMessage protocol) and
 * /api/ai/transcribe (Whisper proxy).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, isTextUIPart, getToolName, type UIMessage } from 'ai';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Pane context — surface key + suggestions API kept for the existing
// useAISurface() callsites; route + routePlayId are now derived from
// usePathname() so every screen gets page-awareness for free.
// ---------------------------------------------------------------------------

interface QuickAction {
  title: string;
  subtitle?: string;
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
  pendingPrompt: string | null;
  askPane: (prompt: string) => void;
  consumePending: () => string | null;
}

const AIPaneContext = createContext<AIPaneContextValue | null>(null);

export function AIPaneProvider({ children }: { children: ReactNode }) {
  const [surface, setSurfaceState] = useState<string>('home');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [suggestions, setSuggestions] = useState<QuickAction[]>([]);
  const [open, setOpen] = useState<boolean>(true);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

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

  // Right arrow toggles pane open/closed unless typing.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') setOpen((o) => !o);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setSurface = useCallback(
    (s: string, sid?: string | null, ctx?: Record<string, unknown> | null) => {
      setSurfaceState(s);
      setScopeId(sid ?? null);
      setContext(ctx ?? null);
      setSuggestions([]);
    },
    [],
  );

  function askPane(prompt: string) {
    setPendingPrompt(prompt);
    setOpen(true);
  }
  function consumePending() {
    const p = pendingPrompt;
    setPendingPrompt(null);
    return p;
  }

  return (
    <AIPaneContext.Provider
      value={{
        surface,
        scopeId,
        context,
        suggestions,
        setSurface,
        setSuggestions,
        open,
        setOpen,
        pendingPrompt,
        askPane,
        consumePending,
      }}
    >
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
 * Surfaces register a key + optional quick actions. Page-awareness for
 * the AI now comes for free from usePathname; surface key is mostly
 * useful for conditional quick-action sets.
 */
export function useAISurface(opts: {
  surface: string;
  scopeId?: string | null;
  context?: Record<string, unknown> | null;
  suggestions?: QuickAction[];
}) {
  const { setSurface, setSuggestions } = useAIPane();
  const ctxKey = JSON.stringify(opts.context ?? null);
  const sugKey = JSON.stringify(opts.suggestions ?? []);
  useEffect(() => {
    setSurface(opts.surface, opts.scopeId ?? null, opts.context ?? null);
    setSuggestions(opts.suggestions ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.surface, opts.scopeId, ctxKey, sugKey]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) { if (MediaRecorder.isTypeSupported(c)) return c; }
  return '';
}

function inferPlayIdFromRoute(route: string): string | null {
  const m = /^\/plays\/(play-[a-z0-9-]+)/i.exec(route ?? '');
  return m ? m[1] : null;
}

function humaniseTool(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// Greeting block, only shown on an empty conversation. Tone matches
// the Mojito system prompt: short, concrete, no emoji, no em-dashes.
function buildGreeting(now: Date): string {
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  return greeting + ', Maddog. Ask me to do anything in the dashboard. I can create ideas, run discovery, draft campaigns, navigate, summarise. Tap the mic if you would rather talk.';
}

// ---------------------------------------------------------------------------
// AIAssistantPane
// ---------------------------------------------------------------------------

export function AIAssistantPane() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const {
    surface,
    scopeId,
    context: surfaceContext,
    suggestions,
    open,
    setOpen,
    pendingPrompt,
    consumePending,
  } = useAIPane();

  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const handledActionIds = useRef<Set<string>>(new Set());

  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/ai/chat',
      prepareSendMessagesRequest: ({ messages, body, id }) => ({
        body: {
          ...(body ?? {}),
          messages,
          id,
          pane: {
            route: pathname,
            routePlayId: inferPlayIdFromRoute(pathname),
            surface,
            surfaceContext,
            contextName: null,
          },
        },
      }),
    });
    // pathname / surface change should rebuild so subsequent sends carry fresh data.
  }, [pathname, surface, surfaceContext]);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
  });

  // Auto-scroll on new content.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  // Pending prompt injection from elsewhere in the app (askPane()).
  useEffect(() => {
    if (!pendingPrompt) return;
    const text = consumePending();
    if (text) void sendMessage({ text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Watch tool outputs for clientActions and dispatch them client-side.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      for (const part of m.parts ?? []) {
        if (!isToolUIPart(part)) continue;
        if (part.state !== 'output-available') continue;
        const key = m.id + ':' + part.toolCallId;
        if (handledActionIds.current.has(key)) continue;
        const out = part.output as Record<string, unknown> | null;
        if (!out || typeof out !== 'object') continue;
        const action = (out as { clientAction?: { type?: string; route?: string } }).clientAction;
        if (!action || typeof action !== 'object') continue;
        handledActionIds.current.add(key);
        if (action.type === 'navigate' && typeof action.route === 'string' && action.route.startsWith('/')) {
          router.push(action.route);
        } else if (action.type === 'closePane') {
          setOpen(false);
        }
      }
    }
  }, [messages, router, setOpen]);

  function refreshConversation() {
    setMessages([]);
    setInput('');
    handledActionIds.current = new Set();
  }

  function onSubmit() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void sendMessage({ text });
  }

  // ----- voice (click to toggle, talks to Whisper) ----------------------
  // Click to start, click again to stop, transcribe runs on stop. Errors
  // surface in micError so the user can see why the mic did not work
  // (most common cause: browser permission denied).
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    if (recording || transcribing) return;
    setMicError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError('This browser does not support microphone capture.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setMicError('MediaRecorder not supported in this browser.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      // Permission denied, no device, or hardware error.
      const name = (e as { name?: string } | null)?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicError('Microphone blocked. Allow it in the browser address bar, then click the mic again.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicError('No microphone detected on this device.');
      } else {
        setMicError('Could not start microphone: ' + (e instanceof Error ? e.message : String(e)));
      }
      console.warn('[mojito.mic.start] getUserMedia failed', e);
      return;
    }
    let rec: MediaRecorder;
    try {
      const mime = pickMime();
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setMicError('MediaRecorder rejected the audio format.');
      console.warn('[mojito.mic.start] MediaRecorder failed', e);
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      setRecording(false);
      if (blob.size < 1500) {
        // Way too small to contain speech, skip the round-trip.
        setMicError('Recording was too short. Try again and speak for a beat.');
        return;
      }
      setTranscribing(true);
      try {
        const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
        const fd = new FormData();
        fd.append('audio', blob, 'audio.' + ext);
        const res = await fetch('/api/ai/transcribe', { method: 'POST', body: fd });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
        if (res.ok && json.ok && json.text) {
          setInput((cur) => (cur ? cur + ' ' + json.text : json.text!));
        } else {
          setMicError(json.error ?? ('Transcription failed (HTTP ' + res.status + ').'));
          console.warn('[mojito.mic.transcribe] failed', json);
        }
      } catch (e) {
        setMicError('Transcription request failed: ' + (e instanceof Error ? e.message : String(e)));
        console.warn('[mojito.mic.transcribe] threw', e);
      } finally {
        setTranscribing(false);
      }
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
  }
  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* already stopping */ }
    }
    recorderRef.current = null;
  }
  function toggleRecording() {
    if (recording) stopRecording();
    else void startRecording();
  }

  // Send a confirmation reply ("yes, proceed") in response to a
  // requiresConfirmation tool result. The model should re-call the
  // same tool with confirm:true.
  function confirmToolGate(verb: 'yes' | 'no') {
    const text = verb === 'yes' ? 'Yes, confirmed. Proceed.' : 'No, cancel that.';
    void sendMessage({ text });
  }

  // ----- collapsed pill --------------------------------------------------
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 bottom-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-evari-gold/40 bg-evari-surface text-evari-gold hover:brightness-110 shadow-lg transition text-[11px] font-semibold"
      >
        <Sparkles className="h-3.5 w-3.5" /> Mojito
      </button>
    );
  }

  const busy = status === 'submitted' || status === 'streaming';

  return (
    <aside
      className={cn(
        'flex flex-col border-l border-evari-edge/30 bg-evari-surface min-h-0 flex-shrink-0 transition-all',
        collapsed ? 'w-14' : 'w-[360px]',
      )}
    >
      <header
        className={cn('border-b border-evari-edge/30 flex items-center h-[44px]', collapsed ? 'px-2 justify-center' : 'px-3 gap-2')}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={cn(
            'inline-flex items-center justify-center h-6 w-6 rounded-md bg-evari-gold/15 text-evari-gold',
            collapsed ? 'cursor-pointer hover:brightness-110' : '',
          )}
          title={collapsed ? 'Expand' : undefined}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
        {collapsed ? null : (
          <>
            <h3 className="text-[12px] font-semibold text-evari-text flex-1">Mojito AI</h3>
            <button
              type="button"
              onClick={refreshConversation}
              className="text-evari-dim hover:text-evari-text p-1 rounded transition"
              title="New conversation"
              aria-label="New conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setCollapsed(true)} className="text-evari-dim hover:text-evari-text p-1 rounded transition" title="Minimise">
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-evari-dim hover:text-evari-text p-1 rounded transition" title="Hide">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </header>

      {collapsed ? null : (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="text-[12px] text-evari-dim leading-relaxed bg-evari-ink/30 border border-evari-edge/30 rounded-md p-3">
                {buildGreeting(new Date())}
              </div>
            ) : null}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onConfirm={confirmToolGate} />
            ))}

            {error ? (
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md p-2">
                {error.message ?? 'Something went wrong. Try again.'}
              </div>
            ) : null}

            {busy && messages[messages.length - 1]?.role !== 'assistant' ? (
              <div className="flex items-center gap-2 text-[11px] text-evari-dim">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
              </div>
            ) : null}
          </div>

          {suggestions.length > 0 && messages.length === 0 ? (
            <div className="px-3 pb-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Quick actions</div>
              {suggestions.map((sg, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void sendMessage({ text: sg.prompt })}
                  disabled={busy}
                  className="w-full text-left rounded-md border border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40 hover:bg-evari-gold/5 transition p-2 disabled:opacity-50"
                >
                  <div className="text-[12px] font-semibold text-evari-text">{sg.title}</div>
                  {sg.subtitle ? <div className="text-[11px] text-evari-dim">{sg.subtitle}</div> : null}
                </button>
              ))}
            </div>
          ) : null}

          {micError ? (
            <div className="px-3 pb-2 -mt-1">
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5 leading-snug">
                {micError}
              </div>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="px-3 py-2 border-t border-evari-edge/30 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleRecording}
              disabled={busy || transcribing}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
              title={recording ? 'Click to stop and transcribe' : 'Click to record. Click again to stop.'}
              className={cn(
                'inline-flex items-center justify-center h-8 w-8 rounded-md border transition shrink-0',
                recording
                  ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                  : 'bg-evari-ink border-evari-edge/40 text-evari-dim hover:text-evari-text',
                (busy || transcribing) ? 'opacity-50' : '',
              )}
            >
              {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={transcribing ? 'Transcribing...' : recording ? 'Listening...' : 'Ask Mojito...'}
              className="flex-1 h-8 px-2 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
              disabled={transcribing}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition shrink-0"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </form>
        </>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// One conversation message: walks parts, renders text + tool pills.
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onConfirm,
}: {
  message: UIMessage;
  onConfirm: (verb: 'yes' | 'no') => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'rounded-md px-2.5 py-1.5 text-[12px] max-w-[92%] whitespace-pre-wrap break-words leading-relaxed space-y-2',
        isUser ? 'bg-evari-gold/15 text-evari-text' : 'bg-evari-ink/40 text-evari-text border border-evari-edge/30',
      )}>
        {(message.parts ?? []).map((part, i) => {
          if (isTextUIPart(part)) {
            return <div key={i}>{part.text}</div>;
          }
          if (isToolUIPart(part)) {
            return <ToolPill key={i} part={part} onConfirm={onConfirm} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolPill({
  part,
  onConfirm,
}: {
  part: ReturnType<typeof asToolPart>;
  onConfirm: (verb: 'yes' | 'no') => void;
}) {
  const name = humaniseTool(getToolName(part) as string);
  const state = part.state;
  const [open, setOpen] = useState(false);
  let icon = <Wrench className="h-3 w-3" />;
  let label: string = name;
  let tone = 'text-evari-dim';
  if (state === 'input-streaming' || state === 'input-available') {
    icon = <Loader2 className="h-3 w-3 animate-spin" />;
    label = 'Calling ' + name + '...';
  } else if (state === 'output-available') {
    icon = <CheckCircle2 className="h-3 w-3 text-evari-gold" />;
    tone = 'text-evari-text';
  } else if (state === 'output-error') {
    icon = <Circle className="h-3 w-3 text-red-400" />;
    tone = 'text-red-400';
    label = name + ' failed';
  }

  const out = state === 'output-available' ? (part.output as Record<string, unknown> | null) : null;
  const requiresConfirmation = !!(out && typeof out === 'object' && (out as { requiresConfirmation?: boolean }).requiresConfirmation);
  const message = out && typeof out === 'object' ? (out as { message?: string }).message : null;

  return (
    <div className="rounded-md border border-evari-edge/40 bg-evari-ink/30 px-2 py-1.5 text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn('flex items-center gap-1.5 w-full text-left', tone)}
      >
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wide opacity-70">tool</span>
        <span className="font-medium">{label}</span>
        <ChevronDown className={cn('h-3 w-3 ml-auto opacity-50 transition', open ? 'rotate-180' : '')} />
      </button>
      {requiresConfirmation && message ? (
        <div className="mt-2 space-y-2">
          <div className="text-evari-text text-[11px] leading-relaxed">{message}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onConfirm('yes')}
              className="px-2.5 py-1 rounded text-[11px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => onConfirm('no')}
              className="px-2.5 py-1 rounded text-[11px] text-evari-dim hover:text-evari-text border border-evari-edge/40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {open ? (
        <pre className="mt-2 text-[10px] leading-snug text-evari-dim font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
{JSON.stringify({ input: (part as { input?: unknown }).input, output: out, errorText: (part as { errorText?: string }).errorText }, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

// Helper to keep the ToolPill prop type tractable across SDK versions
// without exporting an internal SDK type.
type ToolUIPartLike = Parameters<typeof getToolName>[0] & {
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolCallId: string;
};

function asToolPart(p: ToolUIPartLike): ToolUIPartLike {
  return p;
}
