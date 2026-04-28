/**
 * Pre-send AI inspector for campaign emails.
 *
 * Given the rendered subject + html for a single recipient (exactly as
 * Postmark would deliver it), the inspector returns a list of issues
 * the operator should look at before approving. The shape is small on
 * purpose: severity tells the UI how loud to render, kind is a stable
 * machine token used for grouping/filters, message is human prose.
 *
 * The inspector NEVER auto-holds anyone. It just surfaces flags. The
 * operator still decides whether to approve, hold, or skip in the
 * review modal. Keeping the AI advisory rather than gating preserves
 * the "send fast, fix later" rhythm the founder works in.
 *
 * Strict failure modes: if the gateway is unreachable or the model
 * returns junk, return an empty array rather than blow up the modal.
 * The send pipeline never depends on this — it's purely advisory.
 */

import { generateTextWithFallback, hasAIGatewayCredentials } from '@/lib/ai/gateway';
import type { HeldFlag } from './heldRecipients';

const INSPECT_MODEL = process.env.AI_INSPECT_MODEL || 'anthropic/claude-haiku-4-5';

export interface InspectionInput {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  subject: string;
  html: string;
}

export interface InspectionResult {
  contactId: string;
  flags: HeldFlag[];
}

const SYSTEM_PROMPT = `You are a pre-send safety reviewer for marketing email at Evari Speed Bikes (a premium bike brand). The operator is the founder, Craig. Your job is to spot issues with a SPECIFIC outgoing email before it ships.

Look for, in order of priority:
1. Missing or wrong personalisation: empty greeting, "Hi ," (comma straight after Hi), "Hi {{firstName}}", "Hi friend", or any leftover merge tokens like {{...}} that were not substituted.
2. Wrong audience signal: name in the email body does not match the recipient (e.g., "Hi Craig" when the recipient is Sarah).
3. Ungrammatical greeting from data quality: "Hi BIKES", all-caps last name treated as first name, vendor names in the firstName slot, etc.
4. Em-dashes (—) or en-dashes (–) anywhere in the body. The brand explicitly bans them. Flag every occurrence as a separate or summarised issue.
5. Lorem ipsum, placeholder copy, "TODO", or obvious template chrome that was never replaced.
6. Subject line problems: empty subject, ALL CAPS subject, more than 90 chars, "test" / "draft" in subject.
7. Suspicious tracking placeholders left raw, e.g. "{{trackingPixel}}".
8. The email looks like it was meant for a different segment (mentions a discount, product, or persona that does not match the recipient's company or signals).

For each issue, emit ONE flag with:
- severity: "error" (must fix), "warn" (almost certainly should hold), or "info" (cosmetic, send is fine).
- kind: a short stable token like "missing_first_name", "em_dash", "leftover_merge_token", "subject_empty", "wrong_recipient_name", "audience_mismatch", "lorem_ipsum", "subject_all_caps".
- message: one sentence, plain English, no em-dashes, telling the operator what is wrong.

If the email looks fine, return {"flags": []}.

You MUST reply with a single JSON object on a single line, no markdown, no commentary, exactly the shape:
{"flags":[{"severity":"warn","kind":"missing_first_name","message":"Greeting reads 'Hi ,' which means firstName was empty."}]}`;

function stripDoctype(html: string): string {
  // Drop the doctype + html scaffolding to keep the prompt small.
  return html
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '… [truncated]';
}

function buildPrompt(input: InspectionInput): string {
  const { firstName, lastName, email, company, subject, html } = input;
  const meta = [
    `Recipient.email: ${email}`,
    `Recipient.firstName: ${firstName ?? '(none)'}`,
    `Recipient.lastName: ${lastName ?? '(none)'}`,
    `Recipient.company: ${company ?? '(none)'}`,
  ].join('\n');
  const cleaned = truncate(stripDoctype(html), 8000);
  return [
    'Review this single outgoing email and flag issues. Reply with the JSON object exactly as specified.',
    '',
    'RECIPIENT METADATA:',
    meta,
    '',
    'SUBJECT:',
    subject || '(empty)',
    '',
    'BODY (html):',
    cleaned,
  ].join('\n');
}

function parseFlags(text: string): HeldFlag[] {
  // Models occasionally wrap JSON in code fences despite instructions.
  const stripped = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  // Find the first { and last } so we tolerate stray prose.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return [];
  const slice = stripped.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as { flags?: unknown };
    const raw = Array.isArray(parsed.flags) ? parsed.flags : [];
    const out: HeldFlag[] = [];
    for (const f of raw) {
      if (!f || typeof f !== 'object') continue;
      const ff = f as { severity?: string; kind?: string; message?: string };
      const severity = ff.severity === 'error' || ff.severity === 'warn' || ff.severity === 'info' ? ff.severity : 'info';
      const kind = typeof ff.kind === 'string' && ff.kind.length > 0 ? ff.kind.slice(0, 64) : 'unknown';
      const message = typeof ff.message === 'string' ? ff.message.slice(0, 280) : '';
      if (!message) continue;
      out.push({ severity, kind, message });
    }
    return out;
  } catch {
    return [];
  }
}

export async function inspectOne(input: InspectionInput): Promise<InspectionResult> {
  if (!hasAIGatewayCredentials()) {
    return { contactId: input.contactId, flags: [] };
  }
  try {
    const { text } = await generateTextWithFallback({
      model: INSPECT_MODEL,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      temperature: 0,
    });
    return { contactId: input.contactId, flags: parseFlags(text) };
  } catch (err) {
    console.warn('[mkt.aiInspect] failed', err);
    return { contactId: input.contactId, flags: [] };
  }
}

interface InspectBatchOpts {
  concurrency?: number;
}

export async function inspectBatch(
  inputs: InspectionInput[],
  opts: InspectBatchOpts = {},
): Promise<InspectionResult[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 6, 12));
  const results: InspectionResult[] = new Array(inputs.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await inspectOne(inputs[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
