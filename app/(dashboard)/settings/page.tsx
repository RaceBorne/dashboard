import Link from 'next/link';
import { TopBar } from '@/components/sidebar/TopBar';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ShadeSlider } from '@/components/theme/ShadeSlider';
import { AccentPicker } from '@/components/theme/AccentPicker';
import { LogoUploader } from '@/components/theme/LogoUploader';
import { SendersSection } from '@/components/settings/SendersSection';
import { ArrowUpRight } from 'lucide-react';

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" subtitle="Appearance, preferences" />

      <div className="p-6 max-w-[800px] space-y-5">
        {/* Appearance */}
        <section className="rounded-xl bg-evari-surface p-5 space-y-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium mb-1">
                Appearance
              </div>
              <div className="text-sm font-medium text-evari-text">Theme</div>
              <div className="text-xs text-evari-dim mt-0.5">
                Light or dark. Preference is remembered on this device.
              </div>
            </div>
            <ThemeToggle />
          </div>
          <div
            className="flex items-start justify-between gap-6 pt-4"
            style={{ borderTop: '1px solid rgb(var(--evari-edge) / 0.5)' }}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-evari-text">Darkness</div>
              <div className="text-xs text-evari-dim mt-0.5 max-w-sm">
                Too black can feel techy and harsh. Slide right for a warmer,
                softer charcoal.
              </div>
            </div>
            <ShadeSlider />
          </div>
          <div
            className="flex items-start justify-between gap-6 pt-4"
            style={{ borderTop: '1px solid rgb(var(--evari-edge) / 0.5)' }}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-evari-text">Accent</div>
              <div className="text-xs text-evari-dim mt-0.5 max-w-sm">
                The colour used for every highlight — primary buttons, the
                to-do count, pinned markers, active links. Change it and the
                whole app follows.
              </div>
            </div>
            <AccentPicker />
          </div>
          <div
            className="flex items-start justify-between gap-6 pt-4"
            style={{ borderTop: '1px solid rgb(var(--evari-edge) / 0.5)' }}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-evari-text">Brand logo</div>
              <div className="text-xs text-evari-dim mt-0.5 max-w-sm">
                Replaces the Evari mark in the top-left of the sidebar. Upload
                a light version for dark mode and a dark version for light
                mode — the right one appears automatically based on the active
                theme. Drop a file or click to browse; saves on upload.
              </div>
            </div>
            <div className="flex flex-col gap-4 w-full max-w-xs">
              <LogoUploader which="dark" label="For dark mode" />
              <LogoUploader which="light" label="For light mode" />
            </div>
          </div>
        </section>

        {/* Outreach senders */}
        <SendersSection />

        {/* Pointer to Connections */}
        <section className="rounded-xl bg-evari-surface p-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-sm font-medium text-evari-text">
                Looking for integrations?
              </div>
              <div className="text-xs text-evari-dim mt-0.5 max-w-sm">
                Shopify, Google, Gmail, LinkedIn, Meta, TikTok, Supabase — every
                integration lives on the Wireframe page now, with the live
                architecture diagram and an AI audit panel.
              </div>
            </div>
            <Link
              href="/wireframe"
              className="inline-flex items-center gap-1.5 rounded-md h-8 px-3 text-xs font-medium bg-evari-surfaceSoft text-evari-text hover:bg-evari-mute/60 transition"
            >
              Go to Wireframe
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
