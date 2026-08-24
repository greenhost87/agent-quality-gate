import { createHash } from 'node:crypto';

/** SHA-256 hex digest of file bytes (managed preset content identity). */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
