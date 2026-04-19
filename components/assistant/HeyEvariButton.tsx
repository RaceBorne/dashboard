'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Mic,
  MicOff,
  X,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Web Speech API types (not in the standard DOM lib).
interface SpeechResult {
  transcript: string;
  isFinal: boolean;
}
interface SR extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<SpeechResult>> & { length: number } }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SR;
interface SRWindow extends Window {
  SpeechRecognition?: SRCtor;
  webkitSpeechRecognition?: SRCtor;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const FEMALE_VOICE_NAMES = [
  'Serena', 'Kate', 'Moira', 'Fiona', 'Tessa', 'Karen', 'Samantha',
  'Google UK English Female', 'Google US English',
  'Microsoft Hazel', 'Microsoft Susan', 'Microsoft Libby', 'Microsoft Sonia',
  'Microsoft Zira', 'Microsoft Aria', 'Microsoft Jenny',
  'Joanna', 'Salli', 'Kendra',
];

function pickFemaleVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  for (const pref of FEMALE_VOICE_NAMES) {
    const v = voices.find(
      (v) =>
        v.name.toLowerCase().includes(pref.toLowerCase()) &&
        v.lang?.toLowerCase().startsWith('en'),
    );
    if (v) return v;
  }
  const labelled = voices.find(
    (v) => v.lang?.toLowerCase().startsWith('en') && /female/i.test(v.name),
  );
  if (labelled) return labelled;
  const gb = voices.find((v) => v.lang === 'en-GB');
  if (gb) return gb;
  const en = voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
  return en ?? voices[0] ?? null;
}

// Wake + sleep phrase matchers. Loose on "evari" transcription variance —
// Google's recogniser often hears "every" / "ever he" / "avari". The prefix
// guards against accidental triggers in normal speech.
// "Evari" is not in any browser's dictation dictionary, so recognisers
// butcher it in wildly different ways. Keep this regex loose — false
// positives are recoverable (say "goodbye Evari"), but a missed wake is
// what drives Craig mad.
const EVARI_ALIAS =
  '(?:e[\\s-]?vari|every|ever\\s?he|avari|ferrari|evari|i\\s?vari|ivari|very|heavy|heavyri|every\\s?e|heavari)';
const WAKE_RE = new RegExp(
  `\\b(?:hey|hi|okay|ok|hello|yo)\\s+${EVARI_ALIAS}`,
  'i',
);
const SLEEP_RE = new RegExp(
  `\\b(?:goodbye|good\\s*bye|bye|cheers|cheerio)\\s+${EVARI_ALIAS}`,
  'i',
);
const STORAGE_WAKE = 'evari-wake-enabled';

export function HeyEvariButton() {
  const [open, setOpen] = useState(false);
  // Wake word defaults OFF so the browser doesn't prompt for mic permission
  // on every page load before Craig has interacted. He can opt in via the
  // toggle in the panel header — once on, it persists across sessions.
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const wakeSrRef = useRef<SR | null>(null);

  // Load wake preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = window.localStorage.getItem(STORAGE_WAKE);
    if (v === '1') setWakeEnabled(true);
  }, []);

  function setWake(on: boolean) {
    setWakeEnabled(on);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_WAKE, on ? '1' : '0');
    }
  }

  // Wake-word listener: runs when wake is enabled AND panel is closed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!wakeEnabled || open) return;
    const w = window as unknown as SRWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    let stopped = false;
    const start = () => {
      if (stopped) return;
      const sr = new Ctor();
      sr.lang = 'en-GB';
      sr.interimResults = true;
      sr.continuous = true;
      sr.onresult = (ev) => {
        const results = ev.results;
        let combined = '';
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.length > 0) combined += r[0].transcript + ' ';
        }
        if (WAKE_RE.test(combined)) {
          try {
            sr.stop();
          } catch {
            /* ignore */
          }
          stopped = true;
          setOpen(true);
        }
      };
      sr.onerror = () => {
        // Restart after a brief pause unless intentionally stopped
        if (!stopped)
          setTimeout(() => {
            if (!stopped) start();
          }, 800);
      };
      sr.onend = () => {
        // Browser often auto-stops on silence — restart while we're still
        // in wake mode.
        if (!stopped)
          setTimeout(() => {
            if (!stopped) start();
          }, 200);
      };
      wakeSrRef.current = sr;
      try {
        sr.start();
      } catch {
        /* ignore */
      }
    };

    start();
    return () => {
      stopped = true;
      try {
        wakeSrRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [wakeEnabled, open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          // Craig's click is the browser's required user gesture for mic
          // access. Auto-enable wake word from now on so future page loads
          // and closures listen for "Hey Evari" without another prompt.
          if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem(STORAGE_WAKE);
            if (stored !== '0') {
              window.localStorage.setItem(STORAGE_WAKE, '1');
              setWakeEnabled(true);
            }
          }
        }}
        className={cn(
          'group relative inline-flex items-center justify-center rounded-full',
          'bg-evari-gold text-evari-goldInk',
          'h-14 w-14 shrink-0',
          'shadow-[0_6px_28px_-4px_rgb(var(--evari-gold)/0.5)]',
          'hover:brightness-110 active:scale-[0.96] transition-transform',
        )}
        aria-label='Open assistant — or just say "Hey Evari"'
        title='Open assistant — or just say "Hey Evari"'
      >
        <Sparkles className="h-6 w-6" />
        {!open && !wakeEnabled && (
          <span className="absolute inset-0 rounded-full border border-evari-goldInk/30 animate-ping opacity-60 pointer-events-none" />
        )}
        {!open && wakeEnabled && (
          <span
            className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-evari-success ring-2 ring-evari-ink"
            title='Listening for "Hey Evari"'
          />
        )}
      </button>

      {open && (
        <AssistantPanel
          onClose={() => setOpen(false)}
          wakeEnabled={wakeEnabled}
          setWake={setWake}
        />
      )}
    </div>
  );
}

function AssistantPanel({
  onClose,
  wakeEnabled,
  setWake,
}: {
  onClose: () => void;
  wakeEnabled: boolean;
  setWake: (on: boolean) => void;
}) {
  const [history, setHistory] = useState<Turn[]>([]);
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState('');
  const [thinking, setThinking] = useState(false);
  // Resolve capability synchronously on first render so the greeting's speak()
  // closure doesn't miss the auto-listen trigger at the end of TTS.
  const [supportsSpeech] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as SRWindow;
    return (
      !!(w.SpeechRecognition ?? w.webkitSpeechRecognition) &&
      'speechSynthesis' in window
    );
  });
  const [mock, setMock] = useState(false);
  const [autoListen, setAutoListen] = useState(true);
  const srRef = useRef<SR | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoListenRef = useRef(autoListen);
  useEffect(() => {
    autoListenRef.current = autoListen;
  }, [autoListen]);
  const listeningRef = useRef(listening);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  // Inactivity timer — 10 seconds of no speech/typing activity closes the panel.
  const INACTIVITY_MS = 10_000;
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpActivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => onClose(), INACTIVITY_MS);
  }, [onClose]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, []);

  const startListening = useCallback(() => {
    const w = window as unknown as SRWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    // Stop any previous recogniser
    try {
      srRef.current?.stop();
    } catch {
      /* ignore */
    }
    const sr = new Ctor();
    sr.lang = 'en-GB';
    sr.interimResults = true;
    sr.continuous = false;
    let lastInterim = '';
    let finalSent = false;
    sr.onresult = (ev) => {
      const results = ev.results;
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const first = result[0];
        if (result.length > 0) {
          if (first.isFinal) finalText += first.transcript;
          else interimText += first.transcript;
        }
      }
      if (interimText) {
        lastInterim = interimText.trim();
        setInterim(interimText);
        bumpActivity();
        // Sleep-phrase can be caught on interim — don't wait for a final
        if (SLEEP_RE.test(interimText)) {
          try {
            sr.stop();
          } catch {
            /* ignore */
          }
          onClose();
          return;
        }
      }
      if (finalText) {
        finalSent = true;
        bumpActivity();
        if (SLEEP_RE.test(finalText)) {
          try {
            sr.stop();
          } catch {
            /* ignore */
          }
          onClose();
          return;
        }
        setInterim('');
        void sendTurnRef.current?.(finalText);
      }
    };
    sr.onerror = () => setListening(false);
    sr.onend = () => {
      setListening(false);
      // Chrome sometimes ends recognition without ever emitting isFinal
      // for short utterances (e.g. "how are you"). Fall back to the last
      // interim transcript so the turn still gets sent.
      if (!finalSent && lastInterim.length >= 2) {
        const utterance = lastInterim;
        setInterim('');
        void sendTurnRef.current?.(utterance);
      }
    };
    srRef.current = sr;
    setListening(true);
    try {
      sr.start();
    } catch {
      setListening(false);
    }
    window.speechSynthesis?.cancel();
  }, []);

  const stopListening = useCallback(() => {
    try {
      srRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined') return;
      const synth = window.speechSynthesis;
      if (!synth) return;
      if (muted) {
        // Still trigger auto-listen even when muted, for a text-only conversation
        if (autoListenRef.current && supportsSpeech) {
          setTimeout(() => startListening(), 300);
        }
        return;
      }
      const send = () => {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickFemaleVoice(synth.getVoices());
        if (voice) u.voice = voice;
        u.rate = 1.02;
        u.pitch = 1.05;
        u.onstart = () => setSpeaking(true);
        u.onend = () => {
          setSpeaking(false);
          // Auto-resume listening for a natural back-and-forth.
          if (autoListenRef.current && supportsSpeech) {
            setTimeout(() => startListening(), 250);
          }
        };
        u.onerror = () => setSpeaking(false);
        synth.speak(u);
      };
      if (synth.getVoices().length === 0) {
        const handler = () => {
          synth.removeEventListener('voiceschanged', handler);
          send();
        };
        synth.addEventListener('voiceschanged', handler);
        setTimeout(send, 500);
      } else {
        send();
      }
    },
    [muted, supportsSpeech, startListening],
  );

  const sendTurn = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      bumpActivity();
      const userTurn: Turn = { role: 'user', content: clean };
      setHistory((prev) => [...prev, userTurn]);
      setInterim('');
      setTyped('');
      setThinking(true);
      scrollToBottom();
      let reply = '';
      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: clean,
            history: [...history, userTurn].slice(-10),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { text?: string; mock?: boolean };
        setMock(!!data.mock);
        reply = (data.text ?? '').trim();
        if (!reply) {
          reply = "Hmm, I didn't catch a response from the server. Try again?";
        }
      } catch {
        // Network failure, non-JSON, 500, whatever — always surface an audible
        // reply so the conversation doesn't die in silence.
        reply =
          "I'm having trouble reaching my brain right now. Could you ask me again in a moment?";
        setMock(true);
      } finally {
        setHistory((prev) => [...prev, { role: 'assistant', content: reply }]);
        speak(reply);
        setThinking(false);
        scrollToBottom();
        bumpActivity();
      }
    },
    [history, speak, scrollToBottom, bumpActivity],
  );

  const sendTurnRef = useRef(sendTurn);
  useEffect(() => {
    sendTurnRef.current = sendTurn;
  }, [sendTurn]);

  // Auto greeting on mount
  useEffect(() => {
    // Greet immediately
    (async () => {
      setThinking(true);
      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: '', greeting: true, history: [] }),
        });
        const data = (await res.json()) as { text: string; mock?: boolean };
        setMock(!!data.mock);
        setHistory([{ role: 'assistant', content: data.text }]);
        speak(data.text);
      } catch {
        // Network/API failure — don't block the conversation.
        setHistory([
          {
            role: 'assistant',
            content: "I'm here. What can I do for you?",
          },
        ]);
      } finally {
        setThinking(false);
        scrollToBottom();
        bumpActivity();
        // Safety net: if TTS doesn't fire (fetch failed, voices unavailable,
        // muted tab, etc.) still open the mic so the conversation can continue
        // naturally without Craig having to click anything.
        setTimeout(() => {
          if (autoListenRef.current && supportsSpeech && !listeningRef.current) {
            startListening();
          }
        }, 1500);
      }
    })();

    // Close on outside click
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      try {
        srRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    if (!muted) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
    }
    setMuted((v) => !v);
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-16 right-0 z-50 w-[300px] rounded-xl bg-evari-surfaceSoft shadow-[0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-evari-surface">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'h-7 w-7 rounded-full bg-evari-gold flex items-center justify-center shrink-0',
              speaking ? 'animate-pulse' : '',
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-evari-goldInk" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-evari-dim leading-tight">
              {listening
                ? 'Listening…'
                : thinking
                  ? 'Thinking…'
                  : speaking
                    ? 'Speaking'
                    : supportsSpeech
                      ? 'Tap the mic or type'
                      : 'Type your message'}
              {mock ? ' · offline' : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={wakeEnabled ? 'Turn off wake word' : 'Turn on wake word'}
            onClick={() => setWake(!wakeEnabled)}
            title={
              wakeEnabled
                ? 'Wake word on — say "Hey Evari" to open'
                : 'Wake word off'
            }
            className={cn(
              'h-6 w-6 rounded-full inline-flex items-center justify-center transition-colors relative',
              wakeEnabled
                ? 'text-evari-success hover:bg-evari-surfaceSoft'
                : 'text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft',
            )}
          >
            <Sparkles className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={autoListen ? 'Turn off auto-listen' : 'Turn on auto-listen'}
            onClick={() => setAutoListen((v) => !v)}
            title={autoListen ? 'Auto-listen on' : 'Auto-listen off'}
            className={cn(
              'h-6 w-6 rounded-full inline-flex items-center justify-center transition-colors',
              autoListen
                ? 'text-evari-gold hover:bg-evari-surfaceSoft'
                : 'text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft',
            )}
          >
            <Mic className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
            className="h-6 w-6 rounded-full inline-flex items-center justify-center text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors"
          >
            {muted ? (
              <VolumeX className="h-3 w-3" />
            ) : (
              <Volume2 className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="h-6 w-6 rounded-full inline-flex items-center justify-center text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="h-[200px] overflow-y-auto px-2.5 py-2 space-y-1.5"
      >
        {history.map((t, i) => (
          <div
            key={i}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-[13px] leading-relaxed',
              t.role === 'user'
                ? 'bg-evari-surface ml-6'
                : 'bg-evari-surface/60 mr-6',
            )}
          >
            {t.content}
          </div>
        ))}
        {interim && (
          <div className="bg-evari-surface/40 rounded-md px-2.5 py-1.5 text-[13px] leading-relaxed ml-6 italic text-evari-dim">
            {interim}…
          </div>
        )}
        {thinking && (
          <div className="flex items-center gap-1 text-xs text-evari-dim mr-6 px-2">
            <span className="h-1.5 w-1.5 rounded-full bg-evari-gold animate-bounce" />
            <span
              className="h-1.5 w-1.5 rounded-full bg-evari-gold animate-bounce"
              style={{ animationDelay: '0.15s' }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-evari-gold animate-bounce"
              style={{ animationDelay: '0.3s' }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 flex items-center gap-2 bg-evari-surface/40">
        <button
          type="button"
          aria-label={listening ? 'Stop listening' : 'Start listening'}
          onClick={listening ? stopListening : startListening}
          disabled={!supportsSpeech}
          className={cn(
            'h-9 w-9 rounded-full inline-flex items-center justify-center transition-all shrink-0',
            listening
              ? 'bg-evari-danger text-white animate-pulse'
              : supportsSpeech
                ? 'bg-evari-gold text-evari-goldInk hover:brightness-110'
                : 'bg-evari-surfaceSoft text-evari-dimmer cursor-not-allowed',
          )}
        >
          {listening ? (
            <MicOff className="h-3.5 w-3.5" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </button>
        <Input
          placeholder="…or type"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            bumpActivity();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && typed.trim()) {
              e.preventDefault();
              void sendTurn(typed);
            }
          }}
          disabled={thinking}
          className="flex-1 h-9 text-xs"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => void sendTurn(typed)}
          disabled={thinking || !typed.trim()}
          className="h-9 px-2"
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
