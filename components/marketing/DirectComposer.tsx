'use client';

/**
 * Direct-message composer — the OTHER half of /email/campaigns/new.
 * For personal text-based emails (outreach, follow-ups, short notes)
 * that should feel like a real email from a person, not a marketing
 * brochure.
 *
 * Three steps: Who -> Write -> Send. The Write step is intentionally
 * simple: subject, plain text body with auto-greeting (Hi {{firstName}}),
 * and a live preview of the brand signature + footer that gets
 * appended at send time. No blocks, no template picker, no visual
 * chrome.
 *
 * Saves to dashboard_mkt_campaigns with kind='direct' so analytics
 * splits open/reply rates fairly (direct messages typically open
 * MUCH higher than newsletters).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Mail,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { CampaignReviewModal } from './CampaignReviewModal';
import { AIDraftButton } from '../ai/AIDraftButton';

interface AIFlag { severity: 'info' | 'warn' | 'error'; kind: string; message: string }
interface HeldPayload {
  contactId: string;
  reason?: string | null;
  source?: 'human' | 'ai' | 'both';
  aiFlags?: AIFlag[] | null;
}
import type { Campaign, Group, MarketingBrand, Segment } from '@/lib/marketing/types';
import type { GroupWithCounts } from '@/lib/marketing/types-extra';
import type { ListMember } from '@/lib/marketing/groups';

interface Props {
  groups: GroupWithCounts[];
  segments: Segment[];
  brand: MarketingBrand;
  initialRecipientEmails?: string[];
}

type AudienceKind = 'group' | 'segment' | 'custom';
type StepKey = 'who' | 'write' | 'send';

const STEPS: Array<{ key: StepKey; label: string; sub: string }> = [
  { key: 'who',   label: 'Who',   sub: 'Pick recipients' },
  { key: 'write', label: 'Write', sub: 'Subject + body' },
  { key: 'send',  label: 'Send',  sub: 'Review and ship' },
];

export function DirectComposer({ groups, segments, brand, initialRecipientEmails = [] }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>('who');

  // --- Audience ---
  const [audienceKind, setAudienceKind] = useState<AudienceKind>(
    initialRecipientEmails.length > 0 ? 'custom' : (groups.length > 0 ? 'group' : 'custom'),
  );
  const [groupId, setGroupId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [recipientEmails, setRecipientEmails] = useState<string[]>(initialRecipientEmails);

  // --- Compose ---
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeGreeting, setIncludeGreeting] = useState(true);

  // --- Send ---
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [savedCampaign, setSavedCampaign] = useState<Campaign | null>(null);
  const [sending, setSending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sendResult, setSendResult] = useState<{ attempted: number; sent: number; suppressed: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audienceReady =
    (audienceKind === 'group' && !!groupId) ||
    (audienceKind === 'segment' && !!segmentId) ||
    (audienceKind === 'custom' && recipientEmails.length > 0);
  const writeReady = subject.trim().length > 0 && body.trim().length > 0;

  function canAdvance(from: StepKey): boolean {
    if (from === 'who')   return audienceReady;
    if (from === 'write') return writeReady && name.trim().length > 0;
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

  // --- Compose body assembly ---
  // Final HTML = optional greeting (Hi {{firstName}}) + body (with line
  // breaks preserved) + brand signature (rendered server-side via the
  // sender) + footer (auto-appended at send time). For preview the
  // greeting + body are shown verbatim with simple <br/> conversion.
  const composedHtml = useMemo(() => {
    const greetingLine = includeGreeting ? '<p>Hi {{firstName}},</p>' : '';
    const bodyHtml = body
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
      .join('\n');
    const sigHtml = brand.signatureHtml ?? '';
    return `${greetingLine}\n${bodyHtml}\n${sigHtml}`.trim();
  }, [body, includeGreeting, brand.signatureHtml]);

  const audienceLabel = useMemo(() => {
    if (audienceKind === 'group')   return groups.find((g) => g.id === groupId)?.name ?? 'No list';
    if (audienceKind === 'segment') return segments.find((s) => s.id === segmentId)?.name ?? 'No segment';
    return `${recipientEmails.length} address${recipientEmails.length === 1 ? '' : 'es'}`;
  }, [audienceKind, groupId, segmentId, recipientEmails, groups, segments]);

  async function ensureSaved(): Promise<Campaign | null> {
    if (savedCampaign) return savedCampaign;
    setError(null);
    if (!name.trim()) {
      setError('Campaign needs an internal name before it can save. Go back to the Write step.');
      return null;
    }
    if (!subject.trim()) {
      setError('Subject line is required.');
      return null;
    }
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        subject: subject.trim(),
        content: composedHtml,
        kind: 'direct',
        segmentId: audienceKind === 'segment' ? segmentId || null : null,
        groupId:   audienceKind === 'group'   ? groupId   || null : null,
        recipientEmails: audienceKind === 'custom' ? recipientEmails : null,
        emailDesign: null,
      };
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
      const res = await fetch('/api/marketing/templates/preview-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim(), html: composedHtml, subject: `[Test] ${subject.trim()}`, skipBrandFooter: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error ?? 'Test failed');
      setTestResult(`Test sent to ${testEmail.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTestSending(false);
    }
  }

  async function sendNow(held: HeldPayload[] = []) {
    if (sending) return;
    setSending(true); setError(null);
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
    // Save the campaign first so the preview endpoint can render it
    // exactly as it would ship.
    setError(null);
    const c = await ensureSaved();
    if (c) setReviewOpen(true);
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-evari-ink">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <Link href="/email/campaigns" className="inline-flex items-center gap-1 text-xs text-evari-dim hover:text-evari-text transition-colors mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> All campaigns
        </Link>

        <Stepper current={step} />

        <div className="mt-4 rounded-panel bg-evari-surface border border-evari-edge/30 p-4 min-h-[420px]">
          {step === 'who' ? (
            <WhoStep
              groups={groups} segments={segments}
              audienceKind={audienceKind} setAudienceKind={setAudienceKind}
              groupId={groupId} setGroupId={setGroupId}
              segmentId={segmentId} setSegmentId={setSegmentId}
              recipientEmails={recipientEmails} setRecipientEmails={setRecipientEmails}
            />
          ) : step === 'write' ? (
            <WriteStep
              name={name} setName={setName}
              subject={subject} setSubject={setSubject}
              body={body} setBody={setBody}
              includeGreeting={includeGreeting} setIncludeGreeting={setIncludeGreeting}
              signatureHtml={brand.signatureHtml ?? ''}
            />
          ) : (
            <SendStep
              audienceLabel={audienceLabel}
              name={name} subject={subject}
              previewHtml={composedHtml}
              testEmail={testEmail} setTestEmail={setTestEmail}
              onTest={sendTest} testSending={testSending} testResult={testResult}
              onSend={() => sendNow()} onReview={openReview} sending={sending} sendResult={sendResult}
            />
          )}
        </div>

        {sendResult ? (
          <div className="mt-4 flex items-center justify-between">
            <Link href="/email/campaigns" className="inline-flex items-center gap-1 text-[12px] text-evari-dim hover:text-evari-text">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all campaigns
            </Link>
            {savedCampaign ? (
              <Link href={`/email/campaigns/${savedCampaign.id}`} className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1.5 rounded">
                Open campaign report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={back} disabled={step === 'who'} className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] text-evari-dim hover:text-evari-text disabled:opacity-30 disabled:hover:text-evari-dim transition-colors">
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
                  canAdvance(step) ? 'bg-evari-gold text-evari-goldInk hover:brightness-110' : 'bg-evari-ink/60 text-evari-dimmer cursor-not-allowed',
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

// ─── Stepper ───────────────────────────────────────────────────

function Stepper({ current }: { current: StepKey }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="rounded-panel bg-evari-surface border border-evari-edge/30 px-2 py-2">
      <ol className="flex items-stretch">
        {STEPS.map((s, i) => {
          const isCurrent = s.key === current;
          const isPast = i < idx;
          const isFuture = i > idx;
          return (
            <li key={s.key} className="flex-1 flex items-center min-w-0">
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md w-full min-w-0 transition-all', isCurrent ? 'bg-evari-gold/15' : '')}>
                <span className={cn('shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-mono font-semibold',
                  isCurrent ? 'bg-evari-gold text-evari-goldInk' :
                  isPast    ? 'bg-evari-success/20 text-evari-success' :
                              'bg-evari-ink/60 text-evari-dimmer',
                )}>
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

// ─── Who step ─────────────────────────────────────────────────

function WhoStep({ groups, segments, audienceKind, setAudienceKind, groupId, setGroupId, segmentId, setSegmentId, recipientEmails, setRecipientEmails }: {
  groups: GroupWithCounts[]; segments: Segment[];
  audienceKind: AudienceKind; setAudienceKind: (k: AudienceKind) => void;
  groupId: string; setGroupId: (s: string) => void;
  segmentId: string; setSegmentId: (s: string) => void;
  recipientEmails: string[]; setRecipientEmails: (xs: string[]) => void;
}) {
  return (
    <div>
      <header className="mb-3">
        <h2 className="text-base font-semibold text-evari-text">Who is this going to?</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Direct messages work for one person or a list — pick whichever fits.</p>
      </header>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Tile active={audienceKind === 'custom'}  onClick={() => setAudienceKind('custom')}  icon={<Mail className="h-4 w-4" />}     title="Specific people" sub="Paste / add" />
        <Tile active={audienceKind === 'group'}   onClick={() => setAudienceKind('group')}   icon={<Users className="h-4 w-4" />}    title="A list"           sub={`${groups.length} saved`} />
        <Tile active={audienceKind === 'segment'} onClick={() => setAudienceKind('segment')} icon={<Sparkles className="h-4 w-4" />} title="A segment"        sub={`${segments.length} saved`} />
      </div>

      {audienceKind === 'custom' ? (
        <div>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Recipient addresses ({recipientEmails.length})</span>
            <textarea
              className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] font-mono border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none min-h-[140px]"
              placeholder="alice@example.com&#10;bob@example.com"
              value={recipientEmails.join('\n')}
              onChange={(e) => {
                const next = e.target.value.split(/[\n,]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
                setRecipientEmails([...new Set(next)]);
              }}
            />
            <span className="text-[10px] text-evari-dimmer mt-0.5 block">One per line or comma-separated. Invalid addresses are dropped silently.</span>
          </label>
        </div>
      ) : audienceKind === 'group' ? (
        groups.length === 0 ? (
          <Empty label="You don't have any lists yet." cta={<Link href="/email/audience" className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded">Build a list <ArrowRight className="h-3.5 w-3.5" /></Link>} />
        ) : (
          <div className="space-y-3">
            <ul className="grid grid-cols-2 gap-2">
              {groups.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => setGroupId(g.id)} className={cn('w-full text-left rounded-md border p-3 transition-colors', groupId === g.id ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40')}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-semibold text-evari-text truncate flex-1 min-w-0">{g.name}</div>
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
              ))}
            </ul>
            {groupId ? <ListPreview groupId={groupId} /> : null}
          </div>
        )
      ) : (
        segments.length === 0 ? (
          <Empty label="You don't have any segments yet." cta={<Link href="/email/audience" className="inline-flex items-center gap-1 text-[12px] font-semibold bg-evari-gold text-evari-goldInk px-3 py-1 rounded">Build a segment <ArrowRight className="h-3.5 w-3.5" /></Link>} />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {segments.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setSegmentId(s.id)} className={cn('w-full text-left rounded-md border p-3 transition-colors', segmentId === s.id ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40')}>
                  <div className="text-[13px] font-semibold text-evari-text truncate">{s.name}</div>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function Tile({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('rounded-md border px-3 py-3 text-left transition-colors', active ? 'border-evari-gold bg-evari-gold/10' : 'border-evari-edge/30 bg-evari-ink/30 hover:border-evari-gold/40')}>
      <div className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md mb-2', active ? 'bg-evari-gold/30 text-evari-gold' : 'bg-evari-ink text-evari-dim')}>{icon}</div>
      <div className="text-[12px] font-semibold text-evari-text">{title}</div>
      <div className="text-[10px] text-evari-dimmer mt-0.5">{sub}</div>
    </button>
  );
}

function Empty({ label, cta }: { label: string; cta: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-evari-edge/40 px-4 py-6 text-center">
      <p className="text-[12px] text-evari-dim mb-3">{label}</p>
      {cta}
    </div>
  );
}

// ─── Write step ───────────────────────────────────────────────

function WriteStep({ name, setName, subject, setSubject, body, setBody, includeGreeting, setIncludeGreeting, signatureHtml }: {
  name: string; setName: (s: string) => void;
  subject: string; setSubject: (s: string) => void;
  body: string; setBody: (s: string) => void;
  includeGreeting: boolean; setIncludeGreeting: (b: boolean) => void;
  signatureHtml: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <header>
          <h2 className="text-base font-semibold text-evari-text">Write the message</h2>
          <p className="text-[12px] text-evari-dim mt-0.5">Plain text. Your brand signature appends automatically. The footer (unsub, address) is added at send time.</p>
        </header>

        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-0.5">Internal name</span>
          <input className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" placeholder="Follow-up to launch list" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="block">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Subject line</span>
            <AIDraftButton field="subject" value={subject} context={`Direct message · audience: ${name}`} onApply={setSubject} />
          </div>
          <input className="w-full px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none" placeholder="Quick question about your build" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeGreeting} onChange={(e) => setIncludeGreeting(e.target.checked)} className="accent-evari-gold cursor-pointer" />
          <span className="text-[12px] text-evari-text">Auto-prepend &quot;Hi {`{{firstName}}`},&quot;</span>
        </label>

        <div className="block">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer">Message body</span>
            <AIDraftButton field="body" value={body} context={`Direct message. Subject: ${subject}. Internal name: ${name}.`} onApply={setBody} />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the message you'd write if you were sending this from your own inbox..."
            className="w-full min-h-[280px] px-2.5 py-2 rounded-md bg-evari-ink text-evari-text text-[13px] leading-relaxed border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none"
          />
          <span className="text-[10px] text-evari-dimmer mt-0.5 block">Blank line = paragraph break. {`{{firstName}}`} merges per recipient.</span>
        </div>
      </div>

      {/* Live preview pane */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer mb-1">Live preview</div>
        <div className="rounded-md bg-white text-zinc-900 p-4 max-h-[480px] overflow-y-auto text-[13px] leading-relaxed font-sans">
          {includeGreeting ? <p className="mb-3">Hi <span className="text-evari-dimmer">{`{{firstName}}`}</span>,</p> : null}
          {body.trim() ? (
            body.trim().split(/\n{2,}/).map((p, i) => (
              <p key={i} className="mb-3" style={{ whiteSpace: 'pre-line' }}>{p}</p>
            ))
          ) : (
            <p className="italic text-zinc-400">Your message will appear here as you type.</p>
          )}
          {signatureHtml ? (
            <div className="mt-4 pt-4 border-t border-zinc-200" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
          ) : (
            <p className="mt-4 text-[11px] italic text-zinc-400">Brand signature will append at send time.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Send step ────────────────────────────────────────────────

function SendStep({ audienceLabel, name, subject, previewHtml, testEmail, setTestEmail, onTest, testSending, testResult, onSend, onReview, sending, sendResult }: {
  audienceLabel: string;
  name: string; subject: string;
  previewHtml: string;
  testEmail: string; setTestEmail: (s: string) => void;
  onTest: () => void; testSending: boolean; testResult: string | null;
  onSend: () => void; onReview: () => void; sending: boolean; sendResult: { attempted: number; sent: number; suppressed: number; failed: number } | null;
}) {
  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h2 className="text-base font-semibold text-evari-text">Review and send</h2>
        <p className="text-[12px] text-evari-dim mt-0.5">Test it on yourself first, then send.</p>
      </header>

      <ul className="rounded-md border border-evari-edge/30 divide-y divide-evari-edge/15">
        <Row label="Audience" value={audienceLabel} />
        <Row label="Name"     value={name} />
        <Row label="Subject"  value={subject} />
      </ul>

      <details className="rounded-md border border-evari-edge/30 bg-evari-ink/30 group">
        <summary className="px-3 py-2 cursor-pointer text-[12px] font-semibold text-evari-text">Preview the email</summary>
        <div className="px-3 pb-3">
          <div className="rounded-md bg-white text-zinc-900 p-4 text-[13px] leading-relaxed max-h-[400px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </details>

      <div className="rounded-md border border-evari-edge/30 p-3 bg-evari-ink/30">
        <div className="text-[12px] font-semibold text-evari-text mb-1.5">Send a test first</div>
        <div className="flex gap-1.5">
          <input type="email" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-md bg-evari-ink text-evari-text text-[12px] border border-evari-edge/30 focus:border-evari-gold/60 focus:outline-none font-mono" />
          <button type="button" onClick={onTest} disabled={testSending || !testEmail.trim()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-evari-ink text-evari-text border border-evari-edge/30 hover:border-evari-gold/40 disabled:opacity-50 transition-colors">
            {testSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Test
          </button>
        </div>
        {testResult ? <p className="text-[11px] text-evari-success mt-1.5">{testResult}</p> : null}
      </div>

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
          <button type="button" onClick={onSend} disabled={sending} className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md text-[13px] font-semibold bg-evari-gold text-evari-goldInk hover:brightness-110 disabled:opacity-50 transition">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send direct message'}
          </button>
          <p className="text-[10px] text-evari-dimmer text-center">Reviewing lets you walk through each recipient's merged email + hold any that aren't right.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-[12px]">
      <span className="text-[10px] uppercase tracking-[0.12em] text-evari-dimmer w-20 shrink-0">{label}</span>
      <span className="text-evari-text flex-1 truncate">{value || <em className="text-evari-dimmer">Not set</em>}</span>
    </li>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Drops in beneath the list cards once the operator has picked one.
 * Shows the actual member emails so they can SEE who they're about to
 * send to before continuing — solves the 'fearful of sending' problem
 * by making the audience concrete.
 */
function ListPreview({ groupId }: { groupId: string }) {
  const [members, setMembers] = useState<ListMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // Re-fetch whenever the picked list changes.
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
