import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * Inter, subset for the Journals storefront preview.
 *
 * We scope this to the .shopify-preview class (see globals.css) so
 * the Journals composer + reader render in the same face Shopify
 * uses by default on the evari.cc blog template, while the rest of
 * the dashboard keeps Geist. Variable weight + fallback metrics
 * adjuster keeps the preview faithful even while the Google Fonts
 * file is still loading.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-shopify-preview',
});
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';

export const metadata: Metadata = {
  title: 'Evari Dashboard',
  description:
    'Operations cockpit for evari.cc — leads, conversations, SEO, traffic, and social.',
};

// Inline script: set data-theme + per-theme shade + per-theme accent before
// paint so the whole UI boots with the user's stored preferences. Each theme
// (light / dark) keeps its own shade and accent — flipping themes applies
// that theme's remembered values.
const THEME_BOOTSTRAP = `
  (function() {
    try {
      var t = localStorage.getItem('evari-theme');
      var theme = t === 'light' ? 'light' : 'dark';
      var s = localStorage.getItem('evari-shade-' + theme);
      var a = localStorage.getItem('evari-accent-' + theme);
      var i = localStorage.getItem('evari-ink-' + theme);
      var shade = (s === null || isNaN(Number(s))) ? '2' : String(Math.max(0, Math.min(4, Number(s))));
      var root = document.documentElement;
      root.setAttribute('data-theme', theme);
      root.setAttribute('data-shade', shade);
      var hex = (a && /^#?[0-9a-fA-F]{6}$/.test(a)) ? (a[0] === '#' ? a.slice(1) : a) : 'CFA853';
      var r = parseInt(hex.slice(0, 2), 16);
      var g = parseInt(hex.slice(2, 4), 16);
      var b = parseInt(hex.slice(4, 6), 16);
      root.style.setProperty('--evari-gold', r + ' ' + g + ' ' + b);
      root.style.setProperty('--evari-warn', r + ' ' + g + ' ' + b);
      var ink;
      if (i === 'light') {
        ink = '245 245 245';
      } else if (i === 'dark') {
        ink = '20 20 20';
      } else {
        var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        ink = luma < 150 ? '245 245 245' : '20 20 20';
      }
      root.style.setProperty('--evari-gold-ink', ink);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.setAttribute('data-shade', '2');
    }
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-shade="2"
      className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}
      // The THEME_BOOTSTRAP script below mutates data-theme / data-shade /
      // inline CSS vars on <html> before React hydrates (to avoid a theme
      // flash). Without this attribute, React sees "dark"/"2" in its SSR
      // output vs "light"/"4" (or whatever the user stored) in the real DOM,
      // flags a hydration mismatch, and re-renders the whole tree from
      // scratch — which detaches every child event handler. suppressHydrationWarning
      // tells React "first-level attributes here may differ — keep hydrating."
      // This is the same pattern next-themes uses.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen bg-evari-ink text-evari-text antialiased">
        <ThemeProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
