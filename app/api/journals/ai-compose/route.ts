import { NextResponse } from 'next/server';

import { buildSystemPrompt, generateTextWithFallback } from '@/lib/ai/gateway';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';

type BlockKind =
  | 'paragraph'
  | 'header'
  | 'list'
  | 'quote'
  | 'image-caption'
  | 'summary'
  | 'title';

interface ComposeContext {
  articleTitle?: string;
  articleSummary?: string;
  blogLane?: string;
  /** Plain-text roll-up of the other blocks so the model has voice + topic context. */
  articleContext?: string;
}

interface WizardImage {
  url: string;
  alt?: string;
}
interface ComposeRequest {
  mode: 'block' | 'outline' | 'wizard';
  /** For block mode. */
  blockKind?: BlockKind;
  /** Current text in the block (empty = generate from scratch). */
  currentText?: string;
  /** The human instruction ("tighten this", "write a 3-sentence intro"). */
  instruction?: string;
  /** For outline mode + wizard — the user's bullet list / paragraph
   *  describing what the article should cover. */
  brief?: string;
  /** For wizard mode — the title the user typed in step 1. */
  title?: string;
  /** For wizard mode — the ordered list of images the user picked
   *  from the Shopify library in step 2. */
  images?: WizardImage[];
  context?: ComposeContext;
}

interface OutlineBlock {
  type: 'header' | 'paragraph' | 'quote' | 'list' | 'delimiter';
  data: Record<string, unknown>;
}

/**
 * POST /api/journals/ai-compose
 *
 *   mode: 'block'   — rewrites or generates text for a single block.
 *                     Returns { text: string }.
 *   mode: 'outline' — generates a full block array from a rough brief.
 *                     Returns { blocks: [{ type, data }, ...] }.
 *
 * Both modes go through `generateTextWithFallback` — same model setup as
 * Synopsis + Spitball. House rules (no em-dashes, Evari voice) come in
 * via `buildSystemPrompt({ voice: 'evari' })`.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ComposeRequest | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.mode === 'outline') {
    return composeOutline(body);
  }
  if (body.mode === 'wizard') {
    return composeWizard(body);
  }
  return composeBlock(body);
}

async function composeBlock(body: ComposeRequest) {
  const kind = body.blockKind ?? 'paragraph';
  const current = (body.currentText ?? '').trim();
  const instruction = (body.instruction ?? '').trim();
  const ctx = body.context ?? {};

  const system = await buildSystemPrompt({
    voice: 'evari',
    task: `Write or rewrite a single ${describeKind(kind)} inside an Evari Shopify blog article. Output only the text for that block, no commentary, no quotes around the output, no markdown fences.`,
  });

  const promptLines: string[] = [];
  if (ctx.articleTitle) promptLines.push(`Article title: ${ctx.articleTitle}`);
  if (ctx.blogLane) promptLines.push(`Lane: ${ctx.blogLane}`);
  if (ctx.articleSummary) promptLines.push(`Summary: ${ctx.articleSummary}`);
  if (ctx.articleContext) {
    promptLines.push('');
    promptLines.push('Other blocks already in the article:');
    promptLines.push(ctx.articleContext.slice(0, 2000));
  }
  promptLines.push('');
  if (current) {
    promptLines.push(`Current ${describeKind(kind)} text:`);
    promptLines.push(current);
    promptLines.push('');
  }
  if (instruction) {
    promptLines.push(`Instruction: ${instruction}`);
  } else if (current) {
    promptLines.push('Instruction: Tighten and improve this while keeping the meaning and voice.');
  } else {
    promptLines.push(
      `Instruction: Write a new ${describeKind(kind)} that fits naturally into the article at this point.`,
    );
  }
  promptLines.push('');
  promptLines.push('House rules:');
  promptLines.push('  - No em-dashes or en-dashes. Use commas, colons, or full stops.');
  promptLines.push('  - Evari voice: confident, technical where it counts, no jargon-as-decoration.');
  promptLines.push('  - Output ONLY the text for this block, no prefix, no quotes, no commentary.');
  if (kind === 'header') {
    promptLines.push('  - Single heading line, no trailing punctuation unless it is a question.');
  }
  if (kind === 'list') {
    promptLines.push('  - One item per line. No bullet characters, no numbering. Just the text.');
  }

  const { text } = await generateTextWithFallback({
    model: MODEL,
    system,
    prompt: promptLines.join('\n'),
    temperature: 0.6,
  });

  const cleaned = text
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[—–]/g, ',')
    .trim();

  return NextResponse.json({ ok: true, text: cleaned });
}

async function composeOutline(body: ComposeRequest) {
  const brief = (body.brief ?? '').trim();
  if (!brief) {
    return NextResponse.json(
      { ok: false, error: 'Outline mode needs a brief' },
      { status: 400 },
    );
  }
  const ctx = body.context ?? {};
  const system = await buildSystemPrompt({
    voice: 'evari',
    task:
      'Compose an Evari Shopify blog article from a rough brief. Output a strict JSON array of block objects. Each block is { "type": string, "data": object }. Valid types: "header" (data: { text, level }), "paragraph" (data: { text }), "quote" (data: { text, caption }), "list" (data: { style: "unordered"|"ordered", items: string[] }), "delimiter" (data: {}). No commentary, no markdown fences. JSON only.',
  });
  const promptLines: string[] = [];
  if (ctx.articleTitle) promptLines.push(`Article title: ${ctx.articleTitle}`);
  if (ctx.blogLane) promptLines.push(`Lane: ${ctx.blogLane}`);
  promptLines.push('');
  promptLines.push('Brief:');
  promptLines.push(brief);
  promptLines.push('');
  promptLines.push('Shape:');
  promptLines.push('  - Open with a paragraph that hooks the reader.');
  promptLines.push('  - Use 2 to 4 H2 headers to split the article.');
  promptLines.push('  - Paragraphs are 2 to 4 sentences each, no walls of text.');
  promptLines.push('  - Drop a pull-quote somewhere if the brief hints at a voice-y line.');
  promptLines.push('  - Aim for a 5-8 minute read. Keep Evari voice, no em-dashes.');
  promptLines.push('');
  promptLines.push('Output: a JSON array of blocks. Nothing else.');

  const { text } = await generateTextWithFallback({
    model: MODEL,
    system,
    prompt: promptLines.join('\n'),
    temperature: 0.7,
  });

  // Strip any accidental markdown fencing.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let blocks: OutlineBlock[] = [];
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (Array.isArray(parsed)) {
      blocks = parsed.filter(isOutlineBlock);
    }
  } catch (err) {
    console.error('[ai-compose outline] JSON parse failed', err, stripped.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: 'AI returned malformed JSON', raw: stripped.slice(0, 500) },
      { status: 500 },
    );
  }

  // Sanitise — enforce em-dash rule on any generated text.
  const cleaned = blocks.map((b) => ({
    type: b.type,
    data: sanitizeBlockData(b.type, b.data),
  }));

  return NextResponse.json({ ok: true, blocks: cleaned });
}

function isOutlineBlock(x: unknown): x is OutlineBlock {
  if (!x || typeof x !== 'object') return false;
  const t = (x as { type?: unknown }).type;
  if (typeof t !== 'string') return false;
  return ['header', 'paragraph', 'quote', 'list', 'delimiter'].includes(t);
}

function sanitizeBlockData(
  type: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const scrub = (s: unknown) =>
    typeof s === 'string' ? s.replace(/[—–]/g, ',') : s;
  const out: Record<string, unknown> = { ...data };
  if (typeof out.text === 'string') out.text = scrub(out.text);
  if (typeof out.caption === 'string') out.caption = scrub(out.caption);
  if (Array.isArray(out.items)) {
    out.items = (out.items as unknown[]).map((it) => scrub(it));
  }
  if (type === 'header') {
    const lvl = Number(out.level ?? 2);
    out.level = lvl >= 2 && lvl <= 4 ? lvl : 2;
  }
  if (type === 'list' && !['ordered', 'unordered'].includes(String(out.style))) {
    out.style = 'unordered';
  }
  return out;
}

/**
 * Wizard mode: title + brief + ordered image sequence → fully laid-
 * out block array. The model is briefed as a graphic designer, not
 * just a copywriter. It must:
 *  - Open with a hero image (the first user-picked image at full
 *    width) followed by a paragraph hook.
 *  - Use H2 headings to break the article into 3-5 sections.
 *  - Place every other user-picked image somewhere sensible inside
 *    those sections, choosing width (sm/md/lg/full) + alignment
 *    (left/center/right) per image.
 *  - Drop a pull quote somewhere if the brief suggests one.
 *  - Close with a paragraph that wraps up the story.
 *
 * Image objects must reference the supplied URLs by index — the
 * model picks placement, width, alignment, but never invents URLs.
 */
async function composeWizard(body: ComposeRequest) {
  const title = (body.title ?? '').trim();
  const brief = (body.brief ?? '').trim();
  const images = body.images ?? [];
  if (!title) {
    return NextResponse.json({ ok: false, error: 'Title required' }, { status: 400 });
  }
  if (!brief) {
    return NextResponse.json({ ok: false, error: 'Brief required' }, { status: 400 });
  }
  const ctx = body.context ?? {};

  const system = await buildSystemPrompt({
    voice: 'evari',
    task:
      "You are an Evari editorial designer composing a Shopify blog article. Output a strict JSON array of block objects. Each block is { \"type\": string, \"data\": object }. " +
      'Valid block types and their data shape: ' +
      '"header" {text, level: 1|2|3|4}, ' +
      '"paragraph" {text}, ' +
      '"quote" {text, caption}, ' +
      '"list" {style: "unordered"|"ordered", items: string[]}, ' +
      '"image" {file: { url }, caption?, width: "sm"|"md"|"lg"|"full", align: "left"|"center"|"right"}, ' +
      '"spacer" {size: "sm"|"md"|"lg"}, ' +
      '"delimiter" {}. ' +
      'Use ONLY the image URLs you are given — never invent new ones. ' +
      'No commentary, no markdown fences. JSON array only.',
  });

  const promptLines: string[] = [];
  promptLines.push(`Title: ${title}`);
  if (ctx.blogLane) promptLines.push(`Lane: ${ctx.blogLane}`);
  promptLines.push('');
  promptLines.push('Brief from the author:');
  promptLines.push(brief);
  if (images.length > 0) {
    promptLines.push('');
    promptLines.push('Images the author chose (use these URLs in image blocks; place them in the order that best serves the story, not necessarily this order):');
    images.forEach((img, i) => {
      promptLines.push(`  ${i + 1}. ${img.url}${img.alt ? `   alt: ${img.alt}` : ''}`);
    });
  }
  promptLines.push('');
  promptLines.push('Editorial direction:');
  promptLines.push('  - Open with the first / strongest image at width:"full".');
  promptLines.push('  - Then a 2-3 sentence paragraph that hooks the reader.');
  promptLines.push('  - Use 3 to 5 H2 headings to break the article into clear sections.');
  promptLines.push('  - Interleave the remaining images between paragraphs. Vary widths: most at "lg" (75%), one or two at "md" (50%) ranged left/right when the surrounding paragraphs benefit from text-wrap room. Avoid two images of the same width back to back.');
  promptLines.push('  - Add ONE pull quote (block type "quote") somewhere in the middle if the brief carries a quotable line.');
  promptLines.push('  - Close with a paragraph that lands the takeaway.');
  promptLines.push('  - Length target: 5-8 minute read.');
  promptLines.push('');
  promptLines.push('House rules:');
  promptLines.push('  - Evari voice: confident, technical where it counts, no jargon-as-decoration.');
  promptLines.push('  - Never use em-dashes or en-dashes. Use commas, colons, full stops.');
  promptLines.push('  - Output JSON only. No markdown fences, no commentary.');

  const { text } = await generateTextWithFallback({
    model: MODEL,
    system,
    prompt: promptLines.join('\n'),
    temperature: 0.7,
  });

  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  interface WizardBlock {
    type: 'header' | 'paragraph' | 'quote' | 'list' | 'image' | 'spacer' | 'delimiter';
    data: Record<string, unknown>;
  }
  let blocks: WizardBlock[] = [];
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (Array.isArray(parsed)) {
      blocks = parsed.filter(isWizardBlock);
    }
  } catch (err) {
    console.error('[ai-compose wizard] JSON parse failed', err, stripped.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: 'AI returned malformed JSON', raw: stripped.slice(0, 500) },
      { status: 500 },
    );
  }

  // Sanitise: enforce em-dash rule on every text field, validate
  // image URLs against the user's supplied set so the model can't
  // hallucinate one.
  const allowedUrls = new Set(images.map((i) => i.url));
  const cleaned = blocks
    .map((b) => ({
      type: b.type,
      data: sanitizeWizardData(b.type, b.data, allowedUrls),
    }))
    // Drop image blocks whose URL didn't survive the allow-list.
    .filter((b) => !(b.type === 'image' && !((b.data.file as { url?: string } | undefined)?.url)));

  return NextResponse.json({ ok: true, blocks: cleaned });
}

function isWizardBlock(x: unknown): x is { type: 'header' | 'paragraph' | 'quote' | 'list' | 'image' | 'spacer' | 'delimiter'; data: Record<string, unknown> } {
  if (!x || typeof x !== 'object') return false;
  const t = (x as { type?: unknown }).type;
  return typeof t === 'string' && [
    'header', 'paragraph', 'quote', 'list', 'image', 'spacer', 'delimiter',
  ].includes(t);
}

function sanitizeWizardData(
  type: string,
  data: Record<string, unknown>,
  allowedUrls: Set<string>,
): Record<string, unknown> {
  const scrub = (s: unknown) =>
    typeof s === 'string' ? s.replace(/[—–]/g, ',') : s;
  const out: Record<string, unknown> = { ...data };
  if (typeof out.text === 'string') out.text = scrub(out.text);
  if (typeof out.caption === 'string') out.caption = scrub(out.caption);
  if (Array.isArray(out.items)) {
    out.items = (out.items as unknown[]).map((it) => scrub(it));
  }
  if (type === 'header') {
    const lvl = Number(out.level ?? 2);
    out.level = lvl >= 1 && lvl <= 4 ? lvl : 2;
  }
  if (type === 'list' && !['ordered', 'unordered'].includes(String(out.style))) {
    out.style = 'unordered';
  }
  if (type === 'image') {
    // Validate width / align / file.url
    const w = String(out.width ?? 'full');
    if (!['sm', 'md', 'lg', 'full'].includes(w)) out.width = 'full';
    const a = String(out.align ?? 'center');
    if (!['left', 'center', 'right'].includes(a)) out.align = 'center';
    const file = out.file as { url?: string } | undefined;
    if (!file || !file.url || !allowedUrls.has(file.url)) {
      // Strip — sanitiser will drop it via the filter in composeWizard.
      out.file = { url: '' };
    }
  }
  if (type === 'spacer') {
    const s = String(out.size ?? 'md');
    if (!['sm', 'md', 'lg'].includes(s)) out.size = 'md';
  }
  return out;
}

function describeKind(kind: BlockKind): string {
  switch (kind) {
    case 'paragraph':
      return 'paragraph';
    case 'header':
      return 'H2 or H3 heading';
    case 'list':
      return 'bulleted list (one item per line)';
    case 'quote':
      return 'pull quote';
    case 'image-caption':
      return 'image caption (one short sentence)';
    case 'summary':
      return 'article summary (one sentence, 140-155 characters)';
    case 'title':
      return 'article title (55-65 characters)';
  }
}
