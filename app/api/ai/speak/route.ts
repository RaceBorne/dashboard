/**
 * POST /api/ai/speak
 *
 * Server-side proxy for Cartesia text-to-speech. Takes text, returns
 * streaming MP3 bytes that the browser can play in an <audio> element.
 * Keeps the Cartesia API key server-side so it never reaches the
 * browser.
 *
 * Body: { text: string, voiceId?: string, speed?: number }
 *
 * Required env:
 *   CARTESIA_API_KEY    — your sk_car_... key
 *   CARTESIA_VOICE_ID   — the default voice UUID (overridable per request)
 *
 * Default model is sonic-3, which is Cartesia's current stable
 * production model and the one selected in the user's playground.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CARTESIA_API_VERSION = '2024-06-10';
const DEFAULT_MODEL = 'sonic-3';

interface Body {
  text?: string;
  voiceId?: string;
  speed?: number; // 0.5 to 2.0
}

export async function POST(req: Request) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'CARTESIA_API_KEY missing' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const text = (body?.text ?? '').trim();
  if (!text) {
    return new Response(
      JSON.stringify({ ok: false, error: 'text required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }
  // Pronunciation fixups: TTS engines mangle proper nouns that are
  // squeezed into one token. 'Maddog' becomes a weird single syllable.
  // Force the spaced form 'Mad Dog' so Cartesia pronounces it cleanly.
  // Add other tricky words here as we hit them.
  const fixed = text
    .replace(/\bMaddog\b/g, 'Mad Dog')
    .replace(/\bmaddog\b/g, 'Mad Dog');
  // Cartesia caps a single TTS call at ~16k characters; truncate the
  // operator's reply so an oversize message can't blow up the request.
  const transcript = fixed.length > 5000 ? fixed.slice(0, 5000) : fixed;

  const voiceId = (body?.voiceId ?? process.env.CARTESIA_VOICE_ID ?? '').trim();
  if (!voiceId) {
    return new Response(
      JSON.stringify({ ok: false, error: 'CARTESIA_VOICE_ID missing and no voiceId in body' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const speed = typeof body?.speed === 'number' ? Math.min(2, Math.max(0.5, body.speed)) : 1.0;

  // /tts/bytes returns the full MP3 in one chunk. /tts/sse would
  // stream PCM frames over Server-Sent Events for lower first-byte
  // latency, but Sonic-3 is fast enough that the simpler bytes path
  // gives sub-second total round-trip on short replies. We can
  // upgrade later if we feel the lag.
  let upstream: Response;
  try {
    upstream = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_API_VERSION,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: DEFAULT_MODEL,
        transcript,
        voice: { mode: 'id', id: voiceId },
        language: 'en',
        output_format: {
          container: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
        speed,
      }),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Cartesia request failed: ' + (e instanceof Error ? e.message : String(e)) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, error: 'Cartesia ' + upstream.status + ': ' + errText.slice(0, 300) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  // Pass through the audio bytes. The browser will play this directly
  // via an <audio> element fed a blob URL.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'no-store',
    },
  });
}
