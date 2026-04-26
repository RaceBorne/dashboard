'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownAZ,
  Copy,
  Grid3x3,
  List,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { EmailTemplate } from '@/lib/marketing/templates';
import { renderEmailDesignWithStub } from '@/lib/marketing/email-design';

interface Props { initialTemplates: EmailTemplate[] }

type Sort = 'updated' | 'name';
type View = 'grid' | 'list';

const SORT_LABEL: Record<Sort, string> = {
  updated: 'Edited most recently',
  name: 'Name (A → Z)',
};

/**
 * Templates list — Klaviyo-style. Toggle between thumbnail grid and
 * compact list. Search by name. Create button drops a new blank
 * template + jumps you straight to the editor.
 */
export function TemplatesClient({ initialTemplates }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [view, setView] = useState<View>('grid');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = templates.filter((t) => !q || t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q));
    out = out.sort((a, b) => sort === 'name'
      ? a.name.localeCompare(b.name)
      : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );
    return out;
  }, [templates, search, sort]);

  async function refresh() {
    const r = await fetch('/api/marketing/templates', { cache: 'no-store' });
    const d = await r.json().catch(() => null);
    if (d?.ok) setTemplates(d.templates);
    router.refresh();
  }

  async function handleCreate(name: string) {
    setCreating(true);
    try {
      const r = await fetch('/api/marketing/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const d = await r.json().catch(() => null);
      if (d?.ok && d.template) {
        // Jump straight into the editor for the new blank template.
        router.push(`/email/templates/${d.template.id}/edit`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/marketing/templates/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate: true }),
      });
      const d = await r.json().catch(() => null);
      if (d?.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/marketing/templates/${id}`, { method: 'DELETE' });
      if (r.ok) {
        setTemplates((curr) => curr.filter((t) => t.id !== id));
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="rounded-md bg-evari-surface border border-evari-edge/30">
        {/* Toolbar */}
        <header className="flex items-center gap-2 p-3 border-b border-evari-edge/20 flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-2 rounded-md bg-evari-ink border border-evari-edge/30 px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-evari-dimmer shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="flex-1 bg-transparent text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="text-evari-dim hover:text-evari-text">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="inline-flex items-center gap-1 rounded-md bg-evari-ink border border-evari-edge/30 px-2 py-1">
            <ArrowDownAZ className="h-3.5 w-3.5 text-evari-dimmer" />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent text-xs text-evari-text focus:outline-none cursor-pointer">
              {(Object.keys(SORT_LABEL) as Sort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select>
          </div>

          <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
            <button type="button" onClick={() => setView('grid')} className={cn('p-1.5 rounded transition-colors', view === 'grid' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>
              <Grid3x3 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setView('list')} className={cn('p-1.5 rounded transition-colors', view === 'list' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}>
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="text-[10px] text-evari-dimmer tabular-nums ml-1">{visible.length} / {templates.length}</span>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Create
          </button>
        </header>

        {/* Content */}
        {visible.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-evari-dimmer">
            {templates.length === 0
              ? 'No templates yet. Click Create to design your first one.'
              : 'Nothing matches that filter.'}
          </div>
        ) : view === 'grid' ? (
          <ul className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {visible.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                busy={busyId === t.id}
                onDuplicate={() => handleDuplicate(t.id)}
                onDelete={() => handleDelete(t.id, t.name)}
              />
            ))}
          </ul>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-evari-ink/40 text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left w-32">Updated</th>
                <th className="px-3 py-2 text-right w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-evari-edge/10">
              {visible.map((t) => (
                <tr key={t.id} className="hover:bg-evari-ink/30 transition-colors">
                  <td className="px-3 py-2">
                    <Link href={`/email/templates/${t.id}/edit`} className="text-evari-text font-medium hover:text-evari-gold">
                      {t.name}
                    </Link>
                    {t.description ? <div className="text-[11px] text-evari-dimmer truncate mt-0.5">{t.description}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                    {new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => handleDuplicate(t.id)} disabled={busyId === t.id} className="px-2 py-1 rounded text-[11px] text-evari-dim hover:text-evari-text inline-flex items-center gap-1">
                      {busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />} Duplicate
                    </button>
                    <button type="button" onClick={() => handleDelete(t.id, t.name)} disabled={busyId === t.id} className="px-2 py-1 rounded text-[11px] text-evari-dim hover:text-evari-danger inline-flex items-center gap-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate ? (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} creating={creating} />
      ) : null}
    </div>
  );
}

function TemplateCard({ template, busy, onDuplicate, onDelete }: { template: EmailTemplate; busy: boolean; onDuplicate: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // For thumbnail: render a tiny scaled-down iframe of the design.
  const previewHtml = useMemo(() => renderEmailDesignWithStub(template.design), [template.design]);
  return (
    <li className="group relative rounded-md border border-evari-edge/30 bg-evari-ink overflow-hidden hover:border-evari-gold/40 transition-colors">
      <Link href={`/email/templates/${template.id}/edit`} className="block">
        {/* Thumbnail — iframe scaled down */}
        <div className="aspect-[3/4] bg-zinc-100 overflow-hidden relative pointer-events-none">
          <iframe
            title={`Preview of ${template.name}`}
            srcDoc={previewHtml}
            className="absolute inset-0 origin-top-left bg-white"
            style={{
              width: '600px',
              height: '800px',
              transform: 'scale(0.4)',
              transformOrigin: 'top left',
              border: 0,
            }}
          />
        </div>
        <div className="p-2">
          <div className="text-sm text-evari-text font-medium truncate">{template.name}</div>
          <div className="text-[10px] text-evari-dimmer font-mono tabular-nums mt-0.5">
            {new Date(template.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </Link>
      {/* Actions menu */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setMenuOpen((o) => !o); }}
        className="absolute top-1.5 right-1.5 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
      </button>
      {menuOpen ? (
        <div className="absolute top-8 right-1.5 z-10 rounded-md bg-evari-surface border border-evari-edge/40 shadow-lg py-1 text-xs min-w-[140px]" onClick={(e) => e.preventDefault()}>
          <button type="button" onClick={() => { setMenuOpen(false); onDuplicate(); }} className="w-full text-left px-3 py-1.5 hover:bg-evari-ink text-evari-text inline-flex items-center gap-2">
            <Copy className="h-3 w-3" /> Duplicate
          </button>
          <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }} className="w-full text-left px-3 py-1.5 hover:bg-evari-ink text-evari-danger inline-flex items-center gap-2">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      ) : null}
    </li>
  );
}

function CreateModal({ onClose, onCreate, creating }: { onClose: () => void; onCreate: (name: string) => Promise<void>; creating: boolean }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">New template</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>
        <p className="text-[11px] text-evari-dimmer">A template is a reusable design. You'll be taken to the full-page editor next.</p>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Template name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Monthly newsletter"
            className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !creating) onCreate(name.trim()); }}
          />
        </label>
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button
            type="button"
            disabled={!name.trim() || creating}
            onClick={() => onCreate(name.trim())}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {creating ? 'Creating' : 'Create + edit'}
          </button>
        </footer>
      </div>
    </div>
  );
}
