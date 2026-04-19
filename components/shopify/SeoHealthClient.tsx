'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  RotateCcw,
  Wand2,
  ChevronRight,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn, formatNumber } from '@/lib/utils';
import { CHECKS } from '@/lib/seo/checks';
import type { ScanFinding, ScanResult, UndoEntry } from '@/lib/seo/types';

/**
 * SEO Health audit + fix UI.
 *
 * Three panes side-by-side on desktop, stacked on mobile:
 *   1) Scorecard — overall score, scanned counts, "rescan" button
 *   2) Issues by check — grouped, expandable list of findings
 *   3) Detail / fix panel — opens when a finding is selected
 *
 * Safe-auto fixes apply on click (with one confirm). Review fixes load
 * an AI suggestion into a textarea the user can edit before approving.
 */

export function SeoHealthClient({
  initial,
  mock,
  initialFindingId,
}: {
  initial: ScanResult | null;
  mock: boolean;
  initialFindingId?: string;
}) {
  const [scan, setScan] = React.useState<ScanResult | null>(initial);
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialFindingId ?? null);
  const [undoLog, setUndoLog] = React.useState<UndoEntry[]>([]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, ScanFinding[]>();
    if (!scan) return map;
    for (const f of scan.findings) {
      const arr = map.get(f.check.id) ?? [];
      arr.push(f);
      map.set(f.check.id, arr);
    }
    return map;
  }, [scan]);

  React.useEffect(() => {
    void refreshUndo();
  }, []);

  async function refreshUndo() {
    try {
      const res = await fetch('/api/seo/undo');
      const json = (await res.json()) as { entries: UndoEntry[] };
      setUndoLog(json.entries);
    } catch {
      // best-effort
    }
  }

  async function runScan(force = true) {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/seo/scan${force ? '?fresh=1' : ''}`, {
        method: 'GET',
      });
      const json = (await res.json()) as ScanResult & { error?: string };
      if (json.error) throw new Error(json.error);
      setScan(json);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  async function handleApply(findingId: string, value?: string) {
    const res = await fetch('/api/seo/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        findingIds: [findingId],
        values: value !== undefined ? { [findingId]: value } : undefined,
      }),
    });
    const json = (await res.json()) as {
      applied: Array<{ findingId: string; undoId: string; summary: string }>;
      errors: Array<{ findingId: string; error: string }>;
      scan: ScanResult | null;
    };
    if (json.errors?.length > 0) {
      throw new Error(json.errors[0].error);
    }
    if (json.scan) setScan(json.scan);
    setSelectedId(null);
    void refreshUndo();
  }

  async function handleApplyAllSafe() {
    if (!scan) return;
    const safeIds = scan.findings
      .filter((f) => f.check.fix === 'safe-auto')
      .map((f) => f.id);
    if (safeIds.length === 0) return;
    const res = await fetch('/api/seo/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingIds: safeIds }),
    });
    const json = (await res.json()) as {
      applied: unknown[];
      errors: unknown[];
      scan: ScanResult | null;
    };
    if (json.scan) setScan(json.scan);
    void refreshUndo();
  }

  async function handleUndo(undoId: string) {
    await fetch('/api/seo/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ undoId }),
    });
    void refreshUndo();
    void runScan(true);
  }

  const selected = scan?.findings.find((f) => f.id === selectedId) ?? null;
  const safeCount = scan?.findings.filter((f) => f.check.fix === 'safe-auto').length ?? 0;
  const reviewCount = scan?.findings.filter((f) => f.check.fix === 'review').length ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_minmax(0,420px)] gap-4">
      {/* ----- Pane 1: Scorecard ----- */}
      <aside className="space-y-3">
        {mock && (
          <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-3 py-2 text-[11px] text-evari-text">
            Mock data — connect Shopify to scan the live store.
          </div>
        )}
        <Scorecard
          scan={scan}
          scanning={scanning}
          onScan={() => runScan(true)}
          onApplyAllSafe={handleApplyAllSafe}
          safeCount={safeCount}
          reviewCount={reviewCount}
        />
        {scanError && (
          <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-3 py-2 text-xs text-evari-text">
            {scanError}
          </div>
        )}
        <UndoPanel entries={undoLog} onUndo={handleUndo} />
      </aside>

      {/* ----- Pane 2: Issues list ----- */}
      <section className="rounded-xl bg-evari-surface min-h-[400px] overflow-hidden">
        {!scan ? (
          <Empty>
            <p>No scan yet. Hit “Run scan” to audit every product, page and article.</p>
          </Empty>
        ) : scan.findings.length === 0 ? (
          <Empty>
            <Check className="h-8 w-8 mx-auto mb-3 text-evari-success" />
            <p className="text-evari-success font-medium">All clear.</p>
            <p className="text-evari-dim text-sm mt-1">No SEO issues across {totalScanned(scan)} entities.</p>
          </Empty>
        ) : (
          <IssuesList
            grouped={grouped}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </section>

      {/* ----- Pane 3: Detail / fix ----- */}
      <aside className="rounded-xl bg-evari-surface min-h-[400px] flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-evari-dim text-sm italic px-6 text-center">
            Select an issue to see its details and apply a fix.
          </div>
        ) : (
          <FixDetail finding={selected} onApply={handleApply} key={selected.id} />
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function Scorecard({
  scan,
  scanning,
  onScan,
  onApplyAllSafe,
  safeCount,
  reviewCount,
}: {
  scan: ScanResult | null;
  scanning: boolean;
  onScan: () => void;
  onApplyAllSafe: () => void;
  safeCount: number;
  reviewCount: number;
}) {
  const tone =
    scan == null
      ? 'text-evari-dim'
      : scan.score >= 90
      ? 'text-evari-success'
      : scan.score >= 70
      ? 'text-evari-warn'
      : 'text-evari-danger';

  return (
    <div className="rounded-xl bg-evari-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-evari-gold" />
        <h2 className="text-sm font-medium text-evari-text">SEO score</h2>
      </div>
      <div className={cn('text-5xl font-medium leading-none tabular-nums', tone)}>
        {scan ? scan.score : '—'}
      </div>
      <div className="mt-2 text-[11px] text-evari-dim font-mono">
        {scan
          ? `Last scan ${new Date(scan.finishedAt).toLocaleString('en-GB')} · ${formatNumber(
              scan.durationMs / 1000,
              { maximumFractionDigits: 1 },
            )}s`
          : 'never run'}
      </div>
      {scan && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <CountTile label="Products" value={scan.scanned.products} />
          <CountTile label="Pages" value={scan.scanned.pages} />
          <CountTile label="Articles" value={scan.scanned.articles} />
        </dl>
      )}
      {scan && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <CountTile label="Total" value={scan.findings.length} tone="muted" />
          <CountTile label="Safe-auto" value={safeCount} tone="success" />
          <CountTile label="Review" value={reviewCount} tone="warn" />
        </dl>
      )}

      <div className="mt-4 space-y-2">
        <Button variant="primary" size="sm" onClick={onScan} disabled={scanning} className="w-full">
          {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          {scanning ? 'Scanning' : scan ? 'Rescan' : 'Run scan'}
        </Button>
        {safeCount > 0 && (
          <Button variant="default" size="sm" onClick={onApplyAllSafe} className="w-full">
            <Check className="h-3 w-3" /> Apply {safeCount} safe fixes
          </Button>
        )}
      </div>
    </div>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'muted' | 'success' | 'warn';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-evari-success'
      : tone === 'warn'
      ? 'text-evari-warn'
      : 'text-evari-text';
  return (
    <div className="rounded-md bg-evari-carbon py-2">
      <div className={cn('text-base font-medium tabular-nums', valueClass)}>
        {formatNumber(value)}
      </div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mt-0.5">
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issues list
// ---------------------------------------------------------------------------

function IssuesList({
  grouped,
  selectedId,
  onSelect,
}: {
  grouped: Map<string, ScanFinding[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // Sort groups by severity (A, B, C) then by count descending.
  const groups = Array.from(grouped.entries()).sort(([a], [b]) => {
    const ca = CHECKS[a];
    const cb = CHECKS[b];
    const sa = ca?.severity ?? 'C';
    const sb = cb?.severity ?? 'C';
    if (sa !== sb) return sa.localeCompare(sb);
    return (grouped.get(b)?.length ?? 0) - (grouped.get(a)?.length ?? 0);
  });

  return (
    <ul className="divide-y divide-evari-edge/30">
      {groups.map(([checkId, items]) => (
        <CheckGroup
          key={checkId}
          meta={CHECKS[checkId]}
          findings={items}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function CheckGroup({
  meta,
  findings,
  selectedId,
  onSelect,
}: {
  meta: typeof CHECKS[string];
  findings: ScanFinding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const severityColor =
    meta.severity === 'A'
      ? 'bg-evari-danger'
      : meta.severity === 'B'
      ? 'bg-evari-warn'
      : 'bg-sky-400';
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-evari-surfaceSoft/50 transition-colors text-left"
      >
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', severityColor)} />
        <span className="text-sm text-evari-text flex-1 min-w-0 truncate">{meta?.title ?? 'Unknown check'}</span>
        <Badge variant="muted" className="text-[10px] tabular-nums">
          {findings.length}
        </Badge>
        <Badge
          variant={meta.fix === 'safe-auto' ? 'success' : meta.fix === 'review' ? 'warning' : 'muted'}
          className="text-[10px] uppercase"
        >
          {meta.fix.replace('-', ' ')}
        </Badge>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-evari-dim transition-transform',
            open && 'rotate-90',
          )}
        />
      </button>
      {open && (
        <ul className="bg-evari-carbon/40">
          {findings.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                className={cn(
                  'w-full text-left flex items-center gap-3 pl-9 pr-4 py-2 hover:bg-evari-surfaceSoft/40 transition-colors',
                  selectedId === f.id && 'bg-evari-surfaceSoft/60',
                )}
              >
                <Badge variant="outline" className="capitalize text-[10px] shrink-0">
                  {f.entity.type}
                </Badge>
                <span className="text-sm text-evari-text truncate flex-1 min-w-0">
                  {f.entity.title}
                </span>
                <span className="text-[11px] text-evari-dim font-mono truncate max-w-[40%]">
                  {f.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Fix detail panel
// ---------------------------------------------------------------------------

function FixDetail({
  finding,
  onApply,
}: {
  finding: ScanFinding;
  onApply: (findingId: string, value?: string) => Promise<void>;
}) {
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isReview = finding.check.fix === 'review';
  const isHandle = finding.check.id.startsWith('handle-');

  // Pre-load suggestion for review fixes (and handle fixes which have a
  // pre-computed safe transformation).
  React.useEffect(() => {
    if (!isReview && !isHandle) return;
    setLoading(true);
    setError(null);
    fetch(`/api/seo/fix?findingId=${encodeURIComponent(finding.id)}`)
      .then((r) => r.json())
      .then((j: { suggestion?: { value: string }; error?: string }) => {
        if (j.error) throw new Error(j.error);
        setSuggestion(j.suggestion?.value ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [finding.id, isReview, isHandle]);

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await onApply(
        finding.id,
        isReview || isHandle ? suggestion ?? '' : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="px-5 py-4 border-b border-evari-edge/40">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={finding.check.severity === 'A' ? 'critical' : finding.check.severity === 'B' ? 'warning' : 'muted'} className="text-[10px]">
            {finding.check.severity === 'A' ? 'critical' : finding.check.severity === 'B' ? 'warn' : 'minor'}
          </Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{finding.entity.type}</Badge>
        </div>
        <h2 className="text-sm font-medium text-evari-text">{finding.check.title}</h2>
        <p className="text-xs text-evari-dim mt-1">{finding.check.description}</p>
      </header>

      <div className="px-5 py-4 flex-1 overflow-y-auto space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
            Entity
          </div>
          <div className="rounded-md bg-evari-carbon p-3">
            <div className="text-sm text-evari-text">{finding.entity.title}</div>
            <a
              href={finding.entity.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-evari-gold hover:text-evari-gold/80 inline-flex items-center gap-1 mt-0.5 font-mono"
            >
              {finding.entity.url}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
            Detail
          </div>
          <p className="text-sm text-evari-text">{finding.detail}</p>
        </div>

        {(isReview || isHandle) && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
              Suggested value
            </div>
            {loading ? (
              <div className="text-xs text-evari-dim italic flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Asking Evari…
              </div>
            ) : finding.check.id.startsWith('handle-') ? (
              <Input
                value={suggestion ?? ''}
                onChange={(e) => setSuggestion(e.target.value)}
                className="font-mono"
              />
            ) : finding.check.id.startsWith('meta-') ? (
              <Textarea
                rows={4}
                value={suggestion ?? ''}
                onChange={(e) => setSuggestion(e.target.value)}
              />
            ) : (
              <Input
                value={suggestion ?? ''}
                onChange={(e) => setSuggestion(e.target.value)}
              />
            )}
          </div>
        )}

        {!isReview && !isHandle && (
          <div className="rounded-md bg-evari-surface p-3 text-xs text-evari-dim">
            <Wand2 className="inline h-3 w-3 mr-1 text-evari-gold" />
            Safe-auto fix — Evari will write the value directly. You can roll it back
            from the undo log if needed.
          </div>
        )}

        {error && (
          <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-3 py-2 text-xs text-evari-text flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-evari-danger" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <footer className="px-5 py-3 border-t border-evari-edge/40 flex items-center justify-end gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={apply}
          disabled={applying || (isReview && !suggestion)}
        >
          {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {applying ? 'Applying' : isReview ? 'Approve + apply' : 'Apply fix'}
        </Button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Undo log
// ---------------------------------------------------------------------------

function UndoPanel({
  entries,
  onUndo,
}: {
  entries: UndoEntry[];
  onUndo: (undoId: string) => Promise<void>;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl bg-evari-surface p-4">
      <h3 className="text-sm font-medium text-evari-text mb-3">Recent fixes</h3>
      <ul className="space-y-2">
        {entries.slice(0, 6).map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-xs">
            <Check className="h-3 w-3 mt-0.5 text-evari-success shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-evari-text truncate">{e.summary}</div>
              <div className="text-evari-dim font-mono text-[10px]">
                {new Date(e.appliedAt).toLocaleTimeString('en-GB')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUndo(e.id)}
              className="text-[10px] uppercase tracking-[0.06em] text-evari-dim hover:text-evari-text"
            >
              undo
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[400px] text-evari-dim text-center px-6">
      <div>{children}</div>
    </div>
  );
}

function totalScanned(scan: ScanResult): number {
  return scan.scanned.products + scan.scanned.pages + scan.scanned.articles;
}
