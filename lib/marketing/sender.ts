/**
 * Email sender. When POSTMARK_SERVER_TOKEN is set, sends through
 * Postmark's HTTP API. Otherwise falls back to the Phase 5 stub —
 * the dev-time logging mode that returns a synthetic message id.
 *
 * The fallback means local dev + preview deploys without env vars
 * still exercise the full campaign pipeline; only production-with-
 * Postmark-token actually puts mail on the wire.
 *
 * Env vars:
 *   POSTMARK_SERVER_TOKEN       - server token (required to leave stub mode)
 *   POSTMARK_FROM_EMAIL         - From: address (required if token set)
 *   POSTMARK_FROM_NAME          - optional display name
 *   POSTMARK_MESSAGE_STREAM     - default "broadcast" (Postmark stream id)
 */

export interface SendOneInput {
  to: string;
  subject: string;
  html: string;
  /** Optional human label appended to log output (e.g. campaign name). */
  context?: string;
  /** Optional plain-text body. Auto-generated from html if omitted. */
  text?: string;
  /** Optional Postmark message stream override. */
  stream?: string;
}

export interface SendOneResult {
  ok: boolean;
  /** Provider's message id when ok: true. Synthetic in stub mode. */
  messageId?: string;
  /** Provider error message when ok: false. */
  error?: string;
}

const POSTMARK_API = 'https://api.postmarkapp.com/email';

function postmarkConfig() {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM_EMAIL;
  if (!token || !from) return null;
  const fromName = process.env.POSTMARK_FROM_NAME;
  return {
    token,
    from: fromName ? `${fromName} <${from}>` : from,
    stream: process.env.POSTMARK_MESSAGE_STREAM ?? 'broadcast',
  };
}

/** True when the sender will actually call Postmark on send. */
export function isStubSender(): boolean {
  return postmarkConfig() === null;
}

/** Strip HTML tags as a tiny fallback text body for clients that
 *  prefer text/plain. Not perfect but better than nothing. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function sendOne(input: SendOneInput): Promise<SendOneResult> {
  if (!input.to || !input.subject) {
    return { ok: false, error: 'Missing to or subject' };
  }

  const cfg = postmarkConfig();

  if (!cfg) {
    // STUB MODE — log + return a synthetic message id. Same behaviour
    // as Phase 5; nothing leaves the process.
    const synthetic = `stub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    // eslint-disable-next-line no-console
    console.log(
      `[mkt.sender STUB] would send ${input.context ? `(${input.context}) ` : ''}` +
        `to=${input.to} subject=${JSON.stringify(input.subject)} bodyLen=${input.html?.length ?? 0} ` +
        `→ ${synthetic}`,
    );
    return { ok: true, messageId: synthetic };
  }

  // LIVE MODE — Postmark single-message send.
  try {
    const res = await fetch(POSTMARK_API, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': cfg.token,
      },
      body: JSON.stringify({
        From: cfg.from,
        To: input.to,
        Subject: input.subject,
        HtmlBody: input.html,
        TextBody: input.text ?? htmlToText(input.html),
        MessageStream: input.stream ?? cfg.stream,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ErrorCode?: number;
      Message?: string;
      MessageID?: string;
    };
    if (!res.ok || (typeof data.ErrorCode === 'number' && data.ErrorCode !== 0)) {
      return {
        ok: false,
        error: data.Message ?? `Postmark HTTP ${res.status}`,
      };
    }
    return { ok: true, messageId: data.MessageID };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Postmark request failed',
    };
  }
}
