import {
  recordExternalResidentPayment,
  reissueResidentInvoice,
  reverseResidentPayment,
  type Database,
} from '@hsm/db';
import { DomainError, type RecordExternalPaymentInput } from '@hsm/contracts';
import type { z } from 'zod';
import type { InvoiceReissueInput, paymentReversalInputSchema } from '@hsm/contracts';
import { NotificationProducer } from '@hsm/notifications';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { paymentCommandContext, lockPaymentAuthority } from './payment.scope.js';
import { authorizeRecordedPaymentProof } from './payment-proof.js';
import { requireProofSecurity } from './proof-security.js';
export class StayPaymentRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly notices = new NotificationProducer(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  context(actor: Actor, branchId: string, stayId: string) {
    return paymentCommandContext(this.database, actor, branchId, stayId, this.clock);
  }
  async authorize(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    userId: string | null,
  ) {
    const scope = await lockPaymentAuthority(tx, actor, branchId, stayId, this.clock);
    if (scope.userId !== userId)
      throw new DomainError(
        'CONFLICT',
        409,
        'Stay account link changed; reload before recording payment',
      );
    return true;
  }
  async record(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    userId: string | null,
    commandId: string,
    payment: RecordExternalPaymentInput,
  ) {
    const scope = await lockPaymentAuthority(tx, actor, branchId, stayId, this.clock);
    if (scope.userId !== userId)
      throw new DomainError(
        'CONFLICT',
        409,
        'Stay account link changed; reload before recording payment',
      );
    const now = this.clock();
    await requireProofSecurity(tx, branchId, stayId, payment.depositPaisa, now);
    const result = await recordExternalResidentPayment(
      tx,
      {
        scope: { branchId, stayId, actorUserId: actor.userId, actorRole: scope.actorRole },
        commandId,
        payment,
      },
      now,
      (proofTx, _scope, fileId) =>
        authorizeRecordedPaymentProof(proofTx, actor, fileId, this.bucket, now),
    );
    if (userId !== null)
      await this.notices.enqueue(
        tx,
        { userId, event: 'resident.payment_recorded', operationId: result.paymentId },
        now,
      );
    return result;
  }
  // Q14 / PAY-008: Owner-only reversal; explicit opposite ledger entries, receipt kept.
  async reverse(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    paymentId: string,
    reversal: z.infer<typeof paymentReversalInputSchema>,
  ) {
    const scope = await lockPaymentAuthority(tx, actor, branchId, stayId, this.clock);
    if (scope.actorRole !== 'owner')
      throw new DomainError('FORBIDDEN', 403, 'Only the hostel Owner can reverse a payment');
    return reverseResidentPayment(
      tx,
      {
        scope: { branchId, stayId, actorUserId: actor.userId, actorRole: 'owner' },
        paymentId,
        reversal,
      },
      this.clock(),
    );
  }
  // CHG-053: Owner-only cancel & reissue of a wholly unpaid bill; the old bill stays voided.
  async reissue(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    invoiceId: string,
    reissue: InvoiceReissueInput,
  ) {
    const scope = await lockPaymentAuthority(tx, actor, branchId, stayId, this.clock);
    if (scope.actorRole !== 'owner')
      throw new DomainError('FORBIDDEN', 403, 'Only the hostel Owner can cancel a bill');
    return reissueResidentInvoice(
      tx,
      {
        scope: { branchId, stayId, actorUserId: actor.userId, actorRole: 'owner' },
        invoiceId,
        reissue,
      },
      this.clock(),
    );
  }
}
