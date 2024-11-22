import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';
import type { Database } from '@hsm/db';
import { marketplaceQuerySchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { MarketplaceRepository } from './repository.js';
// Unit-only driver callback: real Drizzle SQL construction/result mapping, no
// PostgreSQL execution or transaction proof. Real Testcontainers cases are kept.
it.each([false, true])(
  'ACC-002 / PERF: a twenty-hostel discovery page has a constant query budget (dates %s)',
  async (dated) => {
    const ids = Array.from({ length: 20 }, () => randomUUID()).sort(),
      calls: string[] = [];
    const database = drizzle(async (statement) => {
      calls.push(statement);
      return {
        rows:
          calls.length === 1
            ? ids.map((id, index) => [
                id,
                'Fixture brand',
                'Fixture branch ' + String(index),
                id,
                'boys',
                'Islamabad',
                null,
                33.68,
                73.04,
                null,
                null,
                dated ? '0' : null,
                dated ? '0' : null,
                [],
                [],
              ])
            : [],
      };
    });
    const repository = new MarketplaceRepository(
      database as unknown as Database,
      'private-catalog',
      5000,
      () => new Date('2026-10-17T10:00:00Z'),
    );
    // Reuse the existing caller-owned transaction path; pg-proxy does not implement
    // transactions, and this unit test must not pretend to verify real row locks.
    const result = await repository.list(
      marketplaceQuerySchema.parse({
        limit: 20,
        ...(dated ? { moveInDate: '2026-10-20', moveOutDate: '2026-11-20' } : {}),
      }),
      database as unknown as Transaction,
    );
    expect(result.data.map((row) => row.branchId)).toEqual(ids);
    for (const row of result.data) {
      expect(row.priceFromPaisa).toBeNull();
      expect(row.availableBeds).toBe(dated ? 0 : null);
      expect(row.availableWholeRooms).toBe(dated ? 0 : null);
      expect(row).not.toHaveProperty('roomTypes');
    }
    // Count executed driver callbacks, never nested query-builder construction.
    expect(calls).toHaveLength(1);
  },
);
