/**
 * Shared signature renderer — used by:
 *   - components/settings/SendersSection.tsx (client-side live preview)
 *   - app/api/senders/[id]/test-send/route.ts (server-side send)
 *   - future send pipeline (approval queue → Gmail send)
 *
 * Handles {{slot}} substitution and {{#if token}}…{{/if}} conditional blocks
 * so empty optional fields (role, phone, website, logoUrl) collapse cleanly
 * without leaving blank rows in the final email.
 */

export interface SignatureInputs {
  displayName: string;
  role?: string;
  email: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  signatureHtml: string;
}

export function renderSignature(input: SignatureInputs): string {
  let html = input.signatureHtml;

  const stripIf = (token: string, present: boolean) => {
    const re = new RegExp(
      '\\{\\{#if ' + token + '\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}',
      'g',
    );
    html = html.replace(re, (_m, inner) => (present ? inner : ''));
  };

  stripIf('role', Boolean(input.role));
  stripIf('phone', Boolean(input.phone));
  stripIf('website', Boolean(input.website));
  stripIf('logoUrl', Boolean(input.logoUrl));

  html = html
    .replaceAll('{{displayName}}', escapeHtml(input.displayName || 'Your name'))
    .replaceAll('{{role}}', escapeHtml(input.role || ''))
    .replaceAll('{{email}}', escapeHtml(input.email || 'you@evari.cc'))
    .replaceAll('{{phone}}', escapeHtml(input.phone || ''))
    .replaceAll('{{website}}', escapeHtml(input.website || ''))
    .replaceAll('{{logoUrl}}', input.logoUrl || '');

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
