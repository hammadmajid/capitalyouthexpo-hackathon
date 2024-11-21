import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { storedUploadSchema, type Upload } from '@hsm/contracts';
export class FileRejected extends Error {
  constructor(readonly code: 'SIZE_MISMATCH' | 'CONTENT_MISMATCH') {
    super(code);
  }
}
export async function validateContent(input: Upload, bytes: Buffer) {
  const metadata = storedUploadSchema.parse(input);
  if (bytes.length !== metadata.sizeBytes) throw new FileRejected('SIZE_MISMATCH');
  let mime: string | undefined;
  try {
    mime = (await fileTypeFromBuffer(Uint8Array.from(bytes)))?.mime;
    if (metadata.mimeType === 'text/csv' && !mime) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (
        text.trim() &&
        Array.from(text).every((char) => {
          const code = char.charCodeAt(0);
          return code >= 32 || [9, 10, 13].includes(code);
        }) &&
        !text.startsWith('#!')
      )
        mime = 'text/csv';
    }
  } catch {
    throw new FileRejected('CONTENT_MISMATCH');
  }
  if (mime !== metadata.mimeType) throw new FileRejected('CONTENT_MISMATCH');
  return createHash('sha256').update(bytes).digest();
}
