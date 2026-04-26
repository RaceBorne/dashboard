'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Loader2, Send, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Campaign, Group, Segment } from '@/lib/marketing/types';
import type { CampaignStats } from '@/lib/marketing/campaigns';

interface Props {
  mode: 'new' | 'edit';
  campaign?: Campaign;
  groups: Group[];
  segments: Segment[];
  initialStats?: CampaignStats;
}

type AudienceKind = 'segment' | 'group';

export function CampaignEditor({ mode, campaign, groups, segments, initialStats }: Props) {
  const router = useRouter();
  const editing = mode === 'edit' && !!campaign;
  const [name, setName] = useState(campaign?.name ?? '');
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [content, setContent] = useState(
    campaign?.content ??
      '<h1>Hello {{firstName}}</h1>\n<p>Write your email here. Plain HTML — Phase 6 wires real merging + delivery.</p>',
  );
  const initialAudience: AudienceKind | '' = campaign?.segmentId
    ? 'segment'
    : campaign?.groupId
      ? 'group'
      : '';
  const [audienceKind, setAudienceKind] = useState<AudienceKind | ''>(initialAudience || (segments.length > 0 ? 'segment' : 'group'));
  const [segmentId, setSegmentId] = useState<string>(campaign?.segmentId ?? '');
  const [groupId, setGroupId] = useState<string>(campaign?.groupId ?? '');

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const audienceOk = (audienceKind === 'segment' && !!segmentId) || (audienceKind === 'group' && !!groupId);
  const ready = name.trim().length > 0 && subject.trim().length > 0 && content.length > 0 && audienceOk;
  const sentLocked = campaign?.status === 'sent' || campaign?.status === 'sending';

  async function handleSave(): Promise<Campaign | null> {
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        subject,
        content,
        segmentId: audienceKind === 'segment' ? segmentId || null : null,
        groupId: audienceKind === 'group' ? groupId || null : null,
      };
      const url = editing ? `/api/marketing/campaigns/${campaign!.id}` : '/api/marketing/campaigns';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      router.refresh();
      return data.campaign as Campaign;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndStay() {
    const c = await handleSave();
    if (c && !editing) router.push(`/email/campaigns/${c.id}`);
    else if (c) setInfo('Saved');
  }

  async function handleSendNow() {
    if (!ready || sending) return;
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      // Save first so the latest content is what goes out.
      const saved = await handleSave();
      if (!saved) return;
      const res = await fetch(`/api/marketing/campaigns/${saved.id}/send`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!data.ok && !data.attempted) throw new Error(data.error ?? 'Send failed');
      setInfo(
        `Send complete — attempted ${data.attempted}, sent ${data.sent}, suppressed ${data.suppressed}, failed ${data.failed}.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!editing || !campaign) return;
    if (!confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/marketing/campaigns/${campaign.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (data.ok) router.push('/email/campaigns');
  }

  const inputCls =
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink p-4">
      <div className="mb-3">
        <Link
          href="/email/campaigns"
          className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All campaigns
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: Identity + Audience */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-evari-text">Setup</h2>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Campaign name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={sentLocked} />
          </label>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Subject line</span>
            <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sentLocked} />
          </label>

          <div>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Audience</span>
            <div className="flex gap-1 mb-2">
              {(['segment', 'group'] as AudienceKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAudienceKind(k)}
                  disabled={sentLocked}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors duration-500 ease-in-out',
                    audienceKind === k
                      ? 'bg-evari-gold text-evari-goldInk'
                      : 'bg-evari-ink text-evari-dim hover:text-evari-text',
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
            {audienceKind === 'segment' ? (
              <select
                className={inputCls}
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                disabled={sentLocked}
              >
                <option value="">Select a segment…</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className={inputCls}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                disabled={sentLocked}
              >
                <option value="">Select a group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {editing && initialStats ? (
            <div className="pt-2 border-t border-evari-edge/30">
              <h3 className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Send stats</h3>
              <dl className="grid grid-cols-3 gap-1 text-xs">
                <div className="rounded bg-evari-ink p-2">
                  <dt className="text-evari-dimmer text-[10px]">Total</dt>
                  <dd className="font-mono tabular-nums text-evari-text">{initialStats.total}</dd>
                </div>
                <div className="rounded bg-evari-ink p-2">
                  <dt className="text-evari-dimmer text-[10px]">Sent</dt>
                  <dd className="font-mono tabular-nums text-evari-text">{initialStats.sent}</dd>
                </div>
                <div className="rounded bg-evari-ink p-2">
                  <dt className="text-evari-dimmer text-[10px]">Opened</dt>
                  <dd className="font-mono tabular-nums text-evari-text">{initialStats.opened}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        {/* Right: HTML editor */}
        <section className="rounded-md bg-evari-surface border border-evari-edge/30 p-4 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-evari-text">HTML body</h2>
            <span className="text-[10px] text-evari-dimmer">Phase 5 — plain HTML; rich editor in a later phase</span>
          </div>
          <textarea
            className="flex-1 px-3 py-2 rounded-md bg-evari-ink text-evari-text font-mono text-[12px] leading-relaxed border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none resize-none min-h-[400px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={sentLocked}
          />
        </section>
      </div>

      {/* Footer actions */}
      <div className="mt-3 flex items-center gap-2">
        {error ? <span className="text-xs text-evari-danger">{error}</span> : null}
        {info ? <span className="text-xs text-evari-success">{info}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {editing && !sentLocked ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-evari-dim hover:text-evari-danger transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSaveAndStay}
            disabled={!name.trim() || saving || sentLocked}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-evari-ink text-evari-text hover:bg-black/40 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {editing ? 'Save' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={handleSendNow}
            disabled={!ready || sending || sentLocked}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-evari-gold text-evari-goldInk disabled:opacity-40 hover:brightness-105 transition duration-500 ease-in-out"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? 'Sending…' : 'Send now'}
          </button>
        </div>
      </div>

      {sentLocked ? (
        <p className="mt-3 text-[11px] text-evari-dimmer italic">
          This campaign has already been {campaign?.status} — fields are read-only. Duplicate it to send again.
        </p>
      ) : null}
    </div>
  );
}
