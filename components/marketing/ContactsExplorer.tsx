'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Building2,
  CheckSquare,
  ExternalLink,
  Folder,
  FolderOpen,
  Inbox,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  Square,
  Tag as TagIcon,
  User,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
  ContactFolder,
  ContactsBundle,
  EmailContact,
  EmailContactActivity,
} from '@/lib/marketing/leads-as-contacts';

interface Props {
  initialBundle: ContactsBundle;
}

const STAGE_DOT: Record<string, string> = {
  live:     'bg-evari-success',
  paused:   'bg-evari-gold',
  done:     'bg-evari-dim',
  idea:     'bg-evari-edge',
  archived: 'bg-evari-dimmer',
};

/**
 * Three-pane CRM explorer for /email/contacts.
 *
 *   LEFT  — folders (All / Manual / Unsorted / each Play). Live count.
 *   MID   — contact list filtered by selected folder + free-text search.
 *   RIGHT — full CRM detail for the selected contact, with inline edit.
 *
 * All data comes from dashboard_leads — the same table the prospecting
 * tool writes to. New prospects appear in the relevant Play folder
 * automatically; manual contacts land in the "Manual" folder.
 */
export function ContactsExplorer({ initialBundle }: Props) {
  const router = useRouter();
  const [bundle, setBundle] = useState<ContactsBundle>(initialBundle);
  const [folderId, setFolderId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkOp, setBulkOp] = useState<null | 'addTag' | 'removeTag'>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const folders = bundle.folders;
  const contacts = bundle.contacts;

  // Filter to the selected folder + search.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (folderId === 'all') {
        // include everything
      } else if (folderId === 'manual') {
        if (c.playId || c.source !== 'manual') return false;
      } else if (folderId === 'unsorted') {
        if (c.playId || c.source === 'manual') return false;
      } else if (folderId.startsWith('tag:')) {
        const tag = folderId.slice(4);
        if (!c.tags.includes(tag)) return false;
      } else {
        if (c.playId !== folderId) return false;
      }
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.companyName ?? '').toLowerCase().includes(q) ||
        (c.jobTitle ?? '').toLowerCase().includes(q)
      );
    });
  }, [contacts, folderId, search]);

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) ?? null,
    [contacts, selectedId],
  );

  async function refresh() {
    const res = await fetch('/api/marketing/contacts/leads', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setBundle({ folders: data.folders, contacts: data.contacts });
      router.refresh();
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-evari-ink p-2 flex gap-2">
      {/* ─── LEFT — folder sidebar ─────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        <div className="px-3 py-2.5 border-b border-evari-edge/20 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-evari-text uppercase tracking-[0.12em]">Folders</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-evari-gold/10 text-evari-gold hover:bg-evari-gold/20 transition-colors"
            title="Add a contact manually"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {folders.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              active={f.id === folderId}
              onClick={() => { setFolderId(f.id); setSelectedId(null); setChecked(new Set()); }}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowNewGroup(true)}
          className="flex items-center gap-1.5 px-3 py-2 border-t border-evari-edge/20 text-[11px] text-evari-dim hover:text-evari-text hover:bg-evari-ink/40 transition-colors"
          title="Create a tag-based marketing list"
        >
          <TagIcon className="h-3 w-3" /> New list
        </button>
      </aside>

      {/* ─── MID — contact list ────────────────────────────────────────── */}
      <section className="flex-1 min-w-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        <header className="px-3 py-2 border-b border-evari-edge/20 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-evari-dimmer" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company, role…"
            className="flex-1 bg-transparent text-sm text-evari-text placeholder:text-evari-dimmer focus:outline-none"
          />
          <span className="text-[10px] text-evari-dimmer tabular-nums">{visible.length} / {contacts.length}</span>
        </header>
        {visible.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm">
            {contacts.length === 0
              ? 'No contacts yet — prospects sourced by the Outreach agent land here automatically.'
              : 'Nothing matches that filter.'}
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-evari-edge/10">
            {visible.map((c) => (
              <ContactListRow
                key={c.id}
                contact={c}
                active={c.id === selectedId}
                checked={checked.has(c.id)}
                onToggle={() => setChecked((s) => {
                  const next = new Set(s);
                  if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                  return next;
                })}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
          </ul>
        )}
        {checked.size > 0 ? (
          <div className="border-t border-evari-edge/30 bg-evari-ink px-3 py-2 flex items-center gap-2">
            <span className="text-[11px] text-evari-text">
              <strong>{checked.size}</strong> selected
            </span>
            <button
              type="button"
              onClick={() => { setChecked(new Set(visible.map((c) => c.id))); }}
              className="text-[10px] text-evari-dim hover:text-evari-text underline underline-offset-2"
            >Select all visible</button>
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="text-[10px] text-evari-dim hover:text-evari-text underline underline-offset-2"
            >Clear</button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setBulkOp('addTag')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-evari-ink/60 text-evari-text hover:bg-black/40 transition-colors"
              >
                <TagIcon className="h-3 w-3" /> Add to list
              </button>
              <button
                type="button"
                onClick={() => setBulkOp('removeTag')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-evari-ink/60 text-evari-text hover:bg-black/40 transition-colors"
              >
                <X className="h-3 w-3" /> Remove from list
              </button>
              <a
                href={`/email/campaigns/new?ids=${Array.from(checked).join(',')}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 transition"
              >
                <Send className="h-3 w-3" /> Send campaign
              </a>
            </div>
          </div>
        ) : null}
      </section>

      {/* ─── RIGHT — detail ────────────────────────────────────────────── */}
      <aside className="w-[400px] shrink-0 rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col">
        {selected ? (
          <ContactDetail
            contact={selected}
            onSaved={(next) => {
              setBundle((b) => ({ ...b, contacts: b.contacts.map((c) => (c.id === next.id ? next : c)) }));
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-evari-dimmer text-sm gap-2">
            <User className="h-8 w-8 opacity-40" />
            <p>Pick a contact to see the full record.</p>
          </div>
        )}
      </aside>

      {showCreate ? (
        <CreateContactModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => { await refresh(); setShowCreate(false); }}
        />
      ) : null}

      {bulkOp ? (
        <BulkTagModal
          op={bulkOp}
          ids={Array.from(checked)}
          allLists={folders.filter((f) => f.kind === 'tag').map((f) => ({ name: f.label, count: f.count }))}
          selectedTags={Array.from(checked).flatMap((id) => contacts.find((c) => c.id === id)?.tags ?? [])}
          onClose={() => setBulkOp(null)}
          onDone={async () => { setBulkOp(null); setChecked(new Set()); await refresh(); }}
        />
      ) : null}

      {showNewGroup ? (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(name) => {
            setShowNewGroup(false);
            setFolderId(`tag:${name}`);
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Folder row ─────────────────────────────────────────────────

function FolderRow({ folder, active, onClick }: { folder: ContactFolder; active: boolean; onClick: () => void }) {
  const Icon = folder.kind === 'all' ? Inbox : folder.kind === 'manual' ? User : folder.kind === 'unsorted' ? Folder : FolderOpen;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-200 text-left',
          active ? 'bg-evari-ink/60 text-evari-text' : 'text-evari-dim hover:bg-evari-ink/30 hover:text-evari-text',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {folder.kind === 'play' && folder.playStage ? (
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STAGE_DOT[folder.playStage] ?? 'bg-evari-edge')} />
        ) : null}
        <span className="flex-1 truncate">{folder.label}</span>
        <span className="text-[10px] tabular-nums text-evari-dimmer">{folder.count}</span>
      </button>
    </li>
  );
}

// ─── Contact list row ──────────────────────────────────────────

function ContactListRow({ contact, active, checked, onToggle, onClick }: { contact: EmailContact; active: boolean; checked: boolean; onToggle: () => void; onClick: () => void }) {
  // Initials avatar — first letter of first + (last word of) full name
  const initials = (() => {
    const parts = (contact.fullName || contact.email || '?').split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '?';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase().slice(0, 2);
  })();
  const lastTouch = contact.lastActivityAt ?? contact.lastTouchAt;
  return (
    <li className={cn('flex items-stretch transition-colors duration-150 border-l-2', active ? 'bg-evari-ink/70 border-evari-gold' : 'hover:bg-evari-ink/30 border-transparent')}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="px-2 flex items-center text-evari-dim hover:text-evari-text transition-colors"
        aria-label={checked ? 'Deselect' : 'Select'}
      >
        {checked ? <CheckSquare className="h-3.5 w-3.5 text-evari-gold" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onClick}
        className="flex-1 px-2 py-2.5 text-left min-w-0 flex items-start gap-2.5"
      >
        {/* Avatar — Klaviyo-style initials chip */}
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 border',
          active ? 'bg-evari-gold/15 text-evari-gold border-evari-gold/30' : 'bg-evari-ink border-evari-edge/40 text-evari-dim',
        )}>
          {initials}
        </div>
        {/* Identity column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-sm truncate', active ? 'font-semibold text-evari-text' : 'text-evari-text')}>
              {contact.fullName || contact.email}
            </span>
            {contact.emailInferred ? (
              <span className="text-[9px] uppercase tracking-[0.1em] text-evari-gold/80 px-1.5 py-0 rounded bg-evari-gold/10 shrink-0" title="Email was AI-inferred — verify before sending">inferred</span>
            ) : null}
          </div>
          <div className="text-[11px] text-evari-dim truncate font-mono">{contact.email}</div>
          {(contact.jobTitle || contact.companyName) ? (
            <div className="text-[11px] text-evari-dimmer truncate mt-0.5">
              {contact.jobTitle ? <span className="text-evari-dim">{contact.jobTitle}</span> : null}
              {contact.jobTitle && contact.companyName ? <span className="text-evari-dimmer"> · </span> : null}
              {contact.companyName ?? null}
            </div>
          ) : null}
          {contact.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {contact.tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[9px] uppercase tracking-[0.08em] text-evari-dim bg-evari-ink/60 px-1.5 py-0.5 rounded">{t}</span>
              ))}
              {contact.tags.length > 4 ? <span className="text-[9px] text-evari-dimmer">+{contact.tags.length - 4}</span> : null}
            </div>
          ) : null}
        </div>
        {/* Right column — last activity + status dot */}
        <div className="shrink-0 flex flex-col items-end gap-0.5 text-right">
          <span className={cn(
            'inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full border',
            contact.status === 'active'
              ? 'bg-evari-success/10 text-evari-success border-evari-success/30'
              : contact.status === 'unsubscribed'
                ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                : 'bg-evari-danger/10 text-evari-danger border-evari-danger/30',
          )}>
            {contact.status}
          </span>
          {lastTouch ? (
            <span className="text-[10px] text-evari-dimmer font-mono tabular-nums">
              {new Date(lastTouch).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

// ─── Detail panel ──────────────────────────────────────────────

function ContactDetail({ contact, onSaved }: { contact: EmailContact; onSaved: (c: EmailContact) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EmailContact>(contact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the draft when the user picks a different contact.
  if (draft.id !== contact.id) {
    setDraft(contact);
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/contacts/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          fullName: draft.fullName,
          email: draft.email,
          phone: draft.phone ?? '',
          jobTitle: draft.jobTitle ?? '',
          companyName: draft.companyName ?? '',
          companyUrl: draft.companyUrl ?? '',
          linkedinUrl: draft.linkedinUrl ?? '',
          location: draft.location ?? '',
          address: draft.address ?? '',
          synopsis: draft.synopsis ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data.contact as EmailContact);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="px-4 py-3 border-b border-evari-edge/20 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-evari-ink border border-evari-edge/30 flex items-center justify-center text-evari-text font-semibold shrink-0">
          {(contact.fullName || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-evari-text truncate">{contact.fullName}</h3>
          <p className="text-[11px] text-evari-dim truncate">
            {contact.jobTitle ? `${contact.jobTitle} · ` : ''}{contact.companyName ?? '—'}
          </p>
          {contact.playTitle ? (
            <p className="text-[10px] text-evari-dimmer truncate mt-0.5">From play · {contact.playTitle}</p>
          ) : null}
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setDraft(contact); setEditing(false); setError(null); }}
              className="text-[11px] text-evari-dim hover:text-evari-text px-2 py-1 rounded"
            >Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-2 py-1 rounded disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-evari-dim hover:text-evari-text px-2 py-1 rounded"
          >Edit</button>
        )}
      </header>

      {error ? <div className="px-4 pt-2 text-[11px] text-evari-danger">{error}</div> : null}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <FieldGroup title="Contact">
          <Field label="Email" icon={Mail} value={draft.email} editing={editing} mono onChange={(v) => setDraft({ ...draft, email: v })} />
          <Field label="Phone" icon={Phone} value={draft.phone ?? ''} editing={editing} onChange={(v) => setDraft({ ...draft, phone: v })} />
          <Field label="LinkedIn" icon={Linkedin} value={draft.linkedinUrl ?? ''} editing={editing} mono asLink onChange={(v) => setDraft({ ...draft, linkedinUrl: v })} />
        </FieldGroup>

        <FieldGroup title="Company">
          <Field label="Company name" icon={Building2} value={draft.companyName ?? ''} editing={editing} onChange={(v) => setDraft({ ...draft, companyName: v })} />
          <Field label="Job title" value={draft.jobTitle ?? ''} editing={editing} onChange={(v) => setDraft({ ...draft, jobTitle: v })} />
          <Field label="Website" value={draft.companyUrl ?? ''} editing={editing} mono asLink onChange={(v) => setDraft({ ...draft, companyUrl: v })} />
        </FieldGroup>

        <FieldGroup title="Location">
          <Field label="Region" icon={MapPin} value={draft.location ?? ''} editing={editing} onChange={(v) => setDraft({ ...draft, location: v })} />
          <Field label="Postal address" value={draft.address ?? ''} editing={editing} multiline onChange={(v) => setDraft({ ...draft, address: v })} />
        </FieldGroup>

        {(draft.synopsis ?? contact.synopsis) ? (
          <FieldGroup title="Synopsis">
            <Field label="" value={draft.synopsis ?? ''} editing={editing} multiline onChange={(v) => setDraft({ ...draft, synopsis: v })} />
          </FieldGroup>
        ) : null}

        <FieldGroup title="Marketing">
          <ReadOnlyRow label="Status" value={contact.status} />
          {contact.tags.length > 0 ? (
            <ReadOnlyRow label="Tags" value={contact.tags.join(', ')} />
          ) : null}
          <ReadOnlyRow label="Source" value={contact.sourceDetail || contact.source} />
          <ReadOnlyRow label="First seen" value={new Date(contact.firstSeenAt).toLocaleDateString()} />
          <ReadOnlyRow label="Last touch" value={new Date(contact.lastTouchAt).toLocaleDateString()} />
        </FieldGroup>

        <FieldGroup title={`Activity · ${contact.activityCount}`}>
          <ActivityTimeline events={contact.activity} />
        </FieldGroup>
      </div>
    </>
  );
}

function ActivityTimeline({ events }: { events: EmailContactActivity[] }) {
  if (!events.length) {
    return <p className="text-[11px] text-evari-dimmer italic">No activity yet — events from sends, opens, clicks + outreach show here.</p>;
  }
  return (
    <ol className="space-y-1.5">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-2 text-[11px]">
          <Activity className="h-3 w-3 text-evari-dimmer mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-evari-text leading-snug">{e.summary}</div>
            <div className="text-evari-dimmer font-mono tabular-nums">{new Date(e.at).toLocaleString()} · {e.type}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1.5">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Field({ label, icon: Icon, value, editing, mono, multiline, asLink, onChange }: {
  label: string;
  icon?: typeof Mail;
  value: string;
  editing: boolean;
  mono?: boolean;
  multiline?: boolean;
  asLink?: boolean;
  onChange: (v: string) => void;
}) {
  if (editing) {
    return (
      <label className="block">
        {label ? <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">{label}</span> : null}
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn('w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none min-h-[60px]', mono && 'font-mono text-[12px]')}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn('w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none', mono && 'font-mono text-[12px]')}
          />
        )}
      </label>
    );
  }
  if (!value) {
    return label ? <ReadOnlyRow label={label} value={<span className="text-evari-dimmer italic">—</span>} /> : null;
  }
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon ? <Icon className="h-3.5 w-3.5 text-evari-dimmer mt-0.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        {label ? <div className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">{label}</div> : null}
        {asLink && /^https?:\/\//.test(value) ? (
          <a href={value} target="_blank" rel="noopener" className={cn('text-evari-text break-all hover:text-evari-gold transition-colors inline-flex items-start gap-1', mono && 'font-mono text-[12px]')}>
            <span className="break-all">{value}</span>
            <ExternalLink className="h-3 w-3 shrink-0 mt-1" />
          </a>
        ) : (
          <div className={cn('text-evari-text break-words whitespace-pre-wrap', mono && 'font-mono text-[12px]')}>{value}</div>
        )}
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-[10px] uppercase tracking-[0.1em] text-evari-dimmer w-24 shrink-0">{label}</span>
      <span className="flex-1 text-evari-text break-words">{value}</span>
    </div>
  );
}

// ─── Create modal ──────────────────────────────────────────────

function CreateContactModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!fullName.trim() || !email.trim()) {
      setError('Name + email required');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/marketing/contacts/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, companyName, jobTitle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Create failed');
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">Add a contact</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Full name *</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Email *</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Job title</span>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">Company</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" />
          </label>
        </div>
        {error ? <p className="text-[11px] text-evari-danger">{error}</p> : null}
        <footer className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {saving ? 'Adding' : 'Add contact'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Bulk-tag modal ────────────────────────────────────────────

function BulkTagModal({ op, ids, allLists, selectedTags, onClose, onDone }: { op: 'addTag' | 'removeTag'; ids: string[]; allLists: { name: string; count: number }[]; selectedTags: string[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [tag, setTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdd = op === 'addTag';
  // For Remove: only show the lists the currently-checked contacts
  // actually belong to (intersection isn't useful when they vary, so
  // show the UNION — any list at least one selected contact is on).
  const removeOptions = useMemo(() => {
    const set = new Set(selectedTags);
    return allLists.filter((l) => set.has(l.name));
  }, [allLists, selectedTags]);
  // For Add: every existing list is fair game, sorted by member count.
  const addOptions = useMemo(() => [...allLists].sort((a, b) => b.count - a.count), [allLists]);
  const options = isAdd ? addOptions : removeOptions;

  async function submit(value: string) {
    const v = value.trim();
    if (!v) { setError('List name required'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/marketing/contacts/leads/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, op, value: v }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Bulk update failed');
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">
            {isAdd
              ? `Add ${ids.length} contact${ids.length === 1 ? '' : 's'} to list`
              : `Remove ${ids.length} contact${ids.length === 1 ? '' : 's'} from list`}
          </h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>

        {options.length > 0 ? (
          <div className="space-y-1">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer">{isAdd ? 'Pick a list' : 'Lists these contacts are on'}</span>
            <ul className="max-h-[260px] overflow-y-auto rounded-md border border-evari-edge/30 divide-y divide-evari-edge/15">
              {options.map((l) => (
                <li key={l.name}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => submit(l.name)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] text-evari-text hover:bg-evari-ink/40 disabled:opacity-50"
                  >
                    <span className="truncate">{l.name}</span>
                    <span className="text-[10px] text-evari-dim font-mono tabular-nums shrink-0">{l.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : !isAdd ? (
          <p className="text-[11px] text-evari-dimmer">None of the selected contacts are on a list yet.</p>
        ) : null}

        {isAdd ? (
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">{options.length > 0 ? 'Or create a new list' : 'New list name'}</span>
            <div className="flex items-center gap-1">
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="VIP / Newsletter / Beta…"
                className="flex-1 px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
                autoFocus={options.length === 0}
                onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim()) submit(tag); }}
              />
              <button
                type="button"
                disabled={saving || !tag.trim()}
                onClick={() => submit(tag)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {saving ? 'Saving' : 'Add'}
              </button>
            </div>
          </label>
        ) : null}

        {error ? <p className="text-[11px] text-evari-danger">{error}</p> : null}
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
        </footer>
      </div>
    </div>
  );
}

// ─── New list modal ───────────────────────────────────────────

function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-md bg-evari-surface border border-evari-edge/40 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-evari-text">New list</h3>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text"><X className="h-4 w-4" /></button>
        </header>
        <p className="text-[11px] text-evari-dimmer">
          Lists in Evari are tag-based. The folder will appear as soon as you add at least one contact to it via the bulk &ldquo;Add to list&rdquo; action.
        </p>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.1em] text-evari-dimmer mb-0.5">List name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VIP / Newsletter / Beta…"
            autoFocus
            className="w-full px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreated(name.trim()); }}
          />
        </label>
        <footer className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Cancel</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onCreated(name.trim())}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded disabled:opacity-50"
          >
            Create
          </button>
        </footer>
      </div>
    </div>
  );
}
