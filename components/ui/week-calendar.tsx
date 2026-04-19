'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  startOfWeek,
  addDays,
  addWeeks,
  format,
  isSameDay,
  getHours,
  getMinutes,
  isSameMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { CalendarEvent, CalendarEventTone } from './month-calendar';

// ----------------------------------------------------------------------------

interface WeekCalendarProps {
  events: CalendarEvent[];
  week?: Date;
  onWeekChange?: (d: Date) => void;
  /** When true, renders a single-day column (reuses same layout). */
  singleDay?: boolean;
  day?: Date;
  onDayChange?: (d: Date) => void;
  onSlotClick?: (d: Date, hour: number) => void;
  onEventClick?: (event: CalendarEvent) => void;
  headerRight?: React.ReactNode;
  className?: string;
}

// Visible scroll range — earlier hours accessible via scroll up.
const FIRST_HOUR = 0;
const LAST_HOUR = 24;
const HOUR_HEIGHT = 52; // px

function toneColors(tone: CalendarEventTone = 'default') {
  switch (tone) {
    case 'success':
      return {
        bar: 'rgb(var(--evari-success))',
        fill: 'rgb(var(--evari-success) / 0.18)',
        text: 'rgb(var(--evari-text))',
      };
    case 'warn':
      return {
        bar: 'rgb(var(--evari-warn))',
        fill: 'rgb(var(--evari-warn) / 0.15)',
        text: 'rgb(var(--evari-text))',
      };
    case 'danger':
      return {
        bar: 'rgb(var(--evari-danger))',
        fill: 'rgb(var(--evari-danger) / 0.15)',
        text: 'rgb(var(--evari-text))',
      };
    case 'info':
      return {
        bar: 'rgb(96 165 250)',
        fill: 'rgb(96 165 250 / 0.15)',
        text: 'rgb(var(--evari-text))',
      };
    case 'accent':
      return {
        bar: 'rgb(var(--evari-gold))',
        fill: 'rgb(var(--evari-gold) / 0.15)',
        text: 'rgb(var(--evari-text))',
      };
    default:
      return {
        bar: 'rgb(var(--evari-dim))',
        fill: 'rgb(var(--evari-surface-soft) / 0.85)',
        text: 'rgb(var(--evari-text))',
      };
  }
}

export function WeekCalendar({
  events,
  week: controlledWeek,
  onWeekChange,
  singleDay = false,
  day: controlledDay,
  onDayChange,
  onEventClick,
  headerRight,
  className,
}: WeekCalendarProps) {
  const [internalWeek, setInternalWeek] = useState<Date>(() => new Date());
  const [internalDay, setInternalDay] = useState<Date>(() => new Date());

  const anchor = singleDay
    ? (controlledDay ?? internalDay)
    : (controlledWeek ?? internalWeek);

  function setAnchor(d: Date) {
    if (singleDay) {
      if (onDayChange) onDayChange(d);
      else setInternalDay(d);
    } else {
      if (onWeekChange) onWeekChange(d);
      else setInternalWeek(d);
    }
  }

  const days = useMemo(() => {
    if (singleDay) return [anchor];
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, singleDay]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = format(e.start ?? e.date, 'yyyy-MM-dd');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [events]);

  const today = new Date();
  const nowMin = getHours(today) * 60 + getMinutes(today);

  // Title: "April 2026" — if week spans two months, show "March – April 2026"
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const sameMonth = isSameMonth(firstDay, lastDay);
  const title = sameMonth
    ? format(firstDay, 'LLLL')
    : `${format(firstDay, 'LLL')} – ${format(lastDay, 'LLL')}`;
  const year = format(firstDay, 'yyyy');

  // Auto-scroll to roughly an hour before current time when viewing this week.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      const targetHour = Math.max(FIRST_HOUR, getHours(today) - 1);
      scrollRef.current.scrollTop = (targetHour - FIRST_HOUR) * HOUR_HEIGHT;
    }
    // We only want this on mount per anchor change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.getTime()]);

  const colCount = singleDay ? 1 : 7;
  const gridTemplate = `64px repeat(${colCount}, minmax(0, 1fr))`;

  return (
    <div className={cn('flex flex-col min-h-0 flex-1', className)}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-evari-text">
            {title}
          </h2>
          <span className="text-2xl font-light text-evari-dim tabular-nums">
            {year}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setAnchor(singleDay ? addDays(anchor, -1) : addWeeks(anchor, -1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full text-evari-dim hover:bg-evari-surface hover:text-evari-text transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setAnchor(new Date())}
              className="rounded-full h-7 px-3 text-xs"
            >
              Today
            </Button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setAnchor(singleDay ? addDays(anchor, 1) : addWeeks(anchor, 1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full text-evari-dim hover:bg-evari-surface hover:text-evari-text transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Day header row */}
      <div
        className="grid px-0"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="px-2 py-2 flex items-center justify-center gap-2 text-sm"
            >
              <span className="text-evari-dim text-[12px] uppercase tracking-wider">
                {format(d, 'EEE')}
              </span>
              {isToday ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-evari-danger text-[11px] font-semibold text-white tabular-nums">
                  {format(d, 'd')}
                </span>
              ) : (
                <span className="tabular-nums text-evari-text font-medium">
                  {format(d, 'd')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="grid"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="px-2 py-2 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer text-right">
          all-day
        </div>
        {days.map((d, col) => {
          const isWeekend = !singleDay && col >= 5;
          const key = format(d, 'yyyy-MM-dd');
          const allDayEvts = (eventsByDay.get(key) ?? []).filter(
            (e) => e.allDay,
          );
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'min-h-[32px] p-1 flex flex-col gap-0.5',
                isWeekend ? 'cal-cell-weekend' : 'cal-cell',
              )}
              style={{
                boxShadow:
                  col > 0 || singleDay
                    ? 'inset 1px 0 0 0 rgb(var(--evari-edge) / 0.35)'
                    : undefined,
              }}
            >
              {allDayEvts.map((e) => {
                const c = toneColors(e.tone);
                return (
                  <span
                    key={e.id}
                    onClick={() => onEventClick?.(e)}
                    className="text-[11px] truncate px-1.5 py-0.5 rounded cursor-pointer"
                    style={{ background: c.fill, color: c.text }}
                  >
                    {e.title}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: gridTemplate,
            minHeight: (LAST_HOUR - FIRST_HOUR) * HOUR_HEIGHT,
          }}
        >
          {/* Time gutter */}
          <div className="flex flex-col">
            {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => {
              const h = FIRST_HOUR + i;
              // Skip rendering 00:00 label at top to avoid clipping
              return (
                <div
                  key={h}
                  style={{ height: HOUR_HEIGHT }}
                  className="relative"
                >
                  {h > FIRST_HOUR && (
                    <span className="absolute -top-1.5 right-2 text-[10px] text-evari-dimmer tabular-nums">
                      {String(h).padStart(2, '0')}:00
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map((d, col) => {
            const isToday = isSameDay(d, today);
            const isWeekend = !singleDay && col >= 5;
            const key = format(d, 'yyyy-MM-dd');
            const timed = (eventsByDay.get(key) ?? []).filter(
              (e) => !e.allDay,
            );

            return (
              <div
                key={d.toISOString()}
                className={cn(
                  'relative',
                  isWeekend ? 'cal-cell-weekend' : 'cal-cell',
                )}
                style={{
                  height: (LAST_HOUR - FIRST_HOUR) * HOUR_HEIGHT,
                  boxShadow: 'inset 1px 0 0 0 rgb(var(--evari-edge) / 0.35)',
                }}
              >
                {/* Hour separator lines */}
                {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: i * HOUR_HEIGHT,
                      height: 1,
                      background: 'rgb(var(--evari-edge) / 0.3)',
                    }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday &&
                  nowMin >= FIRST_HOUR * 60 &&
                  nowMin <= LAST_HOUR * 60 && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{
                        top:
                          ((nowMin - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT,
                      }}
                    >
                      <div className="relative h-[2px] bg-evari-danger">
                        <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-evari-danger" />
                      </div>
                    </div>
                  )}

                {/* Events */}
                {timed.map((e) => {
                  const eventDate = e.start ?? e.date;
                  const startMin =
                    (getHours(eventDate) - FIRST_HOUR) * 60 +
                    getMinutes(eventDate);
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const dur = e.durationMinutes ?? 60;
                  const height = Math.max((dur / 60) * HOUR_HEIGHT, 28);
                  const c = toneColors(e.tone);
                  const endMin = startMin + dur;
                  const endDate = new Date(eventDate.getTime() + dur * 60_000);
                  return (
                    <button
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick?.(e);
                        e.onClick?.();
                      }}
                      className="absolute text-left overflow-hidden rounded-md z-10 hover:brightness-110 transition"
                      style={{
                        top,
                        height,
                        left: 4,
                        right: 4,
                        background: c.fill,
                        borderLeft: `3px solid ${c.bar}`,
                        color: c.text,
                        padding: '4px 6px',
                      }}
                      title={e.title}
                    >
                      <div className="text-[11px] font-medium leading-tight truncate">
                        {e.title}
                      </div>
                      <div className="text-[10px] tabular-nums text-evari-dim leading-tight mt-0.5">
                        {format(eventDate, 'HH:mm')}
                        {dur >= 45 && (
                          <>
                            {' – '}
                            {format(endDate, 'HH:mm')}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
