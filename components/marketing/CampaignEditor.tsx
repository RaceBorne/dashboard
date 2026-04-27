'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, LayoutGrid, Loader2, Send, Trash2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Campaign, EmailDesign, Group, MarketingBrand, Segment } from '@/lib/marketing/types';
import type { EmailTemplate } from '@/lib/marketing/templates';
import { renderEmailDesignWithStub } from '@/lib/marketing/email-design';
import { DEFAULT_EMAIL_DESIGN } from '@/lib/marketing/types';
import type { CampaignStats } from '@/lib/marketing/campaigns';
import { EmailDesigner } from './EmailDesigner';

interface Props {
  mode: 'new' | 'edit';
  campaign?: Campaign;
  groups: Group[];
  segments: Segment[];
  initialStats?: CampaignStats;
  /** Pre-loaded recipient emails — typically from /campaigns/new?ids=… */
  initialRecipientEmails?: string[];
  /** Brand kit — used by the visual designer's preview renderer. */
  brand?: MarketingBrand;
  /** Saved templates — drives the 'Use template' picker. */
  templates?: EmailTemplate[];
}

type AudienceKind = 'segment' | 'group' | 'custom';

export function CampaignEditor({ mode, campaign, groups, segments, initialStats, initialRecipientEmails, brand, templates }: Props) {
  const router = useRouter();
  const editing = mode === 'edit' && !!campaign;
  const [name, setName] = useState(campaign?.name ?? '');
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [content, setContent] = useState(
    campaign?.content ??
      '<h1>Hello {{firstName}}</h1>\n<p>Write your email here. Plain HTML — Phase 6 wires real merging + delivery.</p>',
  );
  // Phase 14: visual design supersedes content when set.
  const [emailDesign, setEmailDesign] = useState<EmailDesign | null>(campaign?.emailDesign ?? null);
  const [editorMode, setEditorMode] = useState<'visual' | 'html'>(campaign?.emailDesign ? 'visual' : 'html');
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  // Audience defaults: prefer existing campaign value > deep-link custom emails
  // > first available picker. 'custom' wins automatically when ids= was used.
  const seedCustom = (campaign?.recipientEmails ?? initialRecipientEmails ?? []) as string[];
  const initialAudience: AudienceKind | '' =
    campaign?.segmentId ? 'segment'
    : campaign?.groupId ? 'group'
    : seedCustom.length > 0 ? 'custom'
    : '';
  const [audienceKind, setAudienceKind] = useState<AudienceKind | ''>(initialAudience || (segments.length > 0 ? 'segment' : 'group'));
  const [segmentId, setSegmentId] = useState<string>(campaign?.segmentId ?? '');
  const [groupId, setGroupId] = useState<string>(campaign?.groupId ?? '');
  const [recipientEmails, setRecipientEmails] = useState<string[]>(seedCustom);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const audienceOk =
    (audienceKind === 'segment' && !!segmentId) ||
    (audienceKind === 'group' && !!groupId) ||
    (audienceKind === 'custom' && recipientEmails.length > 0);
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
        recipientEmails: audienceKind === 'custom' ? recipientEmails : null,
        emailDesign,
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
    'px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[11px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none transition-colors duration-500 ease-in-out w-full';

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

      <div className={cn('grid gap-3', editorMode === 'visual' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2')}>
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
              {(['segment', 'group', 'custom'] as AudienceKind[]).map((k) => (
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
                  {k === 'custom' ? 'Custom list' : k}
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
            ) : audienceKind === 'group' ? (
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
            ) : (
              <div className="space-y-1">
                <p className="text-[10px] text-evari-dimmer">
                  {recipientEmails.length} recipient{recipientEmails.length === 1 ? '' : 's'} —
                  {' '}<span className="text-evari-dim">paste emails (one per line) or comma-separated.</span>
                </p>
                <textarea
                  className={cn(inputCls, 'font-mono text-[12px] min-h-[100px]')}
                  value={recipientEmails.join('\n')}
                  onChange={(e) => {
                    const next = e.target.value
                      .split(/[\n,]+/)
                      .map((x) => x.trim().toLowerCase())
                      .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
                    setRecipientEmails([...new Set(next)]);
                  }}
                  disabled={sentLocked}
                  placeholder="alice@example.com&#10;bob@example.com"
                />
              </div>
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

        {/* Right (or full-width when visual): body editor — toggle between
            visual block builder and raw HTML */}
        <section className={cn('rounded-md bg-evari-surface border border-evari-edge/30 flex flex-col', editorMode === 'visual' ? 'min-h-[80vh]' : 'min-h-[400px]')}>
          <header className="flex items-center justify-between px-4 py-2 border-b border-evari-edge/20">
            <h2 className="text-sm font-semibold text-evari-text">Body</h2>
            <div className="flex items-center gap-2">
            {templates && templates.length > 0 ? (
              <button
                type="button"
                onClick={() => setTemplatePickerOpen(true)}
                disabled={sentLocked}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-evari-ink text-evari-dim hover:text-evari-text hover:bg-black/40 transition-colors"
              >
                <LayoutGrid className="h-3 w-3" /> Use template
              </button>
            ) : null}
            <div className="inline-flex rounded-md bg-evari-ink border border-evari-edge/30 p-0.5">
              <button
                type="button"
                onClick={() => {
                  if (!emailDesign) {
                    setEmailDesign({ ...DEFAULT_EMAIL_DESIGN, blocks: [...DEFAULT_EMAIL_DESIGN.blocks] });
                  }
                  setEditorMode('visual');
                }}
                disabled={sentLocked}
                className={cn('px-2.5 py-1 rounded text-[11px] font-medium transition-colors duration-300', editorMode === 'visual' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}
              >Visual</button>
              <button
                type="button"
                onClick={() => setEditorMode('html')}
                disabled={sentLocked}
                className={cn('px-2.5 py-1 rounded text-[11px] font-medium transition-colors duration-300', editorMode === 'html' ? 'bg-evari-gold text-evari-goldInk' : 'text-evari-dim hover:text-evari-text')}
              >HTML</button>
            </div>
            </div>
          </header>
          {editorMode === 'visual' ? (
            brand ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 flex flex-col">
                  <EmailDesigner
                    initialBrand={brand}
                    value={emailDesign}
                    onChange={setEmailDesign}
                  />
                </div>
                <p className="text-[10px] text-evari-dimmer px-3 py-1.5 border-t border-evari-edge/20">
                  Visual mode supersedes the raw HTML body at send time. Switch to HTML to override.
                </p>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-evari-dimmer">
                Couldn't load the brand kit — falling back to HTML mode.
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col p-4">
              <textarea
                className="flex-1 px-3 py-2 rounded-md bg-evari-ink text-evari-text font-mono text-[12px] leading-relaxed border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none resize-none min-h-[400px]"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={sentLocked}
              />
              <p className="text-[10px] text-evari-dimmer mt-1">
                Raw HTML — used when no visual design is set. Brand signature available via <code className="text-evari-text">{'{{signatureHtml}}'}</code> placeholder support coming next.
              </p>
            </div>
          )}
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
    {templatePickerOpen && templates ? (
      <TemplatePickerModal
        templates={templates}
        onClose={() => setTemplatePickerOpen(false)}
        onPick={(t) => {
          // Deep-copy so subsequent edits don't mutate the source template.
          const cloned = JSON.parse(JSON.stringify(t.design)) as EmailDesign;
          setEmailDesign(cloned);
          setEditorMode('visual');
          setTemplatePickerOpen(false);
        }}
      />
    ) : null}
    </div>
  );
}

// ─── Template picker modal ──────────────────────────────────────

function TemplatePickerModal({ templates, onClose, onPick }: { templates: EmailTemplate[]; onClose: () => void; onPick: (t: EmailTemplate) => void }) {
  const [search, setSearch] = useState('');
  const visible = templates.filter((t) => !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" onClick={onClose}>
      <div className="flex-1 min-h-0 flex flex-col p-6" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 mb-3">
          <h3 className="text-base font-semibold text-evari-text">Pick a template</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 max-w-xs px-2 py-1 rounded bg-evari-ink text-evari-text text-sm border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          />
          <span className="text-[10px] text-evari-dimmer tabular-nums ml-auto">{visible.length} / {templates.length}</span>
          <button type="button" onClick={onClose} className="text-evari-dim hover:text-evari-text inline-flex items-center gap-1 px-2 py-1 rounded">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-auto rounded-md bg-evari-surface border border-evari-edge/30 p-3">
          {visible.length === 0 ? (
            <div className="py-12 text-center text-sm text-evari-dimmer">
              {templates.length === 0
                ? 'No templates yet — design one in /email/templates first.'
                : 'Nothing matches that filter.'}
            </div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {visible.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t)}
                    className="block w-full text-left rounded-md border border-evari-edge/30 bg-evari-ink overflow-hidden hover:border-evari-gold/60 transition-colors"
                  >
                    <PickerThumbnail title={`Preview of ${t.name}`} html={renderEmailDesignWithStub(t.design)} />
                    <div className="p-2">
                      <div className="text-sm text-evari-text font-medium truncate">{t.name}</div>
                      <div className="text-[10px] text-evari-dimmer font-mono tabular-nums mt-0.5">
                        {new Date(t.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 9:16 portrait template preview tile that scales an iframe to fill the
 * column width. Same approach as TemplatesClient — measured scale via
 * ResizeObserver, iframe rendered at email-native 600px width.
 */
function PickerThumbnail({ title, html }: { title: string; html: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [containerW, setContainerW] = useState(240);
  const [contentH, setContentH] = useState(800);
  const measureContent = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const h = Math.max(doc.body?.scrollHeight ?? 0, doc.documentElement?.scrollHeight ?? 0);
      if (h > 0) setContentH(h);
    } catch { /* noop */ }
  };
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => { setContainerW(el.clientWidth); };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { measureContent(); }, [html]);
  // Use Math.ceil on the scaled width and divide back to ensure the
  // transformed iframe always covers the container width — no sub-pixel
  // sliver of the wrapper bg shows on the right edge.
  const scale = Math.ceil(containerW * 1000 / 600) / 1000;
  return (
    <div ref={wrapRef} className="aspect-[4/5] bg-evari-ink overflow-hidden relative pointer-events-none">
      <iframe
        ref={iframeRef}
        title={title}
        srcDoc={html}
        onLoad={measureContent}
        className="absolute top-0 left-0 bg-white"
        style={{
          width: '600px',
          height: `${contentH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
        }}
      />
    </div>
  );
}

