// Platform-specific content format options. The spec here drives:
//   - the format chooser UI on /social/new
//   - the aspect-ratio preview
//   - validation hints (caption length, media constraints)
//
// Spec values are pulled from each platform's current creator documentation
// (Instagram Graph API, LinkedIn Posts API, TikTok Content Posting API).

import type { SocialPlatform } from './types';

export type PostFormatId =
  // Instagram
  | 'ig-feed-square'
  | 'ig-feed-portrait'
  | 'ig-feed-landscape'
  | 'ig-story'
  | 'ig-reel'
  | 'ig-carousel'
  // LinkedIn
  | 'li-image'
  | 'li-video'
  | 'li-document'
  | 'li-text'
  | 'li-article'
  // TikTok
  | 'tt-video'
  | 'tt-photo-carousel'
  // Shopify Blog
  | 'sb-article'
  // Newsletter (Klaviyo)
  | 'nl-campaign'
  | 'nl-automation';

export interface PostFormat {
  id: PostFormatId;
  platform: SocialPlatform;
  label: string;
  /** 'w:h' — used for the preview frame aspect ratio. */
  aspect: string;
  /** Media kind — drives the upload zone. */
  media: 'image' | 'video' | 'document' | 'text' | 'carousel';
  /** Recommended pixel dimensions (for the upload zone copy). */
  recommended?: string;
  /** Short description. */
  description: string;
  /** Max caption/body length in characters. */
  captionMax?: number;
  /** Typical duration for video, in seconds. */
  durationMax?: number;
}

export const POST_FORMATS: PostFormat[] = [
  // --- Instagram ---------------------------------------------------------
  {
    id: 'ig-feed-square',
    platform: 'instagram',
    label: 'Feed · Square',
    aspect: '1:1',
    media: 'image',
    recommended: '1080 × 1080',
    description: 'Classic grid post. Works everywhere, safest default.',
    captionMax: 2200,
  },
  {
    id: 'ig-feed-portrait',
    platform: 'instagram',
    label: 'Feed · Portrait',
    aspect: '4:5',
    media: 'image',
    recommended: '1080 × 1350',
    description: 'Taller frame — more visible real-estate in the feed.',
    captionMax: 2200,
  },
  {
    id: 'ig-feed-landscape',
    platform: 'instagram',
    label: 'Feed · Landscape',
    aspect: '1.91:1',
    media: 'image',
    recommended: '1080 × 566',
    description: 'Widescreen, good for ride shots.',
    captionMax: 2200,
  },
  {
    id: 'ig-story',
    platform: 'instagram',
    label: 'Story',
    aspect: '9:16',
    media: 'image',
    recommended: '1080 × 1920',
    description: 'Disappears in 24h. Lightweight behind-the-scenes.',
    durationMax: 60,
  },
  {
    id: 'ig-reel',
    platform: 'instagram',
    label: 'Reel',
    aspect: '9:16',
    media: 'video',
    recommended: '1080 × 1920',
    description: 'Short-form vertical video, up to 90 seconds.',
    captionMax: 2200,
    durationMax: 90,
  },
  {
    id: 'ig-carousel',
    platform: 'instagram',
    label: 'Carousel',
    aspect: '1:1',
    media: 'carousel',
    recommended: '1080 × 1080 · 2–10 slides',
    description: 'Swipeable slides, great for builds and customer stories.',
    captionMax: 2200,
  },

  // --- LinkedIn ----------------------------------------------------------
  {
    id: 'li-text',
    platform: 'linkedin',
    label: 'Text post',
    aspect: '2:1',
    media: 'text',
    description: 'Plain text, up to 3000 chars. Founder narrative.',
    captionMax: 3000,
  },
  {
    id: 'li-image',
    platform: 'linkedin',
    label: 'Single image',
    aspect: '1.91:1',
    media: 'image',
    recommended: '1200 × 627',
    description: 'Headline-ratio image with a written post.',
    captionMax: 3000,
  },
  {
    id: 'li-video',
    platform: 'linkedin',
    label: 'Native video',
    aspect: '1:1',
    media: 'video',
    recommended: 'Up to 10 minutes',
    description: 'In-feed video — typically square or landscape.',
    captionMax: 3000,
    durationMax: 600,
  },
  {
    id: 'li-document',
    platform: 'linkedin',
    label: 'Document / carousel',
    aspect: '4:5',
    media: 'document',
    recommended: 'PDF, up to 10 pages',
    description:
      'Swipeable PDF — excellent for rehab protocols, spec sheets, guides.',
    captionMax: 3000,
  },
  {
    id: 'li-article',
    platform: 'linkedin',
    label: 'Long-form article',
    aspect: '2:1',
    media: 'text',
    description: 'Newsletter-style long copy. Builds authority.',
  },

  // --- TikTok ------------------------------------------------------------
  {
    id: 'tt-video',
    platform: 'tiktok',
    label: 'Video',
    aspect: '9:16',
    media: 'video',
    recommended: '1080 × 1920',
    description: 'Native vertical video — 3 seconds to 10 minutes.',
    captionMax: 2200,
    durationMax: 600,
  },
  {
    id: 'tt-photo-carousel',
    platform: 'tiktok',
    label: 'Photo carousel',
    aspect: '9:16',
    media: 'carousel',
    recommended: 'Up to 35 photos',
    description: 'Swipeable photo post, takes music like a video.',
    captionMax: 2200,
  },

  // --- Shopify Blog ------------------------------------------------------
  {
    id: 'sb-article',
    platform: 'shopify_blog',
    label: 'Blog article',
    aspect: '16:9',
    media: 'text',
    recommended: 'Featured image 1200 × 675',
    description:
      'Long-form article on the Evari Shopify blog. Rich text body, featured image, SEO title + description, tags. Great for pillar content and rehab-vertical deep dives.',
    captionMax: 100_000,
  },

  // --- Newsletter (Klaviyo-powered) --------------------------------------
  {
    id: 'nl-campaign',
    platform: 'newsletter',
    label: 'Campaign',
    aspect: '3:4',
    media: 'text',
    recommended: '600px-wide email-safe layout',
    description:
      'One-shot email to a list or segment — product launches, rides, offers. Scheduled through Klaviyo.',
    captionMax: 50_000,
  },
  {
    id: 'nl-automation',
    platform: 'newsletter',
    label: 'Automation',
    aspect: '3:4',
    media: 'text',
    recommended: 'Trigger-based flow',
    description:
      'Triggered email — welcome, abandoned cart, post-purchase, rehab clinic partner. Designed once, runs forever.',
    captionMax: 50_000,
  },
];

export function formatsFor(platform: SocialPlatform): PostFormat[] {
  return POST_FORMATS.filter((f) => f.platform === platform);
}
