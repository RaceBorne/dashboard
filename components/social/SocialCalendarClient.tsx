'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ShopifyPreview, type JournalBlock } from '@/components/journals/ShopifyPreview';
import { useRouter } from 'next/navigation';
import { Send, ChevronLeft, ChevronRight, Loader2, ExternalLink, ChevronDown, Facebook } from 'lucide-react';

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
  summary: string;
  author: string;
  scheduledFor: string;
  blogTarget: string;
  coverImageUrl: string | null;
  blocks: Array<{ id?: string; type: string; data: Record<string, unknown> }>;
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
  // Currently-selected event in the right rail. The full event object
  // is stored so the rail can display platform-specific metadata
  // without re-deriving from id.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Send-now busy flag — disables the action button while an in-flight
  // publish request is pending.
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const router = useRouter();
  // Resizable right rail — default 380px, dragged via the left edge.
  // Clamped between 280 and 720 so it never disappears or eats the
  // calendar entirely.
  const [railWidth, setRailWidth] = useState(380);
  const railRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  function onResizeMouseDown(ev: React.MouseEvent) {
    ev.preventDefault();
    dragRef.current = { startX: ev.clientX, startW: railWidth };
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - e.clientX;
      const next = Math.min(720, Math.max(280, dragRef.current.startW + dx));
      setRailWidth(next);
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    }
    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  // Bottom drawer is height-based. 36 = collapsed (just the toggle
  // bar). Default 'open' height = 25% of viewport. User can drag the
  // top edge to resize between 36 (closed) and ~85vh.
  const drawerClosedH = 36;
  const drawerDefaultH = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.25) : 240;
  const [drawerHeight, setDrawerHeight] = useState(drawerClosedH);
  const drawerOpen = drawerHeight > drawerClosedH;
  // Which broadcast platforms are currently visible as columns inside
  // the drawer. Default: all six. User can tick / un-tick via the
  // 'Choose broadcast applications' picker at the top of the drawer.
  const [enabledPlatforms, setEnabledPlatforms] = useState<Set<string>>(
    () => new Set(['instagram', 'facebook', 'tiktok', 'linkedin', 'klaviyo', 'blogs']),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // Drag-to-resize handler for the drawer's top edge.
  const drawerDragRef = useRef<{ startY: number; startH: number } | null>(null);
  function onDrawerResizeStart(ev: React.MouseEvent) {
    ev.preventDefault();
    drawerDragRef.current = { startY: ev.clientY, startH: drawerHeight };
    function onMove(e: MouseEvent) {
      if (!drawerDragRef.current) return;
      const dy = drawerDragRef.current.startY - e.clientY;
      const next = Math.min(
        Math.round(window.innerHeight * 0.85),
        Math.max(drawerClosedH, drawerDragRef.current.startH + dy),
      );
      setDrawerHeight(next);
    }
    function onUp() {
      drawerDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    }
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

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
        onClick: () => {
          setSelectedDate(d);
          setSelectedEventId(p.id);
        },
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
          setSelectedDate(d);
          setSelectedEventId(`journal:${j.id}`);
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

  // Resolve the currently-selected event back to its source data
  // (SocialPost or JournalCalendarEntry). We key by event.id; journal
  // events use the 'journal:<id>' prefix.
  const selectedJournal: JournalCalendarEntry | null = useMemo(() => {
    if (!selectedEventId?.startsWith('journal:')) return null;
    const id = selectedEventId.slice('journal:'.length);
    return journalDrafts.find((j) => j.id === id) ?? null;
  }, [selectedEventId, journalDrafts]);
  const selectedSocial: SocialPost | null = useMemo(() => {
    if (!selectedEventId || selectedEventId.startsWith('journal:')) return null;
    return posts.find((p) => p.id === selectedEventId) ?? null;
  }, [selectedEventId, posts]);

  // Day pagination — events sharing the same calendar date as the
  // currently-selected event. Powers the '1 of N' navigation in the
  // preview window header.
  const selectedEventDate: Date | null = selectedJournal
    ? new Date(selectedJournal.scheduledFor)
    : selectedSocial
      ? (selectedSocial.scheduledFor || selectedSocial.publishedAt
          ? new Date(selectedSocial.scheduledFor || selectedSocial.publishedAt!)
          : null)
      : null;
  const dayKey = selectedEventDate ? format(selectedEventDate, 'yyyy-MM-dd') : null;
  const dayEvents = useMemo(() => {
    if (!dayKey) return [] as CalendarEvent[];
    return events.filter((e) => format(e.start ?? e.date, 'yyyy-MM-dd') === dayKey);
  }, [events, dayKey]);
  const dayIndex = dayEvents.findIndex((e) => e.id === selectedEventId);

  function navigateDay(dir: 'prev' | 'next') {
    if (dayEvents.length === 0) return;
    const next =
      dir === 'next'
        ? (dayIndex + 1) % dayEvents.length
        : (dayIndex - 1 + dayEvents.length) % dayEvents.length;
    setSelectedEventId(dayEvents[next].id);
  }

  async function sendNow() {
    if (sending) return;
    setSendError(null);
    setSending(true);
    try {
      if (selectedJournal) {
        const res = await fetch(`/api/journals/${selectedJournal.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.error ?? 'Publish failed');
        router.refresh();
      } else if (selectedSocial) {
        // Social send-now endpoint left as a placeholder for now —
        // wire to the real publish route when it's available.
        throw new Error('Send-now for social posts not implemented yet');
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden bg-evari-ink p-3">
      {/* Calendar column is hard-pinned to (100% − rail − gaps). All
          panels are detached floating rounded rectangles so content
          height in any one panel can never push or shrink another. */}
      <div
        className="absolute top-3 left-3 bottom-3 flex flex-col overflow-hidden gap-3 transition-[width] duration-200"
        style={{
          width: selectedEventId
            ? 'calc(100% - 380px - 1.5rem)'
            : 'calc(100% - 1.5rem)',
        }}
      >
      {/* Calendar — fills the available height of the LEFT column.
          The calendar component handles its own internal scrolling
          (week/day views) so the column itself doesn't scroll —
          everything outside the post-preview pane stays fixed. */}
      <div
        className="flex-1 min-h-0 flex flex-col rounded-2xl bg-evari-surface overflow-hidden"
        style={{
          minHeight: view === 'month' ? 720 : 760,
        }}
      >
        {view === 'month' && (
          <MonthCalendar
            events={events}
            month={month}
            onMonthChange={setMonth}
            selectedDay={selectedDate}
            onDayClick={(d) => {
              setSelectedDate(d);
              setSelectedEventId(null);
            }}
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

            <PlatformDrawer
        height={drawerHeight}
        open={drawerOpen}
        onToggle={() =>
          setDrawerHeight((h) => (h > drawerClosedH ? drawerClosedH : drawerDefaultH))
        }
        onResizeStart={onDrawerResizeStart}
        events={events}
        enabledPlatforms={enabledPlatforms}
        onTogglePlatform={(key) => {
          setEnabledPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
        }}
        pickerOpen={pickerOpen}
        onTogglePicker={() => setPickerOpen((v) => !v)}
      />
      </div>
      {/* RIGHT RAIL — preview + actions. Resizable via the left-edge
          drag handle (clamped 280-720px, default 380). Stacks two
          panels: the action card (top, content-sized) and the post
          preview (bottom, fills remaining height + scrolls). */}
      {selectedEventId ? (
      <aside
        ref={railRef}
        className="hidden lg:flex flex-col absolute top-3 right-3 bottom-3 z-10 overflow-hidden gap-3"
        style={{ width: railWidth - 24 }}
      >
        {/* Drag handle — hover changes cursor to ew-resize. The handle
            itself is a 6px-wide invisible strip on the left edge with
            a 1px visible accent on hover so it discoverable. */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-ew-resize z-30 hover:bg-evari-gold/40 transition-colors"
        />
        <ScheduleActionsPanel
          selectedJournal={selectedJournal}
          selectedSocial={selectedSocial}
          onSendNow={sendNow}
          sending={sending}
          sendError={sendError}
          onEdit={() => {
            if (selectedJournal) router.push(`/journals/${selectedJournal.id}`);
          }}
        />
        <PostPreviewWindow
          selectedJournal={selectedJournal}
          selectedSocial={selectedSocial}
          dayCount={dayEvents.length}
          dayIndex={dayIndex >= 0 ? dayIndex : 0}
          onNavigate={navigateDay}
        />
      </aside>
      ) : null}
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

// ─── Right rail panels ──────────────────────────────────────────────

interface SchedulePanelProps {
  selectedJournal: JournalCalendarEntry | null;
  selectedSocial: SocialPost | null;
  onSendNow: () => void;
  onEdit: () => void;
  sending: boolean;
  sendError: string | null;
}

/**
 * Top-right panel — surfaces metadata + actions for the selected
 * event. Empty state nudges the user to click an event on the
 * calendar. Send Now is wired for journals (POST publish endpoint);
 * social send-now is a placeholder for now.
 */
function ScheduleActionsPanel({
  selectedJournal,
  selectedSocial,
  onSendNow,
  onEdit,
  sending,
  sendError,
}: SchedulePanelProps) {
  if (!selectedJournal && !selectedSocial) {
    return (
      <div className="flex-none p-4 rounded-2xl bg-evari-surface">
        <div className="text-xs text-evari-text font-medium mb-2">
          Schedule
        </div>
        <p className="text-[11px] text-evari-dim leading-relaxed">
          Click an event on the calendar to see scheduled time, status,
          and quick actions.
        </p>
        {/* Placeholder area so the empty state has the same visual
            footprint as the populated state — keeps the rail width
            visually consistent regardless of selection. */}
        <div className="mt-3 h-9 rounded-md bg-evari-ink/30 ring-1 ring-evari-edge/30" />
        <div className="mt-1.5 h-7 rounded-md bg-evari-ink/20 ring-1 ring-evari-edge/20" />
      </div>
    );
  }
  const kindLabel = selectedJournal ? 'Journal' : selectedSocial!.platform;
  const title = selectedJournal
    ? selectedJournal.title
    : captionSnippet(selectedSocial!.caption, 64);
  const author = selectedJournal ? selectedJournal.author : 'Evari';
  const dateIso = selectedJournal
    ? selectedJournal.scheduledFor
    : selectedSocial!.scheduledFor || selectedSocial!.publishedAt || '';
  const date = dateIso ? new Date(dateIso) : null;
  const status = selectedJournal
    ? 'Scheduled'
    : selectedSocial!.status;
  return (
    <section className="p-4 rounded-2xl bg-evari-surface flex-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-semibold">
          {kindLabel}
        </span>
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium',
            status === 'published'
              ? 'bg-evari-success/20 text-evari-success'
              : status === 'failed'
                ? 'bg-evari-danger/20 text-evari-danger'
                : 'bg-orange-500/20 text-orange-400',
          )}
        >
          {status}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-evari-text leading-snug line-clamp-2">
        {title}
      </h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
        <dt className="text-evari-dimmer">Scheduled by</dt>
        <dd className="text-evari-text">{author}</dd>
        {date ? (
          <>
            <dt className="text-evari-dimmer">Date</dt>
            <dd className="text-evari-text">{format(date, 'EEE d LLL')}</dd>
            <dt className="text-evari-dimmer">Time</dt>
            <dd className="text-evari-text font-mono tabular-nums">
              {format(date, 'HH:mm')}
            </dd>
          </>
        ) : null}
      </dl>
      <button
        type="button"
        onClick={onSendNow}
        disabled={sending}
        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-md bg-evari-gold text-evari-goldInk text-sm font-semibold disabled:opacity-60 hover:brightness-105 transition"
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        {sending ? 'Publishing…' : 'Send now'}
      </button>
      {sendError ? (
        <p className="mt-2 text-[11px] text-evari-danger leading-snug">
          {sendError}
        </p>
      ) : null}
      {selectedJournal ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-evari-surface text-evari-dim hover:text-evari-text text-xs font-medium ring-1 ring-evari-edge transition"
        >
          <ExternalLink className="h-3 w-3" />
          Open in editor
        </button>
      ) : null}
    </section>
  );
}

interface PreviewWindowProps {
  selectedJournal: JournalCalendarEntry | null;
  selectedSocial: SocialPost | null;
  dayCount: number;
  dayIndex: number;
  onNavigate: (dir: 'prev' | 'next') => void;
}

/**
 * Bottom-right panel — context-dependent preview of the selected
 * event in its finished state. Header shows day pagination
 * ('1 of N · 15 APR'). Body switches renderer by event kind.
 */
function PostPreviewWindow({
  selectedJournal,
  selectedSocial,
  dayCount,
  dayIndex,
  onNavigate,
}: PreviewWindowProps) {
  if (!selectedJournal && !selectedSocial) {
    return (
      <section className="flex-1 flex flex-col p-4 gap-3 rounded-2xl bg-evari-surface">
        <div className="h-32 rounded-md bg-evari-ink/30 ring-1 ring-evari-edge/30" />
        <div className="h-4 rounded bg-evari-ink/20 ring-1 ring-evari-edge/20 w-3/4" />
        <div className="h-3 rounded bg-evari-ink/20 ring-1 ring-evari-edge/20 w-full" />
        <div className="h-3 rounded bg-evari-ink/20 ring-1 ring-evari-edge/20 w-5/6" />
        <p className="mt-auto text-[11px] text-evari-dimmer leading-relaxed text-center">
          Pick an event from the calendar to preview the post in its
          finished state.
        </p>
      </section>
    );
  }
  const dateIso = selectedJournal
    ? selectedJournal.scheduledFor
    : selectedSocial!.scheduledFor || selectedSocial!.publishedAt || '';
  const date = dateIso ? new Date(dateIso) : null;
  return (
    <section className="flex-1 flex flex-col min-h-0 rounded-2xl bg-evari-surface overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b border-evari-edge/30 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
        <button
          type="button"
          onClick={() => onNavigate('prev')}
          disabled={dayCount <= 1}
          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-evari-surface disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="font-semibold tabular-nums">
          {dayCount > 0 ? `${dayIndex + 1} of ${dayCount}` : '—'}
          {date ? ` · ${format(date, 'd LLL').toUpperCase()}` : ''}
        </span>
        <button
          type="button"
          onClick={() => onNavigate('next')}
          disabled={dayCount <= 1}
          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-evari-surface disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </header>
      <ScaledPreview>
        {selectedJournal ? (
          <JournalPreviewCard journal={selectedJournal} />
        ) : selectedSocial ? (
          <SocialPreviewCard post={selectedSocial} />
        ) : null}
      </ScaledPreview>
    </section>
  );
}

function JournalPreviewCard({ journal }: { journal: JournalCalendarEntry }) {
  // Render the FULL article through ShopifyPreview so the right rail
  // shows the exact final layout users will see on evari.cc — hero
  // overlay, body blocks, captions, the lot. Scrollable inside the
  // rail's preview window. The format is identical to the editor
  // preview; this is a final 'what will it look like when published'
  // check.
  const blocks: JournalBlock[] = journal.blocks.map((b, i) => ({
    id: b.id ?? `b${i}`,
    type: b.type,
    data: b.data,
  }));
  return (
    <ShopifyPreview
      title={journal.title}
      author={journal.author}
      publishedAt={journal.scheduledFor}
      coverImageUrl={journal.coverImageUrl}
      blocks={blocks}
      subLabel={journal.blogTarget === 'cs_plus' ? 'CS+ | Bike Builds' : 'Blogs'}
      summary={journal.summary}
    />
  );
}

function SocialPreviewCard({ post }: { post: SocialPost }) {
  const Icon = PLATFORM_ICON[post.platform];
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-zinc-700" />
        <span className="text-xs font-semibold capitalize text-zinc-700">
          {post.platform}
        </span>
      </div>
      {post.mediaUrls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrls[0]}
          alt=""
          className="w-full rounded-md mb-3"
          style={{ aspectRatio: '1 / 1', objectFit: 'cover' }}
        />
      ) : null}
      <p className="text-xs leading-relaxed whitespace-pre-line text-zinc-900">
        {post.caption}
      </p>
      {post.hashtags.length > 0 ? (
        <p className="mt-2 text-[11px] text-blue-700 leading-relaxed">
          {post.hashtags.map((h) => `#${h}`).join(' ')}
        </p>
      ) : null}
    </div>
  );
}

// ─── Bottom platform-queue drawer ──────────────────────────────────

interface PlatformDrawerProps {
  open: boolean;
  height: number;
  onToggle: () => void;
  onResizeStart: (ev: React.MouseEvent) => void;
  events: CalendarEvent[];
  enabledPlatforms: Set<string>;
  onTogglePlatform: (key: string) => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}

type LucideIcon = typeof Instagram;
const DRAWER_COLS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  matches: (e: CalendarEvent) => boolean;
}> = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: Instagram,
    matches: (e) => /^IG /i.test(e.title) || e.title.startsWith('IG '),
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: Facebook,
    matches: (e) => /^FB /i.test(e.title),
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: Music2,
    matches: (e) => /^TT /i.test(e.title),
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    matches: (e) => /^LI /i.test(e.title),
  },
  {
    key: 'klaviyo',
    label: 'Klaviyo',
    icon: Mail,
    matches: (e) => /^Email /i.test(e.title) || e.title.startsWith('Email '),
  },
  {
    key: 'blogs',
    label: 'Blogs',
    icon: Newspaper,
    matches: (e) => e.id.startsWith('journal:'),
  },
];

/**
 * Pull-up drawer below the calendar — six columns, one per channel,
 * each listing the queued items in chronological order. Lets the
 * user scan everything stacked up on a single platform without
 * navigating around the calendar grid.
 *
 * Collapsed by default so the calendar gets full vertical room;
 * a small chevron handle at the top toggles the drawer open
 * to ~360px tall.
 */
function PlatformDrawer({
  open,
  height,
  onToggle,
  onResizeStart,
  events,
  enabledPlatforms,
  onTogglePlatform,
  pickerOpen,
  onTogglePicker,
}: PlatformDrawerProps) {
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          (a.start ?? a.date).getTime() - (b.start ?? b.date).getTime(),
      ),
    [events],
  );
  const byColumn = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const col of DRAWER_COLS) m.set(col.key, []);
    for (const e of sorted) {
      for (const col of DRAWER_COLS) {
        if (col.matches(e)) {
          m.get(col.key)!.push(e);
          break;
        }
      }
    }
    return m;
  }, [sorted]);
  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-20 flex flex-col overflow-hidden"
      style={{ height }}
    >
      {/* Drag handle for vertical resize — only visible when open. */}
      {open ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={onResizeStart}
          className="h-1.5 -mb-1.5 cursor-row-resize z-30 hover:bg-evari-gold/40 transition-colors shrink-0"
        />
      ) : null}
      {/* Pull handle — drag-affordance bar + label + chevron */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="h-9 px-4 flex items-center justify-between text-xs text-evari-dim hover:text-evari-text transition-colors shrink-0 rounded-2xl bg-evari-surface"
      >
        <span className="font-semibold">Queue · all platforms</span>
        <span className="flex items-center gap-2">
          <span className="text-evari-dimmer normal-case tracking-normal">
            {open ? 'Collapse' : `${sorted.length} item${sorted.length === 1 ? '' : 's'}`}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              open ? '' : 'rotate-180',
            )}
          />
        </span>
      </button>
      {open ? (
        <div className="flex-1 flex flex-col mt-3 min-h-0">
          {/* Platform picker — sits inline at the top of the drawer
              (not a floating popup). Click 'Choose broadcast
              applications' to reveal the checkbox list; tick the
              platforms you want as columns. */}
          <div className="shrink-0 px-1 mb-3">
            <button
              type="button"
              onClick={onTogglePicker}
              className="w-full inline-flex items-center justify-between px-4 py-2 rounded-2xl bg-evari-surface text-evari-text text-sm hover:bg-evari-surfaceSoft transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    pickerOpen ? 'rotate-180' : '',
                  )}
                />
                Choose broadcast applications
              </span>
              <span className="text-evari-dimmer text-xs tabular-nums">
                {enabledPlatforms.size} of {DRAWER_COLS.length} active
              </span>
            </button>
            {pickerOpen ? (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {DRAWER_COLS.map((col) => {
                  const active = enabledPlatforms.has(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => onTogglePlatform(col.key)}
                      className={cn(
                        'inline-flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors',
                        active
                          ? 'bg-evari-surface text-evari-text ring-1 ring-evari-gold/40'
                          : 'bg-evari-surface/40 text-evari-dim hover:bg-evari-surface',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <col.icon className="h-4 w-4" />
                        {col.label}
                      </span>
                      <span
                        className={cn(
                          'h-3.5 w-3.5 rounded-sm border',
                          active
                            ? 'bg-evari-gold border-evari-gold'
                            : 'border-evari-edge',
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Visible columns = the platforms the user has ticked. */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full gap-3 min-w-fit">
            {DRAWER_COLS.filter((c) => enabledPlatforms.has(c.key)).map((col) => {
              const items = byColumn.get(col.key) ?? [];
              return (
                <div key={col.key} className="flex-1 min-w-[180px] flex flex-col min-h-0 rounded-2xl bg-evari-surface overflow-hidden">
                  <header className="px-3 py-2 text-xs text-evari-text font-medium border-b border-evari-edge/30 shrink-0 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      {col.icon ? (
                        <col.icon
                          className="h-3.5 w-3.5 text-evari-dim"
                          aria-hidden="true"
                        />
                      ) : null}
                      {col.label}
                    </span>
                    <span className="tabular-nums text-evari-dimmer text-[10px]">{items.length}</span>
                  </header>
                  <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
                    {items.length === 0 ? (
                      <li className="text-[11px] text-evari-dimmer italic px-1 py-2">
                        Nothing queued.
                      </li>
                    ) : (
                      items.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-md bg-white text-zinc-900 p-2 cursor-pointer transition-colors hover:bg-zinc-50 ring-1 ring-evari-edge/30"
                          onClick={() => e.onClick?.()}
                        >
                          <div className="text-[11px] leading-tight line-clamp-2">
                            {e.title.replace(/^[A-Z]+ · /, '')}
                          </div>
                          <div className="mt-1 text-[10px] text-zinc-500 font-mono tabular-nums">
                            {format(e.start ?? e.date, 'EEE d LLL · HH:mm')}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Scaled preview — pixel-locked layout that scales to fit ──────

/**
 * Renders its children at a fixed natural width (TARGET_WIDTH below)
 * and applies a CSS transform so the visual size fills the available
 * container width WITHOUT reflowing the layout. This is the 'PDF
 * locked' behaviour the user asked for: the post NEVER changes its
 * format (column widths, image crops, font sizes, line breaks) when
 * the right rail is resized — only the zoom factor changes.
 *
 * Implementation:
 *   - Inner div is sized to TARGET_WIDTH (e.g., 1100px) so the
 *     ShopifyPreview component inside renders exactly as it would on
 *     a desktop article page.
 *   - transform: scale(s) where s = containerWidth / TARGET_WIDTH
 *     visually shrinks/grows the inner without affecting its layout.
 *   - A ResizeObserver tracks the inner's natural height; the
 *     wrapper is sized to (naturalHeight * scale) so the parent's
 *     overflow-y scroll lines up correctly (otherwise the scrollable
 *     area would be the un-scaled height, which is way too tall).
 */
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const TARGET_WIDTH = 1100;
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(TARGET_WIDTH);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);

  useEffect(() => {
    if (!outerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!innerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      if (h > 0) setNaturalHeight(h);
    });
    ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = containerWidth > 0 ? containerWidth / TARGET_WIDTH : 1;

  return (
    <div
      ref={outerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden bg-white text-zinc-900 min-h-0"
    >
      <div
        style={{
          // The visible footprint = natural height × scale, so the
          // outer scroll container reserves the right amount of room.
          width: TARGET_WIDTH * scale,
          height: naturalHeight * scale,
          position: 'relative',
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: TARGET_WIDTH,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
