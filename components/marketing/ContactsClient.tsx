'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Contact, ContactStatus } from '@/lib/marketing/types';

interface Props {
  initialContacts: Contact[];
}

const STATUS_BADGE: Record<ContactStatus, string> = {
  active: 'bg-evari-success/15 text-evari-success',
  unsubscribed: 'bg-evari-warn/15 text-evari-warn',
  suppressed: 'bg-evari-danger/15 text-evari-danger',
};

/**
 * Contacts list — minimal table + inline 'New contact' creator.
 * Search is client-side over the loaded set (server limits to 500 by
 * default; raise as needed).
 */
export function ContactsClient({ initialContacts }: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state if the server prop updates (router.refresh()).
  useEffect(() => setContacts(initialContacts), [initialContacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      return (
        c.email.toLowerCase().includes(q) ||
        (c.firstName ?? '').toLowerCase().includes(q) ||
        (c.lastName ?? '').toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q)
      );
    });
  }, [contacts, query]);

  async function handleCreate() {
    if (!newEmail.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/marketing/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          firstName: newFirst.trim() || null,
          lastName: newLast.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Create failed');
      setContacts((c) => [data.contact as Contact, ...c]);
      setNewEmail('');
      setNewFirst('');
      setNewLast('');
      setCreating(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      {/* Toolbar */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-evari-dimmer" />
          <input
            type="text"
            placeholder="Search by name, email, company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-panel bg-evari-surface text-evari-text text-sm placeholder:text-evari-dimmer border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out"
          />
        </div>
        <span className="text-xs text-evari-dimmer tabular-nums">
          {filtered.length} of {contacts.length}
        </span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md h-8 px-2.5 text-xs font-semibold bg-evari-gold text-evari-goldInk hover:brightness-105 transition duration-500 ease-in-out"
        >
          <Plus className="h-3.5 w-3.5" />
          New contact
        </button>
      </div>

      {/* Inline create row */}
      {creating ? (
        <div className="mb-3 p-3 rounded-panel bg-evari-surface border border-evari-edge/30">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
              autoFocus
            />
            <input
              type="text"
              placeholder="First name"
              value={newFirst}
              onChange={(e) => setNewFirst(e.target.value)}
              className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Last name"
              value={newLast}
              onChange={(e) => setNewLast(e.target.value)}
              className="px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            {error ? <span className="text-xs text-evari-danger mr-auto">{error}</span> : null}
            <button
              type="button"
              onClick={() => { setCreating(false); setError(null); }}
              className="px-2.5 py-1 rounded-md text-xs text-evari-dim hover:text-evari-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || !newEmail.trim()}
              className="px-2.5 py-1 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-panel bg-evari-surface border border-evari-edge/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-evari-dimmer border-b border-evari-edge/30">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-evari-dimmer text-sm">
                  {contacts.length === 0
                    ? 'No contacts yet. Click New contact to add one.'
                    : 'No contacts match that search.'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-evari-edge/20 last:border-0 hover:bg-evari-surfaceSoft/40 transition-colors"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/email/contacts/${c.id}`}
                      className="text-evari-text font-medium hover:text-evari-gold transition-colors"
                    >
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-evari-text font-mono text-[12px]">{c.email}</td>
                  <td className="px-3 py-2 text-evari-dim">{c.company ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium',
                        STATUS_BADGE[c.status],
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-evari-dim text-xs">{c.source ?? '—'}</td>
                  <td className="px-3 py-2 text-evari-dimmer text-xs font-mono tabular-nums">
                    {new Date(c.createdAt).toISOString().slice(0, 10)}
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
