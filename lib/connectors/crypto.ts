/**
 * AES-GCM wrap for storing credentials server-side.
 *
 * When CONNECTOR_ENCRYPTION_KEY is set (base64, 32 bytes) the repository
 * wraps credential JSON through encryptJson / decryptJson. If the env var
 * is empty, we fall through to plaintext storage with a boolean flag on
 * the row so reads still work. Dev setups can skip the key; production /
 * any multi-tenant deployment must set it.
 *
 * To generate a key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function loadKey(): Buffer | null {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

export function encryptionEnabled(): boolean {
  return loadKey() !== null;
}

export function encryptJson(value: unknown): string {
  const key = loadKey();
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (!key) return plaintext.toString('utf8');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Envelope format: base64(iv):base64(tag):base64(ct)
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptJson<T = unknown>(payload: string, encrypted: boolean): T | null {
  if (!payload) return null;
  if (!encrypted) {
    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  }
  const key = loadKey();
  if (!key) return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const ct = Buffer.from(parts[2], 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return null;
  }
}
