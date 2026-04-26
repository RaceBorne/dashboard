/**
 * Email sender abstraction. Phase 5 ships a no-op stub that records
 * what *would* have been sent so the campaign + recipient state
 * machine works end-to-end. Phase 6 swaps in the Postmark client by
 * replacing the function bodies — the public API stays.
 *
 * The stub is intentionally NOT a fake/mock that pretends to send.
 * It returns ok:true with a synthetic message_id but logs every call
 * so the developer can see in the Vercel logs that no real mail went
 * out yet.
 */

export interface SendOneInput {
  to: string;
  subject: string;
  html: string;
  /** Optional human label appended to log output (e.g. campaign name). */
  context?: string;
}

export interface SendOneResult {
  ok: boolean;
  /** Provider's message id when ok: true. Synthetic in stub mode. */
  messageId?: string;
  /** Provider error message when ok: false. */
  error?: string;
}

/**
 * Send one email. Stubbed in Phase 5 — Phase 6 will replace the body
 * with a Postmark API call.
 */
export async function sendOne(input: SendOneInput): Promise<SendOneResult> {
  // Defensive — never quietly drop a send because of a missing field.
  if (!input.to || !input.subject) {
    return { ok: false, error: 'Missing to or subject' };
  }
  // Phase 5 stub: log + return a synthetic message id. Anything that
  // depends on a real provider response (open/click webhooks, hard
  // bounces) won't fire until Phase 6 wires the real client.
  const synthetic = `stub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  // eslint-disable-next-line no-console
  console.log(
    `[mkt.sender STUB] would send ${input.context ? `(${input.context}) ` : ''}` +
      `to=${input.to} subject=${JSON.stringify(input.subject)} bodyLen=${input.html?.length ?? 0} ` +
      `→ ${synthetic}`,
  );
  return { ok: true, messageId: synthetic };
}

/** Whether the sender is currently a stub. UI uses this to badge campaigns. */
export function isStubSender(): boolean {
  return true; // Phase 6 flips to: !!process.env.POSTMARK_SERVER_TOKEN
}
