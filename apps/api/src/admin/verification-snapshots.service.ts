import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import {
  branchVerificationEvents,
  verificationDecisionSubmissions,
  verificationSnapshotItems,
  verificationSubmissions,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  stayIdentifierSchema as id,
  verificationSnapshotComparisonSchema,
  verificationSnapshotDiff,
  verificationSnapshotItemQuerySchema,
  verificationSnapshotItemsSchema,
  verificationDossierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockAdmin } from './scope.js';
import { verificationRecord } from './verification-record.js';
export class VerificationSnapshotsService {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  comparison(actor: Actor, branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      await verificationRecord(tx, branch);
      const [current] = await tx
        .select()
        .from(verificationSubmissions)
        .where(eq(verificationSubmissions.branchId, branch))
        .orderBy(desc(verificationSubmissions.id))
        .limit(1);
      const [approved] = await tx
        .select({ submission: verificationSubmissions })
        .from(branchVerificationEvents)
        .innerJoin(
          verificationDecisionSubmissions,
          eq(verificationDecisionSubmissions.eventId, branchVerificationEvents.id),
        )
        .innerJoin(
          verificationSubmissions,
          eq(verificationSubmissions.id, verificationDecisionSubmissions.submissionId),
        )
        .where(
          and(
            eq(branchVerificationEvents.branchId, branch),
            eq(branchVerificationEvents.toStatus, 'approved'),
          ),
        )
        .orderBy(desc(branchVerificationEvents.createdAt), desc(branchVerificationEvents.id))
        .limit(1);
      const project = (row: typeof verificationSubmissions.$inferSelect) => ({
        id: row.id,
        submittedAt: row.submittedAt.toISOString(),
        dossier: verificationDossierSchema.parse(row.dossier),
      });
      const changed =
        current && approved
          ? verificationSnapshotDiff(
              verificationDossierSchema.parse(current.dossier),
              verificationDossierSchema.parse(approved.submission.dossier),
            )
          : [];
      const changedFields: string[] = [...changed];
      if (current && approved) {
        const fingerprints = await tx
          .select()
          .from(verificationSnapshotItems)
          .where(
            and(
              eq(verificationSnapshotItems.kind, 'fingerprint'),
              inArray(verificationSnapshotItems.submissionId, [current.id, approved.submission.id]),
            ),
          );
        const a = fingerprints.find((row) => row.submissionId === current.id)?.data;
        const b = fingerprints.find((row) => row.submissionId === approved.submission.id)?.data;
        if (a?.pricing !== b?.pricing) changedFields.push('pricing');
        if (a?.photos !== b?.photos) changedFields.push('photos');
      }
      return verificationSnapshotComparisonSchema.parse({
        current: current ? project(current) : null,
        lastApproved: approved ? project(approved.submission) : null,
        changedFields,
        historicalSnapshotUnavailable: !current || !approved,
      });
    });
  }
  items(actor: Actor, branchId: unknown, submissionId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      submission = id.parse(submissionId),
      input = verificationSnapshotItemQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      await verificationRecord(tx, branch);
      const [header] = await tx
        .select({ id: verificationSubmissions.id })
        .from(verificationSubmissions)
        .where(
          and(
            eq(verificationSubmissions.id, submission),
            eq(verificationSubmissions.branchId, branch),
          ),
        );
      if (!header) throw new DomainError('NOT_FOUND', 404, 'Submission unavailable');
      const rows = await tx
        .select()
        .from(verificationSnapshotItems)
        .where(
          and(
            eq(verificationSnapshotItems.submissionId, submission),
            eq(verificationSnapshotItems.kind, input.kind),
            input.cursor ? gt(verificationSnapshotItems.sourceId, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(verificationSnapshotItems.sourceId))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return verificationSnapshotItemsSchema.parse({
        data: page.map((row) => ({ kind: row.kind, sourceId: row.sourceId, data: row.data })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.sourceId ?? null) : null,
      });
    });
  }
}
