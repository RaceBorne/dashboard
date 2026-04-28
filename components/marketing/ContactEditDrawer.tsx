'use client';

/**
 * Inline contact-edit slide-over. Mounted from any list / audience
 * surface — clicking a member opens this drawer instead of bouncing
 * to /leads. Edits commit via PATCH /api/marketing/contacts/[id]
 * and surface back on close so the parent list can refresh.
 *
 * Why inline rather than navigating to /leads:
 * - The /leads page is a heavy CRM surface meant for prospect
 *   pipeline work. For a marketing list we just need to fix a
 *   wrong name or add a missing first name; a 600px slide-over
 *   gets you in, fixes the field, gets you out.
 * - The drawer still carries an 'Open full record' link to /leads
 *   for contacts mirrored from prospecting (lead_id present), so
 *   you can drop into the rich view if you really need to.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Contact, ContactStatus } from '@/lib/marketing/types';

interface Props {
  contactId: string;
  /** Optional — if the contact came from prospecting we surface a deep link. */
  leadId: string | null;
  /** Called when the drawer should close (X button or backdrop click). */
  onClose: () => void;
  /** Called after a successful save so the parent list can refetch. */
  onSaved: () => void | Promise<void>;
  /** Optional: called if the operator hits 'Remove from this list' — gives
   *  the parent the chance to fire its own removeMember handler instead
   *  of the drawer guessing which list it lives in. */
  onRemoveFromList?: () => void | Promise<void>;
}

const STATUS_OPTIONS: Array<{ v: ContactStatus; label: string; description: string }> = [
  { v: 'active',       label: 'Active',       description: 'Will receive sends.' },
  { v: 'unsubscribed', label: 'Unsubscribed', description: 'Hard block — they opted out.' },
  { v: 'suppressed',   label: 'Suppressed',   description: 'Hard block — bounce / complaint.' },
];

export function ContactEditDrawer({ contactId, leadId, onClose, onSaved, onRemoveFromList }: Props) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable mirrors of the contact fields.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<ContactStatus>('active');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/marketing/contacts/${contactId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok) throw new Error(d?.error ?? 'Load failed');
        const c = d.contact as Contact;
        setContact(c);
        setFirstName(c.firstName ?? '');
        setLastName(c.lastName ?? '');
        setEmail(c.email ?? '');
        setCompany(c.company ?? '');
        setPhone(c.phone ?? '');
        setStatus(c.status);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contactId]);

  // Computed: is the displayable name actually informative? If not,
  // we'll show a helpful hint at the top to fix it.
  const hasRealName = firstName.trim().length > 0 || lastName.trim().length > 0;
  const displayName = `${firstName} ${lastName}`.trim() || email || '';

  async function save() {
    if (saving) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`/api/marketing/contacts/${contactId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim() || null,
          lastName:  lastName.trim()  || null,
          email:     email.trim().toLowerCase(),
          company:   company.trim() || null,
          phone:     phone.trim()   || null,
          status,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error ?? 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-evari-surface border-l border-evari-edge/40 shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-200">
        <header className="px-4 py-3 border-b border-evari-edge/30 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] text-evari-dimmer">Edit contact</div>
            <h2 className="text-sm font-semibold text-evari-text truncate">{displayName || 'Loading…'}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text p-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-evari-dimmer text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !contact ? (
          <div className="flex-1 flex items-center justify-center text-evari-danger text-sm">{error ?? 'Contact not found'}</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!hasRealName ? (
              <div className="rounded-md border border-evari-warn/40 bg-evari-warn/10 p-3 text-[12px] text-evari-warn">
                <div className="inline-flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" /> No name on this contact
                </div>
                <p className="mt-1 text-[11px] leading-relaxed">
                  Sends will fall back to &quot;there&quot; for the {`{{firstName}}`} merge.
                  Adding a name here also fixes how this contact appears across every list.
                </p>
              </div>
            ) : null}

            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Craig" className={inputCls} />
            </Field>
            <Field label="Last name">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. McDonald" className={inputCls} />
            </Field>
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={cn(inputCls, 'font-mono text-[12px]')} />
            </Field>
            <Field label="Company">
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="(optional)" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(optional)" className={cn(inputCls, 'font-mono')} />
            </Field>

            <Field label="Status">
              <div className="space-y-1">
                {STATUS_OPTIONS.map((opt) => (
                  <label key={opt.v} className="flex items-start gap-2 cursor-pointer p-2 rounded-md border border-evari-edge/20 hover:border-evari-edge/40 transition-colors">
                    <input
                      type="radio"
                      name="status"
                      checked={status === opt.v}
                      onChange={() => setStatus(opt.v)}
                      className="accent-evari-gold mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-evari-text">{opt.label}</div>
                      <div className="text-[10px] text-evari-dim">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Field>

            {leadId ? (
              <a
                href={`/leads?id=${encodeURIComponent(leadId)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-[11px] text-evari-gold hover:underline mt-2"
              >
                Open the full prospect record <ArrowRight className="h-3 w-3" />
              </a>
            ) : null}

            {error ? <p className="text-[11px] text-evari-danger">{error}</p> : null}
          </div>
        )}

        <footer className="px-4 py-3 border-t border-evari-edge/30 flex items-center gap-2">
          {onRemoveFromList ? (
            <button
              type="button"
              onClick={onRemoveFromList}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-evari-dim hover:text-evari-danger transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove from list
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {saved ? <span className="text-[11px] text-evari-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span> : null}
            <button type="button" onClick={onClose} className="text-[12px] text-evari-dim hover:text-evari-text px-3 py-1 rounded">Done</button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading || !email.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save changes
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">{label}</span>
      {children}
    </label>
  );
}
