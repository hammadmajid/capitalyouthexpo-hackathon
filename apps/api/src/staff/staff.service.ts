import { and, asc, desc, eq, gt, ilike, isNull, lte, sql } from 'drizzle-orm';
import {
  staffAgreements,
  staffMembers,
  staffSalaryPayments,
  staffSalaryTerms,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  staffCreateInputSchema,
  staffDashboardSchema,
  staffDetailSchema,
  staffMemberSchema,
  staffMonthQuerySchema,
  staffPageSchema,
  staffQuerySchema,
  staffStatusInputSchema,
  staffUpdateInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import {
  canPayroll,
  ensureMonth,
  lockStaff,
  salaryRows,
  staffScope,
  toSalary,
} from './staff-read.js';
import { coversMonth, karachiToday, monthOf, touchesMonth } from './staff-rules.js';
import { paymentView } from './staff-payroll.service.js';
import { staffDueFilter } from './staff-due-filter.js';
const id = stayIdentifierSchema;
type Staff = typeof staffMembers.$inferSelect;
function member(staff: Staff, salary: ReturnType<typeof toSalary> | null) {
  return staffMemberSchema.parse({
    id: staff.id,
    branchId: staff.branchId,
    fullName: staff.fullName,
    phone: staff.phone,
    jobTitle: staff.jobTitle,
    customTitle: staff.customTitle,
    startsOn: staff.startsOn,
    endsOn: staff.endsOn,
    status: staff.status,
    version: staff.version,
    salary,
  });
}
// CHG-039: branch staff directory. Staff never become users or Managers.
export class StaffService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  list(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = staffQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await staffScope(tx, actor, branch, false, this.clock);
      const payroll = await canPayroll(tx, actor, branch);
      if (input.salary && !payroll)
        throw new DomainError('FORBIDDEN', 403, 'Payroll access required');
      const today = karachiToday(this.clock()),
        month = input.month ?? monthOf(today);
      const pattern = input.q ? '%' + input.q.replace(/[\\%_]/g, '\\$&') + '%' : undefined;
      const rows = await tx
        .select()
        .from(staffMembers)
        .where(
          and(
            eq(staffMembers.branchId, branch),
            isNull(staffMembers.archivedAt),
            input.status ? eq(staffMembers.status, input.status) : undefined,
            input.jobTitle ? eq(staffMembers.jobTitle, input.jobTitle) : undefined,
            input.salary === 'due' ? staffDueFilter(tx, branch, today) : undefined,
            pattern ? ilike(staffMembers.fullName, pattern) : undefined,
            input.cursor ? gt(staffMembers.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(staffMembers.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      let salaries = new Map<string, ReturnType<typeof toSalary>>();
      if (payroll && page.length) {
        await ensureMonth(tx, branch, month, today);
        const found = await salaryRows(tx, branch, { month, staffIds: page.map((s) => s.id) });
        salaries = new Map(found.map((row) => [row.staffId, toSalary(row, today)]));
      }
      return staffPageSchema.parse({
        data: page.map((staff) => member(staff, salaries.get(staff.id) ?? null)),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
        payroll,
      });
    });
  }
  detail(actor: Actor, branchId: unknown, staffId: unknown) {
    const branch = id.parse(branchId),
      staffKey = id.parse(staffId);
    return this.database.transaction(async (tx) => {
      await staffScope(tx, actor, branch, false, this.clock);
      const payroll = await canPayroll(tx, actor, branch);
      const staff = await lockStaff(tx, branch, staffKey);
      const today = karachiToday(this.clock());
      if (payroll) await ensureMonth(tx, branch, monthOf(today), today);
      const salaries = payroll
        ? (await salaryRows(tx, branch, { staffIds: [staffKey] })).map((r) => toSalary(r, today))
        : [];
      const agreements = await tx
        .select()
        .from(staffAgreements)
        .where(eq(staffAgreements.staffId, staffKey))
        .orderBy(desc(staffAgreements.version))
        .limit(50);
      return staffDetailSchema.parse({
        staff: member(staff, salaries.find((s) => s.month === monthOf(today)) ?? null),
        payroll,
        terms: payroll ? await this.terms(tx, staffKey) : [],
        salaries: salaries.slice(0, 60),
        payments: payroll ? await this.payments(tx, staffKey) : [],
        // staff_manage alone sees only nonfinancial agreement metadata.
        agreements: agreements.map((a) => ({
          id: a.id,
          version: a.version,
          title: a.title,
          effectiveOn: a.effectiveOn,
          createdAt: a.createdAt.toISOString(),
          body: payroll ? a.body : null,
          termsId: payroll ? a.termsId : null,
          hasFile: payroll ? a.fileId !== null : false,
        })),
      });
    });
  }
  private async terms(tx: Transaction, staffId: string) {
    const rows = await tx
      .select()
      .from(staffSalaryTerms)
      .where(eq(staffSalaryTerms.staffId, staffId))
      .orderBy(desc(staffSalaryTerms.version))
      .limit(100);
    return rows.map((t) => ({
      id: t.id,
      version: t.version,
      amountPaisa: Number(t.amountPaisa),
      dueDay: t.dueDay,
      effectiveFrom: t.effectiveFrom,
      createdAt: t.createdAt.toISOString(),
    }));
  }
  private async payments(tx: Transaction, staffId: string) {
    const rows = await tx
      .select()
      .from(staffSalaryPayments)
      .where(eq(staffSalaryPayments.staffId, staffId))
      .orderBy(desc(staffSalaryPayments.recordedAt))
      .limit(200);
    const reversed = new Set(rows.map((r) => r.reversesPaymentId).filter(Boolean));
    return rows.map((r) => paymentView(r, reversed.has(r.id)));
  }
  dashboard(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = staffMonthQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await staffScope(tx, actor, branch, false, this.clock);
      const payroll = await canPayroll(tx, actor, branch);
      const today = karachiToday(this.clock()),
        month = input.month ?? monthOf(today);
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(staffMembers)
        .where(
          and(
            eq(staffMembers.branchId, branch),
            eq(staffMembers.status, 'active'),
            isNull(staffMembers.archivedAt),
          ),
        );
      return staffDashboardSchema.parse({
        branchId: branch,
        month,
        today,
        activeStaff: count?.value ?? 0,
        payroll: payroll ? await this.money(tx, branch, month, today) : null,
      });
    });
  }
  private async money(tx: Transaction, branch: string, month: string, today: string) {
    await ensureMonth(tx, branch, month, today);
    const salaries = (await salaryRows(tx, branch, { month })).map((r) => toSalary(r, today));
    const recent = await tx
      .select({ payment: staffSalaryPayments, staffName: staffMembers.fullName })
      .from(staffSalaryPayments)
      .innerJoin(staffMembers, eq(staffMembers.id, staffSalaryPayments.staffId))
      .where(eq(staffSalaryPayments.branchId, branch))
      .orderBy(desc(staffSalaryPayments.recordedAt))
      .limit(10);
    const issued = new Set(salaries.map((s) => s.staffId));
    const needsAmount = await this.needsAmount(tx, branch, month, issued);
    const sum = (pick: (s: (typeof salaries)[number]) => number) =>
      salaries.reduce((total, s) => total + BigInt(pick(s)), 0n);
    return {
      paid: salaries.filter((s) => s.timing === 'paid').length,
      unpaid: salaries.filter((s) => s.timing === 'unpaid').length,
      due: salaries.filter((s) => s.timing === 'due').length,
      overdue: salaries.filter((s) => s.timing === 'overdue').length,
      partial: salaries.filter((s) => s.partial).length,
      needsAmount,
      expectedPaisa: Number(sum((s) => s.amountPaisa)),
      paidPaisa: Number(sum((s) => s.paidPaisa)),
      outstandingPaisa: Number(sum((s) => s.outstandingPaisa)),
      recentPayments: recent.map((r) => ({
        ...paymentView(r.payment, false),
        staffId: r.payment.staffId,
        staffName: r.staffName,
      })),
    };
  }
  // Active staff with terms whose employment only partly covers the month.
  private async needsAmount(tx: Transaction, branch: string, month: string, issued: Set<string>) {
    const rows = await tx
      .select({ id: staffMembers.id, startsOn: staffMembers.startsOn, endsOn: staffMembers.endsOn })
      .from(staffMembers)
      .innerJoin(staffSalaryTerms, eq(staffSalaryTerms.staffId, staffMembers.id))
      .where(
        and(
          eq(staffMembers.branchId, branch),
          eq(staffMembers.status, 'active'),
          isNull(staffMembers.archivedAt),
          lte(staffSalaryTerms.effectiveFrom, month),
        ),
      )
      .groupBy(staffMembers.id)
      .limit(500);
    return rows.filter(
      (r) =>
        !issued.has(r.id) &&
        touchesMonth(r.startsOn, r.endsOn, month) &&
        !coversMonth(r.startsOn, r.endsOn, month),
    ).length;
  }
  create(actor: Actor, key: unknown, branchId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      input = staffCreateInputSchema.parse(body);
    const payroll = input.salary !== undefined;
    return this.idempotency.execute(
      { actor, key: id.parse(key), endpoint: 'POST branch staff', status: 201 },
      { branch },
      input,
      staffMemberSchema,
      async (tx) => Boolean(await staffScope(tx, actor, branch, payroll, this.clock)),
      async () => {
        const tx = requireTransaction(),
          scope = await staffScope(tx, actor, branch, payroll, this.clock),
          now = this.clock();
        const [staff] = await tx
          .insert(staffMembers)
          .values({
            organizationId: scope.organizationId,
            branchId: branch,
            fullName: input.fullName,
            phone: input.phone ?? null,
            jobTitle: input.jobTitle,
            customTitle: input.customTitle ?? null,
            startsOn: input.startsOn,
            createdByUserId: actor.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!staff) throw new DomainError('INTERNAL', 500, 'Staff not saved');
        if (input.salary)
          await tx.insert(staffSalaryTerms).values({
            staffId: staff.id,
            branchId: branch,
            version: 1,
            amountPaisa: BigInt(input.salary.amountPaisa),
            dueDay: input.salary.dueDay,
            effectiveFrom: input.salary.effectiveFrom,
            createdByUserId: actor.userId,
            createdAt: now,
          });
        await this.audit.hostel(tx, {
          organizationId: scope.organizationId,
          branchId: branch,
          actorUserId: actor.userId,
          actorRole: scope.actorRole,
          action: 'staff.created',
          targetType: 'staff_member',
          targetId: staff.id,
          before: null,
          after: { jobTitle: staff.jobTitle, salaryTerms: Boolean(input.salary) },
          createdAt: now,
        });
        return member(staff, null);
      },
    );
  }
  update(actor: Actor, key: unknown, branchId: unknown, staffId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      staffKey = id.parse(staffId),
      input = staffUpdateInputSchema.parse(body);
    return this.change(actor, key, branch, staffKey, 'PATCH staff', input, (staff) => {
      const jobTitle = input.jobTitle ?? staff.jobTitle;
      return {
        fullName: input.fullName ?? staff.fullName,
        phone: input.phone === undefined ? staff.phone : input.phone,
        jobTitle,
        customTitle:
          jobTitle === 'other'
            ? input.customTitle === undefined
              ? staff.customTitle
              : input.customTitle
            : null,
        startsOn: input.startsOn ?? staff.startsOn,
      };
    });
  }
  setStatus(actor: Actor, key: unknown, branchId: unknown, staffId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      staffKey = id.parse(staffId),
      input = staffStatusInputSchema.parse(body);
    return this.change(actor, key, branch, staffKey, 'POST staff status', input, (staff) => {
      if (input.endsOn && input.endsOn < staff.startsOn)
        throw new DomainError('VALIDATION_FAILED', 400, 'Last day is before the start date');
      return {
        status: input.status,
        endsOn: input.status === 'ended' ? (input.endsOn ?? null) : staff.endsOn,
      };
    });
  }
  // History is kept: rows are versioned and audited, never deleted.
  private change(
    actor: Actor,
    key: unknown,
    branch: string,
    staffKey: string,
    endpoint: string,
    input: { expectedVersion: number },
    next: (staff: Staff) => Partial<Staff>,
  ) {
    return this.idempotency.execute(
      { actor, key: id.parse(key), endpoint, status: 200 },
      { branch, staffKey },
      input,
      staffMemberSchema,
      async (tx) => Boolean(await staffScope(tx, actor, branch, false, this.clock)),
      async () => {
        const tx = requireTransaction(),
          scope = await staffScope(tx, actor, branch, false, this.clock),
          now = this.clock();
        const staff = await lockStaff(tx, branch, staffKey);
        if (staff.version !== input.expectedVersion)
          throw new DomainError(
            'CONFLICT',
            409,
            'This staff record changed. Refresh and try again',
          );
        const values = next(staff);
        const [saved] = await tx
          .update(staffMembers)
          .set({ ...values, version: staff.version + 1, updatedAt: now })
          .where(eq(staffMembers.id, staff.id))
          .returning();
        if (!saved) throw new DomainError('INTERNAL', 500, 'Staff not saved');
        await this.audit.hostel(tx, {
          organizationId: scope.organizationId,
          branchId: branch,
          actorUserId: actor.userId,
          actorRole: scope.actorRole,
          action: endpoint === 'PATCH staff' ? 'staff.updated' : 'staff.status_changed',
          targetType: 'staff_member',
          targetId: staff.id,
          before: { version: staff.version, status: staff.status, jobTitle: staff.jobTitle },
          after: { version: saved.version, status: saved.status, jobTitle: saved.jobTitle },
          createdAt: now,
        });
        return member(saved, null);
      },
    );
  }
}
