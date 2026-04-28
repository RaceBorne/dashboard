'use client';

/**
 * Raceborne analogue clock — pixel-matched to the widget example.
 *
 * Layered top-to-bottom (back-to-front):
 *
 *   1. Yellow gradient backdrop (matches the example's bright top
 *      to olive bottom).
 *   2. Soft circular highlight in the middle of the dial.
 *   3. SVG dial: 60 tick marks (longer at every 5), 01-12 numerals
 *      in mono two-digit format, curved 'RACEBORNE · TECHNICAL ·
 *      EQUIPMENT' text running counter-clockwise on the left, and
 *      the '3' brand stamp below the centre.
 *   4. Hour hand PNG, rotated.
 *   5. Minute hand PNG, rotated.
 *   6. Second hand (programmatic SVG line) sweeping continuously.
 *
 * Each hand carries a soft drop shadow (filter: drop-shadow) so it
 * lifts off the dial. Offsets are subtle on purpose — the spec said
 * 'not too extreme'.
 *
 * Continuous Rolex-style sweep on the second hand via
 * requestAnimationFrame with millisecond-precise rotation.
 */

import { useEffect, useRef, useState } from 'react';

const HAND_SHADOW = 'drop-shadow(2px 3px 4px rgba(0,0,0,0.32))';
const SECOND_SHADOW = 'drop-shadow(1px 2px 2.5px rgba(0,0,0,0.28))';

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
  const minutes = (time?.m ?? 0) + seconds / 60;
  const hours   = ((time?.h ?? 0) % 12) + minutes / 60;
  const hourAngle   = hours * 30;
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-panel">
      {/* 1. Backdrop gradient (matches widget example top→bottom). */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, #FFCB00 0%, #E0B400 45%, #B89500 100%)' }}
      />

      {/* 2. Soft circular highlight to give the dial a slight dome. */}
      <div
        className="absolute"
        style={{
          top: '8%', left: '8%', width: '84%', height: '84%',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 25%, rgba(255,225,90,0.55) 0%, rgba(255,200,0,0.0) 60%)',
          filter: 'blur(2px)',
        }}
      />

      {/* 3. Dial markings, curved RACEBORNE text, and "3" stamp. */}
      <svg
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Counter-clockwise sweep on the left of the dial for the
              brand text. Two arcs glued so we can split the wording
              between top-left and bottom-left if we want; for now one
              continuous run from 7 o'clock up to 5 o'clock. */}
          <path id="raceborneCurve" d="M 165 425 A 200 200 0 0 1 165 175" fill="none" />
        </defs>

        {/* Outer ring shadow to anchor the dial visually. */}
        <circle cx="300" cy="300" r="246" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="2" />

        {/* 60 tick marks. Longer at every 5. */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i * 6 - 90) * (Math.PI / 180);
          const long = i % 5 === 0;
          const r1 = long ? 212 : 222;
          const r2 = 235;
          const x1 = 300 + r1 * Math.cos(angle);
          const y1 = 300 + r1 * Math.sin(angle);
          const x2 = 300 + r2 * Math.cos(angle);
          const y2 = 300 + r2 * Math.sin(angle);
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#1A1A1A"
              strokeWidth={long ? 2.6 : 1.1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Numerals 01..12, leading-zero, 12 at the top. */}
        {Array.from({ length: 12 }).map((_, i) => {
          const num = i === 0 ? 12 : i;
          const label = num.toString().padStart(2, '0');
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const r = 188;
          const x = 300 + r * Math.cos(angle);
          const y = 300 + r * Math.sin(angle);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#1A1A1A"
              style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 22, letterSpacing: 0.5, fontWeight: 500 }}
            >
              {label}
            </text>
          );
        })}

        {/* Curved RACEBORNE TECHNICAL EQUIPMENT on the left of the dial. */}
        <text
          fill="#1A1A1A"
          style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 11, letterSpacing: 4, fontWeight: 500 }}
        >
          <textPath href="#raceborneCurve" startOffset="50%" textAnchor="middle">
            RACEBORNE · TECHNICAL · EQUIPMENT
          </textPath>
        </text>

        {/* "3" brand stamp, below centre. */}
        <text
          x="300" y="370"
          textAnchor="middle"
          fill="#1A1A1A"
          opacity="0.75"
          style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 28, fontWeight: 700 }}
        >
          3
        </text>
      </svg>

      {/* 4. Hour hand (PNG asset). */}
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
          filter: HAND_SHADOW,
        }}
      />

      {/* 5. Minute hand (PNG asset). */}
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
          filter: HAND_SHADOW,
        }}
      />

      {/* 6. Second hand — continuous sweep, soft drop shadow. */}
      <svg
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full pointer-events-none"
        style={{ filter: SECOND_SHADOW }}
      >
        <g style={{ transform: `rotate(${secondAngle}deg)`, transformOrigin: '300px 300px' }}>
          <line x1="300" y1="320" x2="300" y2="120" stroke="#B91C1C" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
