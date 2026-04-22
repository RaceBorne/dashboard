'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Globe,
  Linkedin,
  Facebook,
  Instagram,
  MapPin,
  Phone,
  Users2,
  Calendar,
  Sparkles,
  Mail,
  Check,
  X,
  ExternalLink,
  Loader2,
  RefreshCw,
  BadgeCheck,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoveredCompany, DiscoverEmail, DiscoverSignal } from '@/lib/types';

/**
 * Shared right-column "company detail" panel. Used by /discover as the third
 * column; also reused as a slide-out from Prospects and Leads rows.
 *
 * Two modes:
 *   - `mode="inline"`   — renders flush in a grid cell with no chrome.
 *   - `mode="overlay"`  — fixed-position slide-in from the right with backdrop.
 *
 * Email picker is optional; Discover turns it on so operators can choose which
 * addresses become prospects.
 */
interface Props {
  domain: string;
  company: DiscoveredCompany | null;
  /** Set while an enrichment SSE stream is running. */
  loading?: boolean;
  /** Optional live log from the enrichment stream. */
  log?: string[];
  /** When the panel renders standalone (not inside a grid). */
  mode?: 'inline' | 'overlay';
  onClose?: () => void;
  /** Trigger an enrichment run for this domain. */
  onEnrich?: (opts: { force?: boolean }) => void;
  /** Email picker. When omitted the emails are just listed. */
  picker?: {
    selected: Set<string>;
    onToggle: (email: string) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
  };
  /** Footer CTAs — rendered stacked at the bottom. */
  actions?: React.ReactNode;
}

export function CompanyPanel({
  domain,
  company,
  loading = false,
  log = [],
  mode = 'inline',
  onClose,
  onEnrich,
  picker,
  actions,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const emails = company?.emails ?? [];
  const sortedEmails = useMemo(() => {
    const bucketOrder: Record<string, number> = {
      personal: 0,
      sales: 1,
      media: 2,
      support: 3,
      generic: 4,
    };
    return [...emails].sort((a, b) => {
      const ba = bucketOrder[a.bucket ?? 'generic'] ?? 99;
      const bb = bucketOrder[b.bucket ?? 'generic'] ?? 99;
      if (ba !== bb) return ba - bb;
      return a.address.localeCompare(b.address);
    });
  }, [emails]);

  const body = (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-evari-line/40 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-evari-surfaceSoft flex items-center justify-center overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company?.logoUrl ?? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
            alt=""
            className={company?.logoUrl ? 'h-full w-full object-cover' : 'h-5 w-5 object-contain'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-evari-text truncate">
              {company?.name ?? domain}
            </h3>
            {company?.enrichedAt ? (
              <BadgeCheck className="h-3.5 w-3.5 text-evari-success shrink-0" />
            ) : null}
          </div>
          <a
            href={'https://' + domain}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-evari-dimmer hover:text-evari-text inline-flex items-center gap-1 mt-0.5"
          >
            <Globe className="h-3 w-3" />
            {domain}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-1">
          {onEnrich ? (
            <button
              type="button"
              onClick={() => onEnrich({ force: true })}
              disabled={loading}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft disabled:opacity-40"
              title="Re-enrich"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto">
        {!company && !loading ? (
          <div className="p-5">
            <div className="rounded-md border border-dashed border-evari-line/60 p-4 text-[12px] text-evari-dim">
              Nothing cached for {domain} yet.
              {onEnrich ? (
                <button
                  type="button"
                  onClick={() => onEnrich({ force: false })}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-evari-accent px-2.5 py-1 text-[11px] font-medium text-evari-ink hover:bg-evari-accent/90"
                >
                  <Sparkles className="h-3 w-3" />
                  Enrich now
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {company ? (
          <div className="divide-y divide-evari-line/40">
            {/* Quick facts */}
            <div className="px-5 py-4 space-y-2">
              {company.description ? (
                <p className="text-[12px] text-evari-dim leading-relaxed">
                  {company.description}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-evari-dim">
                {company.category ? (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3 w-3 text-evari-dimmer" />
                    {company.category}
                  </span>
                ) : null}
                {company.employeeCount || company.employeeBand ? (
                  <span className="inline-flex items-center gap-1">
                    <Users2 className="h-3 w-3 text-evari-dimmer" />
                    {company.employeeCount
                      ? company.employeeCount.toLocaleString() + ' employees'
                      : company.employeeBand + ' employees'}
                  </span>
                ) : null}
                {company.foundedYear ? (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-evari-dimmer" />
                    Founded {company.foundedYear}
                  </span>
                ) : null}
                {company.hq?.full ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-evari-dimmer" />
                    {company.hq.full}
                  </span>
                ) : null}
                {company.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3 text-evari-dimmer" />
                    {company.phone}
                  </span>
                ) : null}
              </div>
              {company.socials ? (
                <div className="flex gap-1.5 pt-1">
                  {socialLinks(company.socials).map((s) => (
                    <a
                      key={s.href}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-evari-dimmer hover:text-evari-text hover:bg-evari-surfaceSoft"
                      title={s.label}
                    >
                      {s.icon}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Emails */}
            {sortedEmails.length > 0 ? (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-evari-text font-medium">
                    Email addresses · {sortedEmails.length}
                  </div>
                  {picker ? (
                    <div className="flex gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={picker.onSelectAll}
                        className="text-evari-dimmer hover:text-evari-text"
                      >
                        All
                      </button>
                      <span className="text-evari-dimmer/60">·</span>
                      <button
                        type="button"
                        onClick={picker.onSelectNone}
                        className="text-evari-dimmer hover:text-evari-text"
                      >
                        None
                      </button>
                    </div>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {sortedEmails.map((e) => (
                    <EmailRow
                      key={e.address}
                      email={e}
                      picked={picker?.selected.has(e.address)}
                      onToggle={picker ? () => picker.onToggle(e.address) : undefined}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Signals */}
            {company.signals && company.signals.length > 0 ? (
              <div className="px-5 py-4">
                <div className="text-sm text-evari-text font-medium mb-2">
                  Signals
                </div>
                <ul className="space-y-2">
                  {company.signals.map((s, i) => (
                    <SignalRow key={s.title + i} signal={s} />
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Technologies */}
            {company.technologies && company.technologies.length > 0 ? (
              <div className="px-5 py-4">
                <div className="text-sm text-evari-text font-medium mb-2">
                  Technologies
                </div>
                <div className="flex flex-wrap gap-1">
                  {company.technologies.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full bg-evari-surfaceSoft px-2 py-0.5 text-[10px] text-evari-dim"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Keywords */}
            {company.keywords && company.keywords.length > 0 ? (
              <div className="px-5 py-4">
                <div className="text-sm text-evari-text font-medium mb-2">
                  Keywords
                </div>
                <div className="flex flex-wrap gap-1">
                  {company.keywords.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center rounded-full border border-evari-line/60 px-2 py-0.5 text-[10px] text-evari-dim"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Sources */}
            {company.sources && company.sources.length > 0 ? (
              <div className="px-5 py-4">
                <div className="text-sm text-evari-text font-medium mb-2">
                  Sources
                </div>
                <ul className="space-y-1">
                  {company.sources.map((u) => (
                    <li key={u} className="text-[11px] truncate">
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{u}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Live log */}
        {log.length > 0 ? (
          <div className="px-5 py-3 border-t border-evari-line/40">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              className="text-sm text-evari-text font-medium hover:text-evari-text"
            >
              {logOpen ? 'Hide log' : 'Show log'} · {log.length} line{log.length === 1 ? '' : 's'}
            </button>
            {logOpen ? (
              <div
                ref={logRef}
                className="mt-2 max-h-40 overflow-y-auto rounded-md bg-evari-surface p-2 font-mono text-[10px] text-evari-dim whitespace-pre-wrap"
              >
                {log.join('\n')}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      {actions ? (
        <div className="border-t border-evari-line/40 px-5 py-3 bg-evari-surface/60">
          {actions}
        </div>
      ) : null}
    </div>
  );

  if (mode === 'overlay') {
    return (
      <div className="fixed inset-0 z-40">
        <div
          className="absolute inset-0 bg-evari-ink/60"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="absolute inset-y-0 right-0 w-full max-w-[520px] bg-evari-surface border-l border-evari-line/40 shadow-2xl">
          {body}
        </div>
      </div>
    );
  }
  return <div className="h-full">{body}</div>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmailRow({
  email,
  picked,
  onToggle,
}: {
  email: DiscoverEmail;
  picked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <li
      className={cn(
        'rounded-md border border-evari-line/40 px-2.5 py-1.5',
        onToggle ? 'cursor-pointer hover:bg-evari-surfaceSoft' : '',
        picked ? 'bg-evari-accent/10 border-evari-accent/60' : '',
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        {onToggle ? (
          <span
            className={cn(
              'h-3.5 w-3.5 shrink-0 rounded-[3px] border flex items-center justify-center',
              picked ? 'bg-evari-accent border-evari-accent' : 'border-evari-dimmer',
            )}
          >
            {picked ? <Check className="h-2.5 w-2.5 text-evari-ink" /> : null}
          </span>
        ) : (
          <Mail className="h-3 w-3 text-evari-dimmer shrink-0" />
        )}
        <span className="text-[12px] text-evari-text font-mono truncate flex-1">
          {email.address}
        </span>
        {email.bucket ? (
          <span className="text-[9px] uppercase tracking-[0.12em] text-evari-dimmer">
            {email.bucket}
          </span>
        ) : null}
      </div>
      {email.name || email.jobTitle ? (
        <div className="pl-5.5 mt-0.5 text-[11px] text-evari-dim">
          {email.name ?? ''}
          {email.name && email.jobTitle ? ' · ' : ''}
          {email.jobTitle ?? ''}
        </div>
      ) : null}
      {email.source || email.confidence ? (
        <div className="pl-5.5 mt-0.5 flex gap-1.5 text-[9px]">
          {email.source ? (
            <span className="text-evari-dimmer uppercase tracking-[0.12em]">
              {email.source}
            </span>
          ) : null}
          {email.confidence ? (
            <span
              className={cn(
                'uppercase tracking-[0.12em]',
                email.confidence === 'high'
                  ? 'text-evari-success'
                  : email.confidence === 'medium'
                    ? 'text-evari-dim'
                    : 'text-evari-dimmer',
              )}
            >
              {email.confidence}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function SignalRow({ signal }: { signal: DiscoverSignal }) {
  const body = (
    <div className="text-[11px] text-evari-text">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-evari-surfaceSoft px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-evari-dim">
          {signal.type}
        </span>
        {signal.date ? (
          <span className="text-[10px] text-evari-dimmer">{signal.date}</span>
        ) : null}
      </div>
      <div className="mt-0.5 leading-snug">{signal.title}</div>
      {signal.summary ? (
        <div className="mt-0.5 text-[10px] text-evari-dim leading-snug">{signal.summary}</div>
      ) : null}
    </div>
  );
  return signal.url ? (
    <li>
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-evari-surfaceSoft rounded-md -mx-1 px-1 py-0.5"
      >
        {body}
      </a>
    </li>
  ) : (
    <li>{body}</li>
  );
}

function socialLinks(s: NonNullable<DiscoveredCompany['socials']>): Array<{
  href: string;
  label: string;
  icon: React.ReactNode;
}> {
  const out: Array<{ href: string; label: string; icon: React.ReactNode }> = [];
  if (s.linkedin) out.push({ href: s.linkedin, label: 'LinkedIn', icon: <Linkedin className="h-3.5 w-3.5" /> });
  if (s.facebook) out.push({ href: s.facebook, label: 'Facebook', icon: <Facebook className="h-3.5 w-3.5" /> });
  if (s.instagram) out.push({ href: s.instagram, label: 'Instagram', icon: <Instagram className="h-3.5 w-3.5" /> });
  if (s.twitter) out.push({ href: s.twitter, label: 'Twitter / X', icon: <Globe className="h-3.5 w-3.5" /> });
  if (s.youtube) out.push({ href: s.youtube, label: 'YouTube', icon: <Globe className="h-3.5 w-3.5" /> });
  if (s.tiktok) out.push({ href: s.tiktok, label: 'TikTok', icon: <Globe className="h-3.5 w-3.5" /> });
  return out;
}
