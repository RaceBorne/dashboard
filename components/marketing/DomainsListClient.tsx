'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MktDomain } from '@/lib/marketing/types';

interface Props {
  initialDomains: MktDomain[];
}

export function DomainsListClient({ initialDomains }: Props) {
  const router = useRouter();
  const [domains, setDomains] = useState<MktDomain[]>(initialDomains);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Add failed');
      setDomains((d) => [data.domain as MktDomain, ...d]);
      setName('');
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-evari-dimmer tabular-nums">{domains.length} domains</span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition duration-500 ease-in-out"
        >
          <Plus className="h-3.5 w-3.5" />
          Add domain
        </button>
      </div>

      {adding ? (
        <div className="mb-3 p-3 rounded-md bg-evari-surface border border-evari-edge/30">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="mail.example.com"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-evari-danger">{error}</p> : null}
          <p className="mt-2 text-[11px] text-evari-dimmer">
            Postmark account token sets the DKIM record automatically. Without it the domain row is created with SPF + DMARC defaults; DKIM stays blank until token is configured.
          </p>
        </div>
      ) : null}

      <div className="rounded-md bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="px-3 py-2 font-medium">Domain</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last checked</th>
              <th className="px-3 py-2 font-medium">Postmark id</th>
            </tr>
          </thead>
          <tbody>
            {domains.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-evari-dimmer text-sm">
                  No domains yet. Click <span className="text-evari-text font-semibold">Add domain</span> to start.
                </td>
              </tr>
            ) : (
              domains.map((d) => (
                <tr key={d.id} className="border-b border-evari-edge/20 last:border-0 hover:bg-evari-surfaceSoft/40">
                  <td className="px-3 py-2">
                    <Link href={`/email/domains/${d.id}`} className="text-evari-text font-medium font-mono hover:text-evari-gold transition-colors">
                      {d.domainName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium',
                        d.verified ? 'bg-evari-success/15 text-evari-success' : 'bg-orange-500/15 text-orange-400',
                      )}
                    >
                      {d.verified ? 'verified' : 'pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                    {d.lastCheckedAt ? new Date(d.lastCheckedAt).toISOString().replace('T', ' ').slice(0, 16) : '—'}
                  </td>
                  <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">{d.postmarkId ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
