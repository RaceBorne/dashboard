'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Inbox,
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
} from 'lucide-react';
import { DraftsPane } from '@/components/plays/DraftsPane';
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
  PlayScope,
  PlayStage,
  PlayStrategy,
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

type Pane = 'brief' | 'research' | 'targets' | 'messaging' | 'drafts' | 'activity';

export function PlayDetailClient({
  play: initialPlay,
}: {
  play: Play;
}) {
  const [play, setPlay] = useState<Play>(initialPlay);
  const [pane, setPane] = useState<Pane>('brief');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [committingStrategy, setCommittingStrategy] = useState(false);
  const [committingScope, setCommittingScope] = useState(false);
  const [sourcingProspects, setSourcingProspects] = useState(false);
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

  // ----- Stage transitions ---------------------------------------------

  async function setStage(s: PlayStage) {
    if (s === play.stage) return;
    // Optimistic update while the PATCH flies.
    setPlay((prev) => ({ ...prev, stage: s }));
    try {
      await patchPlay({ stage: s });
    } catch {
      // Rollback on failure.
      setPlay((prev) => ({ ...prev, stage: play.stage }));
    }
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
    try {
      const res = await fetch('/api/plays/' + play.id + '/source-prospects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        play?: Play;
        inserted?: number;
        note?: string;
        error?: string;
      };
      if (!data.ok || !data.play) {
        throw new Error(data.error || 'Source Prospects failed');
      }
      setPlay(data.play);
      if (data.note) setFlowError(data.note);
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Source Prospects failed');
    } finally {
      setSourcingProspects(false);
    }
  }

  const strategy = play.strategy;
  const scope = play.scope;

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
                <div className="text-[11px] text-evari-dimmer mt-1">
                  Created {relativeTime(play.createdAt)} · updated{' '}
                  {relativeTime(play.updatedAt)}
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
                  onClick={() => void setStage(s)}
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
              value: 'drafts',
              label: 'Drafts',
              icon: <Inbox className="h-3.5 w-3.5" />,
            },
            {
              value: 'activity',
              label: `Activity · ${play.activity.length}`,
              icon: <Activity className="h-3.5 w-3.5" />,
            },
          ]}
        />

        {pane === 'brief' && (
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void commitScope()}
                    disabled={committingScope || !strategy}
                    title={
                      strategy
                        ? 'Turn this strategy into a bulleted Scope plan.'
                        : 'Commit a strategy first.'
                    }
                    className="text-[11px] uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
                  >
                    {committingScope ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ListChecks className="h-3 w-3" />
                    )}
                    Convert to scope
                  </Button>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
                    Strategy
                  </div>
                </div>
                {!strategy && (
                  <span className="text-[10px] text-evari-dimmer italic">
                    Commit from Spitball, or edit any field below.
                  </span>
                )}
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

            {/* Scope block — generated from Strategy. */}
            <section className="rounded-xl bg-evari-surface p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void sourceProspects()}
                    disabled={sourcingProspects || !scope}
                    title={
                      scope
                        ? 'Run the Source Prospects agent for this scope.'
                        : 'Convert the strategy to a scope first.'
                    }
                    className="text-[11px] uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
                  >
                    {sourcingProspects ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Rocket className="h-3 w-3" />
                    )}
                    Source prospects
                  </Button>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
                    Scope
                  </div>
                </div>
                {scope?.sourcedAt ? (
                  <span className="text-[10px] text-evari-dimmer">
                    {scope.sourcedCount ?? 0} sourced · {relativeTime(scope.sourcedAt)}
                  </span>
                ) : (
                  <span className="text-[10px] text-evari-dimmer italic">
                    {scope ? 'Ready to source.' : 'Convert from Strategy to create a scope.'}
                  </span>
                )}
              </div>

              {flowError && (
                <div className="text-[11px] text-evari-warn bg-evari-surfaceSoft rounded px-2.5 py-1.5">
                  {flowError}
                </div>
              )}

              {scope ? (
                <div className="space-y-4">
                  <StrategyField
                    label="Summary"
                    hint="How we go to market for this Play."
                  >
                    <InlineText
                      value={scope.summary}
                      onSave={(v) => saveScope({ summary: v })}
                      multiline
                      placeholder="Click to write a one-paragraph scope summary."
                      displayClassName="text-sm text-evari-text leading-relaxed whitespace-pre-wrap"
                      label="scope summary"
                    />
                  </StrategyField>

                  <StrategyField
                    label="Plan"
                    hint="Who we contact, in what sequence, with what message."
                  >
                    <InlineList
                      values={scope.bullets}
                      onSave={(v) => saveScope({ bullets: v })}
                      placeholder="Add a plan step..."
                    />
                  </StrategyField>

                  {(scope.targetSummary || true) && (
                    <StrategyField
                      label="Target"
                      hint="Who we contact — sector, role, rough volume."
                    >
                      <InlineText
                        value={scope.targetSummary ?? ''}
                        onSave={(v) => saveScope({ targetSummary: v })}
                        placeholder="e.g. Practice managers at UK private knee clinics — ~120 targets"
                        displayClassName="text-sm text-evari-text"
                        label="target summary"
                      />
                    </StrategyField>
                  )}
                </div>
              ) : (
                <div className="text-xs text-evari-dimmer italic">
                  Commit a Strategy, then click Convert to scope to generate a
                  bulleted plan here.
                </div>
              )}
            </section>
          </div>
        )}

        {pane === 'research' && (
          <section className="space-y-1">
            {play.research.length === 0 && (
              <EmptyState
                label="No research notes yet."
                hint="Ask Claude to scrape or look something up, then pin the answer into this section."
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
                    {t.org ?? '-'}
                  </div>
                  <div className="col-span-3 min-w-0 text-xs font-mono text-evari-dim truncate">
                    {t.email ?? '-'}
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

        {pane === 'drafts' && <DraftsPane play={play} />}

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

      {/* Right: per-play chat. Pinned to the viewport, input always visible. */}
      <aside className="w-[420px] shrink-0">
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
              variant="ghost"
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
      </aside>
    </div>
  );
}

// =========================================================================
// Chat message bubble with long-reply collapse.
// =========================================================================

function ChatMessageBubble({
  message,
  onTogglePin,
}: {
  message: PlayChatMessage;
  onTogglePin: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-md p-3 text-sm relative group',
        message.role === 'user'
          ? 'bg-evari-surfaceSoft ml-6'
          : 'bg-evari-surface/60 mr-6',
      )}
    >
      <div className="flex items-center justify-between mb-1 text-[10px] text-evari-dimmer">
        <span>{message.role === 'user' ? 'Craig' : 'Claude'}</span>
        <div className="flex items-center gap-1">
          {message.pinned && (
            <Pin className="h-2.5 w-2.5 text-evari-gold" />
          )}
          <span>{relativeTime(message.at)}</span>
        </div>
      </div>
      {message.role === 'assistant' ? (
        <CollapsibleAssistant content={message.content} />
      ) : (
        <p className="text-evari-text leading-relaxed whitespace-pre-wrap selectable">
          {message.content}
        </p>
      )}
      <button
        type="button"
        onClick={onTogglePin}
        title={message.pinned ? 'Unpin' : 'Pin'}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-5 w-5 inline-flex items-center justify-center rounded text-evari-dimmer hover:text-evari-gold hover:bg-evari-surfaceSoft transition"
      >
        <Pin className="h-3 w-3" />
      </button>
    </div>
  );
}

function CollapsibleAssistant({ content }: { content: string }) {
  const lines = content.split('\n');
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const isLong = nonEmpty > 6 || content.length > 500;
  const [open, setOpen] = useState(!isLong);

  if (!isLong) {
    return <MessageResponse>{content}</MessageResponse>;
  }

  // Build a 2-to-3 line preview that always ends on a sentence boundary when
  // possible so the summary reads like a natural intro, not a chopped string.
  const preview = buildPreview(content);

  return (
    <div className="space-y-1.5">
      {open ? (
        <MessageResponse>{content}</MessageResponse>
      ) : (
        <p className="text-evari-text leading-relaxed whitespace-pre-wrap">
          {preview}
          <span className="text-evari-dimmer"> ...</span>
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] uppercase tracking-[0.12em] text-evari-gold hover:text-evari-text inline-flex items-center gap-1"
      >
        {open ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Collapse
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Show full reply ({nonEmpty} lines)
          </>
        )}
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
