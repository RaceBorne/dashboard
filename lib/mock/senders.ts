import type { OutreachSender } from '@/lib/types';

/**
 * Seeded placeholder sender so the pipeline has a default identity before
 * real Google OAuth is wired up. `oauthConnected: false` signals to the send
 * layer that this sender can't actually send yet — drafts queue up but do
 * not go out. Once you add a real refresh token to .env.local for this
 * mailbox, flip the flag in Settings → Email senders.
 */
export const MOCK_SENDERS: OutreachSender[] = [
  {
    id: 'sender_placeholder',
    email: 'craig.mcdonald@evari.cc',
    displayName: 'Craig McDonald',
    role: 'Founder · Evari Speed Bikes',
    signatureHtml:
      `<p><strong>{{displayName}}</strong>{{#if role}} · {{role}}{{/if}}<br/>` +
      `Evari Speed Bikes<br/>` +
      `<a href="mailto:{{email}}">{{email}}</a></p>` +
      `{{#if logoUrl}}<img src="{{logoUrl}}" alt="Evari" height="32"/>{{/if}}`,
    isActive: true,
    isDefault: true,
    oauthConnected: false,
    createdAt: '2026-04-21T09:00:00.000Z',
    updatedAt: '2026-04-21T09:00:00.000Z',
  },
];
