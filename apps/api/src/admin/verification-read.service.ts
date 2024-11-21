import { and, desc, eq, lt, or } from 'drizzle-orm';
import { branchVerificationEvents, users, type Database } from '@hsm/db';
import {
  DomainError,
  stayIdentifierSchema,
  verificationDossierSchema,
  verificationHistorySchema,
  verificationPageQuerySchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockAdmin } from './scope.js';
import { verificationRecord } from './verification-record.js';
import {
  attachedEvidence,
  projectEvidence,
  verificationEvidence,
  type VerificationStorage,
} from './verification-evidence.js';
import { VerificationListingService } from './verification-listing.service.js';
import { VerificationSnapshotsService } from './verification-snapshots.service.js';
export class VerificationReadService {
  constructor(
    private readonly database: Database,
    private readonly options?: VerificationStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  snapshots(actor: Actor, branchId: unknown) {
    return new VerificationSnapshotsService(this.database, this.clock).comparison(actor, branchId);
  }
  snapshotItems(actor: Actor, branchId: unknown, submissionId: unknown, query: unknown) {
    return new VerificationSnapshotsService(this.database, this.clock).items(
      actor,
      branchId,
      submissionId,
      query,
    );
  }
  pricing(actor: Actor, branchId: unknown, query: unknown) {
    return new VerificationListingService(this.database, this.options, this.clock).pricing(
      actor,
      branchId,
      query,
    );
  }
  photos(actor: Actor, branchId: unknown, query: unknown) {
    return new VerificationListingService(this.database, this.options, this.clock).photos(
      actor,
      branchId,
      query,
    );
  }
  dossier(actor: Actor, branchId: unknown) {
    const branch = stayIdentifierSchema.parse(branchId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      const row = await verificationRecord(tx, branch);
      const [submitted] = await tx
        .select({ createdAt: branchVerificationEvents.createdAt })
        .from(branchVerificationEvents)
        .where(
          and(
            eq(branchVerificationEvents.branchId, branch),
            eq(branchVerificationEvents.toStatus, 'submitted'),
          ),
        )
        .orderBy(desc(branchVerificationEvents.id))
        .limit(1);
      return verificationDossierSchema.parse({
        branchId: branch,
        branchName: row.branchName,
        organizationName: row.organizationName,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        submittedAt: submitted?.createdAt.toISOString() ?? null,
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
        evidence: (await attachedEvidence(tx, row)).map((file) =>
          projectEvidence(file, row, this.options?.bucket),
        ),
        source: 'current_record',
      });
    });
  }
  history(actor: Actor, branchId: unknown, query: unknown) {
    const branch = stayIdentifierSchema.parse(branchId),
      input = verificationPageQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      await verificationRecord(tx, branch);
      const [anchor] = input.cursor
        ? await tx
            .select({
              id: branchVerificationEvents.id,
              createdAt: branchVerificationEvents.createdAt,
            })
            .from(branchVerificationEvents)
            .where(
              and(
                eq(branchVerificationEvents.branchId, branch),
                eq(branchVerificationEvents.id, input.cursor),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor)
        throw new DomainError('VALIDATION_FAILED', 400, 'History cursor unavailable');
      const rows = await tx
        .select({
          id: branchVerificationEvents.id,
          fromStatus: branchVerificationEvents.fromStatus,
          toStatus: branchVerificationEvents.toStatus,
          reason: branchVerificationEvents.reason,
          reviewerName: users.fullName,
          createdAt: branchVerificationEvents.createdAt,
        })
        .from(branchVerificationEvents)
        .innerJoin(users, eq(users.id, branchVerificationEvents.adminUserId))
        .where(
          and(
            eq(branchVerificationEvents.branchId, branch),
            anchor
              ? or(
                  lt(branchVerificationEvents.createdAt, anchor.createdAt),
                  and(
                    eq(branchVerificationEvents.createdAt, anchor.createdAt),
                    lt(branchVerificationEvents.id, anchor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(branchVerificationEvents.createdAt), desc(branchVerificationEvents.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return verificationHistorySchema.parse({
        data: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      });
    });
  }
  evidence(actor: Actor, branchId: unknown, fileId: unknown, input: unknown) {
    const branch = stayIdentifierSchema.parse(branchId),
      file = stayIdentifierSchema.parse(fileId);
    return this.database.transaction(async (tx) => {
      const scope = await lockAdmin(tx, actor, 'verification', this.clock);
      const record = await verificationRecord(tx, branch);
      return verificationEvidence(tx, scope, record, file, input, this.options, this.clock());
    });
  }
}
