import type { OutreachSender } from '@/lib/types';

/**
 * Default email signature template — email-safe HTML matching the Evari
 * brand signature (two accent bars, name, role, wordmark, phone,
 * evari.cc link, confidentiality notice).
 *
 * The Evari wordmark is embedded as a base64 data URL so the logo cannot
 * be lost by accident when editing a sender. Website is hard-coded to
 * evari.cc. Two accent bars are drawn with a 1x1 transparent GIF
 * stretched + coloured via background (most reliable trick across
 * Outlook, Gmail, Apple Mail, iOS Mail).
 *
 * Tokens: {{displayName}}, {{role}} (with #if wrapper), {{phone}}
 * (with #if wrapper). Everything else is hard-coded in the template.
 */
export const DEFAULT_SIGNATURE_HTML = '<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#111111;line-height:1.4;">\n  <tr><td style="height:32px;line-height:32px;font-size:0;">&nbsp;</td></tr>\n  <tr><td style="padding:0 0 2px 0;font-family:-apple-system,BlinkMacSystemFont,system-ui,Roboto,sans-serif;font-size:13px;font-weight:normal;color:#111111;">{{displayName}}</td></tr>\n  {{#if role}}<tr><td style="padding:0 0 24px 0;font-size:10px;color:#6b6b6b;">{{role}}</td></tr>{{/if}}\n  <tr><td style="padding:0 0 24px 0;"><img src="https://qtxwcyoslvocfodvsmsl.supabase.co/functions/v1/logo-evari-blue" alt="Evari" width="120" height="14" style="display:block;border:0;outline:none;text-decoration:none;width:120px;height:14px;max-width:120px;" /></td></tr>\n  {{#if phone}}<tr><td style="padding:0 0 2px 0;font-size:13px;color:#111111;">{{phone}}</td></tr>{{/if}}\n  <tr><td style="padding:0 0 16px 0;font-size:13px;"><a href="https://evari.cc" style="color:#111111;text-decoration:none;">evari.cc</a></td></tr>\n  <tr><td style="padding:0;font-size:0;line-height:0;border-top:1px solid #cccccc;height:1px;">&nbsp;</td></tr>\n  <tr><td style="padding:16px 0 6px 0;font-size:10px;font-weight:bold;color:#555555;">Confidentiality Notice:</td></tr>\n  <tr><td style="padding:0 0 8px 0;font-size:10px;color:#666666;line-height:1.55;max-width:520px;">This message is confidential and intended solely for the individual or organisation to whom it is addressed. It may contain privileged or sensitive information. If you are not the intended recipient, please do not copy, distribute, or act upon its contents.</td></tr>\n  <tr><td style="font-size:10px;color:#666666;line-height:1.55;max-width:520px;">If you have received this message in error, kindly notify the sender at the email address provided above.</td></tr>\n</table>';

/**
 * Seeded placeholder sender so the pipeline has a default identity
 * before real Google OAuth is wired up. `oauthConnected: false`
 * signals to the send layer that this sender can't actually send yet —
 * drafts queue up but do not go out. Once you add a real refresh
 * token to .env.local for this mailbox, flip the flag in
 * Settings -> Email senders.
 */
export const MOCK_SENDERS: OutreachSender[] = [
  {
    id: 'sender_craig_mcd',
    email: 'craig@evari.cc',
    displayName: 'Craig McDonald',
    role: 'CEO & Head of Design',
    phone: 'UK (M) +44 (0)7720 288398',
    website: 'evari.cc',
    logoUrl: '/email/evari-blue.png',
    signatureHtml: DEFAULT_SIGNATURE_HTML,
    isActive: true,
    isDefault: true,
    oauthConnected: false,
    createdAt: '2026-04-21T09:00:00.000Z',
    updatedAt: '2026-04-21T09:00:00.000Z',
  },
];
