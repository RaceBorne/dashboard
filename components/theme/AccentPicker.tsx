'use client';

import { useTheme } from './ThemeProvider';

/**
 * Full-spectrum colour picker for the app's accent colour. Drives every
 * highlight — CTA buttons, the to-do count pill, pinned icons, active links.
 *
 * Text colour on the accent auto-flips between light and dark based on
 * WCAG luminance, so pure black or pure white are valid choices.
 *
 * Saves per theme (light / dark remember their own accent) and persists
 * immediately on change.
 */
export function AccentPicker() {
  const { accent, setAccent } = useTheme();

  return (
    <div className="flex flex-col gap-3 w-full max-w-xs">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          Accent colour
        </span>
        <span className="text-evari-dim font-mono tabular-nums">
          {accent.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label
          className="relative h-9 w-9 rounded-md overflow-hidden cursor-pointer shrink-0"
          style={{
            background: accent,
            boxShadow: '0 0 0 1px rgb(var(--evari-edge))',
          }}
          title="Pick any colour"
        >
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <div className="text-[11px] text-evari-dim leading-snug">
          Click the swatch to open the colour wheel. Text on highlights
          flips between light and dark automatically for readability.
        </div>
      </div>
    </div>
  );
}
