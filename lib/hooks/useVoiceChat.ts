'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// -----------------------------------------------------------------------------
// useVoiceChat — browser-native voice I/O for chat surfaces.
//
// Two capabilities, both shipped by the Web Speech API (Chromium + Safari):
//   1. SpeechRecognition  — mic → transcript. Emits interim + final strings.
//   2. SpeechSynthesis    — text → audio. Strips markdown before speaking so
//      code fences and table pipes don't get read out loud.
//
// Why native and not OpenAI Realtime / Whisper? Zero backend, zero API-key
// cost, instant to wire. Trade-off: Firefox doesn't support it. If Craig
// switches browsers we can swap the implementation for Whisper later — the
// hook surface stays the same.
//
// Usage:
//   const v = useVoiceChat();
//   <button onClick={() => v.startListening((text) => setInput(text))}>Mic</button>
//   <button onClick={() => v.setAutoSpeak(!v.autoSpeak)}>Speaker</button>
//   // When a reply arrives:
//   if (v.autoSpeak) v.speak(assistantText);
// -----------------------------------------------------------------------------

// Loose typing for the Web Speech API — TS DOM lib only ships
// `webkitSpeechRecognition` stub types. We declare the shape we care about
// so the rest of the hook can stay strict.
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: Array<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SRConstructor {
  new (): SRInstance;
}

type GlobalWithSR = Window & {
  SpeechRecognition?: SRConstructor;
  webkitSpeechRecognition?: SRConstructor;
};

export interface UseVoiceChat {
  /** Both mic and speaker are usable in this browser. */
  supported: boolean;
  micSupported: boolean;
  speakerSupported: boolean;

  // --- Mic ---
  isListening: boolean;
  /** Live transcript while the mic is open. Reset to '' when recognition ends. */
  interimTranscript: string;
  /**
   * Start listening. Calls `onFinal` once the user pauses long enough for a
   * final result, with the best-guess transcript. `onInterim` (optional) fires
   * on every partial result so the composer can show live text.
   */
  startListening(
    onFinal: (text: string) => void,
    onInterim?: (text: string) => void,
  ): void;
  stopListening(): void;

  // --- Speaker ---
  isSpeaking: boolean;
  autoSpeak: boolean;
  setAutoSpeak(v: boolean): void;
  /** Speak the given text (markdown stripped before synthesis). */
  speak(text: string): void;
  stopSpeaking(): void;
}

const AUTOSPEAK_STORAGE_KEY = 'evari.voiceChat.autoSpeak.v1';

export function useVoiceChat(): UseVoiceChat {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeakState] = useState(false);

  // Hold the active recognition instance so stopListening can abort it.
  const recognitionRef = useRef<SRInstance | null>(null);

  // Hydrate autoSpeak preference from localStorage.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTOSPEAK_STORAGE_KEY);
      if (raw === 'true') setAutoSpeakState(true);
    } catch {
      // ignore
    }
  }, []);

  const setAutoSpeak = useCallback((v: boolean) => {
    setAutoSpeakState(v);
    try {
      window.localStorage.setItem(AUTOSPEAK_STORAGE_KEY, v ? 'true' : 'false');
    } catch {
      // ignore
    }
    if (!v) {
      // Flipping the speaker off should kill anything mid-sentence.
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, []);

  // --- Feature detection (runs in an effect so SSR-rendered HTML stays stable) ---
  const [micSupported, setMicSupported] = useState(false);
  const [speakerSupported, setSpeakerSupported] = useState(false);

  useEffect(() => {
    const g = window as GlobalWithSR;
    setMicSupported(Boolean(g.SpeechRecognition || g.webkitSpeechRecognition));
    setSpeakerSupported(
      typeof window !== 'undefined' &&
        typeof window.speechSynthesis !== 'undefined',
    );
  }, []);

  // --- Mic control ---
  const startListening = useCallback(
    (onFinal: (text: string) => void, onInterim?: (text: string) => void) => {
      const g = window as GlobalWithSR;
      const Ctor = g.SpeechRecognition || g.webkitSpeechRecognition;
      if (!Ctor) return;

      // Only one active recognizer at a time.
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }

      const rec = new Ctor();
      rec.continuous = false; // stop after a pause — feels more chat-like
      rec.interimResults = true;
      rec.lang = 'en-GB';

      let finalText = '';

      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const alt = event.results[i][0]?.transcript ?? '';
          if (event.results[i].isFinal) {
            finalText += alt;
          } else {
            interim += alt;
          }
        }
        const combined = (finalText + interim).trim();
        setInterimTranscript(combined);
        if (onInterim) onInterim(combined);
      };

      rec.onerror = () => {
        // Silent — browser pops its own permission UI and the onend handler
        // will run regardless.
      };

      rec.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        const text = finalText.trim();
        if (text) onFinal(text);
        recognitionRef.current = null;
      };

      recognitionRef.current = rec;
      try {
        rec.start();
        setIsListening(true);
      } catch {
        // start() throws if called while already running — just ignore.
      }
    },
    [],
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  // --- Speaker control ---
  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const clean = stripMarkdownForSpeech(text).trim();
      if (!clean) return;

      // Cancel anything mid-sentence so we don't pile up queues.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-GB';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount — kill any active mic + speech so navigating away
  // doesn't leave Claude monologuing into the void.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    supported: micSupported && speakerSupported,
    micSupported,
    speakerSupported,
    isListening,
    interimTranscript,
    startListening,
    stopListening,
    isSpeaking,
    autoSpeak,
    setAutoSpeak,
    speak,
    stopSpeaking,
  };
}

// ---------------------------------------------------------------------------
// Markdown → plain text for speech synthesis. The TTS engine reads pipes and
// hashes literally, which is awful for tables and headings. Strip the obvious
// formatting, collapse extra whitespace, and punctuate bullets as pauses.
// ---------------------------------------------------------------------------

function stripMarkdownForSpeech(input: string): string {
  let s = input;

  // Code fences — replace with a natural spoken break.
  s = s.replace(/```[\s\S]*?```/g, ' (code block) ');
  // Inline code.
  s = s.replace(/`([^`]+)`/g, '$1');

  // Images + links — keep the visible text.
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Headings — drop the leading #s but keep the text.
  s = s.replace(/^#{1,6}\s+/gm, '');

  // Bold + italic emphasis markers.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');

  // Blockquote arrows.
  s = s.replace(/^>\s?/gm, '');

  // Bullet + numbered list markers — convert to a period pause.
  s = s.replace(/^\s*[-*+]\s+/gm, '• ');
  s = s.replace(/^\s*\d+\.\s+/gm, '');

  // Table pipes — replace with commas so rows read as lists.
  s = s.replace(/\|/g, ', ');
  // Table separator rows ( --- | --- ).
  s = s.replace(/^\s*[-: ,]+\s*$/gm, '');

  // Horizontal rules.
  s = s.replace(/^\s*---+\s*$/gm, '');

  // Collapse whitespace.
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ');

  return s.trim();
}
