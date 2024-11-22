import { z } from 'zod';
import { billingCatalogEntrySchema, DomainError, money, moneyToJson } from '@hsm/contracts';
import type { residentChargeCatalog } from '@hsm/db';
export function catalogResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError('INTERNAL', 500, 'Catalogue data unavailable');
  return result.data;
}
export function projectCatalog(row: typeof residentChargeCatalog.$inferSelect) {
  try {
    return catalogResult(billingCatalogEntrySchema, {
      id: row.id,
      branchId: row.branchId,
      code: row.code,
      name: row.name,
      unitLabel: row.unitLabel,
      unitAmountPaisa: moneyToJson(money(row.unitAmountPaisa)),
      createdAt: row.createdAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    });
  } catch {
    throw new DomainError('INTERNAL', 500, 'Catalogue data unavailable');
  }
}
