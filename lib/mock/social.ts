import type { SocialPost } from '@/lib/types';

const isoOffset = (days: number, hours = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours, 0, 0, 0);
  return d.toISOString();
};

export const MOCK_SOCIAL_POSTS: SocialPost[] = [
  // -- Published, last 14 days ----------------------------------------------
  {
    id: 'sp_001',
    platform: 'instagram',
    status: 'published',
    publishedAt: isoOffset(-12, -2),
    caption:
      'Eighteen hours in the booth. Six in the bake. Champagne pearl, hand-laid by Kustomflow. The first paint sample for a customer order arriving this week.',
    mediaUrls: ['/mock/social/champagne-pearl-1.jpg'],
    hashtags: ['#evari', '#kustomflow', '#carbonbicycle'],
    metrics: { impressions: 8420, engagements: 612, clicks: 88, saves: 142, shares: 34 },
  },
  {
    id: 'sp_002',
    platform: 'linkedin',
    status: 'published',
    publishedAt: isoOffset(-8, -3),
    caption:
      'Why we chose Bosch CX over the lighter alternatives. A short note on motors, intent, and what "more than enough" means for a touring bicycle.',
    mediaUrls: [],
    link: 'https://evari.cc/blogs/journal/why-bosch-cx',
    hashtags: ['#ebike', '#cycling', '#design'],
    metrics: { impressions: 3120, engagements: 88, clicks: 142, shares: 12 },
  },
  {
    id: 'sp_003',
    platform: 'tiktok',
    status: 'published',
    publishedAt: isoOffset(-5, -1),
    caption:
      "Devil's Punchbowl, Surrey. One charge. No drama. The Tour at full pace through the cathedral of Scots pines.",
    mediaUrls: ['/mock/social/devils-punchbowl.mp4'],
    hashtags: ['#ebike', '#carbonbike', '#surrey', '#cycling'],
    metrics: { impressions: 14820, engagements: 1820, clicks: 88, saves: 220, shares: 142 },
  },

  // -- Scheduled, next 14 days ----------------------------------------------
  {
    id: 'sp_010',
    platform: 'instagram',
    status: 'scheduled',
    scheduledFor: isoOffset(0, 18),
    caption:
      'Tour fitting today at the Cobham showroom. Quiet morning. Dust on the windows, sun on the carbon weave.',
    mediaUrls: ['/mock/social/cobham-fitting.jpg'],
    hashtags: ['#evari', '#fitting', '#cycling'],
  },
  {
    id: 'sp_011',
    platform: 'instagram',
    status: 'scheduled',
    scheduledFor: isoOffset(2, 16),
    caption: 'Saturday loop, Surrey hills. Member ride leaves Cobham at 09:00 — bring a full battery.',
    mediaUrls: ['/mock/social/saturday-loop.jpg'],
    hashtags: ['#evari', '#groupride', '#sundaymorning'],
  },
  {
    id: 'sp_012',
    platform: 'linkedin',
    status: 'scheduled',
    scheduledFor: isoOffset(3, 9),
    caption:
      "A note on cycle-to-work scheme limits, and how Evari's bespoke route through the firm-purchase model works for partners and senior staff.",
    mediaUrls: [],
    link: 'https://evari.cc/pages/finance',
    hashtags: ['#cycletowork', '#ebike', '#wellbeing'],
  },
  {
    id: 'sp_013',
    platform: 'tiktok',
    status: 'scheduled',
    scheduledFor: isoOffset(5, 19),
    caption: '15 seconds of carbon weave. No paint. No pretence.',
    mediaUrls: ['/mock/social/bare-carbon.mp4'],
    hashtags: ['#carbonbike', '#design', '#minimalism'],
  },
  {
    id: 'sp_014',
    platform: 'instagram',
    status: 'scheduled',
    scheduledFor: isoOffset(7, 17),
    caption:
      'The Pyrenees in September. A pair of Tours leaving Utrecht for the col country. Anneke and Pieter — we wish you headwinds and good coffee.',
    mediaUrls: ['/mock/social/pyrenees-pair.jpg'],
    hashtags: ['#evari', '#touring', '#pyrenees'],
  },

  // -- Drafts ---------------------------------------------------------------
  {
    id: 'sp_020',
    platform: 'linkedin',
    status: 'draft',
    caption:
      '[DRAFT] Aurora Architects in Bath chose six Evari Commuters for the partner team. A short note on the cycle-to-work conversation, and what we did differently.',
    mediaUrls: [],
    hashtags: ['#cycletowork', '#corporate', '#wellbeing'],
  },
  {
    id: 'sp_021',
    platform: 'instagram',
    status: 'draft',
    caption:
      "[DRAFT] Eleanor's Tour, ready for the Yorkshire Moors. Burnt sienna against winter wheat. Photos from the customer.",
    mediaUrls: [],
    hashtags: ['#evari', '#customerstory', '#yorkshire'],
  },
];
