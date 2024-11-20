import { createHash } from 'node:crypto';
// Preserve migration history: accept only exact bytes or deterministic LF/CRLF variants.
export function migrationHashMatches(content: Buffer | string, installedHash: string) {
  const raw = typeof content === 'string' ? content : content.toString('utf8');
  const lf = raw.replaceAll('\r\n', '\n');
  return [raw, lf, lf.replaceAll('\n', '\r\n')].some(
    (value) => createHash('sha256').update(value).digest('hex') === installedHash,
  );
}
