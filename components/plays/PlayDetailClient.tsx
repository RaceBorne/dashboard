'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FunnelRibbon } from '@/components/nav/FunnelRibbon';
import { ProjectRail } from '@/components/nav/ProjectRail';
import {
  Activity,
  Check,
  ExternalLink,
  FileText,
  ListChecks,
  Loader2,
  Mail,
  Mic,
  MicOff,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Target,
  Users,
  Volume2,
  VolumeX,
  X,
  UserSearch,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MessageResponse } from '@/components/MessageResponse';
import { cn, relativeTime } from '@/lib/utils';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';
import type {
  Play,
  PlayAutoScanStatus,
  PlayChatMessage,
  PlayScope,
  PlaySourceRun,
  PlayStrategy,
} from '@/lib/types';

export function PlayDetailClient({
  play: initialPlay,
}: {
  play: Play;
}) {
  const [play, setPlay] = useState<Play>(initialPlay);
  // Accordion state for the Spitball chat: at most ONE assistant bubble is
  // expanded at a time. Seeded with the newest assistant reply in the loaded
  // chat (if any) so the thread opens on the most recent thought.
  const [openMessageId, setOpenMessageId] = useState<string | null>(() => {
    for (let i = initialPlay.chat.length - 1; i >= 0; i -= 1) {
      if (initialPlay.chat[i].role === 'assistant') return initialPlay.chat[i].id;
    }
    return null;
  });
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [committingStrategy, setCommittingStrategy] = useState(false);
  const [committingScope, setCommittingScope] = useState(false);
  const [sourcingProspects, setSourcingProspects] = useState(false);
  // Live log of the streaming Source Prospects run. Each entry is one SSE event.
  const [sourceRunSteps, setSourceRunSteps] = useState<SourceRunStep[]>([]);
  const [flowError, setFlowError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceChat();

  // ----- PATCH helpers --------------------------------------------------

  async function patchPlay(body: Record<string, unknown>): Promise<void> {
    const res = await fetch('/api/plays/' + play.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      play?: Play;
      error?: string;
    };
    if (!data.ok || !data.play) {
      throw new Error(data.error || 'Save failed');
    }
    setPlay(data.play);
  }

  async function saveTitle(next: string) {
    await patchPlay({ title: next });
  }

  async function saveBrief(next: string) {
    await patchPlay({ brief: next });
  }

  async function saveStrategy(patch: Partial<PlayStrategy>) {
    await patchPlay({ strategy: patch });
  }

  async function saveCategory(next: string) {
    await patchPlay({ category: next });
  }

  async function saveScope(patch: Partial<PlayScope>) {
    await patchPlay({ scope: patch });
  }

  // ----- Chat -----------------------------------------------------------

  async function sendChat(override?: string) {
    const text = (override ?? chatInput).trim();
    if (!text || chatLoading) return;
    const userMsg: PlayChatMessage = {
      id: 'c-' + Math.random().toString(36).slice(2, 9),
      role: 'user',
      content: text,
      at: new Date().toISOString(),
    };
    setPlay((prev) => ({ ...prev, chat: [...prev.chat, userMsg] }));
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/plays/' + play.id + '/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: play.chat.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });
      const data = (await res.json()) as { markdown: string; mock?: boolean };
      const aiMsg: PlayChatMessage = {
        id: 'c-' + Math.random().toString(36).slice(2, 9),
        role: 'assistant',
        content: data.markdown,
        at: new Date().toISOString(),
      };
      setPlay((prev) => ({ ...prev, chat: [...prev.chat, aiMsg] }));
      // Newest reply opens; every other bubble snaps shut.
      setOpenMessageId(aiMsg.id);
      if (voice.autoSpeak) voice.speak(data.markdown);
    } catch {
      // swallow
    } finally {
      setChatLoading(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      });
    }
  }

  function toggleMic() {
    if (voice.isListening) {
      voice.stopListening();
      return;
    }
    // Don't let Claude narrate over Craig while he's speaking.
    voice.stopSpeaking();
    voice.startListening(
      (finalText) => {
        setChatInput('');
        void sendChat(finalText);
      },
      (interim) => {
        setChatInput(interim);
      },
    );
  }

  function togglePinned(id: string) {
    setPlay((prev) => ({
      ...prev,
      chat: prev.chat.map((m) =>
        m.id === id ? { ...m, pinned: !m.pinned } : m,
      ),
    }));
  }

  // ----- Flow actions: Brief -> Strategy -> Scope -> Source --------

  async function commitStrategy() {
    if (committingStrategy) return;
    setCommittingStrategy(true);
    setFlowError(null);
    try {
      const res = await fetch('/api/plays/' + play.id + '/commit-strategy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          history: play.chat.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        play?: Play;
        error?: string;
      };
      if (!data.ok || !data.play) {
        throw new Error(data.error || 'Commit failed');
      }
      setPlay(data.play);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommittingStrategy(false);
    }
  }

  async function commitScope() {
    if (committingScope) return;
    if (!play.strategy) {
      setFlowError('Commit a strategy first.');
      return;
    }
    setCommittingScope(true);
    setFlowError(null);
    try {
      const res = await fetch('/api/plays/' + play.id + '/commit-scope', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        play?: Play;
        error?: string;
      };
      if (!data.ok || !data.play) {
        throw new Error(data.error || 'Scope generation failed');
      }
      setPlay(data.play);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Scope generation failed');
    } finally {
      setCommittingScope(false);
    }
  }

  async function sourceProspects() {
    if (sourcingProspects) return;
    if (!play.scope) {
      setFlowError('Convert the strategy to a scope first.');
      return;
    }
    setSourcingProspects(true);
    setFlowError(null);
    // Fresh log — wipe any prior run steps.
    setSourceRunSteps([{ phase: 'starting', at: Date.now(), message: 'Starting Source Prospects…' }]);
    try {
      const res = await fetch('/api/plays/' + play.id + '/source-prospects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'HTTP ' + res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Read SSE chunks until the stream closes. Each SSE event ends with \n\n.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let delimiter = buffer.indexOf('\n\n');
        while (delimiter !== -1) {
          const raw = buffer.slice(0, delimiter).trim();
          buffer = buffer.slice(delimiter + 2);
          delimiter = buffer.indexOf('\n\n');
          if (!raw.startsWith('data:')) continue;
          const payload = raw.slice(5).trim();
          if (!payload) continue;
          let event: SourceRunServerEvent | null = null;
          try {
            event = JSON.parse(payload) as SourceRunServerEvent;
          } catch {
            continue;
          }
          if (!event || typeof event.phase !== 'string') continue;
          const step: SourceRunStep = {
            phase: event.phase,
            at: Date.now(),
            message: typeof event.message === 'string' ? event.message : undefined,
            found: typeof event.found === 'number' ? event.found : undefined,
            foundTotal:
              typeof event.foundTotal === 'number' ? event.foundTotal : undefined,
            uniqueTotal:
              typeof event.uniqueTotal === 'number' ? event.uniqueTotal : undefined,
            costUsd: typeof event.costUsd === 'number' ? event.costUsd : undefined,
            costTotal:
              typeof event.costTotal === 'number' ? event.costTotal : undefined,
            total: typeof event.total === 'number' ? event.total : undefined,
            done: typeof event.done === 'number' ? event.done : undefined,
            index: typeof event.index === 'number' ? event.index : undefined,
            query:
              event.query && typeof event.query === 'object'
                ? (event.query as { description?: string; locationName?: string })
                : undefined,
            queries:
              Array.isArray(event.queries)
                ? (event.queries as Array<{ description?: string; locationName?: string }>)
                : undefined,
            lead:
              event.lead && typeof event.lead === 'object'
                ? (event.lead as { id?: string; fullName?: string; companyName?: string })
                : undefined,
          };
          setSourceRunSteps((prev) => [...prev, step]);
          if (event.phase === 'done' && event.play) {
            setPlay(event.play as Play);
          }
          if (event.phase === 'inserted-progress' || event.phase === 'done') {
            // Tell the sidebar to re-poll nav-counts so the Prospects
            // pill bumps up in real time as rows land.
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('evari:nav-counts-dirty'));
            }
          }
          if (event.phase === 'error') {
            setFlowError(event.message ?? 'Source Prospects failed');
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Source Prospects failed';
      setFlowError(msg);
      setSourceRunSteps((prev) => [
        ...prev,
        { phase: 'error', at: Date.now(), message: msg },
      ]);
    } finally {
      setSourcingProspects(false);
    }
  }

  // Poll /api/plays/[id] while the background auto-scan is running so the
  // Scanning… pill self-resolves once it finishes. Polling stops as soon as
  // status transitions to done/skipped/error.
  const autoScanActive =
    play.autoScan?.status === 'pending' || play.autoScan?.status === 'running';
  useEffect(() => {
    if (!autoScanActive) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/plays/' + play.id, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          play?: Play;
        };
        if (!cancelled && data.ok && data.play) {
          setPlay(data.play);
        }
      } catch {
        // swallow — next tick will retry
      }
    };
    const handle = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [autoScanActive, play.id]);

  // Auto-dismiss the Source Prospects modal 500ms after the stream
  // finishes successfully. On error we leave it open so the operator
  // can read the message and close it themselves.
  const lastSourceStepPhase = sourceRunSteps[sourceRunSteps.length - 1]?.phase;
  useEffect(() => {
    if (sourcingProspects) return;
    if (sourceRunSteps.length === 0) return;
    if (lastSourceStepPhase !== 'done') return;
    const handle = setTimeout(() => setSourceRunSteps([]), 500);
    return () => clearTimeout(handle);
  }, [sourcingProspects, sourceRunSteps.length, lastSourceStepPhase]);

  const strategy = play.strategy;
  const scope = play.scope;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-[1600px]">
      <FunnelRibbon stage="strategy" playId={play.id} play={play} />
      <div className="flex gap-5">
      <ProjectRail activePlayId={play.id} />
      {/* Centre: Spitball chat — the live workspace where the venture
          gets shaped. Moved from the right column so the primary
          interaction sits in the middle of vision. */}
      <main className="flex-1 min-w-0">
        <div className="sticky top-4 rounded-xl bg-evari-surface flex flex-col max-h-[calc(100vh-80px)] min-h-[480px] overflow-hidden">
          <div className="flex items-start gap-3 p-4 shrink-0 border-b border-evari-line/40">
            <div className="h-8 w-8 rounded-lg bg-evari-surfaceSoft flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-evari-dim" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-evari-text">
                Spitball with Claude
              </div>
              <div className="text-[11px] text-evari-dim leading-snug">
                Grounded in this strategy brief, research, targets and prior
                conversation.
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void commitStrategy()}
              disabled={committingStrategy || play.chat.length === 0}
              title={
                play.chat.length === 0
                  ? 'Chat with Claude first.'
                  : 'Commit the current chat into a structured Strategy.'
              }
              className="shrink-0 text-[11px] uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
            >
              {committingStrategy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Commit to strategy
            </Button>
            {voice.speakerSupported ? (
              <button
                type="button"
                onClick={() => {
                  if (voice.autoSpeak) voice.stopSpeaking();
                  voice.setAutoSpeak(!voice.autoSpeak);
                }}
                title={
                  voice.autoSpeak
                    ? 'Speaker on. Click to mute.'
                    : 'Speaker off. Click to hear replies.'
                }
                className={cn(
                  'shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                  voice.autoSpeak
                    ? 'text-evari-gold bg-evari-surfaceSoft'
                    : 'text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft',
                )}
              >
                {voice.autoSpeak ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-2"
          >
            {play.chat.length === 0 && (
              <div className="text-xs text-evari-dimmer italic py-8 text-center">
                No conversation yet. Start one below.
              </div>
            )}
            {play.chat.map((m) => (
              <ChatMessageBubble
                key={m.id}
                message={m}
                isOpen={openMessageId === m.id}
                onToggle={() =>
                  setOpenMessageId((cur) => (cur === m.id ? null : m.id))
                }
                onTogglePin={() => togglePinned(m.id)}
              />
            ))}
            {chatLoading && (
              <div className="text-[11px] text-evari-dimmer italic py-2 pl-1 inline-flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Claude is thinking...
              </div>
            )}
          </div>

          {/* Input row. shrink-0 + border-t keeps it visible at the bottom of
              the aside no matter how long the thread grows. */}
          <div className="shrink-0 border-t border-evari-line/40 p-3 bg-evari-surface">
            <div className="flex items-center gap-2">
              <Input
                placeholder={voice.isListening ? 'Listening...' : 'Ask, draft, plan...'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
                disabled={chatLoading}
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
                </Button>
              ) : null}
              {voice.micSupported ? (
                <Button
                  variant={voice.isListening ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={toggleMic}
                  disabled={chatLoading}
                  title={voice.isListening ? 'Stop listening' : 'Hold a conversation out loud'}
                  className={voice.isListening ? 'animate-pulse' : ''}
                >
                  {voice.isListening ? (
                    <MicOff className="h-3 w-3" />
                  ) : (
                    <Mic className="h-3 w-3" />
                  )}
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                onClick={() => void sendChat()}
                disabled={chatLoading || !chatInput.trim()}
              >
                {chatLoading ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Right: workbook — the living artifact. Brief, strategy,
          notes. Narrow by design so the chat stays primary. */}
      <aside className="w-[560px] shrink-0 space-y-5">
        {/* Title + stage controls */}
        <div className="rounded-xl bg-evari-surface p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {play.pinned && (
                <Pin className="h-4 w-4 text-evari-gold mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <InlineText
                  value={play.title}
                  onSave={saveTitle}
                  placeholder="Untitled strategy"
                  displayClassName="text-lg font-semibold text-evari-text"
                  label="title"
                />
                <div className="text-[11px] text-evari-dimmer mt-1 flex items-center gap-2">
                  <span>
                    Created {relativeTime(play.createdAt)} · updated{' '}
                    {relativeTime(play.updatedAt)}
                  </span>
                  <AutoScanPill autoScan={play.autoScan} />
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                    Funnel
                  </span>
                  <div className="flex-1 min-w-0 max-w-[360px]">
                    <InlineText
                      value={play.category ?? ''}
                      onSave={saveCategory}
                      placeholder="e.g. Knee Ops"
                      displayClassName="text-[11px] text-evari-text"
                      label="funnel category"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {play.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-1">
              {play.tags.map((t) => (
                <Badge key={t} variant="muted" className="text-[9px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
            {/* Brief block */}
            <section className="rounded-xl bg-evari-surface p-5 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
                Brief
              </div>
              <InlineText
                value={play.brief}
                onSave={saveBrief}
                multiline
                placeholder="A one-paragraph why for this strategy. Click to edit."
                displayClassName="text-sm text-evari-text leading-relaxed whitespace-pre-wrap"
                label="brief"
              />
              {play.links && play.links.length > 0 && (
                <div className="pt-2">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium mb-1.5">
                    Connected
                  </div>
                  <ul className="space-y-1">
                    {play.links.map((l) => (
                      <li key={l.label}>
                        <Link
                          href={l.url}
                          className="inline-flex items-center gap-1 text-xs text-evari-gold hover:text-evari-text"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Strategy block */}
            <section className="rounded-xl bg-evari-surface p-5 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
                  Strategy
                </div>
                <div className="flex items-center gap-3">
                  {!strategy && (
                    <span className="text-[10px] text-evari-dimmer italic">
                      Commit from Spitball, or edit any field below.
                    </span>
                  )}
                  <Link
                    href={`/discover?playId=${play.id}`}
                    aria-disabled={!strategy}
                    tabIndex={strategy ? 0 : -1}
                    onClick={(e) => {
                      if (!strategy) e.preventDefault();
                    }}
                    title={
                      strategy
                        ? 'Load up Discovery with this strategy and fire the search.'
                        : 'Commit a strategy first.'
                    }
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] font-semibold shadow-sm transition-colors',
                      strategy
                        ? 'bg-evari-gold text-evari-goldInk hover:bg-evari-gold/90'
                        : 'bg-evari-surfaceSoft text-evari-dim cursor-not-allowed pointer-events-none',
                    ].join(' ')}
                  >
                    <UserSearch className="h-3 w-3" />
                    Load Up Discovery
                  </Link>
                </div>
              </div>

              <StrategyField label="Hypothesis" hint="One-sentence why now.">
                <InlineText
                  value={strategy?.hypothesis ?? ''}
                  onSave={(v) => saveStrategy({ hypothesis: v })}
                  multiline
                  placeholder="Click to write the one-sentence thesis for this play."
                  displayClassName="text-sm text-evari-text leading-relaxed whitespace-pre-wrap"
                  label="hypothesis"
                />
              </StrategyField>

              <StrategyField label="Sector" hint="Market or sector label.">
                <InlineText
                  value={strategy?.sector ?? ''}
                  onSave={(v) => saveStrategy({ sector: v })}
                  placeholder="e.g. UK private knee-surgery clinics"
                  displayClassName="text-sm text-evari-text"
                  label="sector"
                />
              </StrategyField>

              <StrategyField
                label="Target persona"
                hint="The job title we actually email. Not the famous one."
              >
                <InlineText
                  value={strategy?.targetPersona ?? ''}
                  onSave={(v) => saveStrategy({ targetPersona: v })}
                  multiline
                  placeholder="Click to name the person we are actually writing to."
                  displayClassName="text-sm text-evari-text leading-relaxed whitespace-pre-wrap"
                  label="targetPersona"
                />
              </StrategyField>

              <StrategyField
                label="Messaging angles"
                hint="One to three angles to test."
              >
                <InlineList
                  values={strategy?.messagingAngles ?? []}
                  onSave={(v) => saveStrategy({ messagingAngles: v })}
                  placeholder="Add a messaging angle..."
                />
              </StrategyField>

              <StrategyField
                label="Weekly target"
                hint="How many new prospects per week."
              >
                <InlineNumber
                  value={strategy?.weeklyTarget}
                  onSave={(v) => saveStrategy({ weeklyTarget: v })}
                  placeholder="Click to set a weekly target."
                />
              </StrategyField>

              <StrategyField
                label="Success metrics"
                hint="How we know the play worked."
              >
                <InlineList
                  values={strategy?.successMetrics ?? []}
                  onSave={(v) => saveStrategy({ successMetrics: v })}
                  placeholder="Add a success metric..."
                />
              </StrategyField>

              <StrategyField
                label="Disqualifiers"
                hint="Why we would not contact someone who otherwise matches."
              >
                <InlineList
                  values={strategy?.disqualifiers ?? []}
                  onSave={(v) => saveStrategy({ disqualifiers: v })}
                  placeholder="Add a disqualifier..."
                />
              </StrategyField>
            </section>

        </div>
      </aside>

      </div>
    </div>
  );
}

// =========================================================================
// Chat message bubble — click anywhere to toggle; accordion-style one-at-a-time.
// =========================================================================

function ChatMessageBubble({
  message,
  isOpen,
  onToggle,
  onTogglePin,
}: {
  message: PlayChatMessage;
  isOpen: boolean;
  onToggle: () => void;
  onTogglePin: () => void;
}) {
  const isAssistant = message.role === 'assistant';

  function handleClick() {
    if (!isAssistant) return;
    // Don't toggle when the user was selecting text inside the bubble.
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (sel && sel.toString().length > 0) return;
    onToggle();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isAssistant) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }

  const preview = isAssistant ? buildPreview(message.content) : '';
  const hasMore =
    isAssistant && message.content.trim().length > preview.length;

  return (
    <div
      role={isAssistant ? 'button' : undefined}
      tabIndex={isAssistant ? 0 : undefined}
      aria-expanded={isAssistant ? isOpen : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-md p-3 text-sm relative group transition-colors',
        isAssistant
          ? 'bg-evari-surface/60 mr-6 cursor-pointer hover:bg-evari-surface/80'
          : 'bg-evari-surfaceSoft ml-6',
      )}
    >
      <div className="flex items-center justify-between mb-1 text-[10px] text-evari-dimmer">
        <span>{isAssistant ? 'Claude' : 'Craig'}</span>
        <div className="flex items-center gap-1">
          {message.pinned && <Pin className="h-2.5 w-2.5 text-evari-gold" />}
          <span>{relativeTime(message.at)}</span>
        </div>
      </div>
      {isAssistant ? (
        isOpen ? (
          <MessageResponse>{message.content}</MessageResponse>
        ) : (
          <p className="text-evari-text leading-relaxed whitespace-pre-wrap">
            {preview}
            {hasMore ? <span className="text-evari-dimmer"> ...</span> : null}
          </p>
        )
      ) : (
        <p className="text-evari-text leading-relaxed whitespace-pre-wrap selectable">
          {message.content}
        </p>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        title={message.pinned ? 'Unpin' : 'Pin'}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-gold hover:bg-evari-surfaceSoft transition"
      >
        <Pin className="h-3 w-3" />
      </button>
    </div>
  );
}

function buildPreview(content: string): string {
  const trimmed = content.trim();
  // Prefer the first paragraph if it's short enough.
  const firstPara = trimmed.split(/\n\s*\n/)[0] ?? '';
  if (firstPara.length <= 220) return firstPara;
  // Otherwise the first sentence, then the next up to ~220 chars.
  const sentenceMatch = firstPara.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch) return sentenceMatch[0].trim();
  return firstPara.slice(0, 220);
}

// =========================================================================
// Inline editors.
// =========================================================================

function InlineText({
  value,
  onSave,
  placeholder,
  displayClassName,
  multiline,
  label,
}: {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  placeholder?: string;
  displayClassName?: string;
  multiline?: boolean;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    if (saving) return;
    const next = draft.trim();
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const hasValue = value.trim().length > 0;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={label ? `Edit ${label}` : 'Edit'}
        className="group relative block w-full text-left cursor-text rounded px-1 -mx-1 hover:bg-evari-surfaceSoft/40 transition-colors"
      >
        <span
          className={cn(
            'block',
            displayClassName,
            !hasValue && 'text-evari-dimmer italic',
          )}
        >
          {hasValue ? value : placeholder ?? 'Click to edit'}
        </span>
        <Pencil className="h-3 w-3 absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-evari-dimmer" />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={4}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(value);
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void commit();
            }
          }}
          className="w-full text-sm"
        />
      ) : (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(value);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
          className="w-full text-sm"
        />
      )}
      {error && (
        <div className="text-[11px] text-evari-crit">{error}</div>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void commit()}
          disabled={saving}
        >
          {saving ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          <span className="ml-1">Save</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setDraft(value);
            setError(null);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
        {multiline && (
          <span className="text-[10px] text-evari-dimmer">
            Cmd-Enter to save, Esc to cancel
          </span>
        )}
      </div>
    </div>
  );
}

function InlineList({
  values,
  onSave,
  placeholder,
}: {
  values: string[];
  onSave: (next: string[]) => Promise<void> | void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(values);
  }, [values, editing]);

  async function commit() {
    const cleaned = draft.map((s) => s.trim()).filter(Boolean);
    // No-op fast path.
    if (
      cleaned.length === values.length &&
      cleaned.every((v, i) => v === values[i])
    ) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(cleaned);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const empty = values.length === 0;
    return (
      <div className="group relative">
        {empty ? (
          <button
            type="button"
            onClick={() => {
              setDraft(['']);
              setEditing(true);
            }}
            className="text-xs text-evari-dimmer italic hover:text-evari-text"
          >
            {placeholder ?? 'Click to add an item.'}
          </button>
        ) : (
          <ul className="space-y-1.5">
            {values.map((v, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-evari-text"
              >
                <span className="text-evari-dimmer shrink-0 mt-0.5">-</span>
                <span className="flex-1 leading-relaxed whitespace-pre-wrap">
                  {v}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit list"
          className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 rounded text-evari-dimmer hover:text-evari-gold hover:bg-evari-surfaceSoft transition"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {draft.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={v}
            onChange={(e) =>
              setDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))
            }
            autoFocus={i === draft.length - 1}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setDraft((d) => [...d, '']);
              }
              if (e.key === 'Escape') {
                setEditing(false);
                setDraft(values);
              }
            }}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() =>
              setDraft((d) => d.filter((_, j) => j !== i))
            }
            aria-label="Remove item"
            className="shrink-0 p-1 text-evari-dimmer hover:text-evari-crit rounded transition"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {error && (
        <div className="text-[11px] text-evari-crit">{error}</div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDraft((d) => [...d, ''])}
          disabled={saving}
        >
          <Plus className="h-3 w-3" />
          <span className="ml-1">Add</span>
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          onClick={() => void commit()}
          disabled={saving}
        >
          {saving ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          <span className="ml-1">Save</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setDraft(values);
            setError(null);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function InlineNumber({
  value,
  onSave,
  placeholder,
}: {
  value?: number;
  onSave: (next: number | undefined) => Promise<void> | void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === undefined ? '' : String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value === undefined ? '' : String(value));
  }, [value, editing]);

  async function commit() {
    const trimmed = draft.trim();
    let next: number | undefined;
    if (trimmed === '') {
      next = undefined;
    } else {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        setError('Must be a non-negative number.');
        return;
      }
      next = Math.floor(n);
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group relative block text-left cursor-text rounded px-1 -mx-1 hover:bg-evari-surfaceSoft/40 transition-colors"
      >
        <span
          className={cn(
            'text-sm',
            value === undefined ? 'text-evari-dimmer italic' : 'text-evari-text',
          )}
        >
          {value === undefined
            ? placeholder ?? 'Click to set'
            : `${value} / week`}
        </span>
        <Pencil className="h-3 w-3 absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-evari-dimmer" />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="number"
        min={0}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setEditing(false);
            setDraft(value === undefined ? '' : String(value));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          }
        }}
        className="w-32 text-sm"
      />
      {error && <div className="text-[11px] text-evari-crit">{error}</div>}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => void commit()}
          disabled={saving}
        >
          {saving ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          <span className="ml-1">Save</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setDraft(value === undefined ? '' : String(value));
            setError(null);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function StrategyField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          {label}
        </div>
        {hint && (
          <div className="text-[10px] text-evari-dimmer/70 italic">{hint}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-md bg-evari-surface/60 p-8 text-center">
      <div className="text-sm text-evari-dim">{label}</div>
      <div className="text-xs text-evari-dimmer mt-1">{hint}</div>
    </div>
  );
}

// =========================================================================
// Source Prospects — visual devices
// =========================================================================

/**
 * One parsed SSE event from /api/plays/[id]/source-prospects, normalised
 * for the UI. The server emits a superset of fields per phase; we copy
 * only the ones we render.
 */
interface SourceRunStep {
  phase: string;
  at: number;
  message?: string;
  found?: number;
  foundTotal?: number;
  uniqueTotal?: number;
  costUsd?: number;
  costTotal?: number;
  total?: number;
  done?: number;
  index?: number;
  query?: { description?: string; locationName?: string };
  queries?: Array<{ description?: string; locationName?: string }>;
  lead?: { id?: string; fullName?: string; companyName?: string };
}

interface SourceRunServerEvent {
  phase: string;
  message?: string;
  found?: number;
  foundTotal?: number;
  uniqueTotal?: number;
  costUsd?: number;
  costTotal?: number;
  total?: number;
  done?: number;
  index?: number;
  query?: unknown;
  queries?: unknown;
  plan?: unknown;
  play?: unknown;
  lead?: unknown;
}

const PHASE_LABEL: Record<string, string> = {
  starting: 'Starting',
  planning: 'Asking Claude to plan the search',
  'plan-ready': 'Search plan ready',
  searching: 'Calling DataForSEO',
  'search-done': 'DataForSEO returned',
  inserting: 'Writing prospects to funnel',
  'inserted-progress': 'Inserting',
  done: 'Done',
  error: 'Failed',
};

/**
 * Live modal overlay for a Source Prospects run. Gives Craig the obvious
 * "the agent is scraping right now" UX he asked for: a big numeric counter
 * for prospects inserted + found, a progress bar, and a running log of
 * every phase. Auto-opens as soon as the run starts; can be dismissed
 * once the run settles.
 */
function SourceRunModal({
  steps,
  running,
  onDismiss,
}: {
  steps: SourceRunStep[];
  running: boolean;
  onDismiss: () => void;
}) {
  const finalPhase = steps[steps.length - 1]?.phase;
  const failed = steps.some((s) => s.phase === 'error');

  // Derive counters from the stream. The most recent inserted-progress
  // carries the running insert count; the latest search-done/all-searches
  // -done events carry the found totals.
  let inserted = 0;
  let insertTotal = 0;
  let foundTotal = 0;
  let uniqueTotal = 0;
  let costTotal = 0;
  let latestLeadName: string | undefined;
  let plannedQueryCount = 0;
  let plannedQueries: Array<{ description?: string; locationName?: string }> = [];
  let currentSearchIndex = 0;
  for (const s of steps) {
    if (s.phase === 'inserted-progress') {
      if (typeof s.done === 'number') inserted = s.done;
      if (typeof s.total === 'number') insertTotal = s.total;
      if (s.lead?.fullName) latestLeadName = s.lead.fullName;
    }
    if (s.phase === 'inserting' && typeof s.total === 'number') {
      insertTotal = s.total;
    }
    if (s.phase === 'search-done') {
      if (typeof s.foundTotal === 'number') foundTotal = s.foundTotal;
      if (typeof s.uniqueTotal === 'number') uniqueTotal = s.uniqueTotal;
      if (typeof s.costTotal === 'number') costTotal = s.costTotal;
    }
    if (s.phase === 'all-searches-done') {
      if (typeof s.foundTotal === 'number') foundTotal = s.foundTotal;
      if (typeof s.uniqueTotal === 'number') uniqueTotal = s.uniqueTotal;
      if (typeof s.costTotal === 'number') costTotal = s.costTotal;
    }
    if (s.phase === 'plan-ready' && Array.isArray(s.queries)) {
      plannedQueries = s.queries;
      plannedQueryCount = s.queries.length;
    }
    if (s.phase === 'searching' && typeof s.index === 'number') {
      currentSearchIndex = s.index;
    }
  }

  // Progress percentage — insert progress wins once we are inserting;
  // before that, show search progress.
  let progress = 0;
  if (insertTotal > 0) {
    progress = Math.min(100, Math.round((inserted / insertTotal) * 100));
  } else if (plannedQueryCount > 0) {
    progress = Math.min(
      100,
      Math.round((currentSearchIndex / plannedQueryCount) * 100),
    );
  }

  const stateLabel = failed
    ? 'failed'
    : running
      ? finalPhase === 'inserting' || finalPhase === 'inserted-progress'
        ? 'writing to funnel'
        : finalPhase === 'searching'
          ? 'scraping'
          : finalPhase === 'planning'
            ? 'planning'
            : 'running'
      : finalPhase === 'done'
        ? 'complete'
        : 'idle';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Source Prospects live progress"
    >
      <div className="w-[600px] h-[400px] bg-evari-surface border border-evari-line/60 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-evari-line/40">
          <div className="flex items-center gap-2 min-w-0">
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin text-evari-gold shrink-0" />
            ) : failed ? (
              <X className="h-4 w-4 text-evari-danger shrink-0" />
            ) : (
              <Check className="h-4 w-4 text-evari-success shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-evari-dimmer">
                Source Prospects
              </div>
              <div className="text-[13px] font-medium text-evari-text truncate">
                {stateLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={running}
            title={running ? 'Run in progress — wait for it to finish' : 'Close'}
            className={cn(
              'text-[11px] px-2 py-1 rounded border border-evari-line/50',
              running
                ? 'opacity-40 cursor-not-allowed'
                : 'text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft',
            )}
          >
            close
          </button>
        </div>

        {/* Counter row — the big "it's working" number */}
        <div className="px-5 pt-5 pb-3 grid grid-cols-3 gap-3">
          <CounterCell
            label="Inserted"
            value={inserted}
            suffix={insertTotal > 0 ? ' / ' + insertTotal : undefined}
            accent="gold"
            pulse={running && finalPhase === 'inserted-progress'}
          />
          <CounterCell
            label="Unique found"
            value={uniqueTotal}
            accent="text"
          />
          <CounterCell
            label="Raw listings"
            value={foundTotal}
            accent="dim"
          />
        </div>

        {/* Progress bar */}
        <div className="px-5">
          <div className="h-1.5 rounded-full bg-evari-surfaceSoft overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                failed
                  ? 'bg-evari-danger'
                  : running
                    ? 'bg-evari-gold'
                    : 'bg-evari-success',
              )}
              style={{ width: progress + '%' }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-evari-dimmer mt-1">
            <span>
              {insertTotal > 0
                ? 'Writing row ' + inserted + ' of ' + insertTotal
                : plannedQueryCount > 0
                  ? 'Query ' + currentSearchIndex + ' of ' + plannedQueryCount
                  : ''}
            </span>
            {costTotal > 0 ? (
              <span>DataForSEO cost ${costTotal.toFixed(3)}</span>
            ) : null}
          </div>
          {latestLeadName ? (
            <div className="mt-1 text-[10px] text-evari-dim truncate">
              Latest: <span className="text-evari-text">{latestLeadName}</span>
            </div>
          ) : null}
        </div>

        {/* Fan-out query chips */}
        {plannedQueries.length > 0 ? (
          <div className="px-5 pt-3 flex flex-wrap gap-1.5">
            {plannedQueries.map((q, i) => {
              const isDone = i + 1 < currentSearchIndex;
              const isActive = i + 1 === currentSearchIndex && running;
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                    isDone
                      ? 'bg-evari-success/10 text-evari-success border-evari-success/30'
                      : isActive
                        ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/40'
                        : 'bg-evari-surfaceSoft text-evari-dim border-evari-line/40',
                  )}
                >
                  {isActive ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : isDone ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : null}
                  {q.description}
                  {q.locationName && q.locationName !== 'United Kingdom' ? (
                    <span className="opacity-60">· {q.locationName}</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}

        {/* Event log */}
        <div className="px-5 py-3 overflow-y-auto flex-1 min-h-0">
          <ul className="space-y-1">
            {steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              const isError = s.phase === 'error';
              const inFlight =
                running && isLast && !isError && s.phase !== 'done';
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[11px] text-evari-text leading-snug"
                >
                  <span className="shrink-0 w-3 h-3 mt-0.5 inline-flex items-center justify-center">
                    {inFlight ? (
                      <Loader2 className="h-3 w-3 animate-spin text-evari-gold" />
                    ) : isError ? (
                      <X className="h-3 w-3 text-evari-danger" />
                    ) : (
                      <Check className="h-3 w-3 text-evari-success" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-evari-text">
                      {PHASE_LABEL[s.phase] ?? s.phase}
                    </span>
                    {s.message ? (
                      <span className="text-evari-dim"> — {s.message}</span>
                    ) : s.phase === 'inserted-progress' &&
                      s.done != null &&
                      s.total != null ? (
                      <span className="text-evari-dim">
                        {' '}
                        — {s.done} / {s.total}
                        {s.lead?.fullName ? ' · ' + s.lead.fullName : ''}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * One of the three big counters in the modal header. Pulses briefly when
 * a new insert arrives so Craig can see the number move.
 */
function CounterCell({
  label,
  value,
  suffix,
  accent,
  pulse,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent: 'gold' | 'text' | 'dim';
  pulse?: boolean;
}) {
  const color =
    accent === 'gold'
      ? 'text-evari-gold'
      : accent === 'text'
        ? 'text-evari-text'
        : 'text-evari-dim';
  return (
    <div className="rounded-lg border border-evari-line/40 bg-evari-surface/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-evari-dimmer">
        {label}
      </div>
      <div
        className={cn(
          'text-2xl font-semibold tabular-nums leading-tight transition-transform duration-200',
          color,
          pulse ? 'scale-[1.04]' : 'scale-100',
        )}
      >
        {value}
        {suffix ? (
          <span className="text-xs text-evari-dimmer font-normal"> {suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Persistent "Last run" card — always renders as long as scope.lastSourceRun
 * exists, so Craig can see the most recent run's numbers without diving
 * into activity history.
 */
function LastRunCard({ run }: { run: PlaySourceRun }) {
  const failed = Boolean(run.error);
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-1.5',
        failed
          ? 'border-evari-danger/30 bg-evari-danger/5'
          : 'border-evari-line/40 bg-evari-surface/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] font-medium text-evari-dimmer flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          Last source run
        </div>
        <span className="text-[10px] text-evari-dimmer">{relativeTime(run.at)}</span>
      </div>
      <div className="text-[11px] text-evari-text leading-relaxed">
        <span className="text-evari-dim">Agent:</span>{' '}
        <span className="font-medium">{run.agent}</span>
        {run.description ? (
          <>
            {' '}
            · <span className="text-evari-dim">query:</span>{' '}
            <span className="font-medium">"{run.description}"</span>
          </>
        ) : null}
        {run.locationName ? (
          <>
            {' '}
            <span className="text-evari-dim">in</span>{' '}
            <span className="font-medium">{run.locationName}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-evari-dim">
        {run.found != null ? (
          <span>
            <span className="text-evari-text font-medium">{run.found}</span>{' '}
            found
          </span>
        ) : null}
        <span>
          <span className="text-evari-text font-medium">{run.inserted}</span>{' '}
          inserted
        </span>
        {run.costUsd != null ? <span>\${run.costUsd.toFixed(3)}</span> : null}
        {run.durationMs != null ? (
          <span>{(run.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </div>
      {run.error ? (
        <div className="text-[11px] text-evari-danger">{run.error}</div>
      ) : null}
    </div>
  );
}

/**
 * Small status pill next to the Play title. Amber while the background
 * auto-scan is running, green (briefly) when it just finished, nothing
 * once the result is old news.
 */
function AutoScanPill({ autoScan }: { autoScan?: PlayAutoScanStatus }) {
  if (!autoScan) return null;
  if (autoScan.status === 'pending' || autoScan.status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-evari-gold/15 text-evari-gold px-2 py-0.5 text-[10px] font-medium">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Scanning landscape…
      </span>
    );
  }
  if (autoScan.status === 'done' && autoScan.finishedAt) {
    const finished = new Date(autoScan.finishedAt).getTime();
    if (Number.isFinite(finished) && Date.now() - finished < 5 * 60_000) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-evari-success/15 text-evari-success px-2 py-0.5 text-[10px] font-medium">
          <Check className="h-2.5 w-2.5" />
          {autoScan.inserted ?? 0} auto-sourced
        </span>
      );
    }
  }
  if (autoScan.status === 'error') {
    return (
      <span
        title={autoScan.error ?? 'Auto-scan failed'}
        className="inline-flex items-center gap-1 rounded-full bg-evari-danger/15 text-evari-danger px-2 py-0.5 text-[10px] font-medium"
      >
        <X className="h-2.5 w-2.5" />
        Auto-scan failed
      </span>
    );
  }
  return null;
}
