import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  listingMedia,
  files,
  branches,
  brands,
  organizations,
  cities,
  type Database,
} from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
export class PublicListingMedia {
  constructor(
    private readonly database: Database,
    private readonly storage: Pick<PrivateStorage, 'read'>,
    private readonly bucket: string,
  ) {}
  async read(mediaId: string) {
    const metadata = () =>
      this.database
        .select({
          fileId: files.id,
          objectKey: files.objectKey,
          sha256: files.sha256,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
        })
        .from(listingMedia)
        .innerJoin(files, eq(files.id, listingMedia.fileId))
        .innerJoin(branches, eq(branches.id, listingMedia.branchId))
        .innerJoin(cities, eq(cities.id, branches.cityId))
        .innerJoin(brands, eq(brands.id, branches.brandId))
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .where(
          and(
            eq(listingMedia.id, mediaId),
            isNull(listingMedia.archivedAt),
            sql`${listingMedia.publishedAt} is not null`,
            eq(branches.verificationStatus, 'approved'),
            eq(cities.isActive, true),
            isNull(branches.listingHiddenAt),
            isNull(branches.archivedAt),
            isNull(brands.archivedAt),
            isNull(organizations.archivedAt),
            eq(files.purpose, 'listing_photo'),
            eq(files.scanStatus, 'clean'),
            eq(files.visibility, 'private'),
            eq(files.bucket, this.bucket),
          ),
        )
        .limit(1);
    const [file] = await metadata();
    if (
      !file ||
      !file.sha256 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType) ||
      file.sizeBytes <= 0n ||
      file.sizeBytes > 8000000n
    )
      throw new DomainError('NOT_FOUND', 404, 'Published image unavailable');
    let bytes: Buffer;
    try {
      bytes = await this.storage.read(file.objectKey, Number(file.sizeBytes));
    } catch {
      throw new DomainError('INTERNAL', 503, 'Published image unavailable');
    }
    const digest = createHash('sha256').update(bytes).digest();
    if (
      bytes.byteLength !== Number(file.sizeBytes) ||
      file.sha256.byteLength !== digest.byteLength ||
      !timingSafeEqual(file.sha256, digest)
    )
      throw new DomainError('NOT_FOUND', 404, 'Published image unavailable');
    // Publication/verification/scan revocations during storage I/O are checked again.
    const [current] = await metadata();
    if (
      !current ||
      current.fileId !== file.fileId ||
      current.objectKey !== file.objectKey ||
      !current.sha256 ||
      current.sha256.byteLength !== digest.byteLength ||
      current.mimeType !== file.mimeType ||
      current.sizeBytes !== file.sizeBytes ||
      !timingSafeEqual(current.sha256, digest)
    )
      throw new DomainError('NOT_FOUND', 404, 'Published image unavailable');
    return { bytes, mimeType: file.mimeType };
  }
}
