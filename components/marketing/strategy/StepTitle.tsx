'use client';

/**
 * Shared header for every Strategy substep (and Discovery).
 *
 * Renders "Strategy | <substep>" where Strategy is full evari-text,
 * the pipe is dim, and the substep name is one shade lighter to
 * signal it's the subset.
 */

export function StepTitle({ substep }: { substep: string }) {
  return (
    <h1 className="text-[20px] font-bold text-evari-text">
      Strategy
      <span className="mx-2 text-evari-dimmer font-normal">|</span>
      <span className="text-evari-dim">{substep}</span>
    </h1>
  );
}
