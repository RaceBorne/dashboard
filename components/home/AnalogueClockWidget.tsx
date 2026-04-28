'use client';

/**
 * Analogue clock — built strictly from the supplied PNG asset pack:
 *
 *   /clock/background.png — yellow gradient, full-tile bleed.
 *   /clock/face.png       — round dial face (gradient + ticks +
 *                           numerals + RACEBORNE text + 3 stamp).
 *                           No hands baked in.
 *   /clock/hour-hand.png  — black hour hand.
 *   /clock/min-hand.png   — red minute hand with yellow centre dot.
 *
 * The face is held to a square inside the tile so it stays round on
 * any tile aspect ratio. There's 10% breathing room from the face's
 * outer edge to the tile's inner edge on the limiting axis.
 *
 * Hands rotate to local time (Date methods are timezone- and DST-
 * aware automatically). The second hand sweeps continuously like a
 * Rolex via requestAnimationFrame with millisecond precision.
 *
 * Each hand carries a 5-layer drop-shadow stack so the falloff reads
 * as ray-traced — sharp dark contact at the source, fading out to
 * a wide soft outer cast. All shadows are dy-positive, putting the
 * apparent light source at 12 o'clock.
 */

import { useEffect, useRef, useState } from 'react';

const HAND_SHADOW = [
  // Light source: low and far away (sun-like). Each layer's dy is much
  // larger than its blur so the radial blur of drop-shadow can't climb
  // above the hand's edge. The cast lengthens downward, never up.
  'drop-shadow(0 4px 1px rgba(0,0,0,0.55))',
  'drop-shadow(0 10px 3px rgba(0,0,0,0.38))',
  'drop-shadow(0 20px 6px rgba(0,0,0,0.22))',
  'drop-shadow(0 32px 10px rgba(0,0,0,0.12))',
  'drop-shadow(0 48px 14px rgba(0,0,0,0.06))',
].join(' ');

export function AnalogueClockWidget() {
  const [time, setTime] = useState<{ h: number; m: number; s: number; ms: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();                              // browser local time
      setTime({
        h: now.getHours(),                                 // 0..23 in user's locale
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
      {/* Layer 0 — background.png fills the entire tile, edge to edge. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/clock/background.png"
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
      />

      {/* Layer 1+ — round dial sized 110% of the tile height so it
          extends slightly beyond the tile edges (clipped by the
          outer overflow-hidden) for a more prominent face. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ aspectRatio: '1 / 1', height: '110%' }}>
          {/* Face — round dial with markings, no hands. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/clock/face.png"
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
          />

          {/* Hour hand — sized so the bar reaches into the dial ring. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/clock/hour-hand.png"
            alt=""
            draggable={false}
            className="absolute pointer-events-none select-none"
            style={{
              top: '50%', left: '50%',
              width: '155%', height: '155%',
              transform: `translate(-50%, -50%) rotate(${hourAngle}deg)`,
              transformOrigin: 'center center',
              filter: HAND_SHADOW,
            }}
          />

          {/* Minute hand — slightly longer than the hour hand. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/clock/min-hand.png"
            alt=""
            draggable={false}
            className="absolute pointer-events-none select-none"
            style={{
              top: '50%', left: '50%',
              width: '180%', height: '180%',
              transform: `translate(-50%, -50%) rotate(${minuteAngle}deg)`,
              transformOrigin: 'center center',
              filter: HAND_SHADOW,
            }}
          />

          {/* Second hand — continuous Rolex sweep, same shadow stack. */}
          <svg
            viewBox="0 0 600 600"
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ filter: HAND_SHADOW }}
          >
            <g style={{ transform: `rotate(${secondAngle}deg)`, transformOrigin: '300px 300px' }}>
              <line x1="300" y1="370" x2="300" y2="80" stroke="#B91C1C" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="300" cy="300" r="6" fill="#B91C1C" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
