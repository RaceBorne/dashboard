'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Send,
  RefreshCw,
  Sparkles,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageResponse } from '@/components/MessageResponse';
import { cn } from '@/lib/utils';
import type { KeywordWorkspace } from '@/lib/keywords/workspace';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';

// -----------------------------------------------------------------------------
// KeywordStrategyChat — full-width chat surface for the Keywords → Strategy
// tab. Backwards-and-forwards with Claude, grounded in the entire workspace
// (our lists + every competitor + all their ranked keywords, market data,
// backlinks). History is persisted to localStorage so the conversation
// carries between visits without needing a DB table yet.
// -----------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

const STORAGE_KEY = 'evari.keywords.strategyChat.v1';

interface Props {
  workspace: KeywordWorkspace;
}

export function KeywordStrategyChat({ workspace }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceChat();

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore — first-visit or corrupt payload
    }
    setHydrated(true);
  }, []);

  // Persist whenever messages change (after hydration, to avoid wiping on
  // initial render before the read has landed).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // quota or disabled storage — silently drop
    }
  }, [messages, hydrated]);

  // Auto-scroll to bottom when a new message arrives.
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [messages.length, loading]);

  async function sendChat(override?: string) {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: 'k-' + Math.random().toString(36).slice(2, 9),
      role: 'user',
      content: text,
      at: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/keywords/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        markdown?: string;
        mock?: boolean;
      };
      const replyText =
        data.markdown ?? '_No response. Check the /api/keywords/chat logs._';
      const aiMsg: ChatMessage = {
        id: 'k-' + Math.random().toString(36).slice(2, 9),
        role: 'assistant',
        content: replyText,
        at: new Date().toISOString(),
      };
      setMessages([...nextHistory, aiMsg]);
      // If the speaker toggle is on, read Claude's reply aloud.
      if (voice.autoSpeak) voice.speak(replyText);
    } catch (err) {
      const aiMsg: ChatMessage = {
        id: 'k-' + Math.random().toString(36).slice(2, 9),
        role: 'assistant',
        content:
          '_Chat failed: ' +
          (err instanceof Error ? err.message : String(err)) +
          '_',
        at: new Date().toISOString(),
      };
      setMessages([...nextHistory, aiMsg]);
    } finally {
      setLoading(false);
    }
  }

  function toggleMic() {
    if (voice.isListening) {
      voice.stopListening();
      return;
    }
    // Stop any currently-playing assistant voice so Claude isn't talking
    // over Craig as he starts speaking.
    voice.stopSpeaking();
    voice.startListening(
      (finalText) => {
        // Mic produced a final transcript — send it straight through as if
        // Craig had typed and hit Enter.
        setInput('');
        void sendChat(finalText);
      },
      (interim) => {
        // Live interim transcript fills the input so Craig can see what the
        // mic is hearing.
        setInput(interim);
      },
    );
  }

  function clearChat() {
    if (messages.length === 0) return;
    if (!confirm('Clear the strategy chat? This is just the UI history — your workspace data stays.')) {
      return;
    }
    setMessages([]);
  }

  const totalKeywords = Object.values(workspace.membersByList).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const competitors = workspace.lists.filter((l) => l.kind === 'competitor');
  const ownLists = workspace.lists.filter((l) => l.kind === 'own');

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Context banner */}
      <div className="px-6 py-4 border-b border-evari-surfaceSoft flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-evari-surfaceSoft flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-evari-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-evari-text">
            Keyword strategy — spitball with Claude
          </div>
          <div className="text-[11px] text-evari-dim leading-snug mt-0.5">
            Grounded in the full workspace:{' '}
            <span className="text-evari-text">{ownLists.length}</span> own list
            {ownLists.length === 1 ? '' : 's'},{' '}
            <span className="text-evari-text">{competitors.length}</span>{' '}
            competitor{competitors.length === 1 ? '' : 's'}
            {competitors.length > 0 ? (
              <>
                {' '}
                (
                {competitors
                  .map((c) => c.targetDomain || c.label)
                  .slice(0, 4)
                  .join(', ')}
                {competitors.length > 4 ? '…' : ''})
              </>
            ) : null}
            , <span className="text-evari-text">{totalKeywords}</span> keywords
            tracked with DataForSEO market data. Ask what's worth chasing, where
            the gaps are, how to cluster terms for new pages.
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {voice.speakerSupported ? (
            <button
              type="button"
              onClick={() => {
                // Off → on just flips the toggle. On → off also stops any
                // currently-playing utterance so Claude shuts up immediately.
                if (voice.autoSpeak) voice.stopSpeaking();
                voice.setAutoSpeak(!voice.autoSpeak);
              }}
              title={voice.autoSpeak ? 'Speaker on — click to mute' : 'Speaker off — click to hear replies'}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] transition-colors',
                voice.autoSpeak
                  ? 'text-evari-gold'
                  : 'text-evari-dimmer hover:text-evari-text',
              )}
            >
              {voice.autoSpeak ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
              {voice.autoSpeak ? 'Speaker on' : 'Speaker off'}
            </button>
          ) : null}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={clearChat}
              className="inline-flex items-center gap-1 text-[11px] text-evari-dimmer hover:text-evari-danger transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-3"
      >
        {messages.length === 0 ? (
          <EmptyState
            onPickPrompt={(p) => setInput(p)}
            disabled={loading}
          />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-md p-4 text-sm max-w-3xl',
                m.role === 'user'
                  ? 'bg-evari-surfaceSoft ml-auto'
                  : 'bg-evari-surface/60 mr-auto',
              )}
            >
              <div className="flex items-center justify-between mb-1.5 text-[10px] text-evari-dimmer">
                <span>{m.role === 'user' ? 'Craig' : 'Claude'}</span>
                <span>{shortTime(m.at)}</span>
              </div>
              {m.role === 'assistant' ? (
                <MessageResponse>{m.content}</MessageResponse>
              ) : (
                <p className="text-evari-text leading-relaxed whitespace-pre-wrap selectable">
                  {m.content}
                </p>
              )}
            </div>
          ))
        )}
        {loading ? (
          <div className="rounded-md p-4 text-sm bg-evari-surface/60 mr-auto max-w-3xl">
            <div className="flex items-center gap-2 text-[11px] text-evari-dimmer">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Thinking…
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-evari-surfaceSoft px-6 py-3 flex items-center gap-2">
        <Input
          placeholder={
            voice.isListening
              ? 'Listening…'
              : 'e.g. what are the best keywords for adventure-touring ebikes?'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendChat();
            }
          }}
          disabled={loading}
          className="flex-1"
        />
        {voice.isSpeaking ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={voice.stopSpeaking}
            title="Stop Claude from reading out loud"
          >
            <VolumeX className="h-3 w-3" />
            Stop
          </Button>
        ) : null}
        {voice.micSupported ? (
          <Button
            variant={voice.isListening ? 'primary' : 'ghost'}
            size="sm"
            onClick={toggleMic}
            disabled={loading}
            title={voice.isListening ? 'Stop listening' : 'Hold a conversation out loud'}
            className={voice.isListening ? 'animate-pulse' : ''}
          >
            {voice.isListening ? (
              <MicOff className="h-3 w-3" />
            ) : (
              <Mic className="h-3 w-3" />
            )}
            {voice.isListening ? 'Stop' : 'Talk'}
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void sendChat()}
          disabled={loading || !input.trim()}
        >
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  onPickPrompt,
  disabled,
}: {
  onPickPrompt: (p: string) => void;
  disabled: boolean;
}) {
  const starters = [
    'What are the best keywords for ebikes in the UK right now?',
    'Where are the biggest gaps between us and our competitors?',
    'Suggest 10 long-tail keywords for adventure-touring buyers.',
    'Which of our tracked keywords should we actually try to rank top-3 for this quarter?',
  ];
  return (
    <div className="max-w-2xl mx-auto text-center pt-10">
      <div className="text-sm text-evari-dim">
        No chat yet. Start with one of these or type your own prompt:
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPickPrompt(s)}
            className={cn(
              'rounded-md bg-evari-surface/60 hover:bg-evari-surface text-evari-text text-sm px-3 py-2.5 transition-colors text-left',
              disabled ? 'opacity-60 cursor-not-allowed' : '',
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
