import { z } from 'zod';
import {
  uploadSchema,
  uploadResponseSchema,
  fileStatusResponseSchema,
  downloadResponseSchema,
  type Upload,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';

export class UploadFailure extends Error {
  constructor(
    readonly code: 'REJECTED' | 'PENDING',
    readonly fileId: string,
  ) {
    super(code === 'REJECTED' ? 'File rejected' : 'File scan is still pending');
    this.name = 'UploadFailure';
  }
}
export interface PrivateUploadOptions {
  transport?: typeof globalThis.fetch;
  pause?: () => Promise<void>;
}
function checkedStatus(
  value: z.infer<typeof fileStatusResponseSchema>,
  id: string,
  upload: Upload,
) {
  if (
    value.fileId !== id ||
    value.mimeType !== upload.mimeType ||
    value.sizeBytes !== upload.sizeBytes
  )
    throw new ClientFailure('INVALID_RESPONSE');
  if (value.scanStatus === 'rejected') throw new UploadFailure('REJECTED', id);
  return value.scanStatus === 'clean';
}
/** Resume scanning without re-uploading a private document. Pending never means accepted. */
export async function waitForCleanFile(
  client: ApiClient,
  fileId: string,
  metadata: Upload,
  options: PrivateUploadOptions = {},
): Promise<string> {
  const id = z.string().uuid().parse(fileId),
    upload = uploadSchema.parse(metadata);
  const pause = options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));
  for (let attempt = 0; attempt < 20; attempt++) {
    const status = await readApi(
      client.GET('/v1/files/{fileId}', {
        params: { path: { fileId: id } },
      }),
      fileStatusResponseSchema,
    );
    if (checkedStatus(status, id, upload)) return id;
    if (attempt < 19) await pause();
  }
  throw new UploadFailure('PENDING', id);
}
/** Only signed storage headers cross the storage boundary; API credentials never do. */
export async function uploadPrivateFile(
  client: ApiClient,
  metadata: Upload,
  body: Blob,
  options: PrivateUploadOptions = {},
): Promise<string> {
  const upload = uploadSchema.parse(metadata);
  if (body.size !== upload.sizeBytes || body.type !== upload.mimeType)
    throw new ClientFailure('INVALID_RESPONSE');
  const signed = await readApi(
    client.POST('/v1/files/uploads', { body: upload }),
    uploadResponseSchema,
  );
  const url = new URL(signed.uploadUrl);
  const headers = new Headers(signed.headers);
  if (
    Date.parse(signed.expiresAt) <= Date.now() ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    Array.from(headers.keys()).some((key) => key !== 'content-type') ||
    headers.get('content-type') !== upload.mimeType
  )
    throw new ClientFailure('INVALID_RESPONSE');
  let response: Response;
  try {
    response = await (options.transport ?? globalThis.fetch)(url.toString(), {
      method: 'PUT',
      body,
      headers,
      credentials: 'omit',
      redirect: 'error',
    });
  } catch {
    throw new ClientFailure('NETWORK_UNAVAILABLE');
  }
  if (!response.ok) throw new ClientFailure('NETWORK_UNAVAILABLE');
  const status = await readApi(
    client.POST('/v1/files/{fileId}/complete', {
      body: {},
      params: { path: { fileId: signed.fileId } },
    }),
    fileStatusResponseSchema,
  );
  if (checkedStatus(status, signed.fileId, upload)) return signed.fileId;
  return waitForCleanFile(client, signed.fileId, upload, options);
}
/** SEC-003: short-lived signed URL for a clean file this actor uploaded; access is audited. */
export async function readOwnFileUrl(client: ApiClient, fileId: string) {
  const id = z.string().uuid().parse(fileId);
  const result = await readApi(
    client.GET('/v1/files/{fileId}/download', { params: { path: { fileId: id } } }),
    downloadResponseSchema,
  );
  if (!['https:', 'http:'].includes(new URL(result.url).protocol))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
