'use client';

/**
 * Analogue clock — uses the supplied PNG asset pack only:
 *
 *   /clock/dial.png       — full dial face (gradient + ticks +
 *                           numerals + RACEBORNE text + 3 stamp,
 *                           all baked into the image).
 *   /clock/hour-hand.png  — hour hand.
 *   /clock/min-hand.png   — minute hand.
 *
 * The only programmatic element is a thin second hand drawn in SVG,
 * since the asset pack does not include one.
 *
 * Each hand carries a soft drop-shadow filter — light source upper-
 * left, deliberately understated.
 *
 * Continuous Rolex-style sweep on the second hand via
 * requestAnimationFrame with millisecond-precise rotation.
 */

import { useEffect, useRef, useState } from 'react';

const SECOND_SHADOW = [
  'drop-shadow(0 1px 0.75px rgba(0,0,0,0.55))',   // sharp contact shadow at the source
  'drop-shadow(0 3px 4px rgba(0,0,0,0.32))',      // mid falloff
  'drop-shadow(0 7px 12px rgba(0,0,0,0.18))',     // soft outer falloff
].join(' ');

export function AnalogueClockWidget() {
  const [time, setTime] = useState<{ h: number; m: number; s: number; ms: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      setTime({ h: now.getHours(), m: now.getMinutes(), s: now.getSeconds(), ms: now.getMilliseconds() });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const seconds = (time?.s ?? 0) + (time?.ms ?? 0) / 1000;
  const secondAngle = seconds * 6;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-panel">
      {/* Inner stage — scales the clock down so the dial sits with breathing room. */}
      <div className="absolute" style={{ inset: '12%' }}>
      {/* Dial face — single PNG asset, no SVG markings. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/clock/dial.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
      />

      {/* Second hand — bigger, continuous sweep, soft drop shadow. */}
      <svg
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full pointer-events-none"
        style={{ filter: SECOND_SHADOW }}
      >
        <g style={{ transform: `rotate(${secondAngle}deg)`, transformOrigin: '300px 300px' }}>
          {/* Tail below the pivot for visual balance, longer hand above. */}
          <line x1="300" y1="360" x2="300" y2="60" stroke="#B91C1C" strokeWidth="4" strokeLinecap="round" />
          {/* Pivot cap. */}
          <circle cx="300" cy="300" r="6" fill="#B91C1C" />
        </g>
      </svg>
      </div>
    </div>
  );
}
