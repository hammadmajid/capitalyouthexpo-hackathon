import { createHash } from 'node:crypto';
import { and, asc, desc, eq, gt, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  DomainError,
  type AdminExplorerKind,
  type AdminExplorerQuery,
  type AdminExplorerRecord,
} from '@hsm/contracts';

export function explorerPeriods(now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(now);
  const year = day.slice(0, 4),
    month = Number(day.slice(5, 7));
  const date = (value: string) => new Date(value + 'T00:00:00+05:00');
  return {
    month: date(day.slice(0, 7) + '-01'),
    quarter: date(
      year + '-' + String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0') + '-01',
    ),
    year: date(year + '-01-01'),
    lifetime: undefined,
  };
}
export function explorerScope(kind: AdminExplorerKind, query: AdminExplorerQuery) {
  const { cursor, limit, ...filters } = query;
  void cursor;
  void limit;
  return createHash('sha256')
    .update(JSON.stringify([kind, filters]))
    .digest('hex');
}
const cursorSchema = z
  .object({ scope: z.string(), value: z.string().max(300), id: z.string().uuid() })
  .strict();
export function explorerPaging(
  input: AdminExplorerQuery,
  scope: string,
  fields: { id: SQL; name: SQL; createdAt: SQL },
) {
  const name = input.sort.startsWith('name_'),
    ascending = input.sort === 'oldest' || input.sort === 'name_asc';
  const column = name ? fields.name : fields.createdAt;
  const order = ascending ? asc : desc,
    compare = ascending ? gt : lt;
  let after: SQL | undefined;
  if (input.cursor) {
    try {
      const value = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
      );
      if (value.scope !== scope) throw new Error('Cursor filters changed');
      const boundary = name ? value.value : z.string().datetime().parse(value.value);
      after = or(
        compare(column, boundary),
        and(eq(column, boundary), compare(fields.id, value.id)),
      );
    } catch {
      throw new DomainError('VALIDATION_FAILED', 400, 'Invalid cursor for these filters');
    }
  }
  return {
    after,
    order: [order(column), order(fields.id)],
    cursor: (row: AdminExplorerRecord) =>
      Buffer.from(
        JSON.stringify({ scope, value: name ? row.name : row.createdAt, id: row.id }),
      ).toString('base64url'),
  };
}
export function explorerSearch(
  query: AdminExplorerQuery,
  fields: { name: SQL; id: SQL; status: SQL; parentId: SQL },
) {
  const pattern = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
  return and(
    query.q ? or(ilike(fields.name, pattern), ilike(sql`${fields.id}::text`, pattern)) : undefined,
    query.status ? eq(fields.status, query.status) : undefined,
    query.parentId ? eq(fields.parentId, query.parentId) : undefined,
  );
}
export const explorerNotices: Record<AdminExplorerKind, string> = {
  users:
    'Account directory only. Contacts, CNIC and resident records remain private. Privileged or hostel staff accounts are excluded from customer enforcement.',
  owners:
    'Owner profiles reuse the same identity. Hostel businesses and branches remain under their owning organization.',
  managers:
    'One identity per manager; status is the latest assignment. Registration statistics use account creation. Branch assignments retain their history.',
  hostels:
    'A hostel business is a brand within an organization. Each business can have multiple branches; archived records remain visible.',
  branches:
    'A branch belongs to one hostel brand and the same organization. Only existing verification actions are available to Platform Admin.',
  bookings:
    'Lifecycle metadata only. Customers, documents and pricing are omitted. Booking decisions belong to authorized branch staff.',
  complaints:
    'Category and status metadata only; resident identity, description and attachments are restricted. Priority is not recorded in the complaint model; branch staff resolve complaints.',
  occupancy:
    'Current occupied placements from active stay assignments, not reservations or a historical occupancy percentage. Date filters/statistics describe branch creation, not past occupancy.',
  payments:
    'Approved, receipted and non-reversed hostel-direct payment totals by branch, never platform income. No resident identity, proof or transaction reference. Period statistics count approved payments; detail totals are lifetime. Platform Admin cannot approve rent payments.',
};
