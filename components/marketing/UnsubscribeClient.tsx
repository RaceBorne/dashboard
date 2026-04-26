'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  token: string;
  email: string;
  alreadySuppressed: boolean;
}

export function UnsubscribeClient({ token, email, alreadySuppressed }: Props) {
  const [done, setDone] = useState(alreadySuppressed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketing/unsubscribe?u=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Unsubscribe failed');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unsubscribe failed');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-2 text-sm text-zinc-700">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-zinc-900">You've been unsubscribed.</p>
          <p className="mt-1 text-zinc-600">
            <span className="font-mono text-[12px]">{email}</span> won't receive
            further marketing email from us. If you change your mind, just reply
            to any past message.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-zinc-700 leading-relaxed">
        We'll stop sending marketing email to <span className="font-mono text-[12px] font-medium text-zinc-900">{email}</span>.
      </p>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold bg-zinc-900 text-white hover:bg-black disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {busy ? 'Working…' : 'Unsubscribe'}
      </button>
      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </>
  );
}
