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
/** Text colour on accent backgrounds (buttons, badges, lozenges). */
export type Ink = 'auto' | 'light' | 'dark';

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
  /** Ink preference for accent backgrounds. Light and dark each have their own. */
  ink: Ink;
  setInk: (i: Ink) => void;
  /**
   * User-uploaded brand logo per theme, stored as a base64 data URL in
   * localStorage. `null` means fall back to the built-in /evari-logo-on-*.svg.
   */
  logoLight: string | null;
  logoDark: string | null;
  setLogo: (which: Theme, dataUrl: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Storage keys are split per theme so light/dark remember their own settings.
const STORAGE_THEME = 'evari-theme';
const STORAGE_SHADE = (t: Theme) => `evari-shade-${t}`;
const STORAGE_ACCENT = (t: Theme) => `evari-accent-${t}`;
const STORAGE_INK = (t: Theme) => `evari-ink-${t}`;
const STORAGE_LOGO = (t: Theme) => `evari-logo-${t}`;

const DEFAULT_ACCENT = '#FEC700';
const DEFAULT_SHADE: Shade = 2;
const DEFAULT_INK_DARK: Ink = 'auto';
const DEFAULT_INK_LIGHT: Ink = 'light';

const INK_LIGHT = '245 245 245';
const INK_DARK = '20 20 20';

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

export function applyAccent(hex: string, inkPref: Ink = 'auto') {
  if (typeof document === 'undefined') return;
  const { r, g, b } = hexToRgb(hex);
  const tripleString = `${r} ${g} ${b}`;
  const root = document.documentElement;
  root.style.setProperty('--evari-gold', tripleString);
  root.style.setProperty('--evari-warn', tripleString);
  // Ink pref overrides the automatic luminance choice. Amber / yellow / cream
  // sits around luminance 160-200 and reads better with dark text (white
  // washes out). Darker saturated colours (red, blue, green, oxblood, carbon)
  // sit below and carry white text well. Threshold 150 lands in the right
  // place for auto mode; if the user picks 'light' or 'dark' we honour it.
  let ink: string;
  if (inkPref === 'light') {
    ink = INK_LIGHT;
  } else if (inkPref === 'dark') {
    ink = INK_DARK;
  } else {
    const luma = luminance(r, g, b);
    ink = luma < 150 ? INK_LIGHT : INK_DARK;
  }
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
  const [inkByTheme, setInkByTheme] = useState<Record<Theme, Ink>>({
    dark: DEFAULT_INK_DARK,
    light: DEFAULT_INK_LIGHT,
  });
  const [logoByTheme, setLogoByTheme] = useState<Record<Theme, string | null>>({
    dark: null,
    light: null,
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

    const inkDarkRaw = window.localStorage.getItem(STORAGE_INK('dark'));
    const inkLightRaw = window.localStorage.getItem(STORAGE_INK('light'));
    const inkDark = parseInk(inkDarkRaw);
    const inkLight = parseInk(inkLightRaw);

    const logoDark = parseLogo(window.localStorage.getItem(STORAGE_LOGO('dark')));
    const logoLight = parseLogo(window.localStorage.getItem(STORAGE_LOGO('light')));

    setThemeState(resolvedTheme);
    setShadeByTheme({ dark: shadeDark, light: shadeLight });
    setAccentByTheme({ dark: accentDark, light: accentLight });
    setInkByTheme({ dark: inkDark, light: inkLight });
    setLogoByTheme({ dark: logoDark, light: logoLight });

    // Hydrate from Supabase so the logos persist across browsers / devices.
    // localStorage is kept as a fast-path cache for the next paint.
    void (async () => {
      try {
        const res = await fetch('/api/theme/branding', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          logoLight?: string | null;
          logoDark?: string | null;
        };
        if (!data.ok) return;
        const remoteLight = parseLogo(data.logoLight ?? null);
        const remoteDark = parseLogo(data.logoDark ?? null);
        setLogoByTheme((prev) => ({
          light: remoteLight ?? prev.light,
          dark: remoteDark ?? prev.dark,
        }));
        // Mirror the remote values into localStorage so the next mount
        // paints immediately from cache instead of waiting for the fetch.
        if (remoteLight) window.localStorage.setItem(STORAGE_LOGO('light'), remoteLight);
        if (remoteDark) window.localStorage.setItem(STORAGE_LOGO('dark'), remoteDark);
      } catch {
        // Silent — fall back to localStorage values.
      }
    })();

    const activeShade = resolvedTheme === 'dark' ? shadeDark : shadeLight;
    const activeAccent = resolvedTheme === 'dark' ? accentDark : accentLight;
    const activeInk = resolvedTheme === 'dark' ? inkDark : inkLight;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-shade', String(activeShade));
    applyAccent(activeAccent, activeInk);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_THEME, t);
    const root = document.documentElement;
    root.setAttribute('data-theme', t);
    // Re-apply the shade and accent that belong to this theme
    root.setAttribute('data-shade', String(shadeByTheme[t]));
    applyAccent(accentByTheme[t], inkByTheme[t]);
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
    applyAccent(clean, inkByTheme[theme]);
  }

  function setInk(i: Ink) {
    setInkByTheme((prev) => ({ ...prev, [theme]: i }));
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_INK(theme), i);
    applyAccent(accentByTheme[theme], i);
  }

  function setLogo(which: Theme, dataUrl: string | null) {
    setLogoByTheme((prev) => ({ ...prev, [which]: dataUrl }));
    if (typeof window === 'undefined') return;
    // Fast path: keep localStorage so first paint on next mount is instant.
    if (dataUrl === null) {
      window.localStorage.removeItem(STORAGE_LOGO(which));
    } else {
      window.localStorage.setItem(STORAGE_LOGO(which), dataUrl);
    }
    // Durable path: persist to Supabase so other browsers / devices pick it up.
    void fetch('/api/theme/branding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ which, dataUrl }),
    }).catch(() => {
      // Non-fatal — localStorage still has the value.
    });
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
        ink: inkByTheme[theme],
        setInk,
        logoLight: logoByTheme.light,
        logoDark: logoByTheme.dark,
        setLogo,
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

function parseInk(raw: string | null): Ink {
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  // Fallback for stale/corrupt localStorage — 'auto' is the safest choice.
  return 'auto';
}

function parseLogo(raw: string | null): string | null {
  // Only accept data URLs (image/*). Anything else is ignored so corrupt
  // localStorage values can't inject arbitrary URLs.
  if (!raw) return null;
  if (!raw.startsWith('data:image/')) return null;
  return raw;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
