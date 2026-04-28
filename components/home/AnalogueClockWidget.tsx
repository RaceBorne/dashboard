'use client';

/**
 * Analogue clock for the home canvas — built strictly from the
 * supplied asset pack:
 *
 *   public/clock/background.png   — the full dial face (gradient + ticks
 *                                   + numerals + RACEBORNE text + "3"
 *                                   stamp baked into a single image)
 *   public/clock/hour-hand.png    — black hour hand
 *   public/clock/min-hand.png     — red minute hand
 *
 * No SVG dial generation, no programmatic numerals or tick marks. The
 * second hand is the only programmatic element (a thin red line) since
 * the asset pack doesn't include one and the spec calls for a Rolex-
 * style sweep.
 *
 * Hands rotate via requestAnimationFrame with millisecond precision so
 * the second hand glides instead of ticking.
 */

import { useEffect, useRef, useState } from 'react';

export function AnalogueClockWidget() {
  const [time, setTime] = useState<{ h: number; m: number; s: number; ms: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      setTime({
        h: now.getHours(),
        m: now.getMinutes(),
        s: now.getSeconds(),
        ms: now.getMilliseconds(),
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const seconds = (time?.s ?? 0) + (time?.ms ?? 0) / 1000;
  const minutes = (time?.m ?? 0) + seconds / 60;
  const hours   = ((time?.h ?? 0) % 12) + minutes / 60;

  const hourAngle   = hours * 30;
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-panel">
      {/* Dial face — single PNG asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/clock/background.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
      />

      {/* Hour hand. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/clock/hour-hand.png"
        alt=""
        draggable={false}
        className="absolute pointer-events-none select-none"
        style={{
          top: '50%', left: '50%',
          width: '100%', height: '100%',
          transform: `translate(-50%, -50%) rotate(${hourAngle}deg)`,
          transformOrigin: 'center center',
        }}
      />

      {/* Minute hand. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/clock/min-hand.png"
        alt=""
        draggable={false}
        className="absolute pointer-events-none select-none"
        style={{
          top: '50%', left: '50%',
          width: '100%', height: '100%',
          transform: `translate(-50%, -50%) rotate(${minuteAngle}deg)`,
          transformOrigin: 'center center',
        }}
      />

      {/* Second hand — programmatic thin red line, continuous sweep. */}
      <svg
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full pointer-events-none"
      >
        <g style={{ transform: `rotate(${secondAngle}deg)`, transformOrigin: '300px 300px' }}>
          <line x1="300" y1="320" x2="300" y2="120" stroke="#B91C1C" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
