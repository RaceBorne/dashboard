import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { WIREFRAME_NODES } from '@/lib/wireframe';

export const runtime = 'nodejs';

// Build the allowlist from the wireframe nodes — only env vars referenced
// in the diagram can be set this way. Stops a stray request from writing
// arbitrary keys.
const ALLOWED_KEYS = new Set<string>(
  WIREFRAME_NODES.flatMap((n) => n.envVars),
);

/**
 * POST /api/env/set
 * Body: { key: string, value: string }
 *
 * Writes (or replaces) a single env var in `.env.local` so the user can wire
 * up a connection from inside the Wireframe page without leaving the app.
 *
 * Dev-only — production should use Vercel's encrypted env vars instead. The
 * NODE_ENV gate prevents this route from being callable on a deployed instance.
 *
 * After saving, the dev server needs to restart to pick up the new value
 * (Next.js loads .env.local once at boot). The success response makes this
 * explicit so the UI can prompt the user.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { ok: false, error: 'Inline env editing is only available in dev mode.' },
      { status: 403 },
    );
  }

  let body: { key?: unknown; value?: unknown };
  try {
    body = (await req.json()) as { key?: unknown; value?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const value = typeof body.value === 'string' ? body.value : '';

  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { ok: false, error: `Key "${key}" is not in the wireframe allowlist.` },
      { status: 400 },
    );
  }
  if (!value) {
    return NextResponse.json(
      { ok: false, error: 'Value cannot be empty. Use a separate "remove" action to clear.' },
      { status: 400 },
    );
  }

  const envPath = path.join(process.cwd(), '.env.local');
  let content = '';
  try {
    content = await fs.readFile(envPath, 'utf8');
  } catch {
    // File doesn't exist yet — start with a header so it's discoverable on disk.
    content = '# Created by Wireframe inline editor — dev-only.\n';
  }

  // Quote the value defensively in case it contains spaces or special chars.
  // Strip any pre-existing wrapping quotes the user accidentally pasted.
  const cleanValue = value.replace(/^['"]|['"]$/g, '');
  const newLine = `${key}="${cleanValue.replace(/"/g, '\\"')}"`;

  const lineRe = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (lineRe.test(content)) {
    content = content.replace(lineRe, newLine);
  } else {
    content = content.trimEnd() + '\n' + newLine + '\n';
  }

  await fs.writeFile(envPath, content, 'utf8');

  return NextResponse.json({
    ok: true,
    message: `${key} saved to .env.local. Restart \`npm run dev\` to pick up the new value.`,
  });
}
