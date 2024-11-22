import { z } from 'zod';
import type { Database } from '@hsm/db';
import {
  DomainError,
  encodePublicGalleryCursor,
  publicGalleryPageSchema,
  type PublicGalleryQuery,
} from '@hsm/contracts';
import { readPublicGalleryRows } from './gallery-query.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const photoRow = z
  .object({
    branchId: id,
    id,
    altText: z.string().trim().min(1).max(240),
    sortOrder: z.number().int().min(0).max(2147483647),
  })
  .strict();
const emptyRow = z
  .object({ branchId: id, id: z.null(), altText: z.null(), sortOrder: z.null() })
  .strict();
const unavailable = () => new DomainError('INTERNAL', 500, 'Public gallery unavailable');
export function projectPublicGallery(branchId: string, input: PublicGalleryQuery, raw: unknown) {
  const branch = id.parse(branchId),
    parsed = z
      .array(z.union([photoRow, emptyRow]))
      .max(input.limit + 1)
      .safeParse(raw);
  if (!parsed.success || parsed.data.some((row) => row.branchId !== branch)) throw unavailable();
  if (!parsed.data.length) throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
  const photos = parsed.data.filter((row): row is z.infer<typeof photoRow> => row.id !== null);
  const selected = photos.slice(0, input.limit),
    last = selected.at(-1);
  const result = publicGalleryPageSchema.safeParse({
    branchId: branch,
    data: selected.map((row) => ({ id: row.id, altText: row.altText })),
    nextCursor:
      photos.length > input.limit && last
        ? encodePublicGalleryCursor(last.sortOrder, last.id)
        : null,
  });
  if (!result.success) throw unavailable();
  return result.data;
}
export class PublicGalleryRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
  ) {}
  read(branchId: string, input: PublicGalleryQuery) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (transaction) =>
      projectPublicGallery(
        branch,
        input,
        await readPublicGalleryRows(transaction, branch, input, this.bucket),
      ),
    );
  }
}
