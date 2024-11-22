import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { staffMembers, staffSalaries, staffSalaryPayments, staffSalaryTerms } from '@hsm/db';
import { DomainError, staffSalarySchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockStaffScope } from '../services/scope.js';
import { coversMonth, dueOnFor, salaryState } from './staff-rules.js';
type Reader = Pick<Transaction, 'select'>;
// CHG-039: directory needs staff_manage; money and agreements also need staff_payroll_manage.
export function staffScope(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  payroll: boolean,
  clock: () => Date,
) {
  return lockStaffScope(
    tx,
    actor,
    branchId,
    payroll ? ['staff_manage', 'staff_payroll_manage'] : ['staff_manage'],
    clock,
  );
}
export async function canPayroll(tx: Transaction, actor: Actor, branchId: string) {
  try {
    await lockInventoryScope(tx, actor, branchId, 'staff_payroll_manage');
    return true;
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return false;
    throw error;
  }
}
export async function lockStaff(tx: Transaction, branchId: string, staffId: string) {
  const [staff] = await tx
    .select()
    .from(staffMembers)
    .where(
      and(
        eq(staffMembers.id, staffId),
        eq(staffMembers.branchId, branchId),
        isNull(staffMembers.archivedAt),
      ),
    )
    .for('update');
  if (!staff) throw new DomainError('NOT_FOUND', 404, 'Staff member unavailable');
  return staff;
}
// The terms in force for a month: the latest version effective on or before it.
export async function termsFor(tx: Reader, staffId: string, month: string) {
  const [terms] = await tx
    .select()
    .from(staffSalaryTerms)
    .where(and(eq(staffSalaryTerms.staffId, staffId), lte(staffSalaryTerms.effectiveFrom, month)))
    .orderBy(desc(staffSalaryTerms.effectiveFrom))
    .limit(1);
  return terms;
}
// Idempotent: issues each full-month obligation once (unique staff+month); never invents a
// month without terms, never issues the future, never issues partial months on its own.
export async function ensureMonth(tx: Transaction, branchId: string, month: string, today: string) {
  if (month > today.slice(0, 7) + '-01') return;
  const staff = await tx
    .select()
    .from(staffMembers)
    .where(
      and(
        eq(staffMembers.branchId, branchId),
        eq(staffMembers.status, 'active'),
        isNull(staffMembers.archivedAt),
      ),
    )
    .limit(500);
  for (const member of staff) {
    if (!coversMonth(member.startsOn, member.endsOn, month)) continue;
    const terms = await termsFor(tx, member.id, month);
    if (!terms) continue;
    await tx
      .insert(staffSalaries)
      .values({
        staffId: member.id,
        branchId,
        termsId: terms.id,
        month,
        amountPaisa: terms.amountPaisa,
        dueOn: dueOnFor(month, terms.dueDay),
      })
      .onConflictDoNothing({ target: [staffSalaries.staffId, staffSalaries.month] });
  }
}
export async function salaryRows(
  tx: Reader,
  branchId: string,
  filter: { month?: string; staffIds?: string[]; salaryId?: string },
) {
  const net = sql<string>`coalesce(sum(case when ${staffSalaryPayments.kind} = 'payment'
 then ${staffSalaryPayments.amountPaisa} else -${staffSalaryPayments.amountPaisa} end), 0)`;
  return tx
    .select({
      id: staffSalaries.id,
      staffId: staffSalaries.staffId,
      month: staffSalaries.month,
      amountPaisa: staffSalaries.amountPaisa,
      dueOn: staffSalaries.dueOn,
      net,
    })
    .from(staffSalaries)
    .leftJoin(staffSalaryPayments, eq(staffSalaryPayments.salaryId, staffSalaries.id))
    .where(
      and(
        eq(staffSalaries.branchId, branchId),
        filter.month ? eq(staffSalaries.month, filter.month) : undefined,
        filter.staffIds ? inArray(staffSalaries.staffId, filter.staffIds) : undefined,
        filter.salaryId ? eq(staffSalaries.id, filter.salaryId) : undefined,
      ),
    )
    .groupBy(staffSalaries.id)
    .orderBy(desc(staffSalaries.month), asc(staffSalaries.id))
    .limit(500);
}
export function toSalary(row: Awaited<ReturnType<typeof salaryRows>>[number], today: string) {
  const net = BigInt(row.net);
  const state = salaryState(row.amountPaisa, net, row.dueOn, today);
  return staffSalarySchema.parse({
    id: row.id,
    staffId: row.staffId,
    month: row.month,
    amountPaisa: Number(row.amountPaisa),
    paidPaisa: Number(net),
    outstandingPaisa: Number(state.outstanding),
    dueOn: row.dueOn,
    timing: state.timing,
    partial: state.partial,
  });
}
