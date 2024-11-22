import { and, asc, eq, gt } from 'drizzle-orm';
import { v7 } from 'uuid';
import { agreementFiles, type Database } from '@hsm/db';
import {
  agreementFileSchema,
  agreementFilePageSchema,
  billingAgreementTermsSchema,
  downloadResponseSchema,
  DomainError,
  type AgreementFileInput,
  type AgreementFileQuery,
} from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { requireSensitiveAccess } from '../authorization/sensitive.policy.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { agreementDocumentScope, cleanAgreementFile } from './agreement-document.scope.js';
const project = (row: typeof agreementFiles.$inferSelect) =>
  agreementFileSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
export class AgreementDocumentsRepository {
  constructor(
    private readonly database: Database,
    private readonly storage: PrivateStorage,
    private readonly bucket: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  authorize(tx: Transaction, actor: Actor, stayId: string, agreementId: string, branchId?: string) {
    return agreementDocumentScope(tx, actor, stayId, agreementId, this.clock, branchId);
  }
  page(
    actor: Actor,
    stayId: string,
    agreementId: string,
    query: AgreementFileQuery,
    branchId?: string,
  ) {
    return this.database.transaction(async (tx) => {
      const scope = await this.authorize(tx, actor, stayId, agreementId, branchId);
      const rows = await tx
        .select()
        .from(agreementFiles)
        .where(
          and(
            eq(agreementFiles.branchId, scope.stay.branchId),
            eq(agreementFiles.stayId, stayId),
            eq(agreementFiles.agreementId, agreementId),
            query.cursor ? gt(agreementFiles.id, query.cursor) : undefined,
          ),
        )
        .orderBy(asc(agreementFiles.id))
        .limit(query.limit + 1);
      return agreementFilePageSchema.parse({
        branchId: scope.stay.branchId,
        stayId,
        agreementId,
        data: rows.slice(0, query.limit).map(project),
        nextCursor: rows.length > query.limit ? rows[query.limit - 1]?.id : null,
      });
    });
  }
  async attach(
    tx: Transaction,
    actor: Actor,
    stayId: string,
    agreementId: string,
    input: AgreementFileInput,
    branchId?: string,
  ) {
    const scope = await this.authorize(tx, actor, stayId, agreementId, branchId);
    await cleanAgreementFile(tx, input.fileId, 'stay_agreement', this.bucket, actor.userId);
    const [previous] = await tx
      .select()
      .from(agreementFiles)
      .where(eq(agreementFiles.fileId, input.fileId));
    if (previous) {
      if (
        previous.stayId !== stayId ||
        previous.agreementId !== agreementId ||
        previous.label !== input.label
      )
        throw new DomainError('CONFLICT', 409, 'File already belongs to an agreement record');
      return project(previous);
    }
    const [row] = await tx
      .insert(agreementFiles)
      .values({
        id: v7(),
        branchId: scope.stay.branchId,
        stayId,
        agreementId,
        ...input,
        uploadedBy: actor.userId,
        createdAt: this.clock(),
      })
      .returning();
    if (!row) throw new DomainError('INTERNAL', 500, 'Agreement file unavailable');
    await new AuditWriter().hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId: scope.stay.branchId,
      action: 'stay.agreement.file.attached',
      targetType: 'stay_agreement',
      targetId: agreementId,
      after: project(row),
      createdAt: this.clock(),
    });
    return project(row);
  }
  download(actor: Actor, stayId: string, agreementId: string, fileId: string, branchId?: string) {
    return this.database.transaction(async (tx) => {
      const scope = await this.authorize(tx, actor, stayId, agreementId, branchId);
      const terms = billingAgreementTermsSchema.parse(scope.agreement.termsSnapshot);
      const template = terms.policy.agreementTemplate?.fileId === fileId;
      if (!template) {
        const [association] = await tx
          .select({ id: agreementFiles.id })
          .from(agreementFiles)
          .where(
            and(
              eq(agreementFiles.branchId, scope.stay.branchId),
              eq(agreementFiles.stayId, stayId),
              eq(agreementFiles.agreementId, agreementId),
              eq(agreementFiles.fileId, fileId),
            ),
          );
        if (!association) throw new DomainError('NOT_FOUND', 404, 'Agreement file unavailable');
      }
      const file = await cleanAgreementFile(
        tx,
        fileId,
        template ? 'agreement_template' : 'stay_agreement',
        this.bucket,
      );
      const subjectId = scope.stay.userId ?? file.uploadedBy;
      if (!subjectId) throw new DomainError('NOT_FOUND', 404, 'Agreement file unavailable');
      requireSensitiveAccess({
        actorId: actor.userId,
        subjectId,
        actorActive: true,
        resource: 'private_document',
        ownerOrAssignedManager: branchId !== undefined,
        approvedBookingOrWalkIn: scope.stay.source === 'manual' || scope.stay.bookingId !== null,
        rootActive: false,
        authorizedSafetyCase: false,
        justification: '',
      });
      await new AuditWriter().sensitive(tx, {
        actorUserId: actor.userId,
        subjectUserId: subjectId,
        resource: 'private_document',
        resourceId: file.id,
        purpose: 'Original stay agreement review',
        createdAt: this.clock(),
      });
      let url: string;
      try {
        url = await this.storage.presignDownload(file.objectKey, file.id, file.mimeType);
      } catch {
        throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      }
      return downloadResponseSchema.parse({
        url,
        expiresAt: new Date(this.clock().getTime() + 60000).toISOString(),
      });
    });
  }
}
