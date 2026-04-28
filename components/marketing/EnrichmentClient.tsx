'use client';

/**
 * Enrichment surface — contacts found at shortlisted companies.
 *
 * Top stats strip (found / enriched / verified / job-titled / ready).
 * Tabs (All / Ready to engage / Needs review). Master/detail layout:
 * left list of contacts, right detail with AI summary, suggested tags,
 * and a stubbed signals feed (data-providers integration is later).
 *
 * Page registers AI Assistant suggestions via useAISurface so the
 * right rail offers Prioritise / Find more / Improve enrichment.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Mail,
  Linkedin,
  Send,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAISurface } from '@/components/ai/AIAssistantPane';

interface Signal {
  type: 'linkedin_post' | 'event' | 'news' | 'announcement';
  text: string;
  date?: string | null;
}

interface Contact {
  id: string;
  playId: string | null;
  domain: string | null;
  companyName: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  jobTitle: string | null;
  department: string | null;
  seniority: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  fitScore: number | null;
  aiSummary: string | null;
  suggestedTags: string[];
  signals: Signal[];
  status: 'needs_review' | 'ready' | 'archived';
}

interface Summary { found: number; enriched: number; verified: number; jobTitled: number; ready: number }
type Tab = 'all' | 'ready' | 'needs_review';

interface Props {
  plays: { id: string; title: string }[];
  play: { id: string; title: string };
  initial: Contact[];
  summary: Summary;
}

export function EnrichmentClient({ plays, play, initial, summary }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Contact[]>(initial);
  const [tab, setTab] = useState<Tab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);

  useAISurface({
    surface: 'enrichment',
    scopeId: play.id,
    context: { playTitle: play.title, count: items.length, ready: summary.ready },
    suggestions: [
      { title: 'Prioritise contacts', subtitle: 'Rank by best fit and influence', prompt: 'Look at the enrichment list for this idea and tell me which 5 contacts I should reach out to first, by influence and relevance.' },
      { title: 'Find more contacts', subtitle: 'Discover additional contacts at these companies', prompt: 'For the shortlisted companies, suggest two or three additional roles I should hunt contacts for that I haven\'t covered yet.' },
      { title: 'Improve enrichment', subtitle: 'Fill in missing information and verify more emails', prompt: 'Audit the enrichment list and tell me which fields are most often missing across contacts so I can prioritise the next pass.' },
    ],
  });

  const filtered = useMemo(() => {
    return items.filter((c) => {
      if (tab === 'all') return true;
      if (tab === 'ready') return c.status === 'ready';
      if (tab === 'needs_review') return c.status === 'needs_review';
      return true;
    });
  }, [items, tab]);

  const selected = useMemo(() => items.find((c) => c.id === selectedId) ?? filtered[0] ?? null, [items, selectedId, filtered]);

  async function setStatus(id: string, status: 'ready' | 'needs_review' | 'archived') {
    await fetch(`/api/enrichment/${play.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id], status }) });
    setItems((cur) => cur.map((c) => c.id === id ? { ...c, status } : c).filter((c) => c.status !== 'archived'));
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <select
            value={play.id}
            onChange={(e) => router.push(`/enrichment?playId=${e.target.value}`)}
            className="px-2 py-1.5 rounded-md bg-evari-surface text-evari-text text-[12px] border border-evari-edge/40 focus:border-evari-gold/60 focus:outline-none"
          >
            {plays.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-5 gap-2">
          <Stat label="Contacts found" value={summary.found} icon={<Users className="h-4 w-4" />} />
          <Stat label="Enriched" value={summary.enriched} icon={<Sparkles className="h-4 w-4" />} pct={summary.found > 0 ? Math.round(100 * summary.enriched / summary.found) : null} />
          <Stat label="Verified emails" value={summary.verified} icon={<CheckCircle2 className="h-4 w-4" />} pct={summary.enriched > 0 ? Math.round(100 * summary.verified / summary.enriched) : null} />
          <Stat label="Job titles identified" value={summary.jobTitled} icon={<Mail className="h-4 w-4" />} pct={summary.found > 0 ? Math.round(100 * summary.jobTitled / summary.found) : null} />
          <Stat label="Ready to engage" value={summary.ready} icon={<Send className="h-4 w-4" />} accent />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-evari-edge/30">
          {[
            { key: 'all' as Tab, label: 'All contacts', count: items.length },
            { key: 'ready' as Tab, label: 'Ready to engage', count: items.filter((c) => c.status === 'ready').length },
            { key: 'needs_review' as Tab, label: 'Needs review', count: items.filter((c) => c.status === 'needs_review').length },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition',
                tab === t.key ? 'border-evari-gold text-evari-text' : 'border-transparent text-evari-dim hover:text-evari-text')}
            >
              {t.label}
              <span className={cn('inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded text-[10px] font-mono tabular-nums',
                tab === t.key ? 'bg-evari-gold/15 text-evari-gold' : 'bg-evari-ink/40 text-evari-dim')}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Master/detail */}
        <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-3">
          <div className="rounded-md bg-evari-surface border border-evari-edge/30 max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-evari-dim">No contacts in this bucket. Add contacts from the Shortlist page.</div>
            ) : (
              <ul>
                {filtered.map((c) => {
                  const active = selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn('w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-evari-edge/15 transition',
                          active ? 'bg-evari-gold/10 border-l-2 border-l-evari-gold' : 'hover:bg-evari-ink/30')}
                      >
                        <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-evari-ink/40 text-[10px] font-semibold text-evari-dim uppercase shrink-0">
                          {(c.fullName ?? c.email ?? '?').slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-evari-text truncate">{c.fullName ?? '(no name)'}</span>
                            {c.linkedinUrl ? <Linkedin className="h-3 w-3 text-evari-dim shrink-0" /> : null}
                          </div>
                          <div className="text-[11px] text-evari-dim truncate">{c.jobTitle ?? '—'}</div>
                          <div className="text-[10px] text-evari-dimmer truncate">{c.companyName ?? c.domain ?? ''}</div>
                        </div>
                        {c.fitScore !== null ? (
                          <div className={cn('text-[11px] font-mono tabular-nums shrink-0',
                            c.fitScore >= 80 ? 'text-evari-success' : c.fitScore >= 60 ? 'text-evari-text' : 'text-evari-dim')}>
                            {c.fitScore}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          {selected ? (
            <div className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-4">
              <header className="flex items-start gap-3 pb-3 border-b border-evari-edge/20">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-evari-ink/40 text-[12px] font-semibold text-evari-dim uppercase shrink-0">
                  {(selected.fullName ?? selected.email ?? '?').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-evari-text">{selected.fullName ?? '(no name)'}</h2>
                    {selected.emailVerified ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-evari-success/15 text-evari-success">Verified</span> : null}
                  </div>
                  <div className="text-[12px] text-evari-dim">{selected.jobTitle ?? '—'}</div>
                  <div className="text-[12px] text-evari-dim">{selected.companyName ?? '—'}</div>
                </div>
                {selected.fitScore !== null ? (
                  <div className="text-right">
                    <div className={cn('text-2xl font-bold tabular-nums',
                      selected.fitScore >= 80 ? 'text-evari-success' : selected.fitScore >= 60 ? 'text-evari-text' : 'text-evari-dim')}>
                      {selected.fitScore}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Fit</div>
                  </div>
                ) : null}
              </header>

              <section className="grid grid-cols-2 gap-3">
                <Field label="Email">{selected.email ? <span className="font-mono text-[12px]">{selected.email}</span> : '—'}</Field>
                <Field label="Phone">{selected.phone ?? '—'}</Field>
                <Field label="LinkedIn">{selected.linkedinUrl ? <a href={selected.linkedinUrl} target="_blank" rel="noopener" className="text-evari-gold hover:underline truncate inline-block max-w-full">{selected.linkedinUrl}</a> : '—'}</Field>
                <Field label="Department">{selected.department ?? '—'}</Field>
                <Field label="Seniority">{selected.seniority ?? '—'}</Field>
                <Field label="Domain">{selected.domain ?? '—'}</Field>
              </section>

              {selected.aiSummary ? (
                <section className="rounded-md border border-evari-gold/20 bg-evari-gold/5 p-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-gold mb-1.5 inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI enrichment summary</div>
                  <p className="text-[12px] text-evari-text whitespace-pre-wrap leading-relaxed">{selected.aiSummary}</p>
                </section>
              ) : null}

              {selected.signals.length > 0 ? (
                <section>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Relevant activity & signals</div>
                  <ul className="space-y-1.5">
                    {selected.signals.map((s, i) => (
                      <li key={i} className="text-[12px] text-evari-text">
                        {s.text}
                        {s.date ? <span className="text-[10px] text-evari-dimmer ml-2">{s.date}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {selected.suggestedTags.length > 0 ? (
                <section>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-2">Suggested tags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.suggestedTags.map((t) => (
                      <span key={t} className="px-2 py-0.5 rounded-full text-[11px] bg-evari-gold/10 text-evari-gold border border-evari-gold/30">{t}</span>
                    ))}
                  </div>
                </section>
              ) : null}

              <footer className="flex items-center gap-2 pt-2 border-t border-evari-edge/20">
                {selected.status !== 'ready' ? (
                  <button type="button" onClick={() => void setStatus(selected.id, 'ready')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark ready to engage
                  </button>
                ) : null}
                {selected.status !== 'needs_review' ? (
                  <button type="button" onClick={() => void setStatus(selected.id, 'needs_review')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-dim hover:text-evari-text border border-evari-edge/40 hover:border-evari-gold/40 transition">
                    <TriangleAlert className="h-3.5 w-3.5" /> Send to review
                  </button>
                ) : null}
                <div className="flex-1" />
                <button type="button" onClick={() => void setStatus(selected.id, 'archived')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] text-evari-dim hover:text-evari-danger transition">
                  Archive
                </button>
              </footer>
            </div>
          ) : (
            <div className="rounded-md bg-evari-surface border border-evari-edge/30 p-6 text-[13px] text-evari-dim">Pick a contact on the left.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, pct, accent }: { label: string; value: number; icon: React.ReactNode; pct?: number | null; accent?: boolean }) {
  return (
    <div className={cn('rounded-md border p-3', accent ? 'border-evari-gold/30 bg-evari-gold/5' : 'border-evari-edge/30 bg-evari-surface')}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('inline-flex items-center justify-center h-6 w-6 rounded-md',
          accent ? 'bg-evari-gold/15 text-evari-gold' : 'bg-evari-ink/40 text-evari-dim')}>{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums text-evari-text">{value}</div>
      {pct !== null && pct !== undefined ? (
        <div className="text-[10px] text-evari-dim mt-0.5">{pct}%</div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">{label}</div>
      <div className="text-[12px] text-evari-text">{children}</div>
    </div>
  );
}
