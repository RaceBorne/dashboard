'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mail, Pencil, Plus, Send, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OutreachSender } from '@/lib/types';
import { DEFAULT_SIGNATURE_HTML } from '@/lib/mock/senders';
import { renderSignature } from '@/lib/dashboard/signature';

type Draft = {
  id?: string;
  email: string;
  displayName: string;
  role: string;
  phone: string;
  website: string;
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
  phone: '',
  website: 'evari.cc',
  signatureHtml: DEFAULT_SIGNATURE_HTML,
  logoUrl: '/email/evari-blue.png',
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
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

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
          phone: editing.phone.trim() || undefined,
          website: editing.website.trim() || undefined,
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

  async function sendTest(id: string) {
    setSendingTestId(id);
    setTestNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/senders/${id}/test-send`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        ok?: boolean;
        recipient?: string;
        error?: string;
      };
      if (res.ok === false || json.ok === false) {
        throw new Error(json.error || 'Send failed');
      }
      setTestNote(
        `Sent — check ${json.recipient ?? 'your inbox'} in a few seconds.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingTestId(null);
    }
  }

  return (
    <section className="rounded-xl bg-evari-surface p-6 space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-evari-dimmer font-medium mb-1">
            Outreach
          </div>
          <div className="text-sm font-medium text-evari-text">Email senders</div>
          <div className="text-xs text-evari-dim mt-0.5 max-w-md">
            The Gmail mailboxes the outreach engine sends from. Each sender
            has its own display name, role, phone, and signature — pick one
            per Play. Google OAuth is wired up separately per sender so one
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
      {testNote ? (
        <div className="text-xs text-evari-success bg-evari-success/10 rounded-md px-3 py-2">
          {testNote}
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
              craig@evari.cc). You can add more later.
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
                  phone: s.phone ?? '',
                  website: s.website ?? '',
                  signatureHtml: s.signatureHtml,
                  logoUrl: s.logoUrl ?? '',
                  isActive: s.isActive,
                  isDefault: Boolean(s.isDefault),
                  oauthConnected: s.oauthConnected,
                })
              }
              onDelete={() => remove(s.id)}
              onSendTest={() => sendTest(s.id)}
              sending={sendingTestId === s.id}
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
  onSendTest,
  sending,
}: {
  sender: OutreachSender;
  onEdit: () => void;
  onDelete: () => void;
  onSendTest: () => void;
  sending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-evari-surfaceSoft px-3 py-2.5">
      {sender.logoUrl ? (
        // Wide brand wordmarks don't fit in a circle — use a fixed-size
        // white rectangle with object-contain so anything from square
        // glyphs to 450x50 wordmarks looks tidy.
        <div className="h-8 w-14 rounded bg-white border border-evari-edge/50 flex items-center justify-center overflow-hidden shrink-0 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sender.logoUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="h-8 w-8 rounded-full bg-evari-edge flex items-center justify-center overflow-hidden shrink-0">
          <Mail className="h-3.5 w-3.5 text-evari-dim" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
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
          {sender.email}{sender.role ? ' · ' + sender.role : ''}
        </div>
      </div>
      <button
        onClick={onSendTest}
        disabled={sending}
        className="p-1.5 rounded text-evari-dim hover:text-evari-text hover:bg-evari-surface disabled:opacity-50"
        title="Send test email to yourself"
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
      </button>
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
    <div className="rounded-lg border border-evari-edge/60 bg-evari-surfaceSoft/50 p-5 space-y-5">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            placeholder="craig@evari.cc"
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
          />
        </Field>
        <Field label="Role / title (optional)">
          <Input
            placeholder="CEO & Head of Design"
            value={draft.role}
            onChange={(e) => onChange({ ...draft, role: e.target.value })}
          />
        </Field>
        <Field label="Phone (optional)">
          <Input
            placeholder="UK (M) +44 (0)7720 288398"
            value={draft.phone}
            onChange={(e) => onChange({ ...draft, phone: e.target.value })}
          />
        </Field>
        <Field label="Logo (embeds in signature)">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex items-center gap-2 h-9 px-3 rounded-md text-xs shrink-0',
                'bg-evari-surfaceSoft text-evari-text hover:bg-evari-mute/60',
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {draft.logoUrl ? 'Replace' : 'Upload'}
            </button>
            {draft.logoUrl ? (
              <>
                {/*
                  Logo preview — fixed-size white rectangle with object-contain
                  so wide wordmarks (e.g. 450x50) sit inside the box instead of
                  bleeding out across the form.
                */}
                <div className="h-10 w-32 rounded-md bg-white border border-evari-edge/50 flex items-center justify-center overflow-hidden px-2 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={draft.logoUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, logoUrl: '' })}
                  className="text-xs text-evari-dim hover:text-evari-critical shrink-0"
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

      <Field label="Signature (HTML — tokens: {{displayName}}, {{role}}, {{phone}}. Logo is baked in.)">
        <div className="space-y-2">
          <Textarea
            rows={8}
            value={draft.signatureHtml}
            onChange={(e) => onChange({ ...draft, signatureHtml: e.target.value })}
            className="font-mono text-[11px] leading-relaxed"
          />
          <button
            type="button"
            onClick={() => onChange({ ...draft, signatureHtml: DEFAULT_SIGNATURE_HTML })}
            className="text-[11px] text-evari-dim hover:text-evari-text underline underline-offset-2"
          >
            Reset to default template
          </button>
        </div>
      </Field>

      <div className="rounded-md bg-white border border-evari-edge/50 p-5">
        <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500 mb-3">
          Preview (as your recipients will see it)
        </div>
        <div
          className="text-neutral-900"
          dangerouslySetInnerHTML={{
            __html: renderSignature(draft),
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-5 pt-1">
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
    <label className="block space-y-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-evari-dimmer font-medium">
        {label}
      </span>
      {children}
    </label>
  );
}
