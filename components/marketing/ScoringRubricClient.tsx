'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Save, Sparkles } from 'lucide-react';

interface Criteria {
  industryMatch: number;
  companySize: number;
  revenuePotential: number;
  geographicFit: number;
  brandAlignment: number;
  idealCustomer: string | null;
  notes: string | null;
  updatedAt: string;
}

export function ScoringRubricClient({ initial }: { initial: Criteria }) {
  const [c, setC] = useState<Criteria>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fit-score/criteria', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(c),
      });
      const json = await res.json();
      if (json?.ok) { setC(json.criteria); setSavedAt(Date.now()); }
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <header className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-evari-gold/15 text-evari-gold">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-evari-text">Scoring weights</h2>
            <p className="text-[11px] text-evari-dim">0 to 10 each. The AI uses these to rank candidate companies.</p>
          </div>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <Slider label="Industry match" value={c.industryMatch} onChange={(n) => setC({ ...c, industryMatch: n })} />
          <Slider label="Company size" value={c.companySize} onChange={(n) => setC({ ...c, companySize: n })} />
          <Slider label="Revenue potential" value={c.revenuePotential} onChange={(n) => setC({ ...c, revenuePotential: n })} />
          <Slider label="Geographic fit" value={c.geographicFit} onChange={(n) => setC({ ...c, geographicFit: n })} />
          <Slider label="Brand alignment" value={c.brandAlignment} onChange={(n) => setC({ ...c, brandAlignment: n })} />
        </div>
      </section>

      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <h2 className="text-[13px] font-semibold text-evari-text mb-2">Ideal customer (prose)</h2>
        <textarea
          value={c.idealCustomer ?? ''}
          onChange={(e) => setC({ ...c, idealCustomer: e.target.value })}
          placeholder="The ideal Evari customer is..."
          className="w-full min-h-[120px] px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
        />
      </section>

      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 p-4">
        <h2 className="text-[13px] font-semibold text-evari-text mb-2">Notes (deal-breakers, exclusions, anything else)</h2>
        <textarea
          value={c.notes ?? ''}
          onChange={(e) => setC({ ...c, notes: e.target.value })}
          placeholder="e.g. exclude wholesalers, exclude US-only operators..."
          className="w-full min-h-[80px] px-2 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
        />
      </section>

      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </button>
        {savedAt && Date.now() - savedAt < 4000 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-evari-success"><CheckCircle2 className="h-3 w-3" /> Saved</span>
        ) : null}
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input type="range" min={0} max={10} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="flex-1 accent-evari-gold" />
        <span className="text-[12px] text-evari-text font-mono tabular-nums w-6 text-right">{value}</span>
      </div>
    </label>
  );
}
