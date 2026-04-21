'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Instagram,
  Linkedin,
  Music2,
  Sparkles,
  RefreshCw,
  ImageIcon,
  Video,
  FileText,
  Type,
  Layers,
  Clock,
  Calendar as CalendarIcon,
  Newspaper,
  Mail,
} from 'lucide-react';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatsFor, type PostFormat } from '@/lib/social-formats';
import type { SocialPlatform } from '@/lib/types';

const PLATFORM_ICON: Record<SocialPlatform, typeof Instagram> = {
  instagram: Instagram,
  linkedin: Linkedin,
  tiktok: Music2,
  shopify_blog: Newspaper,
  newsletter: Mail,
};

function MediaIcon({ kind }: { kind: PostFormat['media'] }) {
  switch (kind) {
    case 'image':
      return <ImageIcon className="h-3.5 w-3.5" />;
    case 'video':
      return <Video className="h-3.5 w-3.5" />;
    case 'document':
      return <FileText className="h-3.5 w-3.5" />;
    case 'text':
      return <Type className="h-3.5 w-3.5" />;
    case 'carousel':
      return <Layers className="h-3.5 w-3.5" />;
  }
}

// Parse "w:h" aspect string → CSS aspect-ratio value. Accepts "1.91:1" etc.
function aspectFor(spec: string): string {
  const [w, h] = spec.split(':').map((n) => parseFloat(n));
  if (!w || !h) return '1 / 1';
  return `${w} / ${h}`;
}

export function NewPostClient() {
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const formats = useMemo(() => formatsFor(platform), [platform]);
  const [formatId, setFormatId] = useState<PostFormat['id']>(formats[0].id);
  const format = useMemo(
    () => formats.find((f) => f.id === formatId) ?? formats[0],
    [formats, formatId],
  );

  // Switching platform picks the first format of that platform.
  function choosePlatform(p: SocialPlatform) {
    setPlatform(p);
    const first = formatsFor(p)[0];
    if (first) setFormatId(first.id);
  }

  const [caption, setCaption] = useState('');
  const [topic, setTopic] = useState('');
  const [link, setLink] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMock, setAiMock] = useState(false);

  const [scheduleDate, setScheduleDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [scheduleTime, setScheduleTime] = useState('09:00');

  async function draftCaption() {
    setAiLoading(true);
    try {
      const res = await fetch('/api/social/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform, topic, link }),
      });
      const data = (await res.json()) as { markdown: string; mock: boolean };
      setCaption(data.markdown);
      setAiMock(data.mock);
    } finally {
      setAiLoading(false);
    }
  }

  const captionOver =
    format.captionMax != null && caption.length > format.captionMax;

  return (
    <div className="p-6 space-y-5">
      {/* Back link */}
      <div>
        <Link
          href="/social"
          className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to calendar
        </Link>
      </div>

      {/* 1. Platform */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
              Step 1
            </div>
            <div className="text-sm font-medium text-evari-text">Platform</div>
          </div>
          <PillTabs<SocialPlatform>
            size="sm"
            value={platform}
            onChange={choosePlatform}
            options={[
              {
                value: 'instagram',
                label: 'Instagram',
                icon: <Instagram className="h-3.5 w-3.5" />,
              },
              {
                value: 'linkedin',
                label: 'LinkedIn',
                icon: <Linkedin className="h-3.5 w-3.5" />,
              },
              {
                value: 'tiktok',
                label: 'TikTok',
                icon: <Music2 className="h-3.5 w-3.5" />,
              },
              {
                value: 'shopify_blog',
                label: 'Shopify blog',
                icon: <Newspaper className="h-3.5 w-3.5" />,
              },
              {
                value: 'newsletter',
                label: 'Newsletter',
                icon: <Mail className="h-3.5 w-3.5" />,
              },
            ]}
          />
        </div>
      </section>

      {/* 2. Format */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
            Step 2
          </div>
          <div className="text-sm font-medium text-evari-text">Format</div>
          <div className="text-xs text-evari-dim mt-0.5">
            Pick the type of post. Canvas aspect ratio will adjust to match.
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {formats.map((f) => {
            const active = f.id === format.id;
            return (
              <button
                key={f.id}
                onClick={() => setFormatId(f.id)}
                className={cn(
                  'text-left rounded-lg p-3 transition-colors',
                  active
                    ? 'bg-evari-surfaceSoft shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'bg-evari-surfaceSoft hover:bg-evari-mute/60',
                )}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-evari-dim">
                    <MediaIcon kind={f.media} />
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      active ? 'text-evari-text' : 'text-evari-text',
                    )}
                  >
                    {f.label}
                  </span>
                </div>
                <div className="text-[10px] text-evari-dimmer tabular-nums">
                  {f.aspect}
                  {f.recommended ? ` · ${f.recommended}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Canvas + caption */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,420px)_1fr] gap-5">
        {/* Canvas */}
        <section className="rounded-xl bg-evari-surface p-5 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
              Step 3
            </div>
            <div className="text-sm font-medium text-evari-text">
              Media · {format.aspect}
            </div>
            <div className="text-xs text-evari-dim mt-0.5">
              {format.description}
            </div>
          </div>

          <div
            className="w-full rounded-lg bg-evari-ink flex items-center justify-center text-center p-6"
            style={{ aspectRatio: aspectFor(format.aspect) }}
          >
            <div className="text-evari-dimmer">
              <div className="text-xs">Drop an image or video</div>
              <div className="text-[10px] mt-1">
                {format.recommended ?? format.aspect}
              </div>
              <div className="mt-3">
                <Button variant="outline" size="sm">
                  Choose file
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-evari-dim">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-evari-surfaceSoft">
              <MediaIcon kind={format.media} />
              {format.media}
            </span>
            {format.durationMax && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-evari-surfaceSoft">
                <Clock className="h-3 w-3" />
                up to {format.durationMax}s
              </span>
            )}
            {format.captionMax && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-evari-surfaceSoft">
                <Type className="h-3 w-3" />
                {format.captionMax.toLocaleString()} char caption
              </span>
            )}
          </div>
        </section>

        {/* Caption + AI */}
        <section className="rounded-xl bg-evari-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
                Step 4
              </div>
              <div className="text-sm font-medium text-evari-text">
                Caption · in your voice
              </div>
            </div>
            {aiMock && (
              <Badge variant="warning" className="text-[10px]">
                AI fallback
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <Input
              placeholder="Topic — e.g. Tour at Devil's Punchbowl"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Input
              placeholder="Link (optional) — evari.cc/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="md:w-[240px]"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => void draftCaption()}
            disabled={aiLoading || !topic.trim()}
          >
            {aiLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {caption ? 'Regenerate' : 'Draft in Evari voice'}
          </Button>

          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Your post will appear here. Edit freely."
            className="min-h-[220px] font-sans text-sm"
          />

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-evari-dimmer">
              {caption.length.toLocaleString()} chars
            </span>
            {format.captionMax && (
              <span
                className={cn(
                  captionOver ? 'text-evari-danger' : 'text-evari-dim',
                  'tabular-nums',
                )}
              >
                {captionOver
                  ? `over by ${(caption.length - format.captionMax).toLocaleString()}`
                  : `${(format.captionMax - caption.length).toLocaleString()} left`}
              </span>
            )}
          </div>
        </section>
      </div>

      {/* 4. Schedule + publish */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium">
            Step 5
          </div>
          <div className="text-sm font-medium text-evari-text">
            Schedule
          </div>
          <div className="text-xs text-evari-dim mt-0.5">
            Drops into the calendar and is queued for publish at this time.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FieldLabel label="Date" icon={<CalendarIcon className="h-3 w-3" />}>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full bg-evari-surfaceSoft rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
            />
          </FieldLabel>
          <FieldLabel label="Time" icon={<Clock className="h-3 w-3" />}>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full bg-evari-surfaceSoft rounded-md px-2 py-1.5 text-sm text-evari-text focus:outline-none focus:ring-1 focus:ring-evari-gold/50"
            />
          </FieldLabel>
          <div className="flex items-end justify-end gap-2">
            <Button variant="default" size="sm">
              Save as draft
            </Button>
            <Button variant="primary" size="sm" disabled={!caption.trim()}>
              Schedule post
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FieldLabel({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
