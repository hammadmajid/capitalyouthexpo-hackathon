import { and, eq, exists, gt, isNull, lte, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { staffMembers, staffSalaries, staffSalaryPayments, staffSalaryTerms } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { monthEnd, monthOf } from './staff-rules.js';
// CHG-039: exact current projection + historical issued dues; predicate precedes paging.
export function staffDueFilter(tx: Transaction, branchId: string, today: string) {
  const newer = alias(staffSalaryTerms, 'newer_salary_terms');
  const month = monthOf(today);
  const unpaidIssued = exists(
    tx
      .select({ id: staffSalaries.id })
      .from(staffSalaries)
      .where(
        and(
          eq(staffSalaries.branchId, branchId),
          eq(staffSalaries.staffId, staffMembers.id),
          lte(staffSalaries.dueOn, today),
          sql`${staffSalaries.amountPaisa} > coalesce((select sum(case when ${staffSalaryPayments.kind} = 'payment' then ${staffSalaryPayments.amountPaisa} else -${staffSalaryPayments.amountPaisa} end) from ${staffSalaryPayments} where ${staffSalaryPayments.salaryId} = ${staffSalaries.id} and ${staffSalaryPayments.branchId} = ${branchId}),0)`,
        ),
      ),
  );
  const projected = and(
    eq(staffMembers.status, 'active'),
    isNull(staffMembers.archivedAt),
    lte(staffMembers.startsOn, month),
    or(isNull(staffMembers.endsOn), sql`${staffMembers.endsOn} >= ${monthEnd(month)}`),
    not(
      exists(
        tx
          .select({ id: staffSalaries.id })
          .from(staffSalaries)
          .where(
            and(
              eq(staffSalaries.branchId, branchId),
              eq(staffSalaries.staffId, staffMembers.id),
              eq(staffSalaries.month, month),
            ),
          ),
      ),
    ),
    exists(
      tx
        .select({ id: staffSalaryTerms.id })
        .from(staffSalaryTerms)
        .where(
          and(
            eq(staffSalaryTerms.branchId, branchId),
            eq(staffSalaryTerms.staffId, staffMembers.id),
            lte(staffSalaryTerms.effectiveFrom, month),
            lte(staffSalaryTerms.dueDay, Number(today.slice(-2))),
            not(
              exists(
                tx
                  .select({ id: newer.id })
                  .from(newer)
                  .where(
                    and(
                      eq(newer.staffId, staffMembers.id),
                      eq(newer.branchId, branchId),
                      lte(newer.effectiveFrom, month),
                      gt(newer.effectiveFrom, staffSalaryTerms.effectiveFrom),
                    ),
                  ),
              ),
            ),
          ),
        ),
    ),
  );
  return or(unpaidIssued, projected);
}
