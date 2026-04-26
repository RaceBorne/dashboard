'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Copy, Loader2, RefreshCw, Trash2, X, AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { DomainCheckStatus, DomainStatus } from '@/lib/marketing/types';

interface Props {
  initialStatus: DomainStatus;
}

const STATUS_BADGE: Record<DomainCheckStatus, string> = {
  verified: 'bg-evari-success/15 text-evari-success',
  mismatch: 'bg-evari-danger/15 text-evari-danger',
  missing:  'bg-orange-500/15 text-orange-400',
  error:    'bg-evari-danger/15 text-evari-danger',
  pending:  'bg-evari-surfaceSoft text-evari-dim',
};

const STATUS_ICON: Record<DomainCheckStatus, JSX.Element> = {
  verified: <Check className="h-3.5 w-3.5" />,
  mismatch: <X className="h-3.5 w-3.5" />,
  missing:  <AlertTriangle className="h-3.5 w-3.5" />,
  error:    <AlertTriangle className="h-3.5 w-3.5" />,
  pending:  <Loader2 className="h-3.5 w-3.5" />,
};

const KIND_LABEL: Record<'spf' | 'dkim' | 'dmarc', string> = {
  spf:   'SPF',
  dkim:  'DKIM',
  dmarc: 'DMARC',
};

export function DomainDetailClient({ initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleVerify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/domains/${status.domain.id}/verify`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Verify failed');
      setStatus(data.status as DomainStatus);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${status.domain.domainName}? This will also remove it from Postmark.`)) return;
    const res = await fetch(`/api/marketing/domains/${status.domain.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) router.push('/email/domains');
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3 flex items-center gap-3">
        <Link href="/email/domains" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text">
          <ChevronLeft className="h-3.5 w-3.5" />
          All domains
        </Link>
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium',
            status.fullyVerified ? 'bg-evari-success/15 text-evari-success' : 'bg-orange-500/15 text-orange-400',
          )}
        >
          {status.fullyVerified ? 'fully verified' : 'pending'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-50 hover:brightness-105 transition duration-500 ease-in-out"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {busy ? 'Checking…' : 'Re-check DNS'}
          </button>
        </div>
      </div>

      {error ? <p className="mb-2 text-xs text-evari-danger">{error}</p> : null}
      {status.domain.lastCheckedAt ? (
        <p className="mb-3 text-[11px] text-evari-dimmer font-mono tabular-nums">
          Last checked {new Date(status.domain.lastCheckedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
        </p>
      ) : null}

      <div className="space-y-3">
        {status.checks.map((c) => {
          const copyKey = `${c.kind}-record`;
          const hostKey = `${c.kind}-host`;
          return (
            <section
              key={c.kind}
              className="rounded-md bg-evari-surface border border-evari-edge/30 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-evari-text inline-flex items-center gap-2">
                  {KIND_LABEL[c.kind]}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium',
                      STATUS_BADGE[c.status],
                    )}
                  >
                    {STATUS_ICON[c.status]}
                    {c.status}
                  </span>
                </h2>
                {c.note ? <span className="text-[11px] text-evari-dimmer">{c.note}</span> : null}
              </div>

              <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-start text-[12px]">
                <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer pt-1.5">Host</span>
                <code className="px-2 py-1 rounded bg-evari-ink font-mono text-evari-text break-all">{c.host || '—'}</code>
                <button
                  type="button"
                  onClick={() => copy(c.host, hostKey)}
                  disabled={!c.host}
                  className="px-2 py-1 rounded-md text-[10px] text-evari-dim hover:text-evari-text disabled:opacity-30 inline-flex items-center gap-1"
                >
                  {copiedKey === hostKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedKey === hostKey ? 'Copied' : 'Copy'}
                </button>

                <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer pt-1.5">Value</span>
                <code className="px-2 py-1 rounded bg-evari-ink font-mono text-evari-text break-all whitespace-pre-wrap">
                  {c.expected || <span className="italic text-evari-dimmer">— not set —</span>}
                </code>
                <button
                  type="button"
                  onClick={() => copy(c.expected, copyKey)}
                  disabled={!c.expected}
                  className="px-2 py-1 rounded-md text-[10px] text-evari-dim hover:text-evari-text disabled:opacity-30 inline-flex items-center gap-1"
                >
                  {copiedKey === copyKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedKey === copyKey ? 'Copied' : 'Copy'}
                </button>
              </div>

              {c.found.length > 0 && c.status !== 'verified' ? (
                <details className="mt-2">
                  <summary className="text-[11px] text-evari-dimmer cursor-pointer hover:text-evari-text">
                    {c.found.length} TXT record{c.found.length === 1 ? '' : 's'} actually found at host
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {c.found.map((f, i) => (
                      <li key={i} className="px-2 py-1 rounded bg-evari-ink font-mono text-[11px] text-evari-dim break-all">
                        {f}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
