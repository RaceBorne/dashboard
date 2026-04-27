/**
 * YouTube helpers — extract a video ID from any common YouTube URL
 * shape, build the matching thumbnail URL (the i.ytimg.com CDN
 * variants), and build a click-out URL that strips the YouTube
 * paraphernalia (related videos, branding, suggestions) so the
 * recipient lands on a clean player.
 *
 * The renderer in lib/marketing/email-design.ts uses this for the
 * 'youtube' email block. Email clients almost universally drop
 * <video> and <iframe>, so the in-email render is a poster image
 * with a play overlay; the click takes the recipient to
 * youtube-nocookie.com/embed/<id> with the chrome flags applied.
 */

export type YouTubeThumbnailQuality =
  | 'maxresdefault'
  | 'sddefault'
  | 'hqdefault'
  | 'mqdefault'
  | 'default';

export interface YouTubeEmbedOptions {
  hideRelated?: boolean;
  modestBranding?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  captionsOn?: boolean;
  muted?: boolean;
  startSeconds?: number;
}

export function extractYouTubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns: RegExp[] = [
    /(?:youtube(?:-nocookie)?\.com|youtu\.be)\/(?:watch\?v=|embed\/|shorts\/|v\/)([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function youtubeThumbnailUrl(videoId: string, quality: YouTubeThumbnailQuality = 'maxresdefault'): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function youtubeEmbedUrl(videoId: string, opts: YouTubeEmbedOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.hideRelated !== false) params.set('rel', '0');
  if (opts.modestBranding !== false) params.set('modestbranding', '1');
  if (opts.autoplay !== false) params.set('autoplay', '1');
  if (opts.muted) params.set('mute', '1');
  if (opts.loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  if (opts.captionsOn) params.set('cc_load_policy', '1');
  if (typeof opts.startSeconds === 'number' && opts.startSeconds > 0) {
    params.set('start', Math.floor(opts.startSeconds).toString());
  }
  params.set('playsinline', '1');
  params.set('iv_load_policy', '3');
  params.set('fs', '1');
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
