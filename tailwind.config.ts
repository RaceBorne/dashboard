import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Evari brand palette
        evari: {
          ink: '#0A0A0A',         // base background
          carbon: '#111111',      // panel
          surface: '#161616',     // card
          edge: '#1F1F1F',        // borders
          mute: '#2A2A2A',        // dividers
          text: '#EDEDED',
          dim: '#A3A3A3',
          dimmer: '#6B6B6B',
          accent: '#E63946',      // Evari signature red, restrained use
          accentSoft: '#7C1D24',
          gold: '#C7A552',
        },
        border: 'hsl(0 0% 14%)',
        input: 'hsl(0 0% 14%)',
        ring: 'hsl(0 80% 55%)',
        background: 'hsl(0 0% 4%)',
        foreground: 'hsl(0 0% 93%)',
        primary: {
          DEFAULT: 'hsl(0 80% 55%)',
          foreground: 'hsl(0 0% 100%)',
        },
        secondary: {
          DEFAULT: 'hsl(0 0% 12%)',
          foreground: 'hsl(0 0% 93%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 70% 45%)',
          foreground: 'hsl(0 0% 98%)',
        },
        muted: {
          DEFAULT: 'hsl(0 0% 10%)',
          foreground: 'hsl(0 0% 64%)',
        },
        accent: {
          DEFAULT: 'hsl(0 0% 12%)',
          foreground: 'hsl(0 0% 93%)',
        },
        popover: {
          DEFAULT: 'hsl(0 0% 7%)',
          foreground: 'hsl(0 0% 93%)',
        },
        card: {
          DEFAULT: 'hsl(0 0% 8%)',
          foreground: 'hsl(0 0% 93%)',
        },
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
