'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  RefreshCw,
  Sparkles,
  Pin,
  Plus,
  ExternalLink,
  FileText,
  Users,
  Mail,
  Activity,
  Target,
  BookOpenText,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PillTabs } from '@/components/ui/pill-tabs';
import { MessageResponse } from '@/components/MessageResponse';
import { cn, relativeTime } from '@/lib/utils';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';
import type {
  Play,
  PlayChatMessage,
  PlayStage,
} from '@/lib/types';

const STAGES: PlayStage[] = [
  'idea',
  'researching',
  'building',
  'ready',
  'live',
  'retired',
];

const STAGE_TONE: Record<PlayStage, string> = {
  idea: 'text-evari-dim bg-evari-surfaceSoft',
  researching: 'bg-evari-gold text-evari-goldInk',
  building: 'bg-evari-warn text-evari-goldInk',
  ready: 'bg-sky-400 text-evari-ink',
  live: 'bg-evari-success text-evari-ink',
  retired: 'text-evari-dimmer bg-evari-surfaceSoft',
};

type Pane = 'brief' | 'research' | 'targets' | 'messaging' | 'activity';

export function PlayDetailClient({
  play: initialPlay,
}: {
  play: Play;
}) {
  const [play, setCampaign] = useState<Play>(initialPlay);
  const [pane, setPane] = useState<Pane>('brief');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceChat();

  function setStage(s: PlayStage) {
    setCampaign((prev) => ({
      ...prev,
      stage: s,
      activity: [
        ...prev.activity,
        {
          id: 'a-' + Math.random().toString(36).slice(2, 9),
          at: new Date().toISOString(),
          summary: `Moved to ${s}`,
          type: 'stage_change',
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  }

  async function sendChat(override?: string) {
    const text = (override ?? chatInput).trim();
    if (!text || chatLoading) return;
    const userMsg: PlayChatMessage = {
      id: 'c-' + Math.random().toString(36).slice(2, 9),
      role: 'user',
      content: text,
      at: new Date().toISOString(),
    };
    setCampaign((prev) => ({ ...prev, chat: [...prev.chat, userMsg] }));
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
      setCampaign((prev) => ({ ...prev, chat: [...prev.chat, aiMsg] }));
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
    setCampaign((prev) => ({
      ...prev,
      chat: prev.chat.map((m) =>
        m.id === id ? { ...m, pinned: !m.pinned } : m,
      ),
    }));
  }

  return (
    <div className="flex gap-5 p-6 max-w-[1600px]">
      {/* Left: workbook */}
      <main className="flex-1 min-w-0 space-y-5">
        <Link
          href="/plays"
          className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to strategy
        </Link>

        {/* Title + stage controls */}
        <div className="rounded-xl bg-evari-surface p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-2 min-w-0">
              {play.pinned && (
                <Pin className="h-4 w-4 text-evari-gold mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-evari-text">
                  {play.title}
                </h1>
                <div className="text-[11px] text-evari-dimmer mt-1">
                  Created {relativeTime(play.createdAt)} · updated{' '}
                  {relativeTime(play.updatedAt)}
                </div>
              </div>
            </div>
            <span
              className={cn(
                'shrink-0 text-[10px] uppercase tracking-wider font-semibold rounded-full px-2.5 py-1',
                STAGE_TONE[play.stage],
              )}
            >
              {play.stage}
            </span>
          </div>

          {/* Stage transitions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Move to:
            </span>
            {STAGES.map((s) => {
              const active = play.stage === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  disabled={active}
                  className={cn(
                    'text-[10px] capitalize px-2 py-0.5 rounded-full transition-colors',
                    active
                      ? 'bg-evari-surfaceSoft text-evari-text cursor-default'
                      : 'bg-evari-surface/60 text-evari-dim hover:bg-evari-surfaceSoft hover:text-evari-text',
                  )}
                >
                  {s}
                </button>
              );
            })}
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

        {/* Section switcher */}
        <PillTabs<Pane>
          value={pane}
          onChange={setPane}
          size="sm"
          options={[
            {
              value: 'brief',
              label: 'Brief',
              icon: <BookOpenText className="h-3.5 w-3.5" />,
            },
            {
              value: 'research',
              label: `Research · ${play.research.length}`,
              icon: <FileText className="h-3.5 w-3.5" />,
            },
            {
              value: 'targets',
              label: `Targets · ${play.targets.length}`,
              icon: <Target className="h-3.5 w-3.5" />,
            },
            {
              value: 'messaging',
              label: `Messaging · ${play.messaging.length}`,
              icon: <Mail className="h-3.5 w-3.5" />,
            },
            {
              value: 'activity',
              label: `Activity · ${play.activity.length}`,
              icon: <Activity className="h-3.5 w-3.5" />,
            },
          ]}
        />

        {pane === 'brief' && (
          <section className="rounded-xl bg-evari-surface p-5 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
              Brief
            </div>
            <p className="text-sm text-evari-text leading-relaxed whitespace-pre-wrap selectable">
              {play.brief}
            </p>
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
        )}

        {pane === 'research' && (
          <section className="space-y-1">
            {play.research.length === 0 && (
              <EmptyState
                label="No research notes yet."
                hint="Ask Claude to scrape or look something up — pin the answer into this section."
              />
            )}
            {play.research.map((r) => (
              <article
                key={r.id}
                className="bg-evari-surface/60 rounded-md p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-evari-text">
                    {r.title}
                  </h3>
                  <span className="text-[10px] text-evari-dimmer tabular-nums shrink-0">
                    {relativeTime(r.at)}
                  </span>
                </div>
                <p className="text-sm text-evari-dim leading-relaxed whitespace-pre-wrap">
                  {r.body}
                </p>
                {(r.sourceUrl || (r.tags && r.tags.length > 0)) && (
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    {r.sourceUrl && (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-evari-gold hover:text-evari-text"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        source
                      </a>
                    )}
                    {r.tags?.map((t) => (
                      <Badge key={t} variant="muted" className="text-[9px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {pane === 'targets' && (
          <section className="space-y-1">
            <div className="flex items-center justify-between px-1 pb-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                {play.targets.length} targets
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-evari-gold hover:text-evari-text"
              >
                <Plus className="h-3 w-3" />
                Add target
              </button>
            </div>
            {play.targets.length === 0 && (
              <EmptyState
                label="No targets yet."
                hint="Import from research, scrape a list, or add manually."
              />
            )}
            <ul className="space-y-1">
              {play.targets.map((t) => (
                <li
                  key={t.id}
                  className="bg-evari-surface/60 rounded-md p-3 grid grid-cols-12 gap-3 items-center"
                >
                  <div className="col-span-4 min-w-0">
                    <div className="text-sm text-evari-text truncate">
                      {t.name}
                    </div>
                    {t.role && (
                      <div className="text-[11px] text-evari-dim truncate">
                        {t.role}
                      </div>
                    )}
                  </div>
                  <div className="col-span-3 min-w-0 text-xs text-evari-dim truncate">
                    {t.org ?? '—'}
                  </div>
                  <div className="col-span-3 min-w-0 text-xs font-mono text-evari-dim truncate">
                    {t.email ?? '—'}
                  </div>
                  <div className="col-span-2 text-right">
                    <Badge
                      variant={
                        t.status === 'replied' || t.status === 'meeting'
                          ? 'success'
                          : t.status === 'won'
                            ? 'gold'
                            : t.status === 'declined'
                              ? 'critical'
                              : 'muted'
                      }
                      className="text-[9px] capitalize"
                    >
                      {t.status}
                    </Badge>
                  </div>
                  {t.notes && (
                    <div className="col-span-12 text-[11px] text-evari-dimmer italic pt-1">
                      {t.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {pane === 'messaging' && (
          <section className="space-y-1">
            {play.messaging.length === 0 && (
              <EmptyState
                label="No messaging drafts yet."
                hint="Use the chat on the right to draft in Evari voice, then save the best version here."
              />
            )}
            <ul className="space-y-1">
              {play.messaging.map((m) => (
                <li
                  key={m.id}
                  className="bg-evari-surface/60 rounded-md p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="muted" className="text-[9px] capitalize">
                        {m.channel}
                      </Badge>
                      {m.sequenceStep && (
                        <span className="text-[10px] text-evari-dimmer">
                          step {m.sequenceStep}
                        </span>
                      )}
                    </div>
                  </div>
                  {m.subject && (
                    <div className="text-sm font-medium text-evari-text">
                      {m.subject}
                    </div>
                  )}
                  <div className="text-xs text-evari-dim leading-relaxed whitespace-pre-wrap font-sans">
                    {m.body}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pane === 'activity' && (
          <section className="space-y-1">
            <ul className="space-y-1">
              {[...play.activity]
                .sort((a, b) => +new Date(b.at) - +new Date(a.at))
                .map((a) => (
                  <li
                    key={a.id}
                    className="bg-evari-surface/60 rounded-md px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="text-xs text-evari-text">{a.summary}</div>
                    <div className="text-[10px] text-evari-dimmer tabular-nums shrink-0">
                      {relativeTime(a.at)}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>

      {/* Right: per-play chat */}
      <aside className="w-[420px] shrink-0">
        <div className="sticky top-4 rounded-xl bg-evari-surface flex flex-col h-[calc(100vh-80px)]">
          <div className="flex items-start gap-3 p-4">
            <div className="h-8 w-8 rounded-lg bg-evari-surfaceSoft flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-evari-dim" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-evari-text">
                Spitball with Claude
              </div>
              <div className="text-[11px] text-evari-dim leading-snug">
                Grounded in this strategy's brief, research, targets and prior
                conversation.
              </div>
            </div>
            {voice.speakerSupported ? (
              <button
                type="button"
                onClick={() => {
                  if (voice.autoSpeak) voice.stopSpeaking();
                  voice.setAutoSpeak(!voice.autoSpeak);
                }}
                title={
                  voice.autoSpeak
                    ? 'Speaker on — click to mute'
                    : 'Speaker off — click to hear replies'
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
            className="flex-1 overflow-y-auto px-4 space-y-2"
          >
            {play.chat.length === 0 && (
              <div className="text-xs text-evari-dimmer italic py-8 text-center">
                No conversation yet. Start one below.
              </div>
            )}
            {play.chat.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'rounded-md p-3 text-sm relative group',
                  m.role === 'user'
                    ? 'bg-evari-surfaceSoft ml-6'
                    : 'bg-evari-surface/60 mr-6',
                )}
              >
                <div className="flex items-center justify-between mb-1 text-[10px] text-evari-dimmer">
                  <span>{m.role === 'user' ? 'Craig' : 'Claude'}</span>
                  <div className="flex items-center gap-1">
                    {m.pinned && (
                      <Pin className="h-2.5 w-2.5 text-evari-gold" />
                    )}
                    <span>{relativeTime(m.at)}</span>
                  </div>
                </div>
                {m.role === 'assistant' ? (
                  <MessageResponse>{m.content}</MessageResponse>
                ) : (
                  <p className="text-evari-text leading-relaxed whitespace-pre-wrap selectable">
                    {m.content}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => togglePinned(m.id)}
                  title={m.pinned ? 'Unpin' : 'Pin'}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-gold hover:bg-evari-surfaceSoft transition"
                >
                  <Pin className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 flex items-center gap-2">
            <Input
              placeholder={voice.isListening ? 'Listening…' : 'Ask, draft, plan…'}
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
      </aside>
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
