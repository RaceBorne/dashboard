'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mail, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OutreachSender } from '@/lib/types';

const DEFAULT_SIGNATURE = `<p><strong>{{displayName}}</strong>{{#if role}} · {{role}}{{/if}}<br/>
Evari Speed Bikes<br/>
<a href="mailto:{{email}}">{{email}}</a></p>
{{#if logoUrl}}<img src="{{logoUrl}}" alt="Evari" height="32"/>{{/if}}`;

type Draft = {
  id?: string;
  email: string;
  displayName: string;
  role: string;
  signatureHtml: string;
  logoUrl: string;
  isActive: boolean;
  isDefault: boolean;
  oauthConnected: boolean;
};

const emptyDraft = (): Draft => ({
  email: '',
  displayName: '',
  role: '',
  signatureHtml: DEFAULT_SIGNATURE,
  logoUrl: '',
  isActive: true,
  isDefault: false,
  oauthConnected: false,
});

export function SendersSection() {
  const [senders, setSenders] = useState<OutreachSender[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbNote, setDbNote] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      const res = await fetch('/api/senders');
      const json = (await res.json()) as {
        senders?: OutreachSender[];
        note?: string;
        error?: string;
      };
      if (json.error) throw new Error(json.error);
      setSenders(json.senders ?? []);
      setDbNote(json.note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSenders([]);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const isEdit = Boolean(editing.id);
      const url = isEdit ? `/api/senders/${editing.id}` : '/api/senders';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: editing.email.trim(),
          displayName: editing.displayName.trim(),
          role: editing.role.trim() || undefined,
          signatureHtml: editing.signatureHtml,
          logoUrl: editing.logoUrl || undefined,
          isActive: editing.isActive,
          isDefault: editing.isDefault,
          oauthConnected: editing.oauthConnected,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this sender? This does not revoke the Google OAuth grant — do that in your Google account.'))
      return;
    try {
      const res = await fetch(`/api/senders/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || 'Delete failed');
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="rounded-xl bg-evari-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium mb-1">
            Outreach
          </div>
          <div className="text-sm font-medium text-evari-text">Email senders</div>
          <div className="text-xs text-evari-dim mt-0.5 max-w-md">
            The Gmail mailboxes the outreach engine sends from. Each sender
            has its own display name, role, and signature — pick one per
            Play. Google OAuth is wired up separately per sender so one
            mailbox can't leak into another.
          </div>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setEditing(emptyDraft())}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add sender</span>
        </Button>
      </div>

      {dbNote ? (
        <div className="text-xs text-evari-warn bg-evari-warn/10 rounded-md px-3 py-2">
          {dbNote} — saved senders will start appearing once the DB is connected.
        </div>
      ) : null}

      {error ? (
        <div className="text-xs text-evari-critical bg-evari-critical/10 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        {senders === null ? (
          <div className="flex items-center gap-2 text-xs text-evari-dim px-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading senders…
          </div>
        ) : senders.length === 0 ? (
          <div className="rounded-md border border-dashed border-evari-edge/60 px-4 py-6 text-center">
            <Mail className="h-5 w-5 text-evari-dimmer mx-auto mb-2" />
            <div className="text-sm text-evari-text">No senders yet</div>
            <div className="text-xs text-evari-dim mt-0.5 max-w-sm mx-auto">
              Add the Gmail mailbox you want outreach to send from (e.g.
              craig.mcdonald@evari.cc). You can add more later.
            </div>
          </div>
        ) : (
          senders.map((s) => (
            <SenderRow
              key={s.id}
              sender={s}
              onEdit={() =>
                setEditing({
                  id: s.id,
                  email: s.email,
                  displayName: s.displayName,
                  role: s.role ?? '',
                  signatureHtml: s.signatureHtml,
                  logoUrl: s.logoUrl ?? '',
                  isActive: s.isActive,
                  isDefault: Boolean(s.isDefault),
                  oauthConnected: s.oauthConnected,
                })
              }
              onDelete={() => remove(s.id)}
            />
          ))
        )}
      </div>

      {editing ? (
        <SenderEditor
          draft={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={save}
          saving={saving}
        />
      ) : null}
    </section>
  );
}

function SenderRow({
  sender,
  onEdit,
  onDelete,
}: {
  sender: OutreachSender;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-evari-surfaceSoft px-3 py-2">
      <div className="h-8 w-8 rounded-full bg-evari-edge flex items-center justify-center overflow-hidden shrink-0">
        {sender.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sender.logoUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <Mail className="h-3.5 w-3.5 text-evari-dim" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-evari-text truncate">
            {sender.displayName}
          </div>
          {sender.isDefault ? (
            <Badge variant="muted" className="text-[10px]">Default</Badge>
          ) : null}
          {!sender.isActive ? (
            <Badge variant="muted" className="text-[10px]">Paused</Badge>
          ) : null}
          {sender.oauthConnected ? (
            <Badge variant="muted" className="text-[10px] text-evari-success">
              <Check className="h-2.5 w-2.5 mr-1 inline" />OAuth
            </Badge>
          ) : (
            <Badge variant="muted" className="text-[10px]">Not connected</Badge>
          )}
        </div>
        <div className="text-xs text-evari-dim truncate">
          {sender.email}{sender.role ? ` · ${sender.role}` : ''}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="p-1.5 rounded text-evari-dim hover:text-evari-text hover:bg-evari-surface"
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded text-evari-dim hover:text-evari-critical hover:bg-evari-surface"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SenderEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onLogoFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 400_000) {
      alert('Logo is too big. Max 400KB — use a small PNG or SVG.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ ...draft, logoUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="rounded-lg border border-evari-edge/60 bg-evari-surfaceSoft/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer font-medium">
          {draft.id ? 'Edit sender' : 'New sender'}
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded text-evari-dim hover:text-evari-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Display name">
          <Input
            placeholder="Craig McDonald"
            value={draft.displayName}
            onChange={(e) => onChange({ ...draft, displayName: e.target.value })}
          />
        </Field>
        <Field label="Email address">
          <Input
            type="email"
            placeholder="craig.mcdonald@evari.cc"
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
          />
        </Field>
        <Field label="Role / title (optional)">
          <Input
            placeholder="Founder · Evari Speed Bikes"
            value={draft.role}
            onChange={(e) => onChange({ ...draft, role: e.target.value })}
          />
        </Field>
        <Field label="Logo (optional, embeds in signature)">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex items-center gap-2 h-9 px-3 rounded-md text-xs',
                'bg-evari-surfaceSoft text-evari-text hover:bg-evari-mute/60',
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {draft.logoUrl ? 'Replace' : 'Upload'}
            </button>
            {draft.logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.logoUrl}
                  alt=""
                  className="h-8 w-auto bg-white rounded border border-evari-edge/50"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, logoUrl: '' })}
                  className="text-xs text-evari-dim hover:text-evari-critical"
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="text-xs text-evari-dim">No logo</span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => onLogoFile(e.target.files?.[0])}
              style={{ display: 'none' }}
            />
          </div>
        </Field>
      </div>

      <Field label="Signature (HTML — supports {{displayName}}, {{role}}, {{email}}, {{logoUrl}})">
        <Textarea
          rows={6}
          value={draft.signatureHtml}
          onChange={(e) => onChange({ ...draft, signatureHtml: e.target.value })}
          className="font-mono text-xs"
        />
      </Field>

      <div className="rounded-md bg-evari-bg/40 border border-evari-edge/50 p-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer mb-2">
          Preview
        </div>
        <div
          className="text-evari-text text-sm [&_a]:text-evari-gold [&_a]:underline [&_p]:my-1 [&_img]:my-2 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{
            __html: renderSignature(draft),
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <label className="flex items-center gap-2 text-xs text-evari-text">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(e) => onChange({ ...draft, isDefault: e.target.checked })}
          />
          Default sender for new Plays
        </label>
        <label className="flex items-center gap-2 text-xs text-evari-text">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => onChange({ ...draft, isActive: e.target.checked })}
          />
          Active (available in pickers)
        </label>
        <label className="flex items-center gap-2 text-xs text-evari-text">
          <input
            type="checkbox"
            checked={draft.oauthConnected}
            onChange={(e) => onChange({ ...draft, oauthConnected: e.target.checked })}
          />
          OAuth connected (tick once refresh token is in .env.local)
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="default" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {draft.id ? 'Save changes' : 'Create sender'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Lightweight preview — substitutes {{slots}} with draft values and strips
 * the {{#if role}}…{{/if}} blocks based on presence. Not the full renderer
 * used at send time; just enough for WYSIWYG.
 */
function renderSignature(d: Draft): string {
  let html = d.signatureHtml;
  const stripIf = (token: string, present: boolean) => {
    const re = new RegExp(`{{#if ${token}}}([\\s\\S]*?){{/if}}`, 'g');
    html = html.replace(re, (_m, inner) => (present ? inner : ''));
  };
  stripIf('role', Boolean(d.role));
  stripIf('logoUrl', Boolean(d.logoUrl));
  html = html
    .replaceAll('{{displayName}}', escapeHtml(d.displayName || 'Your name'))
    .replaceAll('{{role}}', escapeHtml(d.role || ''))
    .replaceAll('{{email}}', escapeHtml(d.email || 'you@evari.cc'))
    .replaceAll('{{logoUrl}}', d.logoUrl || '');
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
