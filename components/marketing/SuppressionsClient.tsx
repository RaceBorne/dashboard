'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Suppression } from '@/lib/marketing/types';

interface Props {
  initialSuppressions: Suppression[];
}

export function SuppressionsClient({ initialSuppressions }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Suppression[]>(initialSuppressions);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(initialSuppressions), [initialSuppressions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => s.email.includes(q) || (s.reason ?? '').toLowerCase().includes(q));
  }, [items, query]);

  async function handleAdd() {
    if (!newEmail.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/suppressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), reason: 'manual' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Add failed');
      setItems((prev) => [data.suppression as Suppression, ...prev.filter((p) => p.email !== (data.suppression as Suppression).email)]);
      setNewEmail('');
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove from suppression list? The contact will be re-subscribed.')) return;
    const res = await fetch(`/api/marketing/suppressions/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) {
      setItems((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
          <input
            type="text"
            placeholder="Search by email or reason"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-panel bg-evari-surface text-evari-text text-sm placeholder:text-evari-dimmer border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out"
          />
        </div>
        <span className="text-xs text-evari-dimmer tabular-nums">{filtered.length} of {items.length}</span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition duration-500 ease-in-out"
        >
          <Plus className="h-3.5 w-3.5" />
          Add suppression
        </button>
      </div>

      {adding ? (
        <div className="mb-3 p-3 rounded-panel bg-evari-surface border border-evari-edge/30">
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              autoFocus
              className="flex-1 px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy || !newEmail.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-evari-danger">{error}</p> : null}
          <p className="mt-2 text-[11px] text-evari-dimmer">
            Manual suppressions also flip the matching contact (if any) to status=unsubscribed so segments + flows respect it.
          </p>
        </div>
      ) : null}

      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Added</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-evari-dimmer text-sm">
                  {items.length === 0
                    ? 'No suppressions yet. Hard bounces, complaints, and unsubscribe clicks land here automatically.'
                    : 'No suppressions match that search.'}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className={cn('border-b border-evari-edge/20 last:border-0 hover:bg-evari-surfaceSoft/40 transition-colors')}>
                  <td className="px-3 py-2 text-evari-text font-mono text-[12px]">{s.email}</td>
                  <td className="px-3 py-2 text-evari-dim text-xs">{s.reason ?? '—'}</td>
                  <td className="px-3 py-2 text-evari-dim text-xs">{s.source ?? '—'}</td>
                  <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                    {s.addedAt ? new Date(s.addedAt).toISOString().replace('T', ' ').slice(0, 16) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(s.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-evari-dim hover:text-evari-danger transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
