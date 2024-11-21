import { and, asc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { staffMembers, staffSalaries, staffSalaryPayments } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { coversMonth, dueOnFor } from '../staff/staff-rules.js';
import { termsFor } from '../staff/staff-read.js';
// Reuse salary rules without calling ensureMonth: dashboard GET must never issue money.
export async function dashboardSalaryDue(tx: Transaction, branchId: string, today: string) {
  const payments = tx
    .select({
      id: staffSalaryPayments.salaryId,
      net: sql<string>`sum(case when ${staffSalaryPayments.kind} = 'payment' then ${staffSalaryPayments.amountPaisa} else -${staffSalaryPayments.amountPaisa} end)`.as(
        'net',
      ),
    })
    .from(staffSalaryPayments)
    .where(eq(staffSalaryPayments.branchId, branchId))
    .groupBy(staffSalaryPayments.salaryId)
    .as('paid');
  const [salary] = await tx
    .select({
      due: sql<string>`coalesce(sum(greatest(${staffSalaries.amountPaisa} - coalesce(${payments.net}, 0), 0)), 0)`,
    })
    .from(staffSalaries)
    .leftJoin(payments, eq(payments.id, staffSalaries.id))
    .where(and(eq(staffSalaries.branchId, branchId), lte(staffSalaries.dueOn, today)));
  let due = BigInt(salary?.due ?? '0');
  const month = today.slice(0, 7) + '-01';
  let cursor: string | undefined;
  for (;;) {
    const staff = await tx
      .select({
        id: staffMembers.id,
        startsOn: staffMembers.startsOn,
        endsOn: staffMembers.endsOn,
        salaryId: staffSalaries.id,
      })
      .from(staffMembers)
      .leftJoin(
        staffSalaries,
        and(eq(staffSalaries.staffId, staffMembers.id), eq(staffSalaries.month, month)),
      )
      .where(
        and(
          eq(staffMembers.branchId, branchId),
          eq(staffMembers.status, 'active'),
          isNull(staffMembers.archivedAt),
          cursor ? gt(staffMembers.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(staffMembers.id))
      .limit(100);
    for (const member of staff) {
      if (member.salaryId || !coversMonth(member.startsOn, member.endsOn, month)) continue;
      const terms = await termsFor(tx, member.id, month);
      if (terms && dueOnFor(month, terms.dueDay) <= today) due += terms.amountPaisa;
    }
    if (staff.length < 100) return due;
    cursor = staff.at(-1)?.id;
  }
}
