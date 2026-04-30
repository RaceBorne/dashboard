'use client';

/**
 * Prepare-for-send.
 *
 * One-click pre-send pass that walks the campaign's email design,
 * regenerates each linked image at the right size + format for
 * email, rewrites the design to point at the new variants, and
 * saves it back. The modal shows a before/after report with
 * Gmail-clip + total-size ceiling checks so the operator can see
 * exactly how much weight came out of the email.
 */

import { useState } from 'react';
import { Check, Image as ImageIcon, Loader2, ShieldCheck, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PerImage {
  src: string;
  filename: string | null;
  beforeBytes: number | null;
  afterBytes: number | null;
  beforeDims: string | null;
  afterDims: string | null;
  newUrl: string | null;
  reused: boolean;
  error?: string;
}

interface Report {
  ok: boolean;
  perImage: PerImage[];
  totals: { count: number; beforeBytes: number; afterBytes: number };
  htmlBytes: number;
  targetWidth: number;
  ceilings: {
    gmailClip: boolean;
    gmailClipBytes: number;
    totalSize: boolean;
    totalCeilingBytes: number;
  };
  error?: string;
}

interface Props {
  campaignId: string;
  onApplied?: () => void;
}

function formatBytes(b: number | null): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function pct(before: number | null, after: number | null): string {
  if (!before || after == null) return '';
  const saved = before - after;
  if (saved <= 0) return '';
  const p = Math.round((saved / before) * 100);
  return `−${p}%`;
}

export function PrepareSendButton({ campaignId, onApplied }: Props) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [open, setOpen] = useState(false);

  async function run() {
    setBusy(true);
    setReport(null);
    setOpen(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/prepare-send`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => null)) as Report | null;
      if (!data) {
        setReport({ ok: false, perImage: [], totals: { count: 0, beforeBytes: 0, afterBytes: 0 }, htmlBytes: 0, targetWidth: 0, ceilings: { gmailClip: false, gmailClipBytes: 0, totalSize: false, totalCeilingBytes: 0 }, error: 'Empty response' });
      } else {
        setReport(data);
        if (data.ok) onApplied?.();
      }
    } catch (err) {
      setReport({ ok: false, perImage: [], totals: { count: 0, beforeBytes: 0, afterBytes: 0 }, htmlBytes: 0, targetWidth: 0, ceilings: { gmailClip: false, gmailClipBytes: 0, totalSize: false, totalCeilingBytes: 0 }, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold bg-evari-ink text-evari-text border border-evari-edge/40 hover:border-evari-gold/60 hover:text-evari-gold disabled:opacity-50 transition"
        title="Resize every image to the right send size, then save the trimmed-down design back to the campaign."
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {busy ? 'Optimising images…' : 'Prepare images for send'}
      </button>

      {open && report ? (
        <ReportModal report={report} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function ReportModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const totalAfter = report.htmlBytes + report.totals.afterBytes;
  const saved = report.totals.beforeBytes - report.totals.afterBytes;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-2xl rounded-panel bg-evari-surface border border-evari-edge/30 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Prepare for send</div>
            <div className="text-[14px] font-semibold text-evari-text truncate mt-0.5">
              {report.ok ? `Optimised ${report.perImage.length} ${report.perImage.length === 1 ? 'image' : 'images'}` : 'Could not prepare'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text">
            <X className="h-4 w-4" />
          </button>
        </header>

        {report.error ? (
          <div className="p-4 text-[12px] text-evari-warning">{report.error}</div>
        ) : null}

        {report.ok ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Totals strip */}
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Images"
                value={String(report.perImage.length)}
                sub={`Resized to ${report.targetWidth}px wide max`}
              />
              <Stat
                label="Image weight"
                value={formatBytes(report.totals.afterBytes)}
                sub={`from ${formatBytes(report.totals.beforeBytes)}, saved ${formatBytes(saved)}`}
                accent
              />
              <Stat
                label="Total weight"
                value={formatBytes(totalAfter)}
                sub="HTML + images"
              />
            </div>

            {/* Ceilings */}
            <div className="grid grid-cols-2 gap-3">
              <Ceiling
                label="HTML body"
                actual={report.htmlBytes}
                ceiling={report.ceilings.gmailClipBytes}
                ok={report.ceilings.gmailClip}
                note="Gmail clips above this; campaign shows 'View entire message'."
              />
              <Ceiling
                label="Total size"
                actual={totalAfter}
                ceiling={report.ceilings.totalCeilingBytes}
                ok={report.ceilings.totalSize}
                note="Soft target. Heavier emails feel slow on mobile."
              />
            </div>

            {/* Per-image table */}
            {report.perImage.length > 0 ? (
              <div className="rounded-md border border-evari-edge/30 overflow-hidden">
                <div className="px-3 py-2 border-b border-evari-edge/30 text-[10px] uppercase tracking-[0.12em] text-evari-dimmer flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3" /> Per-image savings
                </div>
                <ul className="divide-y divide-evari-edge/20">
                  {report.perImage
                    .slice()
                    .sort((a, b) => (b.beforeBytes ?? 0) - (a.beforeBytes ?? 0))
                    .map((img) => (
                      <li key={img.src} className="px-3 py-2 flex items-center gap-3 text-[11px]">
                        <span className="flex-1 min-w-0 truncate text-evari-text font-medium" title={img.filename ?? img.src}>
                          {img.filename ?? img.src}
                        </span>
                        {img.error ? (
                          <span className="text-evari-warning text-[10px]">{img.error}</span>
                        ) : (
                          <>
                            <span className="text-evari-dimmer font-mono tabular-nums hidden md:inline">
                              {img.beforeDims ?? '—'} → {img.afterDims ?? '—'}
                            </span>
                            <span className="text-evari-dim font-mono tabular-nums">{formatBytes(img.beforeBytes)}</span>
                            <span className="text-evari-gold/70">→</span>
                            <span className="text-evari-text font-mono tabular-nums">{formatBytes(img.afterBytes)}</span>
                            <span className="w-12 text-right text-evari-gold font-mono tabular-nums">{pct(img.beforeBytes, img.afterBytes)}</span>
                            {img.reused ? <span className="text-[9px] text-evari-dimmer uppercase tracking-wider">cached</span> : null}
                          </>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-evari-edge/30 px-3 py-4 text-[11px] text-evari-dimmer text-center">
                No image references found in the campaign design. Nothing to optimise.
              </div>
            )}

            <div className="rounded-md border border-evari-success/40 bg-evari-success/10 p-3 text-[11px] text-evari-text flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-evari-success mt-0.5 shrink-0" />
              <span>
                Optimised images are saved back to the campaign design. Originals are preserved in the asset library; each variant is tagged with the campaign id, so re-running this step is fast and idempotent.
              </span>
            </div>
          </div>
        ) : null}

        <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-evari-edge/30 p-3 bg-evari-ink/40">
      <div className="text-[9px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
      <div className={cn('text-[18px] font-bold tabular-nums mt-1', accent ? 'text-evari-gold' : 'text-evari-text')}>{value}</div>
      {sub ? <div className="text-[10px] text-evari-dim mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Ceiling({ label, actual, ceiling, ok, note }: { label: string; actual: number; ceiling: number; ok: boolean; note: string }) {
  const pctOf = ceiling > 0 ? Math.min(100, Math.round((actual / ceiling) * 100)) : 0;
  return (
    <div className="rounded-md border border-evari-edge/30 p-3 bg-evari-ink/40">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[9px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</div>
        <div className={cn('text-[10px] font-semibold tabular-nums', ok ? 'text-evari-success' : 'text-evari-warning')}>
          {ok ? '✓ Under limit' : '! Over limit'}
        </div>
      </div>
      <div className="text-[14px] font-bold text-evari-text tabular-nums">
        {formatBytes(actual)} <span className="text-[10px] text-evari-dim font-normal">/ {formatBytes(ceiling)}</span>
      </div>
      <div className="h-1 mt-2 rounded-full bg-evari-edge/30 overflow-hidden">
        <div className={cn('h-full rounded-full', ok ? 'bg-evari-success' : 'bg-evari-warning')} style={{ width: `${pctOf}%` }} />
      </div>
      <div className="text-[10px] text-evari-dimmer mt-1.5 leading-relaxed">{note}</div>
    </div>
  );
}
