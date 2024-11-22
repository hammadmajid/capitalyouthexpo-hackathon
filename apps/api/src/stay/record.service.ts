import { readStayResidentPhoto, type ResidentPhotoReader } from './resident-photo.js';
import type { PrivateStorage } from '@hsm/files';
import { AgreementDocumentsRepository } from './agreement-documents.repository.js';
import {
  agreementFileInputSchema,
  agreementFileSchema,
  agreementFileQuerySchema,
} from '@hsm/contracts';
import { acceptAgreement, authorizeAcceptance } from './agreement-acceptance.repository.js';
import {
  agreementAcceptanceInputSchema,
  agreementAcceptanceSchema,
  DomainError,
} from '@hsm/contracts';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { stayIdentifierSchema, stayRecordSchema, stayRecordQuerySchema } from '@hsm/contracts';
import type { Database } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { StayRecordRepository } from './record.repository.js';
export class StayRecordService {
  constructor(
    private readonly repository: StayRecordRepository,
    private readonly idempotency?: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
    private readonly documents?: AgreementDocumentsRepository,
    private readonly residentPhoto?: ResidentPhotoReader,
  ) {}
  photo(actor: Actor, stay: unknown, branch?: unknown) {
    if (!this.residentPhoto) throw new DomainError('INTERNAL', 503, 'Resident photo unavailable');
    return this.residentPhoto(
      actor,
      stayIdentifierSchema.parse(stay),
      branch === undefined ? undefined : stayIdentifierSchema.parse(branch),
    );
  }
  private documentStore() {
    if (!this.documents) throw new DomainError('INTERNAL', 503, 'Agreement documents unavailable');
    return this.documents;
  }
  files(actor: Actor, stay: unknown, agreement: unknown, query: unknown, branch?: unknown) {
    return this.documentStore().page(
      actor,
      stayIdentifierSchema.parse(stay),
      stayIdentifierSchema.parse(agreement),
      agreementFileQuerySchema.parse(query),
      branch === undefined ? undefined : stayIdentifierSchema.parse(branch),
    );
  }
  fileUrl(actor: Actor, stay: unknown, agreement: unknown, file: unknown, branch?: unknown) {
    return this.documentStore().download(
      actor,
      stayIdentifierSchema.parse(stay),
      stayIdentifierSchema.parse(agreement),
      stayIdentifierSchema.parse(file),
      branch === undefined ? undefined : stayIdentifierSchema.parse(branch),
    );
  }
  attach(
    actor: Actor,
    key: string,
    stay: unknown,
    agreement: unknown,
    body: unknown,
    branch?: unknown,
  ) {
    if (!this.idempotency)
      throw new DomainError('INTERNAL', 503, 'Agreement documents unavailable');
    const repository = this.documentStore(),
      stayId = stayIdentifierSchema.parse(stay),
      agreementId = stayIdentifierSchema.parse(agreement),
      input = agreementFileInputSchema.parse(body),
      branchId = branch === undefined ? undefined : stayIdentifierSchema.parse(branch);
    return this.idempotency.execute(
      {
        actor,
        key: stayIdentifierSchema.parse(key),
        endpoint: 'POST stay agreement file',
        status: 201,
      },
      { stayId, agreementId, branchId: branchId ?? 'own' },
      input,
      agreementFileSchema,
      async (tx) => {
        await repository.authorize(tx, actor, stayId, agreementId, branchId);
        return true;
      },
      () => repository.attach(requireTransaction(), actor, stayId, agreementId, input, branchId),
    );
  }
  accept(actor: Actor, key: string, stay: unknown, agreement: unknown, body: unknown) {
    if (!this.idempotency) throw new DomainError('INTERNAL', 503, 'Acknowledgement unavailable');
    const stayId = stayIdentifierSchema.parse(stay),
      agreementId = stayIdentifierSchema.parse(agreement),
      input = agreementAcceptanceInputSchema.parse(body);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint: 'PUT /me/stays/:stayId/agreements/:agreementId/acceptance',
        status: 200,
      },
      { stayId, agreementId },
      input,
      agreementAcceptanceSchema,
      async (tx) => {
        await authorizeAcceptance(tx, actor, stayId, agreementId, this.clock);
        return true;
      },
      () => acceptAgreement(requireTransaction(), actor, stayId, agreementId, input, this.clock),
    );
  }
  async staff(actor: Actor, branchId: unknown, stayId: unknown, query: unknown = {}) {
    const page = stayRecordQuerySchema.parse(query);
    return stayRecordSchema.parse(
      await this.repository.staff(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayIdentifierSchema.parse(stayId),
        page,
      ),
    );
  }
  async own(actor: Actor, stayId: unknown, query: unknown = {}) {
    const page = stayRecordQuerySchema.parse(query);
    return stayRecordSchema.parse(
      await this.repository.own(actor, stayIdentifierSchema.parse(stayId), page),
    );
  }
}
export function stayRecordService(
  database: Database,
  clock: () => Date = () => new Date(),
  idempotency?: IdempotencyService,
  documents?: { storage: PrivateStorage; bucket: string },
) {
  return new StayRecordService(
    new StayRecordRepository(database, clock),
    idempotency,
    clock,
    documents
      ? new AgreementDocumentsRepository(database, documents.storage, documents.bucket, clock)
      : undefined,
    documents
      ? (actor, stayId, branchId) =>
          readStayResidentPhoto(
            database,
            documents.storage,
            documents.bucket,
            actor,
            stayId,
            clock,
            branchId,
          )
      : undefined,
  );
}
