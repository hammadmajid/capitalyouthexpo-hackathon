import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import {
  listingMedia,
  files,
  roomTypes,
  verificationSubmissions,
  verificationSnapshotItems,
} from '@hsm/db';
import { DomainError, verificationDossierSchema } from '@hsm/contracts';
import { v7 } from 'uuid';
import { createHash } from 'node:crypto';
import type { Transaction } from '../audit/writer.js';
import { verificationRecord } from './verification-record.js';
import { attachedEvidence, projectEvidence } from './verification-evidence.js';
// Submission already holds Owner identity, organization, brand and branch locks.
// Inventory writes take the same locks, so the batched capture cannot mix revisions.
export async function captureVerification(
  tx: Transaction,
  branchId: string,
  ownerId: string,
  now: Date,
) {
  const row = await verificationRecord(tx, branchId),
    submissionId = v7();
  if (row.ownerId !== ownerId)
    throw new DomainError('FORBIDDEN', 403, 'Only the branch Owner can submit verification');
  const dossier = verificationDossierSchema.parse({
    branchId,
    branchName: row.branchName,
    organizationName: row.organizationName,
    status: 'submitted',
    updatedAt: now.toISOString(),
    submittedAt: now.toISOString(),
    completenessScore: row.completenessScore,
    category: row.category,
    addressLine: row.addressLine,
    description: row.description,
    cityId: row.cityId,
    areaId: row.areaId,
    publicPhone: row.publicPhone,
    publicEmail: row.publicEmail,
    showPublicContact: row.showPublicContact,
    propertyTier: row.propertyTier,
    establishmentYear: row.establishmentYear,
    location:
      row.latitude === null || row.longitude === null
        ? null
        : { latitude: row.latitude, longitude: row.longitude },
    owner: {
      fullName: row.fullName,
      cnicLast4: row.cnicLast4,
      profileCompletedAt: row.profileCompletedAt?.toISOString() ?? null,
    },
    evidence: (await attachedEvidence(tx, row)).map((file) => projectEvidence(file, row)),
    source: 'current_record',
  });
  await tx
    .insert(verificationSubmissions)
    .values({ id: submissionId, branchId, submittedByUserId: ownerId, submittedAt: now, dossier });
  const pricing = await capturePrices(tx, branchId, submissionId);
  const photos = await capturePhotos(tx, branchId, submissionId);
  await tx.insert(verificationSnapshotItems).values({
    submissionId,
    kind: 'fingerprint',
    sourceId: submissionId,
    data: { pricing, photos },
  });
  return submissionId;
}
async function capturePrices(tx: Transaction, branchId: string, submissionId: string) {
  const digest = createHash('sha256');
  let cursor: string | undefined;
  for (;;) {
    const rows = await tx
      .select()
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.branchId, branchId),
          isNull(roomTypes.archivedAt),
          cursor ? gt(roomTypes.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(roomTypes.id))
      .limit(100);
    if (!rows.length) break;
    const values = rows.map((row) => ({
      submissionId,
      kind: 'pricing',
      sourceId: row.id,
      data: {
        id: row.id,
        name: row.name,
        inventoryMode: row.inventoryMode,
        capacity: row.capacity,
        bedMonthlyRentPaisa: row.bedMonthlyRentPaisa?.toString() ?? null,
        roomMonthlyRentPaisa: row.roomMonthlyRentPaisa?.toString() ?? null,
        depositPaisa: row.depositPaisa.toString(),
      },
    }));
    for (const value of values) digest.update(JSON.stringify(value.data));
    await tx.insert(verificationSnapshotItems).values(values);
    cursor = rows.at(-1)?.id;
  }
  return digest.digest('hex');
}
async function capturePhotos(tx: Transaction, branchId: string, submissionId: string) {
  const digest = createHash('sha256');
  let cursor: string | undefined;
  for (;;) {
    const rows = await tx
      .select({ media: listingMedia, file: files })
      .from(listingMedia)
      .innerJoin(files, eq(files.id, listingMedia.fileId))
      .where(
        and(
          eq(listingMedia.branchId, branchId),
          isNull(listingMedia.archivedAt),
          cursor ? gt(listingMedia.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(listingMedia.id))
      .limit(100);
    if (!rows.length) break;
    const values = rows.map(({ media, file }) => ({
      submissionId,
      kind: 'photo',
      sourceId: media.id,
      data: {
        id: media.id,
        fileId: file.id,
        roomId: media.roomId,
        seatId: media.seatId,
        altText: media.altText,
        mimeType: file.mimeType,
        available: false,
      },
    }));
    for (let index = 0; index < rows.length; index++) {
      digest.update(JSON.stringify(values[index]?.data));
      digest.update(rows[index]?.file.sha256 ?? Buffer.alloc(0));
    }
    await tx.insert(verificationSnapshotItems).values(values);
    cursor = rows.at(-1)?.media.id;
  }
  return digest.digest('hex');
}
