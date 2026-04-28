'use client';

/**
 * Raceborne-branded analogue clock for the home canvas.
 *
 * Built around the Content/Clock asset pack, copied to public/clock.
 * The dial (tick marks, 01–12 numerals, curved 'RACEBORNE TECHNICAL
 * EQUIPMENT' text and the centre "3" insignia) is rendered as inline
 * SVG so it stays sharp at any tile size. Hour + minute hands are
 * placed as <img> elements anchored at the dial centre. The second
 * hand is drawn as a thin SVG line and sweeps continuously like a
 * Rolex sweep — no ticks — via requestAnimationFrame using
 * millisecond-precise rotation.
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

  // Hand angles in degrees from 12 o'clock, clockwise positive.
  const seconds = (time?.s ?? 0) + (time?.ms ?? 0) / 1000;
  const minutes = (time?.m ?? 0) + seconds / 60;
  const hours   = ((time?.h ?? 0) % 12) + minutes / 60;

  const hourAngle   = hours * 30;        // 360 / 12
  const minuteAngle = minutes * 6;       // 360 / 60
  const secondAngle = seconds * 6;       // continuous sweep

  return (
    <div className="absolute inset-0 overflow-hidden rounded-panel">
      {/* Yellow gradient backdrop matching the brand example. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, #FFCB00 0%, #C8A20A 100%)' }} />

      {/* Dial — fills the tile, preserves aspect via SVG viewBox. */}
      <svg
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Soft inner shadow for depth on the dial surface. */}
          <radialGradient id="dialShade" cx="50%" cy="40%" r="55%">
            <stop offset="0%"  stopColor="#FFD11A" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#A88A00" stopOpacity="0" />
          </radialGradient>
          {/* The path the curved 'RACEBORNE TECHNICAL EQUIPMENT' text follows.
              Sweeps along the left side of the dial counter-clockwise so the
              letters stand upright against the rim. */}
          <path id="raceborneCurve" d="M 178 410 A 200 200 0 0 1 178 190" fill="none" />
        </defs>

        {/* Subtle dial highlight. */}
        <circle cx="300" cy="300" r="240" fill="url(#dialShade)" />

        {/* Tick marks: 60 per revolution, longer at every 5. */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i * 6 - 90) * (Math.PI / 180);
          const long = i % 5 === 0;
          const r1 = long ? 215 : 222;
          const r2 = 232;
          const x1 = 300 + r1 * Math.cos(angle);
          const y1 = 300 + r1 * Math.sin(angle);
          const x2 = 300 + r2 * Math.cos(angle);
          const y2 = 300 + r2 * Math.sin(angle);
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#1A1A1A"
              strokeWidth={long ? 2.6 : 1.2}
              strokeLinecap="round"
            />
          );
        })}

        {/* Numerals 01..12, leading-zero style. */}
        {Array.from({ length: 12 }).map((_, i) => {
          const num = i === 0 ? 12 : i;          // 12 at the top, then 01..11
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
              style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 22, letterSpacing: 0.5 }}
            >
              {label}
            </text>
          );
        })}

        {/* Curved RACEBORNE TECHNICAL EQUIPMENT text on the left of the dial. */}
        <text
          fill="#1A1A1A"
          style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 11, letterSpacing: 4, fontWeight: 500 }}
        >
          <textPath href="#raceborneCurve" startOffset="50%" textAnchor="middle">
            RACEBORNE · TECHNICAL · EQUIPMENT
          </textPath>
        </text>

        {/* Brand "3" stamp, mid-bottom. */}
        <text
          x="300" y="370"
          textAnchor="middle"
          fill="#1A1A1A"
          opacity="0.7"
          style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 26, fontWeight: 700 }}
        >
          3
        </text>

        {/* Second hand — thin red line, continuous sweep. */}
        <g style={{ transform: `rotate(${secondAngle}deg)`, transformOrigin: '300px 300px' }}>
          <line x1="300" y1="320" x2="300" y2="120" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Centre dot, on top of hands but below the pivot cap. */}
      </svg>

      {/* Hour hand — black bar from the asset pack. */}
      <img
        src="/clock/hour-hand.png"
        alt=""
        draggable={false}
        className="absolute pointer-events-none select-none"
        style={{
          top: '50%', left: '50%',
          width: '60%', height: '60%',
          transform: `translate(-50%, -50%) rotate(${hourAngle}deg)`,
          transformOrigin: 'center center',
        }}
      />

      {/* Minute hand — red with yellow centre dot from the asset pack. */}
      <img
        src="/clock/min-hand.png"
        alt=""
        draggable={false}
        className="absolute pointer-events-none select-none"
        style={{
          top: '50%', left: '50%',
          width: '74%', height: '74%',
          transform: `translate(-50%, -50%) rotate(${minuteAngle}deg)`,
          transformOrigin: 'center center',
        }}
      />

      {/* Tiny pivot cap so the second hand sits cleanly on top. */}
      <div
        className="absolute pointer-events-none rounded-full"
        style={{
          top: '50%', left: '50%',
          width: 6, height: 6,
          transform: 'translate(-50%, -50%)',
          background: '#FFCB00',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}
