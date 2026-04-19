'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';
/** 0 = near-black, 2 = warm charcoal (default), 4 = soft warm grey. */
export type Shade = 0 | 1 | 2 | 3 | 4;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  /** Shade for the current theme. Light and dark each have their own. */
  shade: Shade;
  setShade: (s: Shade) => void;
  /** Accent hex for the current theme. Light and dark each have their own. */
  accent: string;
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Storage keys are split per theme so light/dark remember their own settings.
const STORAGE_THEME = 'evari-theme';
const STORAGE_SHADE = (t: Theme) => `evari-shade-${t}`;
const STORAGE_ACCENT = (t: Theme) => `evari-accent-${t}`;

const DEFAULT_ACCENT = '#CFA853';
const DEFAULT_SHADE: Shade = 2;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return { r: 207, g: 168, b: 83 };
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return {
    r: isNaN(r) ? 207 : r,
    g: isNaN(g) ? 168 : g,
    b: isNaN(b) ? 83 : b,
  };
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyAccent(hex: string) {
  if (typeof document === 'undefined') return;
  const { r, g, b } = hexToRgb(hex);
  const tripleString = `${r} ${g} ${b}`;
  const root = document.documentElement;
  root.style.setProperty('--evari-gold', tripleString);
  root.style.setProperty('--evari-warn', tripleString);
  // Amber / yellow / cream sits around luminance 160-200 and reads better
  // with dark text (white washes out). Darker saturated colours (red, blue,
  // green, oxblood, carbon) sit below and carry white text well.
  // Threshold 150 lands in the right place: anything amber-bright or lighter
  // gets dark ink; anything that's properly saturated or dark gets white.
  const luma = luminance(r, g, b);
  const ink = luma < 150 ? '245 245 245' : '20 20 20';
  root.style.setProperty('--evari-gold-ink', ink);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [shadeByTheme, setShadeByTheme] = useState<Record<Theme, Shade>>({
    dark: DEFAULT_SHADE,
    light: DEFAULT_SHADE,
  });
  const [accentByTheme, setAccentByTheme] = useState<Record<Theme, string>>({
    dark: DEFAULT_ACCENT,
    light: DEFAULT_ACCENT,
  });

  // Load stored preferences on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = window.localStorage.getItem(STORAGE_THEME) as Theme | null;
    const resolvedTheme: Theme = storedTheme === 'light' ? 'light' : 'dark';

    const shadeDarkRaw = window.localStorage.getItem(STORAGE_SHADE('dark'));
    const shadeLightRaw = window.localStorage.getItem(STORAGE_SHADE('light'));
    const shadeDark = parseShade(shadeDarkRaw);
    const shadeLight = parseShade(shadeLightRaw);

    const accentDarkRaw = window.localStorage.getItem(STORAGE_ACCENT('dark'));
    const accentLightRaw = window.localStorage.getItem(STORAGE_ACCENT('light'));
    const accentDark = parseAccent(accentDarkRaw);
    const accentLight = parseAccent(accentLightRaw);

    setThemeState(resolvedTheme);
    setShadeByTheme({ dark: shadeDark, light: shadeLight });
    setAccentByTheme({ dark: accentDark, light: accentLight });

    const activeShade = resolvedTheme === 'dark' ? shadeDark : shadeLight;
    const activeAccent = resolvedTheme === 'dark' ? accentDark : accentLight;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-shade', String(activeShade));
    applyAccent(activeAccent);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_THEME, t);
    const root = document.documentElement;
    root.setAttribute('data-theme', t);
    // Re-apply the shade and accent that belong to this theme
    root.setAttribute('data-shade', String(shadeByTheme[t]));
    applyAccent(accentByTheme[t]);
  }

  function setShade(s: Shade) {
    setShadeByTheme((prev) => ({ ...prev, [theme]: s }));
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_SHADE(theme), String(s));
    document.documentElement.setAttribute('data-shade', String(s));
  }

  function setAccent(hex: string) {
    const clean = hex.startsWith('#') ? hex : '#' + hex;
    setAccentByTheme((prev) => ({ ...prev, [theme]: clean }));
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_ACCENT(theme), clean);
    applyAccent(clean);
  }

  function toggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggle,
        shade: shadeByTheme[theme],
        setShade,
        accent: accentByTheme[theme],
        setAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

function parseShade(raw: string | null): Shade {
  if (raw === null) return DEFAULT_SHADE;
  const n = Number(raw);
  if (isNaN(n)) return DEFAULT_SHADE;
  if (n < 0 || n > 4) return DEFAULT_SHADE;
  return n as Shade;
}

function parseAccent(raw: string | null): string {
  if (!raw) return DEFAULT_ACCENT;
  if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) return DEFAULT_ACCENT;
  return raw.startsWith('#') ? raw : '#' + raw;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
