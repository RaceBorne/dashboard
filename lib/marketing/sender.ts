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
  /** When set, a List-Unsubscribe header + RFC 8058 one-click POST
   *  header are added, and any {{unsubscribeUrl}} placeholder in the
   *  HTML / TEXT / SUBJECT is replaced with this URL. */
  unsubscribeUrl?: string;
  /** Optional Reply-To override — falls back to brand kit, then to None. */
  replyTo?: string;
  /** Skip auto-appending the brand signature + legal footer. Default false. */
  skipBrandFooter?: boolean;
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
        (input.unsubscribeUrl ? `unsub=${input.unsubscribeUrl} ` : '') +
        `→ ${synthetic}`,
    );
    return { ok: true, messageId: synthetic };
  }

  // LIVE MODE — Postmark single-message send.
  // Substitute {{unsubscribeUrl}} placeholders + auto-append a footer
  // when the caller passed an unsubscribeUrl but didn't reference it.
  let html = input.html;
  let text = input.text ?? htmlToText(input.html);
  let subject = input.subject;
  let postmarkHeaders: Array<{ Name: string; Value: string }> | undefined;

  // Brand-kit driven footer: signature + legal info auto-appended.
  // Loaded lazily so the import cycle stays clean in stub mode.
  if (!input.skipBrandFooter) {
    try {
      const { getBrand } = await import('./brand');
      const brand = await getBrand();

      // Custom-font @font-face block — prepended to the HTML body so
      // mailbox providers that honour <style> blocks (Apple Mail,
      // most webmail) load brand fonts. Outlook/older clients fall
      // back to the family stack below it. Google Fonts (heading +
      // body) are added via @import for clients that allow it.
      const fontFaceBlocks = brand.customFonts
        .map(
          (f) =>
            `@font-face{font-family:'${f.name}';font-style:${f.style};` +
            `font-weight:${f.weight};font-display:swap;` +
            `src:url('${f.url}') format('${f.format}');}`,
        )
        .join('\n');
      const customNames = new Set(brand.customFonts.map((f) => f.name));
      const headingFamily = brand.fonts.heading || 'Arial';
      const bodyFamily    = brand.fonts.body || 'Arial';
      // Pull Google Fonts via @import only for non-custom names.
      const gFonts = [headingFamily, bodyFamily]
        .filter((n) => !customNames.has(n))
        .filter((n) => !['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS'].includes(n));
      const gImport = gFonts.length > 0
        ? `@import url('https://fonts.googleapis.com/css2?${gFonts.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}`).join('&')}&display=swap');`
        : '';
      const styleBlock = (fontFaceBlocks || gImport)
        ? `<style type="text/css">${gImport}${fontFaceBlocks}` +
          `body,td,p,div,a,span{font-family:'${bodyFamily}',Arial,sans-serif;}` +
          `h1,h2,h3,h4,h5,h6{font-family:'${headingFamily}',Arial,sans-serif;}` +
          `</style>`
        : '';
      if (styleBlock) html = styleBlock + html;

      const sigPieces: string[] = [];
      if (brand.signatureHtml) {
        sigPieces.push(`<div style="margin:32px 0 8px 0;font:14px/1.5 ${brand.fonts.body || 'sans-serif'};color:${brand.colors.text || '#1a1a1a'};">${brand.signatureHtml}</div>`);
      }
      if (brand.companyName || brand.companyAddress) {
        sigPieces.push(
          `<div style="margin:24px 0 8px 0;font:11px/1.5 sans-serif;color:${brand.colors.muted || '#666666'};">` +
            (brand.companyName ? `<strong>${brand.companyName}</strong><br/>` : '') +
            (brand.companyAddress ? brand.companyAddress.replace(/\n/g, '<br/>') : '') +
          `</div>`
        );
      }
      if (sigPieces.length > 0) {
        html += sigPieces.join('\n');
        text += '\n\n' + (brand.signatureHtml ? brand.signatureHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '\n\n' : '') +
                (brand.companyName ? brand.companyName + '\n' : '') +
                (brand.companyAddress ?? '');
      }
      // If caller didn't pass a replyTo and brand has one, use it.
      if (!input.replyTo && brand.replyToEmail) {
        input = { ...input, replyTo: brand.replyToEmail };
      }
    } catch (err) {
      console.error('[mkt.sender brand footer]', err);
    }
  }

  if (input.unsubscribeUrl) {
    const placeholder = '{{unsubscribeUrl}}';
    const had = html.includes(placeholder);
    html = html.split(placeholder).join(input.unsubscribeUrl);
    text = text.split(placeholder).join(input.unsubscribeUrl);
    subject = subject.split(placeholder).join(input.unsubscribeUrl);
    if (!had) {
      // Auto-append a small footer so the recipient always has a link
      // — mailbox providers increasingly bulk-classify mail without one.
      html +=
        `\n<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;"/>` +
        `<p style="font:12px/1.4 sans-serif;color:#666;">` +
        `Don't want these emails? <a href="${input.unsubscribeUrl}">Unsubscribe</a>.` +
        `</p>`;
      text += `\n\n---\nUnsubscribe: ${input.unsubscribeUrl}`;
    }
    // List-Unsubscribe (RFC 2369) + List-Unsubscribe-Post (RFC 8058)
    postmarkHeaders = [
      { Name: 'List-Unsubscribe', Value: `<${input.unsubscribeUrl}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ];
  }

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
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        MessageStream: input.stream ?? cfg.stream,
        ...(postmarkHeaders ? { Headers: postmarkHeaders } : {}),
        ...(input.replyTo ? { ReplyTo: input.replyTo } : {}),
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
