/**
 * Social media crop presets.
 *
 * Single source of truth for Instagram / Facebook / TikTok / LinkedIn
 * image dimensions. Update this file when a platform changes its
 * specs and every cropper, picker, and preview in the app picks the
 * new sizes up automatically.
 *
 * Last reviewed: April 2026. Sources:
 *   - help.instagram.com/business image specs
 *   - facebook.com/business/help image specs
 *   - support.tiktok.com/en/business image specs
 *   - linkedin.com/help company + personal image specs
 */

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin';

export interface SocialPreset {
  id: string;
  platform: SocialPlatform;
  platformLabel: string;
  label: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  /** Computed at runtime; included so callers don't need to recompute. */
  ratio: number;
  /** One-liner describing where this size is used. */
  use: string;
}

interface RawPreset extends Omit<SocialPreset, 'ratio'> {}

const RAW: RawPreset[] = [
  // ─────────── Instagram ───────────
  { id: 'ig-square',       platform: 'instagram', platformLabel: 'Instagram', label: 'Square post',     width: 1080, height: 1080, format: 'jpeg', use: 'Standard 1:1 feed post.' },
  { id: 'ig-portrait',     platform: 'instagram', platformLabel: 'Instagram', label: 'Portrait post',   width: 1080, height: 1350, format: 'jpeg', use: 'Tall 4:5 feed post (max vertical real estate in the feed).' },
  { id: 'ig-landscape',    platform: 'instagram', platformLabel: 'Instagram', label: 'Landscape post',  width: 1080, height: 566,  format: 'jpeg', use: '1.91:1 wide feed post.' },
  { id: 'ig-story',        platform: 'instagram', platformLabel: 'Instagram', label: 'Story / Reel cover', width: 1080, height: 1920, format: 'jpeg', use: '9:16 vertical for Stories and Reel covers.' },
  { id: 'ig-profile',      platform: 'instagram', platformLabel: 'Instagram', label: 'Profile photo',   width: 320,  height: 320,  format: 'jpeg', use: 'Account profile picture.' },

  // ─────────── Facebook ───────────
  { id: 'fb-square',       platform: 'facebook',  platformLabel: 'Facebook',  label: 'Square post',     width: 1200, height: 1200, format: 'jpeg', use: 'Standard 1:1 feed post.' },
  { id: 'fb-link',         platform: 'facebook',  platformLabel: 'Facebook',  label: 'Link / Landscape',width: 1200, height: 630,  format: 'jpeg', use: '1.91:1 link preview, also Open Graph default.' },
  { id: 'fb-cover',        platform: 'facebook',  platformLabel: 'Facebook',  label: 'Page cover',      width: 851,  height: 315,  format: 'jpeg', use: 'Page header banner. Wide 2.7:1 strip.' },
  { id: 'fb-story',        platform: 'facebook',  platformLabel: 'Facebook',  label: 'Story',           width: 1080, height: 1920, format: 'jpeg', use: '9:16 vertical Story.' },
  { id: 'fb-event',        platform: 'facebook',  platformLabel: 'Facebook',  label: 'Event cover',     width: 1920, height: 1080, format: 'jpeg', use: '16:9 event header.' },

  // ─────────── TikTok ───────────
  { id: 'tt-vertical',     platform: 'tiktok',    platformLabel: 'TikTok',    label: 'Vertical 9:16',   width: 1080, height: 1920, format: 'jpeg', use: 'Standard vertical post / video cover.' },
  { id: 'tt-square',       platform: 'tiktok',    platformLabel: 'TikTok',    label: 'Square',          width: 1080, height: 1080, format: 'jpeg', use: '1:1 carousel image.' },
  { id: 'tt-profile',      platform: 'tiktok',    platformLabel: 'TikTok',    label: 'Profile photo',   width: 200,  height: 200,  format: 'jpeg', use: 'Account profile picture.' },

  // ─────────── LinkedIn ───────────
  { id: 'li-personal-cover',platform:'linkedin',  platformLabel: 'LinkedIn',  label: 'Personal cover',  width: 1584, height: 396,  format: 'jpeg', use: 'Personal profile banner. 4:1.' },
  { id: 'li-company-cover',platform:'linkedin',   platformLabel: 'LinkedIn',  label: 'Company cover',   width: 1128, height: 191,  format: 'jpeg', use: 'Company page banner.' },
  { id: 'li-company-logo', platform:'linkedin',   platformLabel: 'LinkedIn',  label: 'Company logo',    width: 400,  height: 400,  format: 'png',  use: 'Square company logo, transparent background recommended.' },
  { id: 'li-square',       platform:'linkedin',   platformLabel: 'LinkedIn',  label: 'Square post',     width: 1200, height: 1200, format: 'jpeg', use: '1:1 feed post.' },
  { id: 'li-landscape',    platform:'linkedin',   platformLabel: 'LinkedIn',  label: 'Landscape post',  width: 1200, height: 627,  format: 'jpeg', use: '1.91:1 link preview / OG default for LinkedIn.' },
  { id: 'li-portrait',     platform:'linkedin',   platformLabel: 'LinkedIn',  label: 'Portrait post',   width: 1080, height: 1350, format: 'jpeg', use: '4:5 portrait feed post.' },
];

export const SOCIAL_PRESETS: SocialPreset[] = RAW.map((p) => ({ ...p, ratio: p.width / p.height }));

export function presetsByPlatform(): Record<SocialPlatform, SocialPreset[]> {
  const out: Record<SocialPlatform, SocialPreset[]> = {
    instagram: [], facebook: [], tiktok: [], linkedin: [],
  };
  for (const p of SOCIAL_PRESETS) out[p.platform].push(p);
  return out;
}

export function getPresetById(id: string): SocialPreset | null {
  return SOCIAL_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Default variant label derived from a preset.
 * "Instagram Story 1080×1920"
 */
export function presetLabel(p: SocialPreset): string {
  return `${p.platformLabel} ${p.label} ${p.width}×${p.height}`;
}
