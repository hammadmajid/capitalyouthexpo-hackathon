import { and, eq, inArray, or } from 'drizzle-orm';
import {
  bookingPaymentProofs,
  branches,
  files,
  hostelAuditLog,
  organizations,
  readResidentInvoiceBalance,
  recordExternalResidentPayment,
  residentPaymentProofInvoices,
  residentPaymentProofs,
  residentPayments,
  stays,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  databaseDateSchema,
  type ProofReviewInput,
  type ResidentProofInput,
} from '@hsm/contracts';
import { NotificationProducer } from '@hsm/notifications';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
import { lockPaymentAuthority } from './payment.scope.js';
import { requireProofSecurity } from './proof-security.js';
import {
  projectProof,
  proofOrder,
  proofPageFilter,
  proofSelect,
  withCovered,
} from './proof-reads.js';
const OPEN = ['issued', 'partially_paid', 'overdue'];
function karachiToday(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
export class ResidentProofRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly notices = new NotificationProducer(),
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  // ACC-004 / SEC-003: only the resident's own clean, unused private payment proof.
  private async ownFile(tx: Transaction, actor: Actor, fileId: string) {
    const [file] = await tx
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.uploadedBy, actor.userId),
          eq(files.bucket, this.bucket),
          eq(files.visibility, 'private'),
          eq(files.purpose, 'payment_proof'),
          eq(files.scanStatus, 'clean'),
        ),
      )
      .for('update');
    if (
      !file ||
      file.sha256?.length !== 32 ||
      !file.objectKey.startsWith('private/payment_proof/' + fileId + '/')
    )
      throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    const [used] = await tx
      .select({ id: residentPaymentProofs.id })
      .from(residentPaymentProofs)
      .where(eq(residentPaymentProofs.fileId, fileId))
      .union(
        tx
          .select({ id: bookingPaymentProofs.id })
          .from(bookingPaymentProofs)
          .where(eq(bookingPaymentProofs.fileId, fileId)),
      )
      .union(
        tx
          .select({ id: residentPayments.id })
          .from(residentPayments)
          .where(eq(residentPayments.proofFileId, fileId)),
      );
    if (used) conflict('This proof file was already submitted');
  }
  async invoiceBalance(tx: Transaction, branchId: string, stayId: string, invoiceId: string) {
    return readResidentInvoiceBalance(tx, {
      branchId,
      stayId,
      invoiceId,
      today: karachiToday(this.clock()),
    });
  }
  // PAY-001..003: submission records evidence only; balances change only on approval.
  // CHG-050: one proof may also pay other open bills of the same Stay (e.g. transport).
  async submit(tx: Transaction, actor: Actor, stayId: string, input: ResidentProofInput) {
    const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock, undefined, 'update');
    // Submissions for one Stay run one at a time, so a bill is never in two open proofs.
    await tx
      .select({ id: stays.id })
      .from(stays)
      .where(and(eq(stays.id, stayId), eq(stays.branchId, stay.branchId)))
      .for('update');
    const bills = [...(input.invoiceId ? [input.invoiceId] : []), ...(input.alsoInvoiceIds ?? [])];
    let outstanding = 0n;
    for (const invoiceId of bills) {
      const balance = await this.invoiceBalance(tx, stay.branchId, stayId, invoiceId);
      if (!OPEN.includes(balance.state)) conflict('This invoice has nothing outstanding');
      outstanding += BigInt(balance.outstandingPaisa);
    }
    if (BigInt(input.amountPaisa) > outstanding + BigInt(input.depositPaisa ?? 0))
      conflict('Payment exceeds selected bills and security deposit. Refresh payments.');
    await requireProofSecurity(tx, stay.branchId, stayId, input.depositPaisa ?? 0, this.clock());
    await this.ownFile(tx, actor, input.fileId);
    if (await this.openProofFor(tx, stay.branchId, bills))
      conflict('A payment proof for this invoice is already awaiting review');
    const now = this.clock();
    const [proof] = await tx
      .insert(residentPaymentProofs)
      .values({
        branchId: stay.branchId,
        stayId,
        invoiceId: input.invoiceId ?? null,
        submittedByUserId: actor.userId,
        fileId: input.fileId,
        amountPaisa: BigInt(input.amountPaisa),
        depositPaisa: BigInt(input.depositPaisa ?? 0),
        method: input.method,
        paidOn: input.paidOn,
        reference: input.reference ?? null,
        createdAt: now,
      })
      .returning({ id: residentPaymentProofs.id });
    if (!proof) throw new DomainError('INTERNAL', 500, 'Payment proof unavailable');
    if (input.alsoInvoiceIds?.length)
      await tx.insert(residentPaymentProofInvoices).values(
        input.alsoInvoiceIds.map((invoiceId) => ({
          proofId: proof.id,
          branchId: stay.branchId,
          stayId,
          invoiceId,
        })),
      );
    const owner = await this.owner(tx, stay.branchId);
    await this.notices.enqueue(
      tx,
      { userId: owner, event: 'resident.payment_proof_submitted', operationId: proof.id },
      now,
    );
    return this.read(tx, stay.branchId, proof.id);
  }
  // Is any of these bills already in a proof that awaits review (as main or extra bill)?
  private async openProofFor(tx: Transaction, branchId: string, invoiceIds: string[]) {
    const [main] = await tx
      .select({ id: residentPaymentProofs.id })
      .from(residentPaymentProofs)
      .where(
        and(
          eq(residentPaymentProofs.branchId, branchId),
          eq(residentPaymentProofs.state, 'submitted'),
          inArray(residentPaymentProofs.invoiceId, invoiceIds),
        ),
      )
      .limit(1);
    if (main) return true;
    const [extra] = await tx
      .select({ id: residentPaymentProofs.id })
      .from(residentPaymentProofInvoices)
      .innerJoin(
        residentPaymentProofs,
        eq(residentPaymentProofs.id, residentPaymentProofInvoices.proofId),
      )
      .where(
        and(
          eq(residentPaymentProofInvoices.branchId, branchId),
          eq(residentPaymentProofs.state, 'submitted'),
          inArray(residentPaymentProofInvoices.invoiceId, invoiceIds),
        ),
      )
      .limit(1);
    return Boolean(extra);
  }
  // CHG-050: every bill a proof pays, main bill first.
  async billsOf(tx: Transaction, proof: { id: string; invoiceId: string | null }) {
    const extra = await tx
      .select({ invoiceId: residentPaymentProofInvoices.invoiceId })
      .from(residentPaymentProofInvoices)
      .where(eq(residentPaymentProofInvoices.proofId, proof.id));
    return [...(proof.invoiceId ? [proof.invoiceId] : []), ...extra.map((row) => row.invoiceId)];
  }
  private async owner(tx: Transaction, branchId: string) {
    const [row] = await tx
      .select({ userId: organizations.ownerUserId })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(eq(branches.id, branchId));
    if (!row) throw new DomainError('INTERNAL', 500, 'Branch owner unavailable');
    return row.userId;
  }
  async read(tx: Transaction, branchId: string, proofId: string) {
    const [row] = await proofSelect(tx).where(
      and(eq(residentPaymentProofs.branchId, branchId), eq(residentPaymentProofs.id, proofId)),
    );
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    const [covered] = await withCovered(tx, [row]);
    return covered ?? row;
  }
  ownPage(actor: Actor, stayId: string, cursor: string | undefined, limit: number) {
    return this.database.transaction(async (tx) => {
      const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock);
      const rows = await proofSelect(tx)
        .where(
          and(
            eq(residentPaymentProofs.branchId, stay.branchId),
            eq(residentPaymentProofs.stayId, stayId),
            proofPageFilter(cursor),
          ),
        )
        .orderBy(proofOrder)
        .limit(limit + 1);
      return withCovered(tx, rows);
    });
  }
  // PAY-004: the branch queue, newest first; finance_view in the exact branch.
  async queue(
    tx: Transaction,
    branchId: string,
    state: 'submitted' | 'approved' | 'rejected' | undefined,
    cursor: string | undefined,
    limit: number,
    stayId?: string,
  ) {
    const rows = await proofSelect(tx)
      .where(
        and(
          eq(residentPaymentProofs.branchId, branchId),
          state === undefined ? undefined : eq(residentPaymentProofs.state, state),
          stayId === undefined ? undefined : eq(residentPaymentProofs.stayId, stayId),
          proofPageFilter(cursor),
        ),
      )
      .orderBy(proofOrder)
      .limit(limit + 1);
    return withCovered(tx, rows);
  }
  // PAY-005..009 / ACC-004: review revalidates every fact inside one transaction. Approval
  // reuses the existing external-payment command (allocation, ledger, receipt, audit).
  async review(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    proofId: string,
    input: ProofReviewInput,
  ) {
    const [found] = await tx
      .select({ stayId: residentPaymentProofs.stayId })
      .from(residentPaymentProofs)
      .where(
        and(eq(residentPaymentProofs.branchId, branchId), eq(residentPaymentProofs.id, proofId)),
      );
    if (!found) throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    const scope = await lockPaymentAuthority(tx, actor, branchId, found.stayId, this.clock);
    const [proof] = await tx
      .select()
      .from(residentPaymentProofs)
      .where(
        and(eq(residentPaymentProofs.branchId, branchId), eq(residentPaymentProofs.id, proofId)),
      )
      .for('update');
    if (!proof || proof.stayId !== found.stayId)
      throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    if (proof.state !== 'submitted') conflict('This payment proof was already reviewed');
    const now = this.clock();
    let paymentId: string | null = null;
    if (input.decision === 'approve') {
      const deposit = Number(proof.depositPaisa ?? 0n);
      await requireProofSecurity(tx, branchId, proof.stayId, deposit, now, proof.id);
      // CHG-050: split one payment across every bill, oldest due first, up to each balance.
      const open = [];
      for (const invoiceId of await this.billsOf(tx, proof)) {
        const balance = await this.invoiceBalance(tx, branchId, proof.stayId, invoiceId);
        if (OPEN.includes(balance.state)) open.push({ invoiceId, balance });
      }
      if (!open.length && !deposit) conflict('This invoice no longer has an outstanding balance');
      const payable = open.reduce(
        (sum, row) => sum + BigInt(row.balance.outstandingPaisa),
        BigInt(deposit),
      );
      if (proof.amountPaisa > payable)
        conflict(
          'Payment exceeds the remaining bills and security. Reconcile the extra amount before approval.',
        );
      open.sort(
        (a, b) =>
          a.balance.dueDate.localeCompare(b.balance.dueDate) ||
          a.invoiceId.localeCompare(b.invoiceId),
      );
      const amount = proof.amountPaisa;
      let left = amount - BigInt(deposit);
      const allocations: { invoiceId: string; amountPaisa: number }[] = [];
      for (const { invoiceId, balance } of open) {
        const due = BigInt(balance.outstandingPaisa);
        const pay = left < due ? left : due;
        if (pay > 0n) allocations.push({ invoiceId, amountPaisa: Number(pay) });
        left -= pay;
      }
      const result = await recordExternalResidentPayment(
        tx,
        {
          scope: {
            branchId,
            stayId: proof.stayId,
            actorUserId: actor.userId,
            actorRole: scope.actorRole,
          },
          commandId: proof.id,
          payment: {
            amountPaisa: Number(amount),
            method: proof.method,
            ...(proof.reference ? { transactionReference: proof.reference } : {}),
            proofFileId: proof.fileId,
            paidOn: proof.paidOn,
            note: 'Approved resident payment proof',
            allocations,
            depositPaisa: deposit,
            // CHG-055: validation above guarantees no new excess credit.
            advanceCreditPaisa: Number(left),
          },
        },
        now,
        // CHG-009 / SEC-003: the exact submitted proof association, never a guessed uploader.
        async (_tx, _scope, fileId) => {
          if (fileId !== proof.fileId)
            throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
          await this.audit.sensitive(tx, {
            actorUserId: actor.userId,
            subjectUserId: proof.submittedByUserId,
            resource: 'private_document',
            resourceId: fileId,
            purpose: 'Resident payment proof approval',
            createdAt: now,
          });
        },
      );
      paymentId = result.paymentId;
    }
    await tx
      .update(residentPaymentProofs)
      .set({
        state: input.decision === 'approve' ? 'approved' : 'rejected',
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        reviewReason: input.decision === 'reject' ? input.reason : null,
        paymentId,
      })
      .where(eq(residentPaymentProofs.id, proof.id));
    await tx.insert(hostelAuditLog).values({
      organizationId: scope.organizationId,
      branchId,
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      action: input.decision === 'approve' ? 'payment.proof.approved' : 'payment.proof.rejected',
      targetType: 'resident_payment_proof',
      targetId: proof.id,
      after: {
        invoiceId: proof.invoiceId,
        invoiceIds: await this.billsOf(tx, proof),
        depositPaisa: Number(proof.depositPaisa ?? 0n),
        paymentId,
      },
      createdAt: now,
    });
    if (scope.userId !== null)
      await this.notices.enqueue(
        tx,
        input.decision === 'approve' && paymentId
          ? { userId: scope.userId, event: 'resident.payment_recorded', operationId: paymentId }
          : {
              userId: scope.userId,
              event: 'resident.payment_proof_rejected',
              operationId: proof.id,
            },
        now,
      );
    return this.read(tx, branchId, proof.id);
  }
  // SEC-003: reviewers read the private proof through a short-lived, audited link.
  async proofFile(tx: Transaction, actor: Actor, branchId: string, proofId: string) {
    const [row] = await tx
      .select({ proof: residentPaymentProofs, file: files })
      .from(residentPaymentProofs)
      .innerJoin(files, eq(files.id, residentPaymentProofs.fileId))
      .where(
        and(
          eq(residentPaymentProofs.branchId, branchId),
          eq(residentPaymentProofs.id, proofId),
          eq(files.scanStatus, 'clean'),
          eq(files.bucket, this.bucket),
          or(eq(files.purpose, 'payment_proof')),
        ),
      );
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    await this.audit.sensitive(tx, {
      actorUserId: actor.userId,
      subjectUserId: row.proof.submittedByUserId,
      resource: 'private_document',
      resourceId: row.file.id,
      purpose: 'Resident payment proof verification',
      createdAt: this.clock(),
    });
    return row.file;
  }
  projectRow = projectProof;
}
