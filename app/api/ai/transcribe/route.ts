/**
 * POST /api/ai/transcribe
 *
 * Voice-to-text proxy for the Mojito assistant. Accepts a multipart
 * form upload of an audio blob (browser MediaRecorder, usually webm /
 * opus) and returns { text }. Backed by OpenAI's Whisper-1, picked for
 * accent robustness, especially Australian / British / NZ which the
 * native Web Speech API mangles.
 *
 * Cost is roughly $0.006 per minute. Trivial for normal use.
 *
 * Required env: OPENAI_API_KEY
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Voice input requires OPENAI_API_KEY in env. Add it in Vercel and redeploy.',
      },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('audio');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'audio file required' }, { status: 400 });
  }

  // Re-pack into a fresh FormData with explicit filename + model so the
  // OpenAI API accepts the upload. The browser may have sent a
  // generic 'blob' name; OpenAI looks at the extension to pick a
  // decoder.
  const language = (form.get('language') as string | null) ?? 'en';
  const upstream = new FormData();
  upstream.append('file', file, 'audio.webm');
  upstream.append('model', 'whisper-1');
  upstream.append('language', language);
  upstream.append('response_format', 'json');

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: upstream,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: 'Whisper failed: ' + res.status + ' ' + errText.slice(0, 200) },
        { status: 502 },
      );
    }
    const json = (await res.json()) as { text?: string };
    return NextResponse.json({ ok: true, text: (json.text ?? '').trim() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'transcription failed' },
      { status: 500 },
    );
  }
}
