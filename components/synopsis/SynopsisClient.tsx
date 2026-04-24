'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Loader2, Lightbulb, Wrench, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Synopsis, SynopsisIssue } from '@/lib/synopsis/analyse';

/**
 * SynopsisClient — two sections.
 *
 *   1. Top summary card: bullet list of the current problems. Pure
 *      read-only text.
 *
 *   2. Fix list: one row per issue. Auto-fixable rows get a gold
 *      "Fix" button that fires /api/synopsis/fix and optimistically
 *      drops the row on success. Manual rows show the recommendation
 *      below the title.
 */
export function SynopsisClient({ synopsis }: { synopsis: Synopsis }) {
  const [issues, setIssues] = useState<SynopsisIssue[]>(synopsis.issues);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fixed, setFixed] = useState<Record<string, { title?: string; description?: string }>>({});

  async function runFix(issue: SynopsisIssue) {
    if (!issue.pageId || issue.kind === 'manual') return;
    if (busy.has(issue.id)) return;
    setBusy((prev) => {
      const next = new Set(prev);
      next.add(issue.id);
      return next;
    });
    setErrors((prev) => {
      const n = { ...prev };
      delete n[issue.id];
      return n;
    });
    try {
      const res = await fetch('/api/synopsis/fix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: issue.kind,
          pageId: issue.pageId,
          pageType: issue.pageType,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        title?: string;
        description?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'HTTP ' + res.status);
      }
      setFixed((prev) => ({
        ...prev,
        [issue.id]: { title: data.title, description: data.description },
      }));
      // Drop the row after a short beat so the user sees the success
      // state first.
      setTimeout(() => {
        setIssues((prev) => prev.filter((x) => x.id !== issue.id));
      }, 1800);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [issue.id]: err instanceof Error ? err.message : 'Fix failed',
      }));
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
    }
  }

  const autoFixable = issues.filter((i) => i.kind !== 'manual');
  const manual = issues.filter((i) => i.kind === 'manual');

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1400px]">
      {/* Section 1: why we're underperforming */}
      <section className="rounded-xl bg-evari-surface p-5 space-y-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
          <Lightbulb className="h-3.5 w-3.5" />
          Why the site is underperforming
        </div>
        <ul className="space-y-2">
          {synopsis.summary.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed text-evari-text">
              <span className="text-evari-dimmer mt-2 shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="pt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
          <Stat label="Pages scanned" value={synopsis.totals.pages} />
          <Stat label="Missing titles" value={synopsis.totals.missingMetaTitle} tone={synopsis.totals.missingMetaTitle > 0 ? 'danger' : 'ok'} />
          <Stat label="Missing descriptions" value={synopsis.totals.missingMetaDesc} tone={synopsis.totals.missingMetaDesc > 0 ? 'warn' : 'ok'} />
          <Stat label="Critical findings" value={synopsis.totals.criticalFindings} tone={synopsis.totals.criticalFindings > 0 ? 'danger' : 'ok'} />
        </div>
      </section>

      {/* Section 2: fix list */}
      <section className="rounded-xl bg-evari-surface overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-evari-line/30">
          <div className="flex items-center gap-2 text-[13px] font-medium text-evari-text">
            <Wrench className="h-3.5 w-3.5 text-evari-dimmer" />
            Fix list
          </div>
          <div className="text-[11px] text-evari-dimmer">
            {autoFixable.length} auto-fixable · {manual.length} manual
          </div>
        </header>
        {issues.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-evari-dim">
            <Check className="h-5 w-5 mx-auto text-evari-success mb-2" />
            Nothing to fix. Enjoy.
          </div>
        ) : (
          <ul className="divide-y divide-evari-line/30">
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                busy={busy.has(issue.id)}
                fixedCopy={fixed[issue.id]}
                error={errors[issue.id]}
                onFix={() => void runFix(issue)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IssueRow({
  issue,
  busy,
  fixedCopy,
  error,
  onFix,
}: {
  issue: SynopsisIssue;
  busy: boolean;
  fixedCopy?: { title?: string; description?: string };
  error?: string;
  onFix: () => void;
}) {
  const autoFixable = issue.kind !== 'manual';
  const sevColor =
    issue.severity === 'critical'
      ? 'bg-evari-danger/15 text-evari-danger'
      : issue.severity === 'warning'
        ? 'bg-evari-warn/15 text-evari-warn'
        : 'bg-evari-surfaceSoft text-evari-dim';
  return (
    <li className="px-5 py-4 flex items-start gap-4">
      <div className="pt-0.5 shrink-0">
        {issue.severity === 'critical' ? (
          <XCircle className="h-4 w-4 text-evari-danger" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-evari-warn" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-evari-text">
            {issue.title}
          </span>
          <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold', sevColor)}>
            {issue.severity}
          </span>
          {issue.pagePath ? (
            <span className="text-[11px] font-mono text-evari-dim truncate max-w-[360px]">
              {issue.pagePath}
            </span>
          ) : null}
        </div>
        <div className="text-[12px] text-evari-dim mt-1 leading-relaxed">
          {issue.description}
        </div>
        {fixedCopy ? (
          <div className="mt-2 rounded-md bg-evari-success/10 border border-evari-success/30 p-2 text-[12px] text-evari-success space-y-1">
            <div className="font-medium inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              Fixed.
            </div>
            {fixedCopy.title ? (
              <div><span className="text-evari-dimmer">Title:</span> {fixedCopy.title}</div>
            ) : null}
            {fixedCopy.description ? (
              <div><span className="text-evari-dimmer">Description:</span> {fixedCopy.description}</div>
            ) : null}
          </div>
        ) : null}
        {issue.kind === 'manual' && issue.manualGuide ? (
          <div className="mt-2 rounded-md bg-evari-surfaceSoft/60 p-2 text-[12px] text-evari-dim leading-relaxed">
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium mb-1">
              How to fix
            </div>
            {issue.manualGuide}
          </div>
        ) : null}
        {error ? (
          <div className="mt-2 text-[11px] text-evari-danger">{error}</div>
        ) : null}
      </div>
      <div className="shrink-0">
        {autoFixable && !fixedCopy ? (
          <Button
            size="sm"
            variant="primary"
            onClick={onFix}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
            {busy ? 'Fixing…' : 'Fix'}
          </Button>
        ) : !autoFixable ? (
          <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
            Manual
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
}) {
  const color =
    tone === 'danger'
      ? 'text-evari-danger'
      : tone === 'warn'
        ? 'text-evari-warn'
        : tone === 'ok'
          ? 'text-evari-success'
          : 'text-evari-text';
  return (
    <div className="rounded-md border border-evari-line/40 bg-evari-surfaceSoft/30 p-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </div>
      <div className={cn('text-lg font-semibold font-mono tabular-nums leading-tight mt-0.5', color)}>
        {value}
      </div>
    </div>
  );
}
