'use client';

import { useMemo, useState, ReactNode } from 'react';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ----------------------------------------------------------------------------
// Public API

export type CalendarEventTone =
  | 'default'
  | 'success'
  | 'warn'
  | 'danger'
  | 'info'
  | 'accent'
  | 'orange';

export interface CalendarEvent {
  id: string;
  date: Date;          // the day this item belongs to (for multi-day, emit per day)
  title: string;
  time?: string;       // e.g. "09:00" — used by month view
  start?: Date;        // used by week/day view for precise positioning
  durationMinutes?: number;
  tone?: CalendarEventTone;
  allDay?: boolean;    // renders as full-width filled bar like a holiday
  /** Optional cover/thumbnail image. When supplied, hovering the
   *  event in any view shows a floating preview of the image. */
  imageUrl?: string;
  /** Optional caption shown under the hover preview. Defaults to the
   *  event's title. */
  imageCaption?: string;
  onClick?: () => void;
}

interface MonthCalendarProps {
  events: CalendarEvent[];
  /** Controlled cursor month. If omitted the component manages its own. */
  month?: Date;
  onMonthChange?: (d: Date) => void;
  /** Day clicked (useful for side-rail composer etc). */
  onDayClick?: (d: Date) => void;
  selectedDay?: Date | null;
  /** Optional extra controls rendered in the top-right. */
  headerRight?: ReactNode;
  /** Max events rendered per day before the "+ more" overflow. */
  maxPerDay?: number;
  className?: string;
}

// ----------------------------------------------------------------------------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Returns tone classes: {bar: left stripe, fill: pill background, text: pill text}
 * Fills are solid (never translucent) per the global colour rule. */
function toneClasses(tone: CalendarEventTone = 'default') {
  switch (tone) {
    case 'success':
      return {
        bar: 'bg-evari-success',
        fill: 'bg-evari-success text-evari-ink',
      };
    case 'warn':
      return {
        bar: 'bg-evari-warn',
        fill: 'bg-evari-warn text-evari-goldInk',
      };
    case 'danger':
      return {
        bar: 'bg-evari-danger',
        fill: 'bg-evari-danger text-white',
      };
    case 'info':
      return {
        bar: 'bg-sky-400',
        fill: 'bg-sky-400 text-evari-ink',
      };
    case 'accent':
      return {
        bar: 'bg-evari-gold',
        fill: 'bg-evari-gold text-evari-goldInk',
      };
    case 'orange':
      return {
        bar: 'bg-orange-500',
        fill: 'bg-orange-500 text-white',
      };
    default:
      return {
        bar: 'bg-evari-dim',
        fill: 'bg-evari-surfaceSoft text-evari-dim',
      };
  }
}

export function MonthCalendar({
  events,
  month: controlledMonth,
  onMonthChange,
  onDayClick,
  selectedDay,
  headerRight,
  maxPerDay = 4,
  className,
}: MonthCalendarProps) {
  const [internalMonth, setInternalMonth] = useState<Date>(
    () => new Date(),
  );
  const month = controlledMonth ?? internalMonth;

  function setMonth(d: Date) {
    if (onMonthChange) onMonthChange(d);
    else setInternalMonth(d);
  }

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = format(e.date, 'yyyy-MM-dd');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    // Put all-day items first, then by time string ascending.
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.time ?? '').localeCompare(b.time ?? '');
      });
    }
    return m;
  }, [events]);

  const today = new Date();

  return (
    <div className={cn('flex flex-col min-h-0 flex-1', className)}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-evari-text">
            {format(month, 'LLLL')}
          </h2>
          <span className="text-2xl font-light text-evari-dim tabular-nums">
            {format(month, 'yyyy')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full text-evari-dim hover:bg-evari-surface hover:text-evari-text transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setMonth(new Date())}
              className="rounded-full h-7 px-3 text-xs"
            >
              Today
            </Button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full text-evari-dim hover:bg-evari-surface hover:text-evari-text transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 px-6 pb-1 text-[11px] uppercase tracking-[0.14em] text-evari-dim font-medium">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid — internal hairlines only, no outer border */}
      <div className="grid grid-cols-7 grid-flow-row auto-rows-fr flex-1">
        {days.map((d, i) => {
          const key = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, today);
          const isSelected = selectedDay ? isSameDay(d, selectedDay) : false;
          const dayEvents = eventsByDay.get(key) ?? [];
          const visible = dayEvents.slice(0, maxPerDay);
          const overflow = dayEvents.length - visible.length;
          const col = i % 7; // 0..6
          const row = Math.floor(i / 7);

          const isWeekend = col === 5 || col === 6;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onDayClick?.(d)}
              style={{
                boxShadow: [
                  row > 0 ? 'inset 0 1px 0 0 rgb(var(--evari-edge) / 0.35)' : null,
                  col > 0 ? 'inset 1px 0 0 0 rgb(var(--evari-edge) / 0.35)' : null,
                ]
                  .filter(Boolean)
                  .join(', '),
              }}
              className={cn(
                'min-h-[108px] text-left p-2 flex flex-col transition-colors',
                isSelected
                  ? 'cal-cell-selected'
                  : isWeekend
                    ? 'cal-cell-weekend'
                    : 'cal-cell',
              )}
            >
              <div className="flex items-center justify-end mb-1 h-6">
                {isToday ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-evari-danger text-[11px] font-semibold tabular-nums text-white">
                    {format(d, 'd')}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums px-1',
                      inMonth ? 'text-evari-text' : 'text-evari-dimmer',
                    )}
                  >
                    {format(d, d.getDate() === 1 ? 'd LLL' : 'd')}
                  </span>
                )}
              </div>

              <ul className="space-y-0.5 flex-1">
                {visible.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
                {overflow > 0 && (
                  <li className="text-[10px] text-evari-dimmer px-1.5">
                    +{overflow} more
                  </li>
                )}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function EventRow({ event }: { event: CalendarEvent }) {
  const t = toneClasses(event.tone);
  const [hover, setHover] = useState(false);

  // All-day events render as filled subtle pills (like a holiday)
  if (event.allDay) {
    return (
      <li
        className={cn(
          'text-[11px] truncate px-1.5 py-0.5 rounded',
          t.fill,
        )}
        onClick={(e) => {
          e.stopPropagation();
          event.onClick?.();
        }}
      >
        {event.title}
      </li>
    );
  }

  // Orange-tone events render as solid filled lozenges (used by the
  // Departure Lounge journal entries — visually distinct from the
  // stripe-style social posts).
  if (event.tone === 'orange') {
    return (
      <li
        className={cn(
          'relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-pointer truncate',
          t.fill,
        )}
        onClick={(e) => {
          e.stopPropagation();
          event.onClick?.();
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="truncate flex-1">{event.title}</span>
        {event.time && (
          <span className="shrink-0 text-[10px] tabular-nums opacity-90">
            {event.time}
          </span>
        )}
        {hover && event.imageUrl ? <HoverImagePreview event={event} /> : null}
      </li>
    );
  }

  // Timed events: leading coloured stripe + title + right-aligned time
  return (
    <li
      className="relative flex items-stretch gap-1.5 rounded group/evt hover:bg-evari-surface/60 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        event.onClick?.();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className={cn('w-[2px] rounded-full shrink-0', t.bar)} />
      <span className="flex-1 flex items-center gap-1 px-0.5 py-0.5 min-w-0">
        <span className="text-[11px] truncate text-evari-text">
          {event.title}
        </span>
        {event.time && (
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-evari-dimmer">
            {event.time}
          </span>
        )}
      </span>
      {hover && event.imageUrl ? <HoverImagePreview event={event} /> : null}
    </li>
  );
}

/**
 * Floating thumbnail preview shown on event hover. Renders to the
 * right of the event pill at a 16:10 crop (matches the journals
 * tile thumbnail). Caption sits underneath. Pointer-events: none so
 * the popover never steals clicks from the underlying day cell.
 */
function HoverImagePreview({ event }: { event: CalendarEvent }) {
  const caption = event.imageCaption ?? event.title;
  return (
    <div
      className="absolute z-50 left-full top-0 ml-2 w-[180px] pointer-events-none rounded-md ring-1 ring-evari-edge bg-evari-surface shadow-[0_6px_18px_rgba(0,0,0,0.4)] overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={event.imageUrl}
        alt={caption}
        className="block w-full"
        style={{ aspectRatio: '16 / 10', objectFit: 'cover' }}
      />
      <div className="px-2 py-1.5 text-[11px] text-evari-text leading-snug truncate">
        {caption}
      </div>
    </div>
  );
}
