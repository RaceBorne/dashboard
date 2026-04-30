'use client';

import { useState } from 'react';
import { Globe2, Loader2, Plus, Target, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT } from '@/lib/layout/stageWrapper';

interface ExclusionRow {
  id: string;
  domain: string;
  reason: string | null;
  play_id: string | null;
  play_title: string | null;
  created_at: string;
}

interface Props {
  initial: ExclusionRow[];
}

type Tab = 'global' | 'perSearch';

export function ExclusionsClient({ initial }: Props) {
  const [rows, setRows] = useState<ExclusionRow[]>(initial);
  const [tab, setTab] = useState<Tab>('global');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const counts = {
    global: rows.filter((r) => r.play_id === null).length,
    perSearch: rows.filter((r) => r.play_id !== null).length,
  };
  const filtered = rows.filter((r) =>
    tab === 'global' ? r.play_id === null : r.play_id !== null,
  );

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
      if (!data?.ok) throw new Error(data?.error ?? 'Could not add domain');
      setRows((cur) => {
        if (cur.find((r) => r.domain === data.domain && r.play_id === null)) return cur;
        return [
          {
            id: crypto.randomUUID(),
            domain: data.domain,
            reason: 'Manually added in Settings',
            play_id: null,
            play_title: null,
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

  async function remove(row: ExclusionRow) {
    const scopeLabel = row.play_id ? `for ${row.play_title ?? 'this venture'}` : 'globally';
    if (!confirm(`Stop blocking ${row.domain} ${scopeLabel}? It will be eligible for future searches again.`)) return;
    setBusy(row.id);
    try {
      const res = await fetch('/api/prospecting/exclusions?id=' + encodeURIComponent(row.id), {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) return;
      setRows((cur) => cur.filter((r) => r.id !== row.id));
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
            Domains here are blocked from Discovery search. <strong className="text-evari-text">Global</strong> blocks apply across every prospecting search; <strong className="text-evari-text">per prospecting search</strong> blocks only hide the domain from one specific search so the same brand can stay relevant elsewhere. Anything you mark Not a fit or Not relevant from inside a search lands as per prospecting search by default. Manual adds from this page default to global.
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
            Add domain (global)
          </button>
        </div>
        {error ? <div className="text-[11px] text-evari-warning">{error}</div> : null}

        <div className="border-t border-evari-edge/20 pt-4">
          {/* Two tabs: Global blocks (everywhere) and Per prospecting search
              blocks (only inside a specific play). Lets the operator
              audit each scope independently. */}
          <div className="flex items-center gap-1 mb-3 border-b border-evari-edge/20">
            <button
              type="button"
              onClick={() => setTab('global')}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition',
                tab === 'global' ? 'border-evari-gold text-evari-gold' : 'border-transparent text-evari-dim hover:text-evari-text')}
            >
              <Globe2 className="h-3.5 w-3.5" /> Global
              <span className="ml-0.5 text-[11px] tabular-nums opacity-70">{counts.global}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('perSearch')}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition',
                tab === 'perSearch' ? 'border-evari-gold text-evari-gold' : 'border-transparent text-evari-dim hover:text-evari-text')}
            >
              <Target className="h-3.5 w-3.5" /> Per prospecting search
              <span className="ml-0.5 text-[11px] tabular-nums opacity-70">{counts.perSearch}</span>
            </button>
          </div>
          {filtered.length === 0 ? (
            <div className="text-[12px] text-evari-dim italic py-4 text-center">
              {tab === 'global'
                ? 'No global exclusions. Anything you add manually here, or block site-wide from a search, will land in this tab.'
                : 'No per prospecting search exclusions yet. Anything you mark Not a fit or Not relevant from inside a search lands here, scoped to that search only.'}
            </div>
          ) : (
            <ul className="divide-y divide-evari-edge/20">
              {filtered.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] font-medium text-evari-text truncate">{r.domain}</div>
                      {r.play_id ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-evari-edge/20 text-evari-dim border border-evari-edge/30 whitespace-nowrap">
                          <Target className="h-2.5 w-2.5" /> {r.play_title ?? 'Per prospecting search'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-evari-gold/10 text-evari-gold border border-evari-gold/30 whitespace-nowrap">
                          <Globe2 className="h-2.5 w-2.5" /> Global
                        </span>
                      )}
                    </div>
                    {r.reason ? <div className="text-[11px] text-evari-dim truncate mt-0.5">{r.reason}</div> : null}
                  </div>
                  <div className="text-[10px] text-evari-dimmer tabular-nums whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(r)}
                    disabled={busy === r.id}
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-evari-dim hover:text-evari-warning hover:bg-evari-warning/10 disabled:opacity-50 transition"
                    title="Remove from exclusion list"
                    aria-label="Remove"
                  >
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
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
