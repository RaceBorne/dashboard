import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
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
      var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      root.style.setProperty('--evari-gold-ink', luma < 150 ? '245 245 245' : '20 20 20');
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
      className={`${GeistSans.variable} ${GeistMono.variable}`}
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
