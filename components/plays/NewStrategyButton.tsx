'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "New strategy" button on the /plays page.
 *
 * POSTs to /api/plays to insert a blank play row, then navigates to the
 * freshly-created detail page (`/plays/{id}`). Keeps the gold-pill styling of
 * the original dead button the designer put in — just wires the click.
 */
export function NewStrategyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function createPlay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/plays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.id) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      startTransition(() => {
        router.push(`/plays/${body.id}`);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={createPlay}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md bg-evari-gold text-evari-goldInk text-xs font-medium px-3 py-1.5 transition-colors',
          loading ? 'opacity-70 cursor-wait' : 'hover:bg-evari-gold/90',
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {loading ? 'Creating…' : 'New strategy'}
      </button>
      {error ? (
        <div className="text-[11px] text-evari-danger">
          Couldn&apos;t create strategy: {error}
        </div>
      ) : null}
    </div>
  );
}
