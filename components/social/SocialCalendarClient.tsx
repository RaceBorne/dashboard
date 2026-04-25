'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Sparkles,
  Linkedin,
  Instagram,
  Music2,
  Plus,
  RefreshCw,
  Newspaper,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SocialPost, SocialPlatform } from '@/lib/types';
import {
  MonthCalendar,
  type CalendarEvent,
  type CalendarEventTone,
} from '@/components/ui/month-calendar';
import { WeekCalendar } from '@/components/ui/week-calendar';
import { PillTabs } from '@/components/ui/pill-tabs';
import Link from 'next/link';

const PLATFORM_ICON: Record<SocialPlatform, typeof Linkedin> = {
  linkedin: Linkedin,
  instagram: Instagram,
  tiktok: Music2,
  shopify_blog: Newspaper,
  newsletter: Mail,
};

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin: 'LI',
  instagram: 'IG',
  tiktok: 'TT',
  shopify_blog: 'Blog',
  newsletter: 'Email',
};

function postDate(p: SocialPost): Date | null {
  const iso = p.publishedAt ?? p.scheduledFor;
  return iso ? new Date(iso) : null;
}

function statusTone(status: SocialPost['status']): CalendarEventTone {
  switch (status) {
    case 'scheduled':
      return 'accent';
    case 'published':
      return 'success';
    case 'failed':
      return 'danger';
    default:
      return 'default';
  }
}

function captionSnippet(s: string, max = 40) {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

export interface JournalCalendarEntry {
  id: string;
  title: string;
  scheduledFor: string;
  blogTarget: string;
  coverImageUrl: string | null;
}

interface Props {
  posts: SocialPost[];
  journalDrafts?: JournalCalendarEntry[];
}

type CalendarView = 'day' | 'week' | 'month' | 'year';

export function SocialCalendarClient({ posts, journalDrafts = [] }: Props) {
  const [view, setView] = useState<CalendarView>('month');
  const [month, setMonth] = useState<Date>(new Date());
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [dayAnchor, setDayAnchor] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // composer state
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [topic, setTopic] = useState('');
  const [link, setLink] = useState('');
  const [draft, setDraft] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMock, setAiMock] = useState(false);

  // Map SocialPosts → CalendarEvents
  const events: CalendarEvent[] = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (const p of posts) {
      const d = postDate(p);
      if (!d) continue;
      out.push({
        id: p.id,
        date: d,
        start: d,
        title: `${PLATFORM_LABEL[p.platform]} · ${captionSnippet(p.caption, 28)}`,
        time: format(d, 'HH:mm'),
        durationMinutes: 30,
        tone: statusTone(p.status),
      });
    }
    // Departure Lounge journal drafts — scheduled-for journals that
    // haven't published to Shopify yet. Rendered as solid orange
    // lozenges (matches the Departure Lounge brand colour) and
    // clicking one in the month view navigates to the week of that
    // date for finer-grain inspection.
    for (const j of journalDrafts) {
      const d = new Date(j.scheduledFor);
      if (Number.isNaN(d.getTime())) continue;
      out.push({
        id: `journal:${j.id}`,
        date: d,
        start: d,
        title: `Journal · ${captionSnippet(j.title, 28)}`,
        time: format(d, 'HH:mm'),
        durationMinutes: 30,
        tone: 'orange',
        imageUrl: j.coverImageUrl ?? undefined,
        imageCaption: j.title,
        onClick: () => {
          setWeekAnchor(d);
          setView('week');
        },
      });
    }
    return out;
  }, [posts, journalDrafts]);

  const drafts = posts.filter((p) => p.status === 'draft');

  const selectedPosts = selectedDate
    ? posts.filter((p) => {
        const d = postDate(p);
        return d ? format(d, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd') : false;
      })
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

  const viewSwitcher = (
    <PillTabs<CalendarView>
      size="sm"
      value={view}
      onChange={(v) => setView(v)}
      options={[
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'year', label: 'Year' },
      ]}
    />
  );

  const newPostButton = (
    <Link
      href="/social/new"
      className="inline-flex items-center gap-1.5 rounded-full h-7 px-3 text-xs font-medium bg-evari-gold text-evari-goldInk hover:bg-evari-gold/90 transition"
    >
      <Plus className="h-3.5 w-3.5" />
      New post
    </Link>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Calendar — full width. Week/Day views need a fixed height so their
          internal scroll works; Month is content-sized. */}
      <div
        className="flex-none flex flex-col"
        style={{
          height: view === 'week' || view === 'day' ? '760px' : undefined,
          minHeight: view === 'month' ? '680px' : undefined,
        }}
      >
        {view === 'month' && (
          <MonthCalendar
            events={events}
            month={month}
            onMonthChange={setMonth}
            selectedDay={selectedDate}
            onDayClick={(d) => setSelectedDate(d)}
            headerRight={
              <div className="flex items-center gap-2">
                {viewSwitcher}
                {newPostButton}
              </div>
            }
          />
        )}
        {view === 'week' && (
          <WeekCalendar
            events={events}
            week={weekAnchor}
            onWeekChange={setWeekAnchor}
            onEventClick={(e) => {
              const d = e.start ?? e.date;
              setSelectedDate(d);
              setDayAnchor(d);
              setView('day');
            }}
            headerRight={
              <div className="flex items-center gap-2">
                {viewSwitcher}
                {newPostButton}
              </div>
            }
          />
        )}
        {view === 'day' && (
          <WeekCalendar
            singleDay
            events={events}
            day={dayAnchor}
            onDayChange={setDayAnchor}
            onEventClick={(e) => {
              setSelectedDate(e.start ?? e.date);
            }}
            headerRight={
              <div className="flex items-center gap-2">
                {viewSwitcher}
                {newPostButton}
              </div>
            }
          />
        )}
        {view === 'year' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-6">
            <div className="flex flex-col gap-2 items-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-evari-dimmer">
                Year view
              </div>
              <div className="text-2xl text-evari-text font-semibold">
                Coming next
              </div>
              <p className="text-sm text-evari-dim max-w-md">
                Twelve-month density heatmap — at a glance, see which weeks of the year
                are well-supplied with content and which are bare.
              </p>
            </div>
            <div className="flex items-center gap-2">{viewSwitcher}</div>
          </div>
        )}
      </div>

      {/* Panels below the calendar: Selected day · Compose · Drafts */}
      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Selected day */}
        <section className="rounded-xl bg-evari-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
                {selectedDate ? 'Selected day' : 'Day detail'}
              </div>
              <div className="text-sm font-medium text-evari-text mt-0.5">
                {selectedDate
                  ? format(selectedDate, 'EEEE d LLLL')
                  : 'Click a day on the calendar'}
              </div>
            </div>
            {selectedDate && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                Clear
              </Button>
            )}
          </div>
          {selectedPosts.length > 0 ? (
            <div className="space-y-3">
              {selectedPosts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-evari-dimmer">
              {selectedDate
                ? 'No posts scheduled or published on this day.'
                : 'Pick a date to see what\u2019s going out.'}
            </div>
          )}
        </section>

        {/* Compose */}
        <section className="rounded-xl bg-evari-surface p-5 space-y-4">
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
                    'rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 justify-center transition-colors capitalize',
                    active
                      ? 'bg-evari-surfaceSoft text-evari-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                      : 'bg-evari-surfaceSoft text-evari-dim hover:bg-evari-mute',
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
            <div className="rounded-md bg-evari-ink p-3">
              {aiMock && draft && (
                <Badge variant="warning" className="text-[10px] mb-2">
                  fallback (no AI)
                </Badge>
              )}
              {aiLoading ? (
                <div className="text-xs text-evari-dim">Drafting…</div>
              ) : (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[160px] text-xs font-sans bg-evari-ink focus-visible:ring-0"
                />
              )}
              <div className="flex justify-between items-center pt-2 mt-2">
                <div className="text-[10px] text-evari-dimmer">
                  {draft.length} chars
                </div>
                <Button size="sm" disabled={!draft.trim()}>
                  <Plus className="h-3 w-3" />
                  Add to calendar
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Drafts */}
        <section className="rounded-xl bg-evari-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
              Drafts
            </div>
            <div className="text-[11px] text-evari-dim tabular-nums">{drafts.length}</div>
          </div>
          {drafts.length > 0 ? (
            <div className="space-y-3">
              {drafts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-evari-dimmer">
              No drafts right now. Generate one in the composer.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  const Icon = PLATFORM_ICON[post.platform];
  return (
    <div className="rounded-md bg-evari-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] rounded-full px-2 py-0.5 capitalize bg-evari-surfaceSoft text-evari-dim">
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
      <div className="text-xs text-evari-text leading-relaxed line-clamp-3">
        {post.caption}
      </div>
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
