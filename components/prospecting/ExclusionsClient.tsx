'use client';

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';

import { STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT } from '@/lib/layout/stageWrapper';

interface ExclusionRow {
  domain: string;
  reason: string | null;
  blocked_by_play: string | null;
  created_at: string;
}

interface Props {
  initial: ExclusionRow[];
}

export function ExclusionsClient({ initial }: Props) {
  const [rows, setRows] = useState<ExclusionRow[]>(initial);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    const domain = draft.trim().toLowerCase();
    if (!domain) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/prospecting/exclusions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        throw new Error(data?.error ?? 'Could not add domain');
      }
      // Optimistic prepend; reload would also work.
      setRows((cur) => {
        if (cur.find((r) => r.domain === data.domain)) return cur;
        return [
          {
            domain: data.domain,
            reason: 'Manually added in Settings',
            blocked_by_play: null,
            created_at: new Date().toISOString(),
          },
          ...cur,
        ];
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function remove(domain: string) {
    if (!confirm(`Remove ${domain} from the exclusion list? It will be eligible for future searches again.`)) return;
    setBusy(domain);
    try {
      const res = await fetch('/api/prospecting/exclusions?domain=' + encodeURIComponent(domain), {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) return;
      setRows((cur) => cur.filter((r) => r.domain !== domain));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT}>
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-5 space-y-4 max-w-3xl w-full">
        <header>
          <h1 className="text-[18px] font-semibold text-evari-text">Prospecting exclusions</h1>
          <p className="text-[12px] text-evari-dim mt-1 leading-relaxed">
            Domains in this list are blocked from every Discovery search path: Similar suggestions, the discover-agent, auto-scan, and the peer-brain lookup. Anything you mark Not a fit or Not relevant in the funnel ends up here. You can add or remove domains by hand.
          </p>
        </header>

        <div className="flex items-center gap-2 border-t border-evari-edge/20 pt-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
            placeholder="example.com"
            className="flex-1 h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:border-evari-gold/50"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !draft.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add domain
          </button>
        </div>
        {error ? <div className="text-[11px] text-evari-warning">{error}</div> : null}

        <div className="border-t border-evari-edge/20 pt-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">
            {rows.length} {rows.length === 1 ? 'domain' : 'domains'} excluded
          </div>
          {rows.length === 0 ? (
            <div className="text-[12px] text-evari-dim italic py-4 text-center">No domains excluded yet.</div>
          ) : (
            <ul className="divide-y divide-evari-edge/20">
              {rows.map((r) => (
                <li key={r.domain} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-evari-text truncate">{r.domain}</div>
                    {r.reason ? <div className="text-[11px] text-evari-dim truncate">{r.reason}</div> : null}
                  </div>
                  <div className="text-[10px] text-evari-dimmer tabular-nums whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(r.domain)}
                    disabled={busy === r.domain}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-evari-dim hover:text-evari-warning hover:bg-evari-warning/10 disabled:opacity-50 transition"
                    title="Remove from exclusion list"
                    aria-label="Remove"
                  >
                    {busy === r.domain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
