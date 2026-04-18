import { promises as fs } from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';

const DEFAULT_SKILL_PATH =
  '/Users/craigmcdonald/Dropbox (Personal)/Evari Speed Bikes/10 Marketing/Claude/evari-copy.skill';

const FALLBACK_SKILL = `# Evari Copy — fallback voice brief

When writing for Evari, sound like a senior copywriter at Pentagram or Ogilvy who is also a quietly serious cyclist.

Voice
- Confident, restrained, never showy. McLaren clarity, Singer Vehicle Design reverence for craft, Porsche calm.
- Short sentences. No exclamation marks. No empty marketing words ("revolutionary", "game-changing", "unleash").
- One specific, concrete detail beats five adjectives.

Subjects we know
- Carbon e-touring and commuter bicycles, made in the United Kingdom.
- Bosch Performance Line CX motor, 85Nm, 750Wh battery, eMTB mode.
- Carbon mainframe — laid in Asia, finished by us; Kustomflow paint.
- Customer audience: discerning, design-led, mid-30s upward, often Singer/Bentley/Patek-shaped taste.

Things to never do
- Never write hype.
- Never use "amazing", "incredible", "stunning".
- Never break character into corporate boilerplate.
- Never invent specs you do not know.
`;

let cached: string | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

interface ZipEntry {
  fileName: string;
  uncompressedSize: number;
}

async function readSkillMdFromZip(zipPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err: unknown, zipfile: any) => {
      if (err || !zipfile) return resolve(null);

      let found = false;
      zipfile.readEntry();

      zipfile.on('entry', (entry: ZipEntry & { fileName: string }) => {
        const isSkillFile =
          entry.fileName.endsWith('SKILL.md') || entry.fileName.endsWith('skill.md');
        if (!isSkillFile) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamErr: unknown, stream: NodeJS.ReadableStream) => {
          if (streamErr || !stream) {
            zipfile.readEntry();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', () => {
            found = true;
            resolve(Buffer.concat(chunks).toString('utf-8'));
          });
          stream.on('error', () => {
            zipfile.readEntry();
          });
        });
      });

      zipfile.on('end', () => {
        if (!found) resolve(null);
      });
      zipfile.on('error', () => resolve(null));
    });
  });
}

/**
 * Load the Evari copywriting skill as a system prompt fragment.
 * The skill is a zip-format `.skill` bundle; we extract SKILL.md at boot
 * and cache the contents for 5 minutes. If the bundle isn't available we
 * fall back to a built-in mini brief so the dashboard still produces
 * tonally credible copy.
 */
export async function loadEvariCopySkill(): Promise<string> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;

  const skillPath = process.env.EVARI_COPY_SKILL_PATH || DEFAULT_SKILL_PATH;

  try {
    await fs.access(skillPath);
  } catch {
    cached = FALLBACK_SKILL;
    cachedAt = now;
    return cached;
  }

  // The bundle could either be a literal .md file or a zipped .skill bundle.
  if (skillPath.endsWith('.md')) {
    try {
      const md = await fs.readFile(skillPath, 'utf-8');
      cached = md;
      cachedAt = now;
      return md;
    } catch {
      cached = FALLBACK_SKILL;
      cachedAt = now;
      return cached;
    }
  }

  // .skill = zip
  const md = await readSkillMdFromZip(skillPath);
  cached = md ?? FALLBACK_SKILL;
  cachedAt = now;
  return cached;
}

export function pathOfEvariCopySkill() {
  return process.env.EVARI_COPY_SKILL_PATH || DEFAULT_SKILL_PATH;
}
