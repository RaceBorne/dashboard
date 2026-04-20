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
import { SeoHealthHistoryPanel } from './SeoHealthHistoryPanel';

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
  const [applyingSafe, setApplyingSafe] = React.useState(false);
  const [applyingGroup, setApplyingGroup] = React.useState<string | null>(null);
  // Bulk review-apply progress: null when idle, else { current, total }.
  const [applyingReview, setApplyingReview] = React.useState<
    { current: number; total: number } | null
  >(null);
  // Set this to request a graceful stop of the in-flight bulk review run.
  const cancelBulkReviewRef = React.useRef(false);
  const [applyStatus, setApplyStatus] = React.useState<
    { appliedCount: number; errorCount: number; firstError: string | null } | null
  >(null);
  // Pane 2 tab — 'issues' shows the findings list + apply bar (the
  // primary work-surface); 'history' shows score-over-time + event
  // timeline. Default to 'history' when there's nothing to action so
  // the empty state is useful rather than a blank "all clear".
  const [pane2Tab, setPane2Tab] = React.useState<'issues' | 'history'>(
    initial && initial.findings.length === 0 ? 'history' : 'issues',
  );

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

  /**
   * Low-level POST /api/seo/fix for a single finding. Returns the parsed
   * body plus the HTTP status so callers can distinguish "cache lost"
   * (409) from every other failure and react accordingly.
   */
  async function postFix(findingId: string, value?: string) {
    const res = await fetch('/api/seo/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        findingIds: [findingId],
        values: value !== undefined ? { [findingId]: value } : undefined,
      }),
    });
    // Defensive parse — an HTML error page (timeout, runtime crash) would
    // crash JSON.parse and leave the UI looking dead.
    const json = (await res.json().catch(() => ({}))) as {
      applied?: Array<{ findingId: string; undoId: string; summary: string }>;
      errors?: Array<{ findingId: string; error: string }>;
      scan?: ScanResult | null;
      error?: string;
    };
    return { ok: res.ok, status: res.status, json };
  }

  async function handleApply(findingId: string, value?: string) {
    // eslint-disable-next-line no-console
    console.log('[seo/apply] POST /api/seo/fix for', findingId);
    let res = await postFix(findingId, value);

    // Self-heal against dev-server restarts: the scan cache lives in a
    // module-level variable on the server, so any HMR or restart wipes it
    // and subsequent applies return 409 "No scan in cache". Instead of
    // asking Craig to click Rescan + retry, re-run the scan silently and
    // try once more. If the finding still exists in the fresh scan it'll
    // be applied; if it was already fixed by something else it'll return
    // "Finding not in current scan" which we surface as a real error.
    if (res.status === 409) {
      // eslint-disable-next-line no-console
      console.warn('[seo/apply] scan cache lost on server — auto-rescanning and retrying');
      const scanRes = await fetch('/api/seo/scan?fresh=1');
      const scanJson = (await scanRes.json().catch(() => ({}))) as
        & Partial<ScanResult>
        & { error?: string };
      if (!scanRes.ok || scanJson.error) {
        throw new Error(
          `Apply failed: the scan cache was lost and re-scanning also failed (${
            scanJson.error ?? `HTTP ${scanRes.status}`
          }).`,
        );
      }
      if (scanJson.findings) setScan(scanJson as ScanResult);
      res = await postFix(findingId, value);
    }

    if (!res.ok) {
      throw new Error(res.json.error ?? `Apply failed (HTTP ${res.status})`);
    }
    if (res.json.errors && res.json.errors.length > 0) {
      throw new Error(res.json.errors[0].error);
    }
    if (res.json.scan) setScan(res.json.scan);
    setSelectedId(null);
    void refreshUndo();
  }

  /** Same 409 + rescan + retry behaviour as single-item `postFix`. */
  async function postBulkFix(findingIds: string[]) {
    type FixBatchJson = {
      applied?: Array<{ findingId: string; summary: string }>;
      errors?: Array<{ findingId: string; error: string }>;
      scan?: ScanResult | null;
      error?: string;
    };
    const body = JSON.stringify({ findingIds });
    let res = await fetch('/api/seo/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status === 409) {
      const scanRes = await fetch('/api/seo/scan?fresh=1');
      const scanJson = (await scanRes.json().catch(() => ({}))) as Partial<ScanResult> & {
        error?: string;
      };
      if (!scanRes.ok || scanJson.error) {
        const errJson = (await res.json().catch(() => ({}))) as FixBatchJson;
        return { res, json: errJson };
      }
      if (scanJson.findings !== undefined) setScan(scanJson as ScanResult);
      res = await fetch('/api/seo/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    }
    const json = (await res.json()) as FixBatchJson;
    return { res, json };
  }

  async function handleApplyAllSafe() {
    if (!scan) return;
    const safeIds = scan.findings
      .filter((f) => f.check.fix === 'safe-auto')
      .map((f) => f.id);
    if (safeIds.length === 0) return;
    setApplyingSafe(true);
    setApplyStatus(null);
    try {
      const { res, json } = await postBulkFix(safeIds);
      if (!res.ok) {
        setApplyStatus({
          appliedCount: 0,
          errorCount: safeIds.length,
          firstError: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      if (json.scan) setScan(json.scan);
      setApplyStatus({
        appliedCount: json.applied?.length ?? 0,
        errorCount: json.errors?.length ?? 0,
        firstError: json.errors?.[0]?.error ?? null,
      });
      void refreshUndo();
    } catch (err) {
      setApplyStatus({
        appliedCount: 0,
        errorCount: safeIds.length,
        firstError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setApplyingSafe(false);
    }
  }

  /**
   * Apply every safe-auto finding within a single check (e.g. all
   * "Missing brand suffix" fixes in one click). Same mechanics as
   * handleApplyAllSafe but filtered to one checkId.
   */
  async function handleApplyGroup(checkId: string) {
    if (!scan) return;
    const ids = scan.findings
      .filter((f) => f.check.id === checkId && f.check.fix === 'safe-auto')
      .map((f) => f.id);
    if (ids.length === 0) return;
    setApplyingGroup(checkId);
    setApplyStatus(null);
    try {
      const { res, json } = await postBulkFix(ids);
      if (!res.ok) {
        setApplyStatus({
          appliedCount: 0,
          errorCount: ids.length,
          firstError: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      if (json.scan) setScan(json.scan);
      setApplyStatus({
        appliedCount: json.applied?.length ?? 0,
        errorCount: json.errors?.length ?? 0,
        firstError: json.errors?.[0]?.error ?? null,
      });
      void refreshUndo();
    } catch (err) {
      setApplyStatus({
        appliedCount: 0,
        errorCount: ids.length,
        firstError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setApplyingGroup(null);
    }
  }

  /**
   * Bulk approve + apply every review-path finding.
   *
   * Behaves like a fast playback of the single-click flow: for each
   * finding we open the detail pane (so you can see which one is being
   * worked on), fetch its AI suggestion, apply it, update the scan
   * *immediately* so the finding visibly drops off the list, then move
   * to the next one. Runs sequentially to stay under the 50K TPM rate
   * limit on Tier 1 Anthropic accounts. Cancellable mid-run.
   */
  async function handleApproveAllReview() {
    if (!scan) return;
    const reviewFindings = scan.findings.filter((f) => f.check.fix === 'review');
    if (reviewFindings.length === 0) return;
    cancelBulkReviewRef.current = false;
    setApplyStatus(null);
    setApplyingReview({ current: 0, total: reviewFindings.length });

    let applied = 0;
    let errored = 0;
    let firstError: string | null = null;

    const fetchJsonWithRetry = async (
      url: string,
      init?: RequestInit,
    ): Promise<{ ok: boolean; status: number; json: any }> => {
      let attempt = 0;
      while (true) {
        const r = await fetch(url, init);
        const j = await r.json().catch(() => ({}));
        if (r.ok) return { ok: true, status: r.status, json: j };
        if ((r.status === 429 || r.status >= 500) && attempt === 0) {
          attempt += 1;
          await new Promise((res) => setTimeout(res, 2000));
          continue;
        }
        return { ok: false, status: r.status, json: j };
      }
    };

    for (let i = 0; i < reviewFindings.length; i += 1) {
      if (cancelBulkReviewRef.current) break;
      const f = reviewFindings[i];

      // Open the detail pane on this finding so the user can see what
      // we're working on right now — mirrors the single-click flow.
      setSelectedId(f.id);
      setApplyingReview({ current: i, total: reviewFindings.length });

      try {
        // 1. Get the AI-suggested value.
        const sug = await fetchJsonWithRetry(
          `/api/seo/fix?findingId=${encodeURIComponent(f.id)}`,
        );
        if (!sug.ok) {
          throw new Error(
            sug.json?.error ?? `Suggestion failed (HTTP ${sug.status})`,
          );
        }
        const value = sug.json?.suggestion?.value;
        if (typeof value !== 'string' || value.length === 0) {
          throw new Error('Empty suggestion returned from AI');
        }

        // 2. Apply it.
        const ap = await fetchJsonWithRetry('/api/seo/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findingIds: [f.id], values: { [f.id]: value } }),
        });
        if (!ap.ok) {
          throw new Error(ap.json?.error ?? `Apply failed (HTTP ${ap.status})`);
        }
        if (ap.json?.errors?.length > 0) {
          throw new Error(ap.json.errors[0].error);
        }
        applied += 1;

        // Update the scan immediately so this finding drops off the
        // list the moment it's saved. Without this the list stays
        // frozen and the user has no feedback that progress is being
        // made.
        if (ap.json?.scan) setScan(ap.json.scan);

        // Refresh the undo log each step so the user can see new
        // entries accumulating as fixes land.
        void refreshUndo();

        // Small pause to stay under 50K TPM rate limit on Tier 1.
        await new Promise((res) => setTimeout(res, 400));
      } catch (err) {
        errored += 1;
        if (!firstError) {
          firstError = err instanceof Error ? err.message : String(err);
        }
        // Leave the failing finding selected and pause briefly so the
        // user can see the error before we move on.
        await new Promise((res) => setTimeout(res, 600));
      }
    }

    // Tick the counter to the final total so the UI reads "N of N".
    setApplyingReview({
      current: reviewFindings.length,
      total: reviewFindings.length,
    });
    setApplyStatus({ appliedCount: applied, errorCount: errored, firstError });
    setApplyingReview(null);
    setSelectedId(null);
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
          applyingSafe={applyingSafe}
        />
        {scanError && (
          <div className="rounded-md bg-evari-danger/15 ring-1 ring-evari-danger/30 px-3 py-2 text-xs text-evari-text">
            {scanError}
          </div>
        )}
        {applyStatus && (
          <div
            className={cn(
              'rounded-md px-3 py-2 text-xs ring-1',
              applyStatus.errorCount === 0
                ? 'bg-evari-success/15 ring-evari-success/30 text-evari-text'
                : applyStatus.appliedCount === 0
                ? 'bg-evari-danger/15 ring-evari-danger/30 text-evari-text'
                : 'bg-evari-warn/15 ring-evari-warn/30 text-evari-text',
            )}
          >
            <div className="font-medium">
              Applied {applyStatus.appliedCount}
              {applyStatus.errorCount > 0
                ? ` · ${applyStatus.errorCount} failed`
                : ''}
            </div>
            {applyStatus.firstError && (
              <div className="mt-1 text-evari-dim break-words">
                First error: {applyStatus.firstError}
              </div>
            )}
          </div>
        )}
        <UndoPanel entries={undoLog} onUndo={handleUndo} />
      </aside>

      {/* ----- Pane 2: Issues list / History ----- */}
      <section className="rounded-xl bg-evari-surface min-h-[400px] overflow-hidden flex flex-col">
        {/* Tab strip — always visible when a scan exists so the user can
            flip between the work-surface (Issues) and the trend view
            (History) without losing their place. */}
        {scan && (
          <div className="flex items-center gap-4 px-4 pt-3 pb-0 border-b border-evari-edge/40 bg-evari-surface">
            <TabButton
              active={pane2Tab === 'issues'}
              onClick={() => setPane2Tab('issues')}
              label="Issues"
              badge={scan.findings.length > 0 ? scan.findings.length : null}
            />
            <TabButton
              active={pane2Tab === 'history'}
              onClick={() => setPane2Tab('history')}
              label="History"
            />
          </div>
        )}
        {scan && pane2Tab === 'history' ? (
          <SeoHealthHistoryPanel
            fallbackScore={scan.score}
            fallbackFindingsTotal={scan.findings.length}
          />
        ) : (
          <>
        {/* Sticky action bar at the top of the issues panel — global
            "Apply N safe fixes" button sits right above the first check
            group so the primary action is always visible next to the
            findings themselves. */}
        {scan && scan.findings.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-evari-edge/40 bg-evari-surface sticky top-0 z-10">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-evari-text">
                {scan.findings.length} issues found
              </div>
              <div className="text-[11px] text-evari-dim mt-0.5">
                {safeCount > 0
                  ? `${safeCount} can be fixed automatically · ${reviewCount} need your review`
                  : `${reviewCount} need your review`}
              </div>
            </div>
            {safeCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyAllSafe}
                disabled={applyingSafe || applyingReview !== null}
                // Keep the gold vibrant during the Applying state — the
                // default disabled:opacity-50 makes it look muddy next to
                // the still-bright Rescan button. pointer-events-none still
                // comes from the disabled attribute so double-clicks are
                // blocked.
                className="shrink-0 disabled:opacity-100 disabled:cursor-wait"
              >
                {applyingSafe ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                {applyingSafe ? `Applying ${safeCount}` : `Apply ${safeCount} safe fixes`}
              </Button>
            )}
            {reviewCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={
                  applyingReview
                    ? () => {
                        cancelBulkReviewRef.current = true;
                      }
                    : handleApproveAllReview
                }
                disabled={applyingSafe}
                className="shrink-0 disabled:opacity-100 disabled:cursor-wait"
              >
                {applyingReview ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                {applyingReview
                  ? `Approving ${applyingReview.current} / ${applyingReview.total} · Cancel`
                  : `Approve & apply ${reviewCount}`}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => runScan(true)}
              disabled={scanning}
              className="shrink-0 disabled:opacity-100 disabled:cursor-wait"
            >
              {scanning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              {scanning ? 'Scanning' : 'Rescan'}
            </Button>
          </div>
        )}
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
            onApplyGroup={handleApplyGroup}
            applyingGroup={applyingGroup}
          />
        )}
          </>
        )}
      </section>

      {/* ----- Pane 3: Detail / fix ----- */}
      <aside className="rounded-xl bg-evari-surface min-h-[400px] flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-evari-dim text-sm italic px-6 text-center">
            Select an issue to see its details and apply a fix.
          </div>
        ) : (
          <FixDetail
            finding={selected}
            onApply={handleApply}
            onScanOutOfSync={() => runScan(true)}
            key={selected.id}
          />
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

/**
 * Human-readable health label derived from the 0–100 score. Mirrors the
 * same bands the colour tone uses so label + colour always agree.
 */
function healthLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 25) return 'Poor';
  return 'Critical';
}

/**
 * Underline-style tab button used for the Issues / History switch on
 * Pane 2. Subtle in its inactive state so the active tab reads as the
 * primary context label.
 */
function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 pb-2 pt-1 text-[13px] transition-colors',
        active
          ? 'text-evari-text font-medium'
          : 'text-evari-dim hover:text-evari-text',
      )}
    >
      <span>{label}</span>
      {badge != null && (
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-full text-[10px] tabular-nums',
            active
              ? 'bg-evari-surfaceSoft text-evari-text'
              : 'bg-evari-surfaceSoft/60 text-evari-dim',
          )}
        >
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-evari-gold rounded-full" />
      )}
    </button>
  );
}

function Scorecard({
  scan,
  scanning,
  onScan,
  onApplyAllSafe,
  safeCount,
  reviewCount,
  applyingSafe,
}: {
  scan: ScanResult | null;
  scanning: boolean;
  onScan: () => void;
  onApplyAllSafe: () => void;
  safeCount: number;
  reviewCount: number;
  applyingSafe: boolean;
}) {
  const tone =
    scan == null
      ? 'text-evari-dim'
      : scan.score >= 90
      ? 'text-evari-success'
      : scan.score >= 70
      ? 'text-evari-warn'
      : 'text-evari-danger';

  // Break findings down by severity so the user can see not just "65 things"
  // but also how many of those are genuinely serious (A) vs cosmetic (C).
  const severityCounts = React.useMemo(() => {
    const out = { A: 0, B: 0, C: 0 };
    if (!scan) return out;
    for (const f of scan.findings) {
      out[f.check.severity] += 1;
    }
    return out;
  }, [scan]);

  const entitiesScanned = scan
    ? scan.scanned.products + scan.scanned.pages + scan.scanned.articles
    : 0;

  return (
    <div className="rounded-xl bg-evari-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-evari-gold" />
        <h2 className="text-sm font-medium text-evari-text">SEO health score</h2>
      </div>

      {/* Headline number — now explicitly "/100", with a plain-English
          health label underneath so Craig doesn't have to guess whether 45
          is good or bad. */}
      <div className="flex items-baseline gap-1">
        <div className={cn('text-5xl font-medium leading-none tabular-nums', tone)}>
          {scan ? scan.score : '—'}
        </div>
        <div className="text-lg text-evari-dimmer font-mono">/100</div>
      </div>
      {scan && (
        <div className={cn('mt-1.5 text-xs font-medium', tone)}>
          {healthLabel(scan.score)}
        </div>
      )}
      <div className="mt-1 text-[11px] text-evari-dim font-mono">
        {scan
          ? `Last scan ${new Date(scan.finishedAt).toLocaleString('en-GB')} · ${formatNumber(
              scan.durationMs / 1000,
              { maximumFractionDigits: 1 },
            )}s`
          : 'never run'}
      </div>

      {/* Initial-scan button — only shows before the first scan runs.
          Once a scan exists, the Apply/Rescan controls live at the top
          of the Issues panel next to the findings themselves. */}
      {!scan && (
        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            onClick={onScan}
            disabled={scanning}
            className="w-full"
          >
            {scanning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            {scanning ? 'Scanning' : 'Run scan'}
          </Button>
        </div>
      )}

      {scan && (
        <>
          {/* Scanned — what we looked at. Products + pages + articles sum to
              `entitiesScanned`, so the tile totals now reconcile cleanly. */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
                Scanned
              </div>
              <div className="text-[10px] text-evari-dimmer tabular-nums">
                {entitiesScanned} entities
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <CountTile label="Products" value={scan.scanned.products} />
              <CountTile label="Pages" value={scan.scanned.pages} />
              <CountTile label="Articles" value={scan.scanned.articles} />
            </dl>
          </div>

          {/* Findings — what we found, broken out two ways so the two tile
              rows have distinct meaning (not two views of the same set). */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
                Findings
              </div>
              <div className="text-[10px] text-evari-dimmer tabular-nums">
                {scan.findings.length} issues
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <CountTile label="Critical" value={severityCounts.A} tone="danger" />
              <CountTile label="Moderate" value={severityCounts.B} tone="warn" />
              <CountTile label="Minor" value={severityCounts.C} tone="muted" />
            </dl>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-center">
              <CountTile label="Safe-auto" value={safeCount} tone="success" />
              <CountTile label="Needs review" value={reviewCount} tone="warn" />
            </dl>
          </div>
        </>
      )}

      {/* What we check — collapsible glossary so Craig can see every rule
          the scan is applying, with severity + auto-vs-review status. */}
      <ChecksLegend />
    </div>
  );
}

/**
 * Expandable list of every check this scan applies. Hidden by default so
 * the scorecard stays compact, but one click reveals the full rulebook.
 */
function ChecksLegend() {
  const [open, setOpen] = React.useState(false);
  const checks = Object.values(CHECKS);
  const bySeverity = {
    A: checks.filter((c) => c.severity === 'A'),
    B: checks.filter((c) => c.severity === 'B'),
    C: checks.filter((c) => c.severity === 'C'),
  } as const;
  return (
    <div className="mt-4 border-t border-evari-edge pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-evari-dimmer hover:text-evari-dim"
      >
        <span>What we check ({checks.length})</span>
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform',
            open && 'rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {(['A', 'B', 'C'] as const).map((sev) => {
            const label =
              sev === 'A' ? 'Critical' : sev === 'B' ? 'Moderate' : 'Minor';
            const dot =
              sev === 'A'
                ? 'bg-evari-danger'
                : sev === 'B'
                ? 'bg-evari-warn'
                : 'bg-evari-dimmer';
            return (
              <div key={sev}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
                  <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dim">
                    {label}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {bySeverity[sev].map((c) => (
                    <li key={c.id} className="text-[11px] leading-relaxed">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-evari-text">{c.title}</span>
                        <span
                          className={cn(
                            'text-[9px] uppercase tracking-[0.1em] shrink-0',
                            c.fix === 'safe-auto'
                              ? 'text-evari-success'
                              : 'text-evari-dim',
                          )}
                        >
                          {c.fix === 'safe-auto' ? 'auto' : 'review'}
                        </span>
                      </div>
                      <p className="text-evari-dim mt-0.5">{c.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
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
  tone?: 'muted' | 'success' | 'warn' | 'danger';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-evari-success'
      : tone === 'warn'
      ? 'text-evari-warn'
      : tone === 'danger'
      ? 'text-evari-danger'
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
  onApplyGroup,
  applyingGroup,
}: {
  grouped: Map<string, ScanFinding[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApplyGroup: (checkId: string) => void;
  applyingGroup: string | null;
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
          onApplyGroup={onApplyGroup}
          applying={applyingGroup === checkId}
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
  onApplyGroup,
  applying,
}: {
  meta: typeof CHECKS[string];
  findings: ScanFinding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApplyGroup: (checkId: string) => void;
  applying: boolean;
}) {
  const [open, setOpen] = React.useState(true);
  const severityColor =
    meta.severity === 'A'
      ? 'bg-evari-danger'
      : meta.severity === 'B'
      ? 'bg-evari-warn'
      : 'bg-sky-400';
  const isSafeAuto = meta.fix === 'safe-auto';
  return (
    <li>
      <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-evari-surfaceSoft/50 transition-colors">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
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
        {/* Per-group apply — only for safe-auto checks. Sits inside the
            same row as the check title so the fix is one click away from
            where Craig's reading. */}
        {isSafeAuto && (
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onApplyGroup(meta.id);
            }}
            disabled={applying}
            className="h-7 px-2.5 text-[11px] shrink-0 disabled:opacity-100 disabled:cursor-wait"
          >
            {applying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {applying ? 'Applying' : `Apply ${findings.length}`}
          </Button>
        )}
      </div>
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
  onScanOutOfSync,
}: {
  finding: ScanFinding;
  onApply: (findingId: string, value?: string) => Promise<void>;
  /** Fired when the server tells us the cache doesn't know this finding —
   *  parent rescans to sync client and server. */
  onScanOutOfSync?: () => void;
}) {
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Separate from `error` so both a suggestion-failure banner and an
  // apply-failure banner can coexist, and so the user sees WHY the
  // textarea below is empty rather than a silent "button doesn't work".
  const [suggestionError, setSuggestionError] = React.useState<string | null>(null);
  const isReview = finding.check.fix === 'review';
  const isHandle = finding.check.id.startsWith('handle-');

  const loadSuggestion = React.useCallback(() => {
    if (!isReview && !isHandle) return;
    setLoading(true);
    setError(null);
    setSuggestionError(null);
    fetch(`/api/seo/fix?findingId=${encodeURIComponent(finding.id)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          suggestion?: { value: string };
          error?: string;
          code?: string;
        };
        // 409 scan-out-of-sync: the server cache doesn't know this
        // finding. Ask the parent to rescan — that refills the cache with
        // findings matching the current UI, and the user's next click
        // will work.
        if (r.status === 409 && j.code === 'scan-out-of-sync') {
          setSuggestionError(
            'Scan cache was refreshed after this page loaded — rescanning to sync…',
          );
          onScanOutOfSync?.();
          return;
        }
        if (!r.ok) throw new Error(j.error ?? `Suggestion failed (HTTP ${r.status})`);
        if (j.error) throw new Error(j.error);
        setSuggestion(j.suggestion?.value ?? '');
      })
      .catch((err) =>
        setSuggestionError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }, [finding.id, isReview, isHandle, onScanOutOfSync]);

  // Pre-load suggestion for review fixes (and handle fixes which have a
  // pre-computed safe transformation).
  React.useEffect(() => {
    loadSuggestion();
  }, [loadSuggestion]);

  const apply = async () => {
    // eslint-disable-next-line no-console
    console.log('[FixDetail] apply() clicked', {
      findingId: finding.id,
      isReview,
      isHandle,
      hasSuggestion: Boolean(suggestion?.trim()),
      suggestionLength: suggestion?.length ?? 0,
    });
    // If this is a review/handle fix and the textarea is empty, bail out
    // with a clear message instead of writing an empty string to Shopify
    // (which would wipe whatever's there and then fail verifyWrite).
    if ((isReview || isHandle) && !suggestion?.trim()) {
      // eslint-disable-next-line no-console
      console.warn('[FixDetail] apply() blocked — empty suggestion textarea');
      setError(
        'No suggested value yet. Either wait for the AI suggestion, retry it, or type your own value in the box below.',
      );
      return;
    }
    setApplying(true);
    setError(null);
    try {
      await onApply(
        finding.id,
        isReview || isHandle ? suggestion ?? '' : undefined,
      );
      // eslint-disable-next-line no-console
      console.log('[FixDetail] apply() completed without throw');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FixDetail] apply() threw:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header with apply button pinned top-right so it lines up with the
          Rescan / Apply N safe fixes bar at the top of the Issues panel. */}
      <header className="px-4 py-3 border-b border-evari-edge/40 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={finding.check.severity === 'A' ? 'critical' : finding.check.severity === 'B' ? 'warning' : 'muted'} className="text-[10px]">
              {finding.check.severity === 'A' ? 'critical' : finding.check.severity === 'B' ? 'warn' : 'minor'}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">{finding.entity.type}</Badge>
          </div>
          <h2 className="text-sm font-medium text-evari-text">{finding.check.title}</h2>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={apply}
          // Only disabled while actively loading/applying. If the AI
          // suggestion failed we still let the user click — they'll
          // either see a clear "type a value first" message or, if
          // they've typed one in the textarea below, the apply will
          // proceed. Never leave the user staring at a dead button.
          disabled={applying || loading}
          className="shrink-0 disabled:opacity-100 disabled:cursor-wait"
        >
          {applying || loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {applying
            ? 'Applying'
            : loading
            ? 'Loading'
            : isReview
            ? 'Approve + apply'
            : 'Apply fix'}
        </Button>
      </header>
      <div className="px-5 pt-3 pb-1">
        <p className="text-xs text-evari-dim">{finding.check.description}</p>
      </div>

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
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer">
                Suggested value
              </div>
              {suggestionError && !loading && (
                <button
                  type="button"
                  onClick={loadSuggestion}
                  className="text-[10px] uppercase tracking-[0.06em] text-evari-gold hover:text-evari-gold/80"
                >
                  Retry suggestion
                </button>
              )}
            </div>
            {suggestionError && !loading && (
              <div className="rounded-md bg-evari-warn/15 ring-1 ring-evari-warn/30 px-3 py-2 text-xs text-evari-text flex items-start gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-evari-warn" />
                <div className="min-w-0">
                  <div className="font-medium">
                    Couldn’t generate a suggestion
                  </div>
                  <div className="mt-0.5 text-evari-dim break-words">
                    {suggestionError}
                  </div>
                  <div className="mt-1 text-evari-dim">
                    You can still type your own value below and apply it.
                  </div>
                </div>
              </div>
            )}
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
                placeholder={
                  suggestionError
                    ? 'Type a meta description (120–160 chars)…'
                    : undefined
                }
              />
            ) : (
              <Input
                value={suggestion ?? ''}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder={
                  suggestionError ? 'Type a meta title (30–60 chars)…' : undefined
                }
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
