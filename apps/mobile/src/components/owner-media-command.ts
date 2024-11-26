import {
  archiveListingImage,
  attachListingImage,
  editListingImage,
  selectListingCover,
  type ApiClient,
} from '@hsm/api-client';
import type { GalleryEdit, GalleryMedia, GalleryTarget } from '@hsm/contracts';
export type MediaCommand =
  | {
      kind: 'attach';
      fileId: string;
      altText: string;
      sortOrder: number;
      target?: GalleryTarget;
      cover?: boolean;
      publish?: boolean;
    }
  | { kind: 'cover' | 'archive'; image: GalleryMedia }
  | { kind: 'edit'; image: GalleryMedia; input: GalleryEdit }
  | {
      kind: 'replace';
      image: GalleryMedia;
      fileId: string;
      target?: GalleryTarget;
      cover?: boolean;
      publish?: boolean;
    };
function publishAdded(client: ApiClient, branchId: string, added: GalleryMedia, key: string) {
  return editListingImage(
    client,
    branchId,
    added.id,
    added.version,
    { altText: added.altText, sortOrder: added.sortOrder, published: true },
    key,
  );
}
// ROOM-002/003: retries keep the same command key for each existing endpoint.
// A replacement attaches a clean file before archiving the original; failed steps
// retain both records, so neither a photo nor its publication history is lost.
export async function runMediaCommand(
  client: ApiClient,
  branchId: string,
  body: MediaCommand,
  key: string,
) {
  if (body.kind === 'attach') {
    const added = await attachListingImage(
      client,
      branchId,
      {
        fileId: body.fileId,
        altText: body.altText,
        sortOrder: body.sortOrder,
        ...(body.target ? { target: body.target } : {}),
      },
      key,
    );
    // PROP-001: a photo goes live as soon as it is added when the actor may publish.
    const shown = body.publish ? await publishAdded(client, branchId, added, key) : added;
    return body.cover ? selectListingCover(client, branchId, shown.id, shown.version, key) : shown;
  }
  if (body.kind === 'cover')
    return selectListingCover(client, branchId, body.image.id, body.image.version, key);
  if (body.kind === 'edit')
    return editListingImage(client, branchId, body.image.id, body.image.version, body.input, key);
  if (body.kind === 'replace') {
    const added = await attachListingImage(
      client,
      branchId,
      {
        fileId: body.fileId,
        altText: body.image.altText,
        sortOrder: body.image.sortOrder,
        ...(body.target ? { target: body.target } : {}),
      },
      key,
    );
    if (body.image.publishedAt || body.publish) await publishAdded(client, branchId, added, key);
  }
  return archiveListingImage(
    client,
    branchId,
    body.image.id,
    body.image.version,
    body.kind === 'replace' ? 'Replaced with a clean uploaded photo' : 'Removed by management',
    key,
  );
}
