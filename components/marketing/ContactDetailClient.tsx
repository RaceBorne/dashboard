'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ContactStatus, ContactWithMeta, Group, MarketingEvent, Tag } from '@/lib/marketing/types';
import { EventTimeline } from './EventTimeline';

interface Props {
  initialContact: ContactWithMeta;
  allGroups: Group[];
  allTags: Tag[];
  initialEvents: MarketingEvent[];
}

const STATUSES: ContactStatus[] = ['active', 'unsubscribed', 'suppressed'];

/**
 * Contact detail — editable identity panel + group/tag assignment
 * panels (replace-semantics PUTs to the API).
 */
export function ContactDetailClient({ initialContact, allGroups, allTags, initialEvents }: Props) {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);

  // Identity edit state
  const [firstName, setFirstName] = useState(contact.firstName ?? '');
  const [lastName, setLastName] = useState(contact.lastName ?? '');
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [company, setCompany] = useState(contact.company ?? '');
  const [status, setStatus] = useState<ContactStatus>(contact.status);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Group / tag selection state — store sets of ids
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set(contact.groups.map((g) => g.id)));
  const [tagIds, setTagIds] = useState<Set<string>>(new Set(contact.tags.map((t) => t.id)));
  const [savingGroups, setSavingGroups] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  // Quick-create new tag
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagPalette, setTagPalette] = useState<Tag[]>(allTags);

  // Quick-create new group
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupPalette, setGroupPalette] = useState<Group[]>(allGroups);

  const dirtyIdentity =
    firstName !== (contact.firstName ?? '') ||
    lastName !== (contact.lastName ?? '') ||
    email !== contact.email ||
    phone !== (contact.phone ?? '') ||
    company !== (contact.company ?? '') ||
    status !== contact.status;

  const dirtyGroups =
    groupIds.size !== contact.groups.length ||
    contact.groups.some((g) => !groupIds.has(g.id));
  const dirtyTags =
    tagIds.size !== contact.tags.length ||
    contact.tags.some((t) => !tagIds.has(t.id));

  async function saveIdentity() {
    if (!dirtyIdentity || savingIdentity) return;
    setSavingIdentity(true);
    setIdentityError(null);
    try {
      const res = await fetch(`/api/marketing/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          email: email.trim(),
          phone: phone.trim() || null,
          company: company.trim() || null,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setContact((c) => ({ ...c, ...data.contact }));
      router.refresh();
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingIdentity(false);
    }
  }

  async function saveGroups() {
    if (!dirtyGroups || savingGroups) return;
    setSavingGroups(true);
    try {
      const res = await fetch(`/api/marketing/contacts/${contact.id}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: [...groupIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setContact((c) => ({ ...c, groups: groupPalette.filter((g) => groupIds.has(g.id)) }));
      router.refresh();
    } catch {
      // surface as a console error for now; toast UX comes later
    } finally {
      setSavingGroups(false);
    }
  }

  async function saveTags() {
    if (!dirtyTags || savingTags) return;
    setSavingTags(true);
    try {
      const res = await fetch(`/api/marketing/contacts/${contact.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: [...tagIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setContact((c) => ({ ...c, tags: tagPalette.filter((t) => tagIds.has(t.id)) }));
      router.refresh();
    } catch {
      // see above
    } finally {
      setSavingTags(false);
    }
  }

  async function quickCreateTag() {
    const name = newTagName.trim();
    if (!name || creatingTag) return;
    setCreatingTag(true);
    try {
      const res = await fetch('/api/marketing/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setTagPalette((tp) => [...tp, data.tag as Tag].sort((a, b) => a.name.localeCompare(b.name)));
        setTagIds((ids) => new Set([...ids, (data.tag as Tag).id]));
        setNewTagName('');
      }
    } finally {
      setCreatingTag(false);
    }
  }

  async function quickCreateGroup() {
    const name = newGroupName.trim();
    if (!name || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const res = await fetch('/api/marketing/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setGroupPalette((gp) => [...gp, data.group as Group].sort((a, b) => a.name.localeCompare(b.name)));
        setGroupIds((ids) => new Set([...ids, (data.group as Group).id]));
        setNewGroupName('');
      }
    } finally {
      setCreatingGroup(false);
    }
  }

  function toggleId(setter: (s: Set<string>) => void, current: Set<string>, id: string) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const inputCls =
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3">
        <Link
          href="/email/contacts"
          className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All contacts
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Identity panel */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
          <h2 className="text-sm font-semibold text-evari-text mb-3">Identity</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">First name</span>
              <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Last name</span>
              <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label className="block col-span-2">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Email</span>
              <input type="email" className={cn(inputCls, 'font-mono text-[12px]')} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Phone</span>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Company</span>
              <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="block col-span-2">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Status</span>
              <div className="flex gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors duration-500 ease-in-out',
                      status === s
                        ? 'bg-evari-gold text-evari-goldInk'
                        : 'bg-evari-ink text-evari-dim hover:text-evari-text',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {identityError ? <span className="text-xs text-evari-danger mr-auto">{identityError}</span> : null}
            <button
              type="button"
              onClick={saveIdentity}
              disabled={!dirtyIdentity || savingIdentity}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40 hover:brightness-105 transition duration-500 ease-in-out"
            >
              {savingIdentity ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {savingIdentity ? 'Saving…' : dirtyIdentity ? 'Save identity' : 'Saved'}
            </button>
          </div>
        </section>

        {/* Groups panel */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-evari-text">Groups</h2>
            <span className="text-xs text-evari-dimmer tabular-nums">{groupIds.size} of {groupPalette.length}</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {groupPalette.length === 0 ? (
              <span className="text-xs text-evari-dimmer italic">No groups yet — create one below.</span>
            ) : (
              groupPalette.map((g) => {
                const on = groupIds.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleId(setGroupIds, groupIds, g.id)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-500 ease-in-out',
                      on
                        ? 'bg-evari-gold text-evari-goldInk'
                        : 'bg-evari-ink text-evari-dim hover:text-evari-text',
                    )}
                  >
                    {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {g.name}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Create new group"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') quickCreateGroup(); }}
              className={cn(inputCls, 'flex-1')}
            />
            <button
              type="button"
              onClick={quickCreateGroup}
              disabled={!newGroupName.trim() || creatingGroup}
              className="px-2.5 py-1.5 rounded-md text-xs bg-evari-ink text-evari-text hover:bg-black/40 disabled:opacity-40"
            >
              {creatingGroup ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={saveGroups}
              disabled={!dirtyGroups || savingGroups}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40"
            >
              {savingGroups ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {savingGroups ? 'Saving…' : dirtyGroups ? 'Save groups' : 'Saved'}
            </button>
          </div>
        </section>

        {/* Tags panel */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-evari-text">Tags</h2>
            <span className="text-xs text-evari-dimmer tabular-nums">{tagIds.size} of {tagPalette.length}</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {tagPalette.length === 0 ? (
              <span className="text-xs text-evari-dimmer italic">No tags yet — create one below.</span>
            ) : (
              tagPalette.map((t) => {
                const on = tagIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleId(setTagIds, tagIds, t.id)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-500 ease-in-out',
                      on
                        ? 'bg-evari-gold text-evari-goldInk'
                        : 'bg-evari-ink text-evari-dim hover:text-evari-text',
                    )}
                  >
                    {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {t.name}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Create new tag"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') quickCreateTag(); }}
              className={cn(inputCls, 'flex-1')}
            />
            <button
              type="button"
              onClick={quickCreateTag}
              disabled={!newTagName.trim() || creatingTag}
              className="px-2.5 py-1.5 rounded-md text-xs bg-evari-ink text-evari-text hover:bg-black/40 disabled:opacity-40"
            >
              {creatingTag ? 'Adding…' : 'Add'}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={saveTags}
              disabled={!dirtyTags || savingTags}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40"
            >
              {savingTags ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {savingTags ? 'Saving…' : dirtyTags ? 'Save tags' : 'Saved'}
            </button>
          </div>
        </section>

        <EventTimeline contactId={contact.id} initialEvents={initialEvents} />
      </div>
    </div>
  );
}
