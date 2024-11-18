import { z } from 'zod';
import {
  galleryArchiveSchema,
  galleryAttachSchema,
  galleryEditSchema,
  galleryMediaSchema,
  galleryPageSchema,
  galleryQuerySchema,
  listingVersionSchema,
  type GalleryMedia,
  type GalleryQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function target(branchId: string, mediaId: string) {
  return { branchId: id.parse(branchId), mediaId: id.parse(mediaId) };
}
function headers(version: string, key: string) {
  return {
    'If-Match': '"' + listingVersionSchema.parse(version) + '"',
    'Idempotency-Key': id.parse(key),
  };
}
function sameImage(value: GalleryMedia, branchId: string, mediaId?: string) {
  if (value.branchId !== branchId || (mediaId !== undefined && value.id !== mediaId))
    throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
export async function listListingGallery(
  client: ApiClient,
  branchId: string,
  input: Partial<GalleryQuery> = {},
) {
  const branch = id.parse(branchId),
    page = galleryQuerySchema.parse(input);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/gallery', {
      params: {
        path: { branchId: branch },
        query: {
          limit: page.limit,
          state: page.state,
          ...(page.cursor ? { cursor: page.cursor } : {}),
          ...(page.roomId ? { roomId: page.roomId } : {}),
          ...(page.bedId ? { bedId: page.bedId } : {}),
        },
      },
    }),
    galleryPageSchema,
  );
  for (const value of result.data) {
    sameImage(value, branch);
    // ROOM-002/003: a scoped page may only contain images for exactly that target.
    if (value.roomId !== (page.roomId ?? null) || value.bedId !== (page.bedId ?? null))
      throw new ClientFailure('INVALID_RESPONSE');
  }
  return result;
}
export async function attachListingImage(
  client: ApiClient,
  branchId: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    { target: attachTarget, ...fields } = galleryAttachSchema.parse(input),
    body = attachTarget ? { ...fields, target: attachTarget } : fields,
    commandKey = id.parse(key);
  const result = sameImage(
    await readApi(
      client.POST('/v1/branches/{branchId}/gallery', {
        params: { path: { branchId: branch }, header: { 'Idempotency-Key': commandKey } },
        body,
      }),
      galleryMediaSchema,
    ),
    branch,
  );
  if (
    result.fileId !== body.fileId ||
    result.roomId !== (attachTarget?.roomId ?? null) ||
    result.bedId !== (attachTarget?.kind === 'bed' ? attachTarget.bedId : null) ||
    result.publishedAt !== null ||
    result.archivedAt !== null ||
    result.scanStatus !== 'clean'
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function editListingImage(
  client: ApiClient,
  branchId: string,
  mediaId: string,
  version: string,
  input: unknown,
  key: string,
) {
  const path = target(branchId, mediaId),
    body = galleryEditSchema.parse(input);
  const result = sameImage(
    await readApi(
      client.PUT('/v1/branches/{branchId}/gallery/{mediaId}', {
        params: { path, header: headers(version, key) },
        body,
      }),
      galleryMediaSchema,
    ),
    path.branchId,
    path.mediaId,
  );
  if (
    result.archivedAt !== null ||
    result.altText !== body.altText ||
    result.sortOrder !== body.sortOrder ||
    (result.publishedAt !== null) !== body.published ||
    (body.published && result.scanStatus !== 'clean')
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function archiveListingImage(
  client: ApiClient,
  branchId: string,
  mediaId: string,
  version: string,
  reason: string,
  key: string,
) {
  const path = target(branchId, mediaId),
    body = galleryArchiveSchema.parse({ reason });
  const result = sameImage(
    await readApi(
      client.POST('/v1/branches/{branchId}/gallery/{mediaId}/archive', {
        params: { path, header: headers(version, key) },
        body,
      }),
      galleryMediaSchema,
    ),
    path.branchId,
    path.mediaId,
  );
  if (result.archivedAt === null) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function selectListingCover(
  client: ApiClient,
  branchId: string,
  mediaId: string,
  version: string,
  key: string,
) {
  const path = target(branchId, mediaId);
  const result = sameImage(
    await readApi(
      client.POST('/v1/branches/{branchId}/gallery/{mediaId}/cover', {
        params: { path, header: headers(version, key) },
        body: {},
      }),
      galleryMediaSchema,
    ),
    path.branchId,
    path.mediaId,
  );
  if (result.sortOrder !== 0 || result.archivedAt !== null || result.scanStatus !== 'clean')
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
