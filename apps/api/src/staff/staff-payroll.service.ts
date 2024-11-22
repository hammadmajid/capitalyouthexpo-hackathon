import { and, eq, max } from 'drizzle-orm';
import {
  staffAgreements,
  staffSalaries,
  staffSalaryPayments,
  staffSalaryTerms,
  type Database,
} from '@hsm/db';
import type { PrivateStorage } from '@hsm/files';
import {
  DomainError,
  staffAgreementFileSchema,
  staffAgreementInputSchema,
  staffAgreementSchema,
  staffIssueInputSchema,
  staffPaymentInputSchema,
  staffPaymentSchema,
  staffReversalInputSchema,
  staffSalarySchema,
  staffSalaryTermsInputSchema,
  staffTermsSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { cleanAgreementFile } from '../stay/agreement-document.scope.js';
import { lockStaff, salaryRows, staffScope, termsFor, toSalary } from './staff-read.js';
import { coversMonth, dueOnFor, karachiToday, monthOf, touchesMonth } from './staff-rules.js';
const id = stayIdentifierSchema;
type Payment = typeof staffSalaryPayments.$inferSelect;
export function paymentView(row: Payment, reversed: boolean) {
  return staffPaymentSchema.parse({
    id: row.id,
    salaryId: row.salaryId,
    kind: row.kind,
    amountPaisa: Number(row.amountPaisa),
    paidOn: row.paidOn,
    method: row.method,
    reference: row.reference,
    note: row.note,
    reversesPaymentId: row.reversesPaymentId,
    reversed,
    recordedAt: row.recordedAt.toISOString(),
  });
}
// CHG-039: salary terms, obligations, record-only payments and agreements. Every command
// needs staff_manage + staff_payroll_manage (the Owner always has both) and is audited.
export class StaffPayrollService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly storage: Pick<PrivateStorage, 'presignDownload'>,
    private readonly bucket: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  private command<T>(
    actor: Actor,
    key: unknown,
    endpoint: string,
    scope: Record<string, string>,
    input: unknown,
    schema: Parameters<IdempotencyService['execute']>[3],
    branch: string,
    work: (tx: Transaction, organizationId: string, role: 'owner' | 'manager') => Promise<T>,
  ) {
    return this.idempotency.execute(
      { actor, key: id.parse(key), endpoint, status: 200 },
      scope,
      input,
      schema,
      async (tx) => Boolean(await staffScope(tx, actor, branch, true, this.clock)),
      async () => {
        const tx = requireTransaction();
        const access = await staffScope(tx, actor, branch, true, this.clock);
        return work(tx, access.organizationId, access.actorRole);
      },
    );
  }
  private record(
    tx: Transaction,
    actor: Actor,
    organizationId: string,
    branchId: string,
    role: 'owner' | 'manager',
    action: string,
    targetId: string,
    after: Record<string, unknown>,
  ) {
    return this.audit.hostel(tx, {
      organizationId,
      branchId,
      actorUserId: actor.userId,
      actorRole: role,
      action,
      targetType: 'staff_member',
      targetId,
      before: null,
      after,
      createdAt: this.clock(),
    });
  }
  // New terms apply from their month on; months already issued keep their amount.
  setTerms(actor: Actor, key: unknown, branchId: unknown, staffId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      staffKey = id.parse(staffId),
      input = staffSalaryTermsInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST staff terms',
      { branch, staffKey },
      input,
      staffTermsSchema,
      branch,
      async (tx, org, role) => {
        const staff = await lockStaff(tx, branch, staffKey);
        const [issued] = await tx
          .select({ month: max(staffSalaries.month) })
          .from(staffSalaries)
          .where(eq(staffSalaries.staffId, staff.id));
        if (issued?.month && input.effectiveFrom <= issued.month)
          throw new DomainError(
            'CONFLICT',
            409,
            'Salary for that month is already issued; start the new salary from a later month',
          );
        const [last] = await tx
          .select({ version: max(staffSalaryTerms.version) })
          .from(staffSalaryTerms)
          .where(eq(staffSalaryTerms.staffId, staff.id));
        const [terms] = await tx
          .insert(staffSalaryTerms)
          .values({
            staffId: staff.id,
            branchId: branch,
            version: (last?.version ?? 0) + 1,
            amountPaisa: BigInt(input.amountPaisa),
            dueDay: input.dueDay,
            effectiveFrom: input.effectiveFrom,
            createdByUserId: actor.userId,
            createdAt: this.clock(),
          })
          .onConflictDoNothing()
          .returning();
        if (!terms)
          throw new DomainError(
            'CONFLICT',
            409,
            'Salary for that month is already set; choose another month',
          );
        await this.record(tx, actor, org, branch, role, 'staff.salary_terms.created', staff.id, {
          version: terms.version,
          amountPaisa: input.amountPaisa,
          dueDay: input.dueDay,
          effectiveFrom: input.effectiveFrom,
        });
        return staffTermsSchema.parse({
          id: terms.id,
          version: terms.version,
          amountPaisa: Number(terms.amountPaisa),
          dueDay: terms.dueDay,
          effectiveFrom: terms.effectiveFrom,
          createdAt: terms.createdAt.toISOString(),
        });
      },
    );
  }
  // A month the employment only partly covers needs an explicit amount (zero allowed).
  issue(actor: Actor, key: unknown, branchId: unknown, staffId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      staffKey = id.parse(staffId),
      input = staffIssueInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST staff salary issue',
      { branch, staffKey },
      input,
      staffSalarySchema,
      branch,
      async (tx, org, role) => {
        const staff = await lockStaff(tx, branch, staffKey);
        const today = karachiToday(this.clock());
        if (input.month > monthOf(today))
          throw new DomainError('VALIDATION_FAILED', 400, 'Future months cannot be issued yet');
        if (
          !touchesMonth(staff.startsOn, staff.endsOn, input.month) ||
          coversMonth(staff.startsOn, staff.endsOn, input.month)
        )
          throw new DomainError('CONFLICT', 409, 'Only a partly worked month needs a set amount');
        const terms = await termsFor(tx, staff.id, input.month);
        if (!terms) throw new DomainError('CONFLICT', 409, 'Set a monthly salary first');
        if (BigInt(input.amountPaisa) > terms.amountPaisa)
          throw new DomainError('VALIDATION_FAILED', 400, 'Amount is more than the monthly salary');
        const [salary] = await tx
          .insert(staffSalaries)
          .values({
            staffId: staff.id,
            branchId: branch,
            termsId: terms.id,
            month: input.month,
            amountPaisa: BigInt(input.amountPaisa),
            dueOn: dueOnFor(input.month, terms.dueDay),
            explicitByUserId: actor.userId,
          })
          .onConflictDoNothing({ target: [staffSalaries.staffId, staffSalaries.month] })
          .returning();
        if (!salary)
          throw new DomainError('CONFLICT', 409, 'Salary for this month is already issued');
        await this.record(tx, actor, org, branch, role, 'staff.salary.issued', staff.id, {
          month: input.month,
          amountPaisa: input.amountPaisa,
        });
        const [row] = await salaryRows(tx, branch, { salaryId: salary.id });
        if (!row) throw new DomainError('INTERNAL', 500, 'Salary unavailable');
        return toSalary(row, today);
      },
    );
  }
  // Locks the obligation, so concurrent payments can never exceed what is owed.
  pay(actor: Actor, key: unknown, branchId: unknown, salaryId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      salaryKey = id.parse(salaryId),
      input = staffPaymentInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST staff salary payment',
      { branch, salaryKey },
      input,
      staffSalarySchema,
      branch,
      async (tx, org, role) => {
        const salary = await this.lockSalary(tx, branch, salaryKey);
        const today = karachiToday(this.clock());
        if (input.paidOn > today)
          throw new DomainError('VALIDATION_FAILED', 400, 'Payment date cannot be in the future');
        const before = toSalary(await this.row(tx, branch, salary.id), today);
        if (input.amountPaisa > before.outstandingPaisa)
          throw new DomainError(
            'VALIDATION_FAILED',
            400,
            'Amount is more than the outstanding salary of PKR ' + before.outstandingPaisa / 100,
          );
        const [payment] = await tx
          .insert(staffSalaryPayments)
          .values({
            salaryId: salary.id,
            staffId: salary.staffId,
            branchId: branch,
            kind: 'payment',
            amountPaisa: BigInt(input.amountPaisa),
            paidOn: input.paidOn,
            method: input.method,
            reference: input.reference ?? null,
            note: input.note ?? null,
            recordedByUserId: actor.userId,
            recordedAt: this.clock(),
          })
          .returning();
        if (!payment) throw new DomainError('INTERNAL', 500, 'Payment not saved');
        await this.record(
          tx,
          actor,
          org,
          branch,
          role,
          'staff.salary.payment_recorded',
          salary.staffId,
          {
            salaryId: salary.id,
            paymentId: payment.id,
            amountPaisa: input.amountPaisa,
            method: input.method,
          },
        );
        return toSalary(await this.row(tx, branch, salary.id), today);
      },
    );
  }
  // A correction adds a reversal row; the original payment stays in history.
  reverse(actor: Actor, key: unknown, branchId: unknown, paymentId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      paymentKey = id.parse(paymentId),
      input = staffReversalInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST staff payment reversal',
      { branch, paymentKey },
      input,
      staffSalarySchema,
      branch,
      async (tx, org, role) => {
        const [original] = await tx
          .select()
          .from(staffSalaryPayments)
          .where(
            and(
              eq(staffSalaryPayments.id, paymentKey),
              eq(staffSalaryPayments.branchId, branch),
              eq(staffSalaryPayments.kind, 'payment'),
            ),
          );
        if (!original) throw new DomainError('NOT_FOUND', 404, 'Payment unavailable');
        const salary = await this.lockSalary(tx, branch, original.salaryId);
        const [reversal] = await tx
          .insert(staffSalaryPayments)
          .values({
            salaryId: salary.id,
            staffId: salary.staffId,
            branchId: branch,
            kind: 'reversal',
            amountPaisa: original.amountPaisa,
            paidOn: karachiToday(this.clock()),
            method: original.method,
            note: input.reason,
            reversesPaymentId: original.id,
            recordedByUserId: actor.userId,
            recordedAt: this.clock(),
          })
          .onConflictDoNothing()
          .returning();
        if (!reversal) throw new DomainError('CONFLICT', 409, 'This payment is already reversed');
        await this.record(
          tx,
          actor,
          org,
          branch,
          role,
          'staff.salary.payment_reversed',
          salary.staffId,
          {
            paymentId: original.id,
            reversalId: reversal.id,
            reason: input.reason,
          },
        );
        return toSalary(await this.row(tx, branch, salary.id), karachiToday(this.clock()));
      },
    );
  }
  agreement(actor: Actor, key: unknown, branchId: unknown, staffId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      staffKey = id.parse(staffId),
      input = staffAgreementInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST staff agreement',
      { branch, staffKey },
      input,
      staffAgreementSchema,
      branch,
      async (tx, org, role) => {
        const staff = await lockStaff(tx, branch, staffKey);
        const file = input.fileId
          ? await cleanAgreementFile(tx, input.fileId, 'staff_agreement', this.bucket, actor.userId)
          : undefined;
        const terms = await termsFor(tx, staff.id, monthOf(input.effectiveOn));
        const [last] = await tx
          .select({ version: max(staffAgreements.version) })
          .from(staffAgreements)
          .where(eq(staffAgreements.staffId, staff.id));
        const [saved] = await tx
          .insert(staffAgreements)
          .values({
            staffId: staff.id,
            branchId: branch,
            version: (last?.version ?? 0) + 1,
            title: input.title,
            body: input.body,
            effectiveOn: input.effectiveOn,
            termsId: terms?.id ?? null,
            fileId: file?.id ?? null,
            createdByUserId: actor.userId,
            createdAt: this.clock(),
          })
          .returning();
        if (!saved) throw new DomainError('INTERNAL', 500, 'Agreement not saved');
        await this.record(tx, actor, org, branch, role, 'staff.agreement.created', staff.id, {
          agreementId: saved.id,
          version: saved.version,
          hasFile: Boolean(file),
        });
        return staffAgreementSchema.parse({
          id: saved.id,
          version: saved.version,
          title: saved.title,
          effectiveOn: saved.effectiveOn,
          createdAt: saved.createdAt.toISOString(),
          body: saved.body,
          termsId: saved.termsId,
          hasFile: saved.fileId !== null,
        });
      },
    );
  }
  // Short-lived private download; every view is written to the sensitive-access log.
  agreementFile(actor: Actor, branchId: unknown, agreementId: unknown) {
    const branch = id.parse(branchId),
      agreementKey = id.parse(agreementId);
    return this.database.transaction(async (tx) => {
      await staffScope(tx, actor, branch, true, this.clock);
      const [agreement] = await tx
        .select()
        .from(staffAgreements)
        .where(and(eq(staffAgreements.id, agreementKey), eq(staffAgreements.branchId, branch)));
      if (!agreement?.fileId) throw new DomainError('NOT_FOUND', 404, 'Agreement file unavailable');
      const file = await cleanAgreementFile(tx, agreement.fileId, 'staff_agreement', this.bucket);
      await this.audit.sensitive(tx, {
        actorUserId: actor.userId,
        subjectUserId: null,
        resource: 'private_document',
        resourceId: file.id,
        purpose: 'Staff agreement review',
        createdAt: this.clock(),
      });
      let url: string;
      try {
        url = await this.storage.presignDownload(file.objectKey, file.id, file.mimeType);
      } catch {
        throw new DomainError('INTERNAL', 503, 'Storage unavailable');
      }
      return staffAgreementFileSchema.parse({
        url,
        expiresAt: new Date(this.clock().getTime() + 60000).toISOString(),
      });
    });
  }
  private async lockSalary(tx: Transaction, branch: string, salaryId: string) {
    const [salary] = await tx
      .select()
      .from(staffSalaries)
      .where(and(eq(staffSalaries.id, salaryId), eq(staffSalaries.branchId, branch)))
      .for('update');
    if (!salary) throw new DomainError('NOT_FOUND', 404, 'Salary unavailable');
    return salary;
  }
  private async row(tx: Transaction, branch: string, salaryId: string) {
    const [row] = await salaryRows(tx, branch, { salaryId });
    if (!row) throw new DomainError('INTERNAL', 500, 'Salary unavailable');
    return row;
  }
}
