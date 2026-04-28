'use client';

/**
 * Marketing settings — singleton row. Today this is just frequency cap.
 * Future: default reply-to, default schedule window, etc.
 */

import { useState } from 'react';
import { CheckCircle2, Clock, Loader2, Save } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Settings {
  frequencyCapCount: number;
  frequencyCapDays: number;
  updatedAt: string;
}

export function MarketingSettingsClient({ initial }: { initial: Settings }) {
  const [count, setCount] = useState(initial.frequencyCapCount);
  const [days, setDays] = useState(initial.frequencyCapDays);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/marketing/settings', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frequencyCapCount: count, frequencyCapDays: days }),
      });
      const json = await res.json();
      if (json?.ok) setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
        <header className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-evari-gold/15 text-evari-gold">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-evari-text">Frequency cap</h2>
            <p className="text-[11px] text-evari-dim">Stop the same person being hit by too many sends in a short window.</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Max sends per contact</span>
            <input
              type="number"
              min={0}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
              className="w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none text-[12px]"
            />
            <p className="text-[10px] text-evari-dimmer mt-1">0 disables the cap.</p>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Window (days)</span>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10) || 1)}
              className="w-full px-2 py-1.5 rounded-md bg-evari-ink text-evari-text border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none text-[12px]"
            />
          </label>
        </div>

        <p className={cn('text-[11px] mt-3', count > 0 ? 'text-evari-dim' : 'text-evari-dimmer')}>
          {count > 0
            ? `Contacts who already received ${count} or more sends in the last ${days} day${days === 1 ? '' : 's'} are skipped automatically. They show up in the campaign report as suppressed with a 'Frequency cap exceeded' note.`
            : 'No cap. Every recipient gets every send.'}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
          {savedAt && Date.now() - savedAt < 4000 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-evari-success">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
