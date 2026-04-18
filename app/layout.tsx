import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Evari Dashboard',
  description:
    'Operations cockpit for evari.cc — leads, conversations, SEO, traffic, and social.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-evari-ink text-evari-text antialiased">
        {children}
      </body>
    </html>
  );
}
