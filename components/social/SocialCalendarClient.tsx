'use client';

import { useMemo, useState } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Sparkles, Linkedin, Instagram, Music2, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SocialPost, SocialPlatform } from '@/lib/types';

const PLATFORM_ICON: Record<SocialPlatform, typeof Linkedin> = {
  linkedin: Linkedin,
  instagram: Instagram,
  tiktok: Music2,
};
const PLATFORM_TONE: Record<SocialPlatform, string> = {
  linkedin: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  instagram: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  tiktok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

function postDate(p: SocialPost): Date | null {
  const iso = p.publishedAt ?? p.scheduledFor;
  return iso ? new Date(iso) : null;
}

interface Props {
  posts: SocialPost[];
}

export function SocialCalendarClient({ posts }: Props) {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // composer state
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [topic, setTopic] = useState('');
  const [link, setLink] = useState('');
  const [draft, setDraft] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMock, setAiMock] = useState(false);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  const postsByDay = useMemo(() => {
    const m = new Map<string, SocialPost[]>();
    posts.forEach((p) => {
      const d = postDate(p);
      if (!d) return;
      const k = format(d, 'yyyy-MM-dd');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    });
    return m;
  }, [posts]);

  const drafts = posts.filter((p) => p.status === 'draft');

  const selectedPosts = selectedDate
    ? postsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? []
    : [];

  async function generateDraft() {
    setAiLoading(true);
    setDraft('');
    try {
      const res = await fetch('/api/social/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, topic, link }),
      });
      const data = (await res.json()) as { markdown: string; mock: boolean };
      setDraft(data.markdown);
      setAiMock(data.mock);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Calendar */}
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-evari-edge bg-evari-carbon">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-medium text-evari-text min-w-[160px] text-center">
              {format(cursor, 'LLLL yyyy')}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
        </div>

        <div className="grid grid-cols-7 border-b border-evari-edge text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 grid-flow-row auto-rows-fr">
            {days.map((d) => {
              const inMonth = isSameMonth(d, cursor);
              const isToday = isSameDay(d, new Date());
              const isSelected = selectedDate && isSameDay(d, selectedDate);
              const dayPosts = postsByDay.get(format(d, 'yyyy-MM-dd')) ?? [];
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    'min-h-[112px] border-b border-r border-evari-edge p-2 text-left transition-colors',
                    inMonth ? 'bg-evari-ink' : 'bg-evari-carbon/40 text-evari-dimmer',
                    isSelected ? 'ring-1 ring-inset ring-primary/60 bg-evari-surface' : 'hover:bg-evari-carbon',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        'text-xs font-mono tabular-nums',
                        isToday
                          ? 'inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground font-semibold'
                          : inMonth
                            ? 'text-evari-text'
                            : 'text-evari-dimmer',
                      )}
                    >
                      {format(d, 'd')}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {dayPosts.slice(0, 3).map((p) => {
                      const Icon = PLATFORM_ICON[p.platform];
                      return (
                        <li
                          key={p.id}
                          className={cn(
                            'text-[10px] rounded px-1.5 py-0.5 border truncate inline-flex items-center gap-1 max-w-full',
                            PLATFORM_TONE[p.platform],
                          )}
                        >
                          <Icon className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">
                            {p.publishedAt
                              ? format(new Date(p.publishedAt), 'HH:mm')
                              : p.scheduledFor
                                ? format(new Date(p.scheduledFor), 'HH:mm')
                                : ''}
                          </span>
                        </li>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <li className="text-[10px] text-evari-dimmer">+{dayPosts.length - 3} more</li>
                    )}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Side rail */}
      <aside className="w-[420px] shrink-0 border-l border-evari-edge bg-evari-carbon flex flex-col">
        {selectedDate ? (
          <div className="border-b border-evari-edge px-5 py-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">Selected day</div>
              <div className="text-sm font-medium text-evari-text">
                {format(selectedDate, 'EEEE d LLLL')}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="border-b border-evari-edge px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
            Compose · Drafts · {drafts.length}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {selectedPosts.length > 0 && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                Posts that day
              </div>
              {selectedPosts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              AI compose · in your voice
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(['instagram', 'linkedin', 'tiktok'] as SocialPlatform[]).map((p) => {
                const Icon = PLATFORM_ICON[p];
                const active = p === platform;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={cn(
                      'rounded-md border px-2 py-2 text-xs flex items-center gap-1.5 justify-center transition-colors capitalize',
                      active
                        ? PLATFORM_TONE[p]
                        : 'border-evari-edge text-evari-dim hover:bg-evari-surface',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {p}
                  </button>
                );
              })}
            </div>

            <Input
              placeholder="Topic — e.g. Tour at Devil's Punchbowl"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Input
              placeholder="Link (optional) — evari.cc/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />

            <Button
              variant="primary"
              size="sm"
              onClick={() => void generateDraft()}
              disabled={aiLoading || !topic.trim()}
              className="w-full"
            >
              {aiLoading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Generate draft
            </Button>

            {(draft || aiLoading) && (
              <div className="rounded-md border border-evari-edge bg-evari-ink p-3">
                {aiMock && draft && (
                  <Badge variant="warning" className="text-[10px] mb-2">fallback (no AI)</Badge>
                )}
                {aiLoading ? (
                  <div className="text-xs text-evari-dim">Drafting…</div>
                ) : (
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-h-[160px] text-xs font-sans bg-evari-ink border-0 focus-visible:ring-0"
                  />
                )}
                <div className="flex justify-between items-center pt-2 border-t border-evari-edge mt-2">
                  <div className="text-[10px] text-evari-dimmer">{draft.length} chars</div>
                  <Button size="sm" disabled={!draft.trim()}>
                    <Plus className="h-3 w-3" />
                    Add to calendar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {drafts.length > 0 && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                Drafts ({drafts.length})
              </div>
              {drafts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const Icon = PLATFORM_ICON[post.platform];
  return (
    <div className="rounded-md border border-evari-edge bg-evari-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] rounded-full border px-2 py-0.5 capitalize',
            PLATFORM_TONE[post.platform],
          )}
        >
          <Icon className="h-3 w-3" />
          {post.platform}
        </div>
        <Badge
          variant={
            post.status === 'published'
              ? 'success'
              : post.status === 'scheduled'
                ? 'gold'
                : post.status === 'failed'
                  ? 'critical'
                  : 'muted'
          }
          className="text-[9px]"
        >
          {post.status}
        </Badge>
      </div>
      <div className="text-xs text-evari-text leading-relaxed line-clamp-3">{post.caption}</div>
      {post.metrics && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-evari-dim font-mono tabular-nums">
          <span>{post.metrics.impressions} imp</span>
          <span>{post.metrics.engagements} eng</span>
          {post.metrics.clicks != null && <span>{post.metrics.clicks} clk</span>}
        </div>
      )}
    </div>
  );
}
