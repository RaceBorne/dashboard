/**
 * Social platform adapters — stubs for LinkedIn, Instagram, TikTok.
 *
 * All three require their respective app to be approved by the platform
 * before publishing is allowed. Until then the dashboard renders posts as
 * scheduled drafts in the calendar and exports a copy-paste pack.
 *
 * Approval timelines (from experience):
 *   - LinkedIn Marketing Developer Platform: 2-4 weeks
 *   - Meta App Review (instagram_content_publish): 1-3 weeks
 *   - TikTok content.publish: 2-6 weeks
 */

import { MOCK_SOCIAL_POSTS } from '@/lib/mock/social';
import type { SocialPlatform, SocialPost } from '@/lib/types';

const isLinkedInConnected = () =>
  Boolean(
    process.env.LINKEDIN_ACCESS_TOKEN &&
      process.env.LINKEDIN_ORGANIZATION_URN,
  );

const isInstagramConnected = () =>
  Boolean(
    process.env.META_ACCESS_TOKEN &&
      process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  );

const isTikTokConnected = () => Boolean(process.env.TIKTOK_ACCESS_TOKEN);

export function platformConnected(p: SocialPlatform) {
  if (p === 'linkedin') return isLinkedInConnected();
  if (p === 'instagram') return isInstagramConnected();
  return isTikTokConnected();
}

export async function listSocialPosts(): Promise<SocialPost[]> {
  return MOCK_SOCIAL_POSTS;
}

export async function publishSocialPost(post: SocialPost) {
  if (!platformConnected(post.platform)) {
    return { ok: true, dryRun: true, post };
  }
  throw new Error(`${post.platform} live publishing not yet implemented`);
}
