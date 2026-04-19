'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme, Theme } from './ThemeProvider';
import { cn } from '@/lib/utils';

/**
 * Escapist-style light/dark lozenge. Matches the "Light | Dark | Sat"
 * control seen on the Escapist map overlay.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="pill-group">
      <Option current={theme} value="light" setTheme={setTheme}>
        <Sun className="h-3.5 w-3.5" />
        Light
      </Option>
      <Option current={theme} value="dark" setTheme={setTheme}>
        <Moon className="h-3.5 w-3.5" />
        Dark
      </Option>
    </div>
  );
}

function Option({
  current,
  value,
  setTheme,
  children,
}: {
  current: Theme;
  value: Theme;
  setTheme: (t: Theme) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      className={cn('pill-tab')}
      data-active={active}
      onClick={() => setTheme(value)}
      type="button"
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
