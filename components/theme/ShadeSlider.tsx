'use client';

import { useTheme, Shade } from './ThemeProvider';

const LABELS: Record<Shade, string> = {
  0: 'Near-black',
  1: 'Dark charcoal',
  2: 'Warm charcoal',
  3: 'Soft grey',
  4: 'Light grey',
};

export function ShadeSlider() {
  const { shade, setShade } = useTheme();
  return (
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <div className="flex items-center justify-between text-[11px] text-evari-dim">
        <span className="uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Background shade
        </span>
        <span>{LABELS[shade]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={4}
        step={1}
        value={shade}
        onChange={(e) => setShade(Number(e.target.value) as Shade)}
        className="shade-slider"
        aria-label="Background shade"
      />
      <div className="flex justify-between text-[9px] text-evari-dimmer tabular-nums">
        <span>darker</span>
        <span>lighter</span>
      </div>
    </div>
  );
}
