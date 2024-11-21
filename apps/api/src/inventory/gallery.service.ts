import { z } from 'zod';
import {
  galleryArchiveSchema,
  galleryAttachSchema,
  galleryEditSchema,
  galleryMediaSchema,
  galleryQuerySchema,
  listingPreconditionSchema,
  type GalleryEdit,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { GalleryRepository } from './gallery.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
type Command =
  { kind: 'edit'; input: GalleryEdit } | { kind: 'archive'; reason: string } | { kind: 'cover' };
export class GalleryService {
  constructor(
    private readonly repository: GalleryRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, branchId: string, query: unknown) {
    return this.repository.read(actor, id.parse(branchId), galleryQuerySchema.parse(query));
  }
  attach(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = galleryAttachSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /branches/:branchId/gallery', status: 201 },
      { branch },
      input,
      galleryMediaSchema,
      async (transaction) => {
        await this.repository.authorize(transaction, actor, branch);
        return true;
      },
      () => this.repository.attach(requireTransaction(), actor, branch, input),
    );
  }
  edit(
    actor: Actor,
    key: string,
    branchId: string,
    mediaId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    return this.write(actor, key, branchId, mediaId, ifMatch, {
      kind: 'edit',
      input: galleryEditSchema.parse(body),
    });
  }
  archive(
    actor: Actor,
    key: string,
    branchId: string,
    mediaId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    return this.write(actor, key, branchId, mediaId, ifMatch, {
      kind: 'archive',
      reason: galleryArchiveSchema.parse(body).reason,
    });
  }
  cover(
    actor: Actor,
    key: string,
    branchId: string,
    mediaId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    z.object({})
      .strict()
      .parse(body ?? {});
    return this.write(actor, key, branchId, mediaId, ifMatch, { kind: 'cover' });
  }
  private write(
    actor: Actor,
    key: string,
    branchId: string,
    mediaId: string,
    ifMatch: unknown,
    command: Command,
  ) {
    const branch = id.parse(branchId),
      media = id.parse(mediaId),
      version = listingPreconditionSchema.parse(ifMatch);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint:
          command.kind === 'edit'
            ? 'PUT /branches/:branchId/gallery/:mediaId'
            : 'POST /branches/:branchId/gallery/:mediaId/' + command.kind,
        status: 200,
      },
      { branch, media },
      { version, command },
      galleryMediaSchema,
      async (transaction) => {
        await this.repository.authorizeImageAction(
          transaction,
          actor,
          branch,
          media,
          command.kind === 'cover' || (command.kind === 'edit' && command.input.published),
          version,
        );
        return true;
      },
      () => {
        const transaction = requireTransaction();
        if (command.kind === 'edit')
          return this.repository.edit(transaction, actor, branch, media, version, command.input);
        if (command.kind === 'archive')
          return this.repository.archive(
            transaction,
            actor,
            branch,
            media,
            version,
            command.reason,
          );
        return this.repository.cover(transaction, actor, branch, media, version);
      },
    );
  }
}
