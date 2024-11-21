import { and, eq, gt, isNull, isNotNull } from 'drizzle-orm';
import { inventoryBlocks, rooms, seats } from '@hsm/db';
import { inventoryBlockPageSchema, type InventoryBlockListQuery } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
// ACC-004 / SEC-003: retained inventory labels, no actor IDs or free-text audit reasons.
export async function readInventoryBlocks(
  database: Transaction,
  branchId: string,
  page: InventoryBlockListQuery,
) {
  const rows = await database
    .select({
      id: inventoryBlocks.id,
      branchId: inventoryBlocks.branchId,
      roomId: inventoryBlocks.roomId,
      seatId: inventoryBlocks.seatId,
      roomLabel: rooms.label,
      bedLabel: seats.label,
      moveInDate: inventoryBlocks.moveInDate,
      moveOutDate: inventoryBlocks.moveOutDate,
      reason: inventoryBlocks.reason,
      createdAt: inventoryBlocks.createdAt,
      releasedAt: inventoryBlocks.releasedAt,
    })
    .from(inventoryBlocks)
    .innerJoin(rooms, and(eq(rooms.id, inventoryBlocks.roomId), eq(rooms.branchId, branchId)))
    .leftJoin(
      seats,
      and(
        eq(seats.id, inventoryBlocks.seatId),
        eq(seats.roomId, inventoryBlocks.roomId),
        eq(seats.branchId, branchId),
      ),
    )
    .where(
      and(
        eq(inventoryBlocks.branchId, branchId),
        page.cursor ? gt(inventoryBlocks.id, page.cursor) : undefined,
        page.state === 'unreleased'
          ? isNull(inventoryBlocks.releasedAt)
          : page.state === 'released'
            ? isNotNull(inventoryBlocks.releasedAt)
            : undefined,
      ),
    )
    .orderBy(inventoryBlocks.id)
    .limit(page.limit + 1);
  const selected = rows.slice(0, page.limit);
  return inventoryBlockPageSchema.parse({
    data: selected.map((row) => ({
      id: row.id,
      branchId: row.branchId,
      target: row.seatId
        ? { kind: 'bed', roomId: row.roomId, bedId: row.seatId }
        : { kind: 'room', roomId: row.roomId },
      range: { moveInDate: row.moveInDate, moveOutDate: row.moveOutDate },
      kind: row.reason === 1 ? 'manual' : 'maintenance',
      roomLabel: row.roomLabel,
      bedLabel: row.bedLabel,
      createdAt: row.createdAt.toISOString(),
      releasedAt: row.releasedAt?.toISOString() ?? null,
    })),
    nextCursor: rows.length > page.limit ? selected.at(-1)?.id : null,
  });
}
