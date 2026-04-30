'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Check, Loader2, Plus, Save, Star, Trash2 } from 'lucide-react';

import { STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT } from '@/lib/layout/stageWrapper';
import { cn } from '@/lib/utils';

interface AppContext {
  id: string;
  slug: string;
  name: string;
  description: string;
  voice: string;
  agentSystemPrompt: string | null;
  defaultIndustries: string[];
  defaultGeographies: string[];
  defaultPersona: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initial: AppContext[];
  activeId: string | null;
}

const MAX_CONTEXTS = 3;

export function ContextClient({ initial, activeId: initialActiveId }: Props) {
  const router = useRouter();
  const [contexts, setContexts] = useState<AppContext[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [selectedId, setSelectedId] = useState<string | null>(initialActiveId ?? initial[0]?.id ?? null);
  const [draft, setDraft] = useState<AppContext | null>(initial.find((c) => c.id === (initialActiveId ?? initial[0]?.id)) ?? null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;
    setSelectedId(id);
    setDraft({ ...ctx });
  }

  function startNew() {
    if (contexts.length >= MAX_CONTEXTS) return;
    setSelectedId(null);
    setDraft({
      id: '',
      slug: '',
      name: '',
      description: '',
      voice: '',
      agentSystemPrompt: '',
      defaultIndustries: [],
      defaultGeographies: [],
      defaultPersona: '',
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: draft.id || undefined,
          slug: draft.slug,
          name: draft.name,
          description: draft.description,
          voice: draft.voice,
          agentSystemPrompt: draft.agentSystemPrompt,
          defaultIndustries: draft.defaultIndustries,
          defaultGeographies: draft.defaultGeographies,
          defaultPersona: draft.defaultPersona,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        setError(data?.error ?? 'Save failed');
        return;
      }
      const saved = data.context as AppContext;
      setContexts((cur) => {
        const idx = cur.findIndex((c) => c.id === saved.id);
        if (idx >= 0) {
          const next = [...cur];
          next[idx] = saved;
          return next;
        }
        return [...cur, saved];
      });
      setSelectedId(saved.id);
      setDraft({ ...saved });
    } finally {
      setSaving(false);
    }
  }

  async function makeActive(id: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/context/active', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setActiveId(id);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx || ctx.isDefault) return;
    if (!confirm(`Delete the ${ctx.name} context? This is permanent.`)) return;
    setBusy(id);
    try {
      await fetch('/api/context?id=' + encodeURIComponent(id), { method: 'DELETE' });
      setContexts((cur) => cur.filter((c) => c.id !== id));
      if (selectedId === id) {
        const next = contexts.find((c) => c.id !== id) ?? null;
        setSelectedId(next?.id ?? null);
        setDraft(next ? { ...next } : null);
      }
    } finally {
      setBusy(null);
    }
  }

  function patch<K extends keyof AppContext>(key: K, value: AppContext[K]) {
    setDraft((cur) => (cur ? { ...cur, [key]: value } : cur));
  }

  function chipsToArray(s: string): string[] {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }

  return (
    <div className={STAGE_WRAPPER_CLASSNAME_FIXED_HEIGHT}>
      <section className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden flex-1 min-h-0 flex">
        {/* Left: list of contexts */}
        <aside className="w-[280px] border-r border-evari-edge/30 flex flex-col">
          <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Contexts</span>
            <span className="text-[10px] text-evari-dimmer tabular-nums">{contexts.length} / {MAX_CONTEXTS}</span>
          </header>
          <div className="flex-1 overflow-y-auto">
            <ul className="divide-y divide-evari-edge/20">
              {contexts.map((c) => {
                const isActive = c.id === activeId;
                const isSelected = c.id === selectedId;
                return (
                  <li key={c.id} className={cn('group', isSelected ? 'bg-evari-edge/20' : 'hover:bg-evari-edge/10')}>
                    <button
                      type="button"
                      onClick={() => pick(c.id)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-evari-gold/70" />
                        <span className="text-[13px] font-semibold text-evari-text truncate">{c.name}</span>
                        {isActive ? (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-evari-gold">
                            <Check className="h-3 w-3" /> Active
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-evari-dim truncate mt-0.5">{c.description.slice(0, 80) || c.slug}</div>
                    </button>
                    <div className="px-4 pb-3 flex items-center gap-2">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => void makeActive(c.id)}
                          disabled={busy === c.id}
                          className="text-[10px] text-evari-gold hover:underline disabled:opacity-50"
                        >
                          {busy === c.id ? 'Switching...' : 'Make active'}
                        </button>
                      ) : null}
                      {!c.isDefault ? (
                        <button
                          type="button"
                          onClick={() => void remove(c.id)}
                          disabled={busy === c.id}
                          className="text-[10px] text-evari-dim hover:text-evari-gold disabled:opacity-50 ml-auto"
                          title="Delete this context"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-evari-dimmer ml-auto inline-flex items-center gap-1">
                          <Star className="h-2.5 w-2.5" /> default
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {contexts.length < MAX_CONTEXTS ? (
              <button
                type="button"
                onClick={startNew}
                className="w-full px-4 py-3 text-left text-[12px] text-evari-gold hover:bg-evari-gold/10 flex items-center gap-1.5 border-t border-evari-edge/20"
              >
                <Plus className="h-3.5 w-3.5" /> New context
              </button>
            ) : (
              <div className="px-4 py-3 text-[10px] text-evari-dimmer italic border-t border-evari-edge/20">
                Cap of {MAX_CONTEXTS} contexts reached. Delete one to add another.
              </div>
            )}
          </div>
        </aside>

        {/* Right: editor */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          {draft ? (
            <div className="space-y-5 max-w-2xl">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <input
                    value={draft.name}
                    onChange={(e) => patch('name', e.target.value)}
                    placeholder="Evari Speed Bikes"
                    className="w-full h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50"
                  />
                </Field>
                <Field label="Slug">
                  <input
                    value={draft.slug}
                    onChange={(e) => patch('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="evari"
                    disabled={draft.isDefault}
                    className="w-full h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50 disabled:opacity-60"
                  />
                </Field>
              </div>

              <Field label="Company background" hint="Used as the AI's brand grounding for every prompt. Plain prose, 2-4 sentences. What the company does, who it sells to, what makes it the company.">
                <textarea
                  value={draft.description}
                  onChange={(e) => patch('description', e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 py-2 text-[12px] text-evari-text leading-relaxed focus:outline-none focus:border-evari-gold/50 resize-y"
                />
              </Field>

              <Field label="Voice and tone" hint="How the AI should write when speaking AS this company. Adjectives, do's and don'ts.">
                <textarea
                  value={draft.voice}
                  onChange={(e) => patch('voice', e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 py-2 text-[12px] text-evari-text leading-relaxed focus:outline-none focus:border-evari-gold/50 resize-y"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Default industries" hint="Comma-separated. Seeded into new Strategy briefs.">
                  <input
                    value={draft.defaultIndustries.join(', ')}
                    onChange={(e) => patch('defaultIndustries', chipsToArray(e.target.value))}
                    placeholder="Luxury cars, Yachts, Boutique hotels"
                    className="w-full h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50"
                  />
                </Field>
                <Field label="Default geographies" hint="Comma-separated. Seeded into new Strategy briefs.">
                  <input
                    value={draft.defaultGeographies.join(', ')}
                    onChange={(e) => patch('defaultGeographies', chipsToArray(e.target.value))}
                    placeholder="United Kingdom, Monaco, Switzerland"
                    className="w-full h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50"
                  />
                </Field>
              </div>

              <Field label="Default persona" hint="One-line description of who this company sells to. Used as the default audience in Strategy.">
                <input
                  value={draft.defaultPersona ?? ''}
                  onChange={(e) => patch('defaultPersona', e.target.value)}
                  placeholder="High-net-worth UK customers aged 35 to 65, design-literate, value craft over commodity"
                  className="w-full h-9 rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 text-[12px] text-evari-text focus:outline-none focus:border-evari-gold/50"
                />
              </Field>

              <Field label="Custom agent system prompt (optional)" hint="If supplied, appended to the AI's system prompt. Use only when voice + description aren't enough to steer the model.">
                <textarea
                  value={draft.agentSystemPrompt ?? ''}
                  onChange={(e) => patch('agentSystemPrompt', e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-evari-edge/40 bg-evari-edge/10 px-3 py-2 text-[12px] text-evari-text leading-relaxed focus:outline-none focus:border-evari-gold/50 resize-y"
                />
              </Field>

              {error ? (
                <div className="text-[11px] text-evari-warning">{error}</div>
              ) : null}

              <div className="flex items-center gap-2 pt-2 border-t border-evari-edge/20">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {draft.id ? 'Save changes' : 'Create context'}
                </button>
                {draft.id && draft.id !== activeId ? (
                  <button
                    type="button"
                    onClick={() => void makeActive(draft.id)}
                    disabled={busy === draft.id}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold border border-evari-edge/40 text-evari-text hover:border-evari-gold/40 hover:text-evari-gold disabled:opacity-50 transition"
                  >
                    Make active
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-evari-dim italic">Pick a context on the left or create a new one.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</div>
      {children}
      {hint ? <div className="text-[10px] text-evari-dimmer mt-1 leading-relaxed">{hint}</div> : null}
    </div>
  );
}
