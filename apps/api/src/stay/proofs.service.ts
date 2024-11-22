import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { residentPaymentProofs, type Database } from '@hsm/db';
import {
  DomainError,
  downloadResponseSchema,
  paymentInstructionListSchema,
  proofReviewInputSchema,
  residentProofInputSchema,
  residentProofPageQuerySchema,
  staffProofPageQuerySchema,
  residentProofPageSchema,
  residentProofSchema,
  stayIdentifierSchema,
  staffProofPageSchema,
} from '@hsm/contracts';
import type { PrivateStorage } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
import { paymentCommandContext, lockPaymentAuthority } from './payment.scope.js';
import { ResidentProofRepository } from './proofs.repository.js';
import { paymentSecurity } from './proof-security.js';
import {
  currentInstructions,
  projectInstruction,
} from '../booking/payment-instructions.repository.js';
const id = stayIdentifierSchema;
export class ResidentProofService {
  constructor(
    private readonly database: Database,
    private readonly repository: ResidentProofRepository,
    private readonly idempotency: IdempotencyService,
    private readonly storage: Pick<PrivateStorage, 'presignDownload'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  paymentSummary(actor: Actor, stayId: unknown) {
    const stay = id.parse(stayId);
    return this.database.transaction(async (tx) => {
      const scope = await lockFinancialReadStay(tx, actor, stay, this.clock);
      return paymentSecurity(tx, scope.branchId, stay, this.clock());
    });
  }
  // PAY-002 / PAY-003: idempotent resident submission against an own open invoice.
  submit(actor: Actor, key: unknown, stayId: unknown, body: unknown) {
    const stay = id.parse(stayId),
      input = residentProofInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint: 'POST resident payment proof', status: 201 },
        { stay },
        input,
        residentProofSchema,
        async (tx) =>
          Boolean(await lockFinancialReadStay(tx, actor, stay, this.clock, undefined, 'update')),
        async () => {
          const tx = requireTransaction();
          return this.repository.projectRow(await this.repository.submit(tx, actor, stay, input));
        },
      )
      .catch(inventoryFailure);
  }
  async ownPage(actor: Actor, stayId: unknown, query: unknown) {
    const input = residentProofPageQuerySchema.parse(query);
    const rows = await this.repository.ownPage(actor, id.parse(stayId), input.cursor, input.limit);
    const page = rows.slice(0, input.limit);
    return residentProofPageSchema.parse({
      data: page.map((row) => this.repository.projectRow(row)),
      nextCursor: rows.length > input.limit ? (page.at(-1)?.proof.id ?? null) : null,
    });
  }
  // PAY-001 / BR-01: the Stay's own branch payment destinations; the platform holds no money.
  instructions(actor: Actor, stayId: unknown) {
    const stay = id.parse(stayId);
    return this.database.transaction(async (tx) => {
      const scope = await lockFinancialReadStay(tx, actor, stay, this.clock);
      const rows = await currentInstructions(tx, scope.branchId);
      return paymentInstructionListSchema.parse({
        branchId: scope.branchId,
        data: rows.slice(0, 10).map(projectInstruction),
      });
    });
  }
  // PAY-004 / PAY-005: staff queue with the invoice's authoritative outstanding amount.
  queue(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = staffProofPageQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      await lockInventoryScope(tx, actor, branch, 'finance_view');
      await lockActor(tx, actor, this.clock);
      const rows = await this.repository.queue(
        tx,
        branch,
        input.state,
        input.cursor,
        input.limit,
        input.stayId,
      );
      const page = rows.slice(0, input.limit),
        data = [];
      for (const row of page) {
        // CHG-050: a proof paying several bills is compared with what all of them still owe.
        let outstanding = 0n;
        for (const invoiceId of await this.repository.billsOf(tx, row.proof)) {
          const balance = await this.repository.invoiceBalance(
            tx,
            branch,
            row.proof.stayId,
            invoiceId,
          );
          outstanding += BigInt(balance.outstandingPaisa);
        }
        const security =
          (row.proof.depositPaisa ?? 0n) > 0n
            ? await paymentSecurity(tx, branch, row.proof.stayId, this.clock())
            : undefined;
        data.push({
          proof: this.repository.projectRow(row),
          residentName: row.residentName,
          roomLabel: row.roomLabel,
          bedLabel: row.bedLabel,
          invoiceOutstandingPaisa: Number(outstanding),
          depositOutstandingPaisa: security?.outstandingDepositPaisa ?? 0,
          amountMismatch:
            outstanding + (row.proof.depositPaisa ?? 0n) !== row.proof.amountPaisa ||
            (security !== undefined &&
              Number(row.proof.depositPaisa) > security.outstandingDepositPaisa),
        });
      }
      return staffProofPageSchema.parse({
        data,
        nextCursor: rows.length > input.limit ? (page.at(-1)?.proof.id ?? null) : null,
      });
    });
  }
  // PAY-006..009: idempotent approve/reject; finance_view + payment_record, live.
  async review(actor: Actor, key: unknown, branchId: unknown, proofId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      proof = id.parse(proofId),
      input = proofReviewInputSchema.parse(body);
    const [found] = await this.database
      .select({ stayId: residentPaymentProofs.stayId })
      .from(residentPaymentProofs)
      .where(and(eq(residentPaymentProofs.branchId, branch), eq(residentPaymentProofs.id, proof)));
    if (!found) throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    try {
      const context = await paymentCommandContext(
        this.database,
        actor,
        branch,
        found.stayId,
        this.clock,
      );
      return await this.idempotency.withStore(context.store).execute(
        { actor, key: id.parse(key), endpoint: 'POST resident payment proof review', status: 200 },
        { branch, proof },
        input,
        residentProofSchema,
        async (tx) =>
          Boolean(await lockPaymentAuthority(tx, actor, branch, found.stayId, this.clock)),
        async () =>
          this.repository.projectRow(
            await this.repository.review(requireTransaction(), actor, branch, proof, input),
          ),
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Payment proof response unavailable');
      return inventoryFailure(error);
    }
  }
  // SEC-003: short-lived link for reviewers; requires live finance_view.
  download(actor: Actor, branchId: unknown, proofId: unknown) {
    const branch = id.parse(branchId),
      proof = id.parse(proofId);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      await lockInventoryScope(tx, actor, branch, 'finance_view');
      await lockActor(tx, actor, this.clock);
      const file = await this.repository.proofFile(tx, actor, branch, proof);
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
export function residentProofService(
  database: Database,
  idempotency: IdempotencyService,
  storage: Pick<PrivateStorage, 'presignDownload'>,
  bucket: string,
  clock: () => Date = () => new Date(),
) {
  return new ResidentProofService(
    database,
    new ResidentProofRepository(database, bucket, undefined, clock),
    idempotency,
    storage,
    clock,
  );
}
