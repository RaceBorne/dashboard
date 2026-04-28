'use client';

/**
 * Campaign creation wizard. Four discrete steps with a header
 * progress bar so the operator always knows where they are and
 * what's next:
 *
 *   1. WHO   — pick a list / segment, or build a custom recipient list
 *   2. WHAT  — pick a saved template (visual cards) or start from blank
 *   3. WHEN  — campaign name, subject line, optional schedule
 *   4. SEND  — review summary, send a test, then send the campaign
 *
 * Replaces the old single-page CampaignEditor on /email/campaigns/new.
 * Edit mode for existing campaigns continues to use the original
 * full-form editor (which is fine for editing — too many fields for
 * a wizard once the campaign exists).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Image as ImageIcon,
  Loader2,
  Mail,
  Plus,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { CampaignReviewModal } from './CampaignReviewModal';
import { SequenceEditor } from './SequenceEditor';
import { LaunchChecksPanel } from './LaunchChecksPanel';
import { AIDraftButton } from '../ai/AIDraftButton';

interface AIFlag { severity: 'info' | 'warn' | 'error'; kind: string; message: string }
interface HeldPayload {
  contactId: string;
  reason?: string | null;
  source?: 'human' | 'ai' | 'both';
  aiFlags?: AIFlag[] | null;
}
import type {
  Campaign,
  EmailDesign,
  Group,
  MarketingBrand,
  Segment,
} from '@/lib/marketing/types';
import type { GroupWithCounts } from '@/lib/marketing/types-extra';
import type { ListMember } from '@/lib/marketing/groups';
import { DEFAULT_EMAIL_DESIGN } from '@/lib/marketing/types';
import type { EmailTemplate } from '@/lib/marketing/templates';
import { renderEmailDesignWithStub } from '@/lib/marketing/email-design';

interface Props {
  groups: GroupWithCounts[];
  segments: Segment[];
  templates: EmailTemplate[];
  brand: MarketingBrand;
  /** Optional pre-loaded recipient emails — typically from
   *  /campaigns/new?ids=… coming off the Contacts bulk action. */
  initialRecipientEmails?: string[];
}

type AudienceKind = 'segment' | 'group' | 'custom';
type StepKey = 'who' | 'what' | 'when' | 'send';

const STEPS: Array<{ key: StepKey; label: string; sub: string }> = [
  { key: 'who',  label: 'Audience',       sub: 'Who receives this' },
  { key: 'what', label: 'Message',        sub: 'Email design + content' },
  { key: 'when', label: 'When',           sub: 'Name + subject + schedule' },
  { key: 'send', label: 'Launch',         sub: 'Review + forecast + send' },
];

export function CampaignWizard({ groups, segments, templates, brand, initialRecipientEmails = [] }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>('who');

  // --- Audience state ---
  const seedAudienceKind: AudienceKind = initialRecipientEmails.length > 0
    ? 'custom'
    : (segments.length > 0 ? 'segment' : 'group');
  const [audienceKind, setAudienceKind] = useState<AudienceKind>(seedAudienceKind);
  const [segmentId, setSegmentId] = useState<string>('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [recipientEmails, setRecipientEmails] = useState<string[]>(initialRecipientEmails);

  // --- Template state ---
  // null = blank; otherwise a saved template's design is cloned in.
  const [pickedTemplate, setPickedTemplate] = useState<EmailTemplate | null>(null);
  const [emailDesign, setEmailDesign] = useState<EmailDesign | null>(
    initialRecipientEmails.length > 0 ? { ...DEFAULT_EMAIL_DESIGN, blocks: [...DEFAULT_EMAIL_DESIGN.blocks] } : null,
  );

  // --- Details state ---
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [subjectVariants, setSubjectVariants] = useState<string[]>([]);
  const [sequence, setSequence] = useState<{ steps: Array<{ kind: 'email'; subject: string | null; html: string | null; design: unknown; waitDays: number }> } | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledFor, setScheduledFor] = useState<string>(''); // ISO local datetime

  // --- Send state ---
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [savedCampaign, setSavedCampaign] = useState<Campaign | null>(null);
  const [sending, setSending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sendResult, setSendResult] = useState<{ attempted: number; sent: number; suppressed: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Validation ---
  const audienceReady =
    (audienceKind === 'segment' && !!segmentId) ||
    (audienceKind === 'group' && groupIds.length > 0) ||
    (audienceKind === 'custom' && recipientEmails.length > 0);
  const templateReady = !!emailDesign && (emailDesign.blocks?.length ?? 0) > 0;
  const detailsReady = name.trim().length > 0 && subject.trim().length > 0
    && (scheduleMode === 'now' || (scheduleMode === 'later' && scheduledFor.length > 0));

  function canAdvance(from: StepKey): boolean {
    if (from === 'who')  return audienceReady;
    if (from === 'what') return templateReady;
    if (from === 'when') return detailsReady;
    return true;
  }

  function next() {
    const i = STEPS.findIndex((s) => s.key === step);
    if (i < STEPS.length - 1 && canAdvance(step)) setStep(STEPS[i + 1]!.key);
  }
  function back() {
    const i = STEPS.findIndex((s) => s.key === step);
    if (i > 0) setStep(STEPS[i - 1]!.key);
  }

  // --- Audience preview text (shown in summary + chip) ---
  const audienceLabel = useMemo(() => {
    if (audienceKind === 'segment') {
      const s = segments.find((x) => x.id === segmentId);
      return s ? `Segment: ${s.name}` : 'No segment picked';
    }
    if (audienceKind === 'group') {
      if (groupIds.length === 0) return 'No list picked';
      if (groupIds.length === 1) {
        const g = groups.find((x) => x.id === groupIds[0]);
        return g ? `List: ${g.name}` : 'No list picked';
      }
      return `${groupIds.length} lists (combined)`;
    }
    return `${recipientEmails.length} custom address${recipientEmails.length === 1 ? '' : 'es'}`;
  }, [audienceKind, segmentId, groupIds, recipientEmails, segments, groups]);

  // --- Save the campaign as a draft. Used both before sending a test
  //     and before the final send. Idempotent — only creates once. ---
  async function ensureSaved(): Promise<Campaign | null> {
    if (savedCampaign) return savedCampaign;
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        subject: subject.trim(),
        subjectVariants: subjectVariants.map((s) => s.trim()).filter(Boolean),
        sequence,
        content: '', // legacy plain-HTML body; visual design supersedes
        kind: 'newsletter',
        segmentId: audienceKind === 'segment' ? segmentId || null : null,
        groupId:   null,
        groupIds:  audienceKind === 'group'   ? groupIds : null,
        recipientEmails: audienceKind === 'custom' ? recipientEmails : null,
        emailDesign,
      };
      if (scheduleMode === 'later' && scheduledFor) {
        payload.scheduledFor = new Date(scheduledFor).toISOString();
        payload.status = 'scheduled';
      }
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setSavedCampaign(data.campaign as Campaign);
      return data.campaign as Campaign;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return null;
    }
  }

  async function sendTest() {
    if (!testEmail.trim() || testSending) return;
    setTestSending(true); setTestResult(null); setError(null);
    try {
      const c = await ensureSaved();
      if (!c) return;
      // Render with includeFooter so the test mirrors a real send.
      const html = emailDesign ? renderEmailDesignWithStub(emailDesign, brand) : '';
      const res = await fetch('/api/marketing/templates/preview-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim(), html, subject: `[Test] ${subject}`, skipBrandFooter: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Test send failed');
      setTestResult(`Test sent to ${testEmail.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTestSending(false);
    }
  }

  async function sendNow(held: HeldPayload[] = []) {
    if (sending) return;
    setSending(true); setError(null); setSendResult(null);
    try {
      const c = await ensureSaved();
      if (!c) return;
      const res = await fetch(`/api/marketing/campaigns/${c.id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ held }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok && !data.attempted) throw new Error(data.error ?? 'Send failed');
      setSendResult({
        attempted: data.attempted ?? 0,
        sent: data.sent ?? 0,
        suppressed: data.suppressed ?? 0,
        failed: data.failed ?? 0,
      });
      setReviewOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }
  async function openReview() {
    setError(null);
    const c = await ensureSaved();
    if (c) setReviewOpen(true);
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-5xl mx-auto px-gutter py-4">
        {/* Top: back link */}
        <div className="mb-3">
          <Link href="/email/campaigns" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> All campaigns
          </Link>
        </div>

        {/* Step bar */}
        <Stepper current={step} done={(k) => canAdvance(k) && STEPS.findIndex((s) => s.key === k) < STEPS.findIndex((s) => s.key === step)} />

        {/* Step body */}
        <div className="mt-4 rounded-panel bg-evari-surface border border-evari-edge/30 p-4 min-h-[420px]">
          {step === 'who' ? (
            <WhoStep
              segments={segments}
              groups={groups}
              audienceKind={audienceKind}
              setAudienceKind={setAudienceKind}
              segmentId={segmentId}
              setSegmentId={setSegmentId}
              groupIds={groupIds}
              setGroupIds={setGroupIds}
              recipientEmails={recipientEmails}
              setRecipientEmails={setRecipientEmails}
            />
          ) : step === 'what' ? (
            <WhatStep
              templates={templates}
              brand={brand}
              sequence={sequence}
              setSequence={setSequence}
              picked={pickedTemplate}
              onPickTemplate={(t) => {
                setPickedTemplate(t);
                setEmailDesign(t ? { ...t.design, blocks: [...t.design.blocks] } : { ...DEFAULT_EMAIL_DESIGN, blocks: [...DEFAULT_EMAIL_DESIGN.blocks] });
              }}
              hasDesign={templateReady}
            />
          ) : step === 'when' ? (
            <WhenStep
              name={name} setName={setName}
              subject={subject} setSubject={setSubject}
              subjectVariants={subjectVariants} setSubjectVariants={setSubjectVariants}
              previewText={previewText} setPreviewText={setPreviewText}
              scheduleMode={scheduleMode} setScheduleMode={setScheduleMode}
              scheduledFor={scheduledFor} setScheduledFor={setScheduledFor}
            />
          ) : (
            <SendStep
              audienceLabel={audienceLabel}
              templateLabel={pickedTemplate?.name ?? 'Custom design'}
              name={name}
              subject={subject}
              previewText={previewText}
              scheduleMode={scheduleMode}
              scheduledFor={scheduledFor}
              testEmail={testEmail} setTestEmail={setTestEmail}
              onTest={sendTest}
              testSending={testSending}
              testResult={testResult}
              onSend={() => sendNow()} onReview={openReview}
              sending={sending}
              sendResult={sendResult}
              campaignId={savedCampaign?.id ?? null}
              recipientCount={recipientEmails.length || 0}
            />
          )}
        </div>

        {/* Step nav (hidden once a real send has completed). */}
        {sendResult ? (
          <div className="mt-4 flex items-center justify-between">
            <Link href="/email/campaigns" className="inline-flex items-center gap-1 text-[12px] text-evari-dim hover:text-evari-text">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all campaigns
            </Link>
            {savedCampaign ? (
              <Link
                href={`/email/campaigns/${savedCampaign.id}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1.5 rounded"
              >
                Open campaign report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={step === 'who'}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text disabled:opacity-30 disabled:hover:text-evari-dim transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            {error ? <span className="text-[11px] text-evari-danger">{error}</span> : null}
            {step !== 'send' ? (
              <button
                type="button"
                onClick={next}
                disabled={!canAdvance(step)}
                className={cn(
                  'inline-flex items-center gap-1 px-4 py-1.5 text-[12px] font-semibold rounded-md transition-all',
                  canAdvance(step)
                    ? 'bg-evari-gold text-evari-goldInk hover:brightness-110'
                    : 'bg-evari-ink/60 text-evari-dimmer cursor-not-allowed',
                )}
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>
      {reviewOpen && savedCampaign ? (
        <CampaignReviewModal
          campaignId={savedCampaign.id}
          onClose={() => setReviewOpen(false)}
          onSend={(held) => sendNow(held)}
        />
      ) : null}
    </div>
  );
}

/**
 * Header progress bar — four steps. Current step is highlighted gold,
 * completed steps show a check icon, future steps stay dim.
 */
function Stepper({ current, done }: { current: StepKey; done: (k: StepKey) => boolean }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 px-2 py-2">
      <ol className="flex items-stretch">
        {STEPS.map((s, i) => {
          const isCurrent = s.key === current;
          const isPast = i < currentIdx;
          const isFuture = i > currentIdx;
          return (
            <li key={s.key} className="flex-1 flex items-center min-w-0">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md w-full min-w-0 transition-all',
                  isCurrent ? 'bg-evari-gold/15' : '',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-mono font-semibold',
                    isCurrent ? 'bg-evari-gold text-evari-goldInk' :
                    isPast    ? 'bg-evari-success/20 text-evari-success' :
                                'bg-evari-ink/60 text-evari-dimmer',
                  )}
                >
                  {isPast ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <div className={cn('text-[12px] font-semibold truncate', isCurrent ? 'text-evari-text' : isFuture ? 'text-evari-dimmer' : 'text-evari-dim')}>
                    {s.label}
                  </div>
                  <div className={cn('text-[10px] truncate', isCurrent ? 'text-evari-dim' : 'text-evari-dimmer')}>{s.sub}</div>
                </div>
              </div>
              {i < STEPS.length - 1 ? <div className="shrink-0 w-3 h-px bg-evari-edge/40 mx-0.5" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Step 1: WHO ──────────────────────────────────────────────

function WhoStep(props: {
  segments: Segment[];
  groups: GroupWithCounts[];
  audienceKind: AudienceKind;
  setAudienceKind: (k: AudienceKind) => void;
  segmentId: string; setSegmentId: (s: string) => void;
  groupIds: string[]; setGroupIds: (xs: string[]) => void;
  recipientEmails: string[]; setRecipientEmails: (xs: string[]) => void;
}) {
  const { segments, groups, audienceKind, setAudienceKind, segmentId, setSegmentId, groupIds, setGroupIds, recipientEmails, setRecipientEmails } = props;
  function toggleGroup(id: string) {
    if (groupIds.includes(id)) setGroupIds(groupIds.filter((x) => x !== id));
    else setGroupIds([...groupIds, id]);
  }
  const totalSendable = groupIds.reduce((sum, id) => {
    const g = groups.find((x) => x.id === id);
    return sum + (g?.sendableCount ?? 0);
  }, 0);
  return (
    <div>
      <header className="mb-3">
        <h2 className="text-base font-semibold text-evari-text">Who should receive this campaign?</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Pick a saved list, a smart segment, or paste a custom set of addresses.</p>
      </header>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <KindCard
          active={audienceKind === 'group'}
          onClick={() => setAudienceKind('group')}
          icon={<Users className="h-4 w-4" />}
          title="List"
          sub={`${groups.length} saved`}
        />
        <KindCard
          active={audienceKind === 'segment'}
          onClick={() => setAudienceKind('segment')}
          icon={<Sparkles className="h-4 w-4" />}
          title="Segment"
          sub={`${segments.length} saved`}
        />
        <KindCard
          active={audienceKind === 'custom'}
          onClick={() => setAudienceKind('custom')}
          icon={<Mail className="h-4 w-4" />}
          title="Custom emails"
          sub="Paste / add"
        />
      </div>

      {audienceKind === 'group' ? (
        groups.length === 0 ? (
          <EmptyAudience
            label="You don't have any lists yet"
            cta={<Link href="/leads" className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded">Build a list on /leads <ArrowRight className="h-3.5 w-3.5" /></Link>}
          />
        ) : (
          <div className="space-y-3">
            <ul className="grid grid-cols-2 gap-2">
              {groups.map((g) => {
                const selected = groupIds.includes(g.id);
                return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={cn(
                      'w-full text-left rounded-md border p-3 transition-colors relative',
                      selected ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-semibold text-evari-text truncate flex-1 min-w-0 flex items-center gap-2">
                        <span className={cn('inline-flex items-center justify-center h-4 w-4 rounded-sm border', selected ? 'bg-evari-gold border-evari-gold text-evari-goldInk' : 'border-evari-edge/50')}>
                          {selected ? <CheckIconTick /> : null}
                        </span>
                        <span className="truncate">{g.name}</span>
                      </div>
                      <div className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-evari-gold bg-evari-gold/10 px-1.5 py-0.5 rounded">
                        <Users className="h-3 w-3" /> {g.sendableCount}
                      </div>
                    </div>
                    {g.description ? <div className="text-[11px] text-evari-dim truncate mt-0.5">{g.description}</div> : null}
                    {(g.pendingCount > 0 || g.suppressedCount > 0) ? (
                      <div className="text-[10px] mt-1 space-x-1">
                        {g.pendingCount > 0    ? <span className="text-evari-warn">{g.pendingCount} pending</span>    : null}
                        {g.suppressedCount > 0 ? <span className="text-evari-danger">{g.suppressedCount} suppressed</span> : null}
                      </div>
                    ) : null}
                  </button>
                </li>
                );
              })}
            </ul>
            {groupIds.length > 0 ? (
              <div className="rounded-md border border-evari-edge/30 bg-evari-ink/30 p-3 text-[12px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-evari-dim">Combined audience (deduped at send)</span>
                  <span className="font-mono tabular-nums text-evari-gold">~{totalSendable}</span>
                </div>
                {groupIds.length > 1 ? (
                  <p className="text-[11px] text-evari-dimmer">
                    A contact in multiple selected lists is sent once, not once per list.
                  </p>
                ) : null}
                {groupIds.length === 1 ? <ListPreview groupId={groupIds[0]} /> : null}
              </div>
            ) : null}
          </div>
        )
      ) : audienceKind === 'segment' ? (
        segments.length === 0 ? (
          <EmptyAudience
            label="You don't have any segments yet"
            cta={<Link href="/email/audience" className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded">Build a segment <ArrowRight className="h-3.5 w-3.5" /></Link>}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {segments.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSegmentId(s.id)}
                  className={cn(
                    'w-full text-left rounded-md border p-3 transition-colors',
                    segmentId === s.id ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40',
                  )}
                >
                  <div className="text-[13px] font-semibold text-evari-text truncate">{s.name}</div>
                  <div className="text-[11px] text-evari-dim mt-0.5">{(s.rules.rules.length ?? 0)} rule{s.rules.rules.length === 1 ? '' : 's'}</div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">
              Recipient emails ({recipientEmails.length})
            </span>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none min-h-[140px]"
              placeholder="alice@example.com&#10;bob@example.com"
              value={recipientEmails.join('\n')}
              onChange={(e) => {
                const next = e.target.value
                  .split(/[\n,]+/)
                  .map((x) => x.trim().toLowerCase())
                  .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
                setRecipientEmails([...new Set(next)]);
              }}
            />
            <span className="text-[10px] text-evari-dimmer mt-0.5 block">One per line or comma-separated. Invalid addresses are dropped silently.</span>
          </label>
        </div>
      )}
    </div>
  );
}

function KindCard({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-3 text-left transition-colors',
        active ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40',
      )}
    >
      <div className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md mb-2', active ? 'bg-evari-gold/30 text-evari-gold' : 'bg-evari-ink text-evari-dim')}>
        {icon}
      </div>
      <div className="text-[12px] font-semibold text-evari-text">{title}</div>
      <div className="text-[10px] text-evari-dimmer mt-0.5">{sub}</div>
    </button>
  );
}

function EmptyAudience({ label, cta }: { label: string; cta: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-evari-edge/40 px-4 py-6 text-center">
      <p className="text-[12px] text-evari-dim mb-3">{label}</p>
      {cta}
    </div>
  );
}

// ─── Step 2: WHAT ─────────────────────────────────────────────

function WhatStep({ templates, brand, picked, onPickTemplate, hasDesign, sequence, setSequence }: { templates: EmailTemplate[]; brand: MarketingBrand; picked: EmailTemplate | null; onPickTemplate: (t: EmailTemplate | null) => void; hasDesign: boolean; sequence: { steps: Array<{ kind: 'email'; subject: string | null; html: string | null; design: unknown; waitDays: number }> } | null; setSequence: (s: { steps: Array<{ kind: 'email'; subject: string | null; html: string | null; design: unknown; waitDays: number }> } | null) => void }) {
  return (
    <div>
      <header className="mb-3">
        <h2 className="text-base font-semibold text-evari-text">Message</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Start from a saved template, or build a fresh design from scratch.</p>
      </header>

      <ul className="grid grid-cols-3 gap-2 mb-3">
        {/* Blank tile always first. */}
        <li>
          <button
            type="button"
            onClick={() => onPickTemplate(null)}
            className={cn(
              'w-full rounded-md border overflow-hidden transition-colors text-left',
              hasDesign && picked === null ? 'border-evari-gold' : 'border-evari-edge/30 hover:border-evari-gold/40',
            )}
          >
            <div className={cn('aspect-[4/3] flex flex-col items-center justify-center gap-2', hasDesign && picked === null ? 'bg-evari-gold/10' : 'bg-evari-ink/40')}>
              <Plus className="h-7 w-7 text-evari-dim" />
              <span className="text-[12px] text-evari-dim font-medium">Start from blank</span>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[12px] font-semibold text-evari-text">Blank</div>
              <div className="text-[10px] text-evari-dimmer">Build the design now</div>
            </div>
          </button>
        </li>
        {templates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPickTemplate(t)}
              className={cn(
                'w-full rounded-md border overflow-hidden transition-colors text-left',
                picked?.id === t.id ? 'border-evari-gold' : 'border-evari-edge/30 hover:border-evari-gold/40',
              )}
            >
              <div className={cn('aspect-[4/3] overflow-hidden', picked?.id === t.id ? 'bg-evari-gold/10' : 'bg-evari-ink/40')}>
                <TemplateThumb template={t} brand={brand} />
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[12px] font-semibold text-evari-text truncate">{t.name}</div>
                <div className="text-[10px] text-evari-dimmer truncate">{t.design.blocks.length} block{t.design.blocks.length === 1 ? '' : 's'}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {hasDesign ? (
        <div className="text-[11px] text-evari-success inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> {picked ? `'${picked.name}' loaded.` : 'Blank design ready.'} You can fine-tune the email content from the campaign report after sending, or open the template editor before scheduling.
        </div>
      ) : (
        <p className="text-[11px] text-evari-dimmer">Pick a tile above to continue.</p>
      )}

      <SequenceEditor value={sequence} onChange={setSequence} />
    </div>
  );
}

function TemplateThumb({ template, brand }: { template: EmailTemplate; brand: MarketingBrand }) {
  // Render the template into an iframe srcDoc so it shows exactly as
  // the recipient will see it. Scaled down to fit the card.
  const html = useMemo(() => renderEmailDesignWithStub(template.design, brand), [template.design, brand]);
  return (
    <div className="w-full h-full relative bg-evari-ink overflow-hidden">
      <iframe
        title={template.name}
        srcDoc={html}
        scrolling="no"
        className="absolute top-0 left-0 origin-top-left pointer-events-none"
        style={{ width: '600px', height: '450px', transform: 'scale(0.4)' }}
      />
    </div>
  );
}

// ─── Step 3: WHEN ─────────────────────────────────────────────

function WhenStep(props: {
  name: string; setName: (s: string) => void;
  subject: string; setSubject: (s: string) => void;
  subjectVariants: string[]; setSubjectVariants: (xs: string[]) => void;
  previewText: string; setPreviewText: (s: string) => void;
  scheduleMode: 'now' | 'later'; setScheduleMode: (s: 'now' | 'later') => void;
  scheduledFor: string; setScheduledFor: (s: string) => void;
}) {
  const { name, setName, subject, setSubject, subjectVariants, setSubjectVariants, previewText, setPreviewText, scheduleMode, setScheduleMode, scheduledFor, setScheduledFor } = props;
  return (
    <div className="space-y-4 max-w-xl">
      <header>
        <h2 className="text-base font-semibold text-evari-text">Name, subject, schedule</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">The internal name is yours; the subject + preview are what recipients see in their inbox.</p>
      </header>

      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Internal name</span>
        <input
          className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          placeholder="Spring 856 launch"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="block">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Subject line</span>
          <AIDraftButton
            field="subject"
            value={subject}
            context={`Campaign name: ${name || '(unnamed)'}.`}
            onApply={setSubject}
          />
        </div>
        <input
          className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          placeholder="The 856 is here"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <SubjectVariantsEditor variants={subjectVariants} setVariants={setSubjectVariants} />
      </div>

      <label className="block">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Preview text (optional)</span>
        <input
          className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          placeholder="The line that shows in the inbox after the subject"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
        />
      </label>

      <div>
        <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Schedule</span>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setScheduleMode('now')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium border transition-colors',
              scheduleMode === 'now' ? 'bg-evari-gold/10 border-evari-gold text-evari-text' : 'bg-evari-ink/30 border-evari-edge/30 text-evari-dim hover:text-evari-text',
            )}
          >
            <Send className="h-3.5 w-3.5" /> Send now
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode('later')}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium border transition-colors',
              scheduleMode === 'later' ? 'bg-evari-gold/10 border-evari-gold text-evari-text' : 'bg-evari-ink/30 border-evari-edge/30 text-evari-dim hover:text-evari-text',
            )}
          >
            <Clock className="h-3.5 w-3.5" /> Schedule for later
          </button>
        </div>
        {scheduleMode === 'later' ? (
          <>
            <input
              type="datetime-local"
              className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none font-mono"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <SendTimeHint scheduledFor={scheduledFor} setScheduledFor={setScheduledFor} />
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Step 4: SEND ─────────────────────────────────────────────

function SendStep(props: {
  audienceLabel: string;
  templateLabel: string;
  name: string;
  subject: string;
  previewText: string;
  scheduleMode: 'now' | 'later';
  scheduledFor: string;
  testEmail: string; setTestEmail: (s: string) => void;
  onTest: () => void; testSending: boolean; testResult: string | null;
  onSend: () => void; onReview: () => void; sending: boolean; sendResult: { attempted: number; sent: number; suppressed: number; failed: number } | null;
  campaignId: string | null;
  recipientCount: number;
}) {
  const { audienceLabel, templateLabel, name, subject, previewText, scheduleMode, scheduledFor, testEmail, setTestEmail, onTest, testSending, testResult, onSend, onReview, sending, sendResult, campaignId, recipientCount } = props;
  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h2 className="text-base font-semibold text-evari-text">Launch</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Sanity-check the forecast and the deliverability before shipping.</p>
      </header>

      {campaignId ? <LaunchChecksPanel campaignId={campaignId} recipientCount={recipientCount} /> : null}

      <ul className="rounded-md border border-evari-edge/30 divide-y divide-evari-edge/15">
        <SummaryRow label="Audience"  value={audienceLabel} />
        <SummaryRow label="Template"  value={templateLabel} />
        <SummaryRow label="Name"      value={name || <em className="text-evari-dimmer">Not set</em>} />
        <SummaryRow label="Subject"   value={subject || <em className="text-evari-dimmer">Not set</em>} />
        {previewText ? <SummaryRow label="Preview" value={previewText} /> : null}
        <SummaryRow
          label="Schedule"
          value={scheduleMode === 'now' ? 'Send immediately' : (scheduledFor ? new Date(scheduledFor).toLocaleString() : 'Not set')}
        />
      </ul>

      {/* Test send */}
      <div className="rounded-md border border-evari-edge/30 p-3 bg-evari-ink/30">
        <div className="text-[12px] font-semibold text-evari-text mb-1.5">Send a test first</div>
        <div className="flex gap-1.5">
          <input
            type="email"
            placeholder="you@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="flex-1 px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none font-mono"
          />
          <button
            type="button"
            onClick={onTest}
            disabled={testSending || !testEmail.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-ink text-evari-text border border-evari-edge/30 hover:border-evari-gold/40 disabled:opacity-50 transition-colors"
          >
            {testSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Test
          </button>
        </div>
        {testResult ? <p className="text-[11px] text-evari-success mt-1.5">{testResult}</p> : null}
      </div>

      {/* Final send */}
      {sendResult ? (
        <div className="rounded-md border border-evari-success/40 bg-evari-success/10 p-4">
          <div className="text-[13px] font-semibold text-evari-success inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Send complete
          </div>
          <ul className="mt-2 space-y-0.5 text-[12px] text-evari-text">
            <li>Attempted: <strong className="font-mono tabular-nums">{sendResult.attempted}</strong></li>
            <li>Delivered: <strong className="font-mono tabular-nums">{sendResult.sent}</strong></li>
            <li>Suppressed: <strong className="font-mono tabular-nums text-evari-dim">{sendResult.suppressed}</strong></li>
            <li>Failed: <strong className={cn('font-mono tabular-nums', sendResult.failed > 0 ? 'text-evari-danger' : 'text-evari-dim')}>{sendResult.failed}</strong></li>
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onReview}
            disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold bg-evari-ink text-evari-text border border-evari-edge/40 hover:border-evari-gold/60 hover:text-evari-gold disabled:opacity-50 transition"
          >
            <CheckCircle2 className="h-4 w-4" /> Review every email first (recommended)
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : scheduleMode === 'now' ? 'Send campaign now' : 'Schedule campaign'}
          </button>
          <p className="text-[10px] text-evari-dimmer text-center">Reviewing lets you walk through each recipient's merged email + hold any that aren't right.</p>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-[12px]">
      <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer w-20 shrink-0">{label}</span>
      <span className="text-evari-text flex-1 truncate">{value}</span>
    </li>
  );
}

void useEffect; // keep import in case of follow-up auto-save
void ImageIcon; // exported for parity with other modules

/**
 * Member preview shown beneath the list cards once one is picked.
 * Same component shape as DirectComposer's preview — kept inline
 * here rather than imported so the two flows stay independent.
 */
function SendTimeHint({ scheduledFor, setScheduledFor }: { scheduledFor: string; setScheduledFor: (s: string) => void }) {
  const [rec, setRec] = useState<{ peakHour: number; totalOpens: number } | null>(null);
  useEffect(() => {
    fetch('/api/marketing/send-time', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.recommendation) setRec({ peakHour: d.recommendation.peakHour, totalOpens: d.recommendation.totalOpens }); })
      .catch(() => {});
  }, []);
  if (!rec) return null;
  // What hour did the operator pick (UTC, since the rec is UTC)?
  let scheduledHour: number | null = null;
  if (scheduledFor) {
    const d = new Date(scheduledFor);
    if (!isNaN(d.getTime())) scheduledHour = d.getUTCHours();
  }
  // Window: peak hour ± 1.
  const inWindow = scheduledHour !== null && Math.abs(scheduledHour - rec.peakHour) <= 1;
  const labelHour = (h: number) => `${String(h).padStart(2, '0')}:00 UTC`;
  function applyPeak() {
    const d = scheduledFor ? new Date(scheduledFor) : new Date();
    if (isNaN(d.getTime())) return;
    d.setUTCHours(rec!.peakHour, 0, 0, 0);
    // Convert back to local datetime-local string.
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    setScheduledFor(`${yyyy}-${mm}-${dd}T${hh}:${mi}`);
  }
  return (
    <div className={'mt-1.5 rounded-md text-[11px] px-2 py-1.5 ' + (inWindow ? 'bg-evari-success/10 text-evari-success' : 'bg-evari-warn/10 text-evari-warn')}>
      {inWindow
        ? `Good window: your audience opens most around ${labelHour(rec.peakHour)} (${rec.totalOpens} opens analysed).`
        : (
          <>
            Heads up: your audience opens most around {labelHour(rec.peakHour)}, you've picked {scheduledHour !== null ? labelHour(scheduledHour) : 'no time yet'}.{' '}
            <button type="button" onClick={applyPeak} className="underline hover:text-evari-text transition">Use peak hour</button>
          </>
        )}
    </div>
  );
}

function SubjectVariantsEditor({ variants, setVariants }: { variants: string[]; setVariants: (xs: string[]) => void }) {
  const enabled = variants.length > 0;
  function add() {
    if (variants.length >= 4) return;
    setVariants([...variants, '']);
  }
  function remove(i: number) {
    const next = variants.slice();
    next.splice(i, 1);
    setVariants(next);
  }
  function setAt(i: number, v: string) {
    const next = variants.slice();
    next[i] = v;
    setVariants(next);
  }
  return (
    <div className="mt-2">
      {!enabled ? (
        <button
          type="button"
          onClick={() => setVariants([''])}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-evari-dim hover:text-evari-gold transition border border-evari-edge/30 hover:border-evari-gold/40 bg-evari-ink/30"
        >
          + A/B test the subject
        </button>
      ) : (
        <div className="rounded-md border border-evari-gold/30 bg-evari-gold/5 p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-evari-gold">
            <span>Subject A/B variants ({variants.length})</span>
            <button type="button" onClick={() => setVariants([])} className="text-evari-dim hover:text-evari-text normal-case tracking-normal">Remove A/B</button>
          </div>
          <p className="text-[11px] text-evari-dim">Recipients are split evenly across variants. The original subject above is variant A; rows below are B, C, D.</p>
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-evari-dimmer w-6">{String.fromCharCode(66 + i)}</span>
              <input
                value={v}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={`Subject variant ${String.fromCharCode(66 + i)}`}
                className="flex-1 px-2 py-1 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
              />
              <button type="button" onClick={() => remove(i)} className="text-[11px] text-evari-dim hover:text-evari-danger transition">Remove</button>
            </div>
          ))}
          {variants.length < 4 ? (
            <button type="button" onClick={add} className="text-[11px] text-evari-gold hover:text-evari-text">+ Add another variant</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CheckIconTick() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 stroke-current" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 13 4" />
    </svg>
  );
}

function ListPreview({ groupId }: { groupId: string }) {
  const [members, setMembers] = useState<ListMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  useMemo(() => {
    setLoading(true);
    fetch(`/api/marketing/groups/${groupId}/members`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMembers((d?.members ?? []) as ListMember[]))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) {
    return (
      <div className="rounded-md border border-evari-edge/30 bg-evari-ink/30 px-3 py-2.5 text-[11px] text-evari-dimmer inline-flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading members…
      </div>
    );
  }
  if (!members || members.length === 0) {
    return (
      <div className="rounded-md border border-evari-warn/30 bg-evari-warn/5 px-3 py-2.5 text-[12px] text-evari-warn">
        This list is empty. Add members on /email/audience before sending.
      </div>
    );
  }
  const approved = members.filter((m) => m.status === 'approved');
  const pending  = members.filter((m) => m.status === 'pending');
  const suppressed = members.filter((m) => m.isSuppressed);
  const willSend = approved.filter((m) => !m.isSuppressed);
  const visible  = showAll ? willSend : willSend.slice(0, 8);
  return (
    <div className="rounded-md border border-evari-edge/30 bg-evari-ink/30">
      <header className="px-3 py-2 border-b border-evari-edge/20 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-evari-gold" />
        <div className="flex-1 text-[12px]">
          <strong className="text-evari-text">{willSend.length}</strong> <span className="text-evari-dim">people will receive this</span>
          {pending.length    > 0 ? <span className="text-evari-warn"> · {pending.length} pending excluded</span> : null}
          {suppressed.length > 0 ? <span className="text-evari-danger"> · {suppressed.length} suppressed excluded</span> : null}
        </div>
      </header>
      <ul className="divide-y divide-evari-edge/10">
        {visible.map((m) => {
          const fullName = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
          return (
            <li key={m.contactId} className="flex items-center gap-2.5 px-3 py-1.5">
              <span className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-evari-ink text-[10px] font-semibold text-evari-dim uppercase">
                {(fullName || m.email).slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-evari-text truncate">{fullName || m.email}</div>
                {fullName ? <div className="text-[10px] text-evari-dim truncate font-mono">{m.email}</div> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {approved.length > 8 ? (
        <footer className="px-3 py-1.5 border-t border-evari-edge/20">
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-evari-gold hover:underline">
            {showAll ? 'Show first 8 only' : `Show all ${approved.length} recipients`}
          </button>
        </footer>
      ) : null}
    </div>
  );
}
