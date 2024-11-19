import { expect, it } from 'vitest';
import {
  inventoryBlockListQuerySchema,
  inventoryBlockPageSchema,
  inventoryBlockInputSchema,
  inventoryBlockReleaseSchema,
  inventoryBlockStateSchema,
} from './inventory-blocks.js';
const roomId = '11111111-1111-4111-8111-111111111111';
const bedId = '22222222-2222-4222-8222-222222222222';
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
const input = {
  target: { kind: 'room', roomId },
  range,
  kind: 'manual',
  reason: 'Reserved by Owner',
};
it('ACC-001: blocks accept explicit physical room/bed targets and half-open stay dates', () => {
  expect(inventoryBlockInputSchema.parse(input)).toEqual(input);
  expect(
    inventoryBlockInputSchema.parse({
      ...input,
      kind: 'maintenance',
      target: { kind: 'bed', roomId, bedId },
      reason: ' Repair frame ',
    }).reason,
  ).toBe('Repair frame');
});
it.each([
  { reason: '' },
  { reason: ' ' },
  { reason: 'x'.repeat(501) },
  { kind: 'booking' },
  { target: { kind: 'room', roomId, ordinal: 1 } },
  { range: { moveInDate: '2026-11-03', moveOutDate: '2026-11-03' } },
  { range: { moveInDate: '2026-11-03', moveOutDate: '2026-11-01' } },
  { branchId: roomId },
  { actorUserId: bedId },
  { releasedAt: '2026-10-15T10:00:00Z' },
])('SEC-003 / ACC-001: block input rejects invalid dates and injected authority %j', (change) => {
  expect(inventoryBlockInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
});
it('ACC-001: release requires a reason and rejects client-controlled timestamps', () => {
  expect(inventoryBlockReleaseSchema.parse({ reason: ' Repair complete ' })).toEqual({
    reason: 'Repair complete',
  });
  expect(
    inventoryBlockReleaseSchema.safeParse({ reason: 'Done', releasedAt: '2026-10-15T10:00:00Z' })
      .success,
  ).toBe(false);
  expect(inventoryBlockReleaseSchema.safeParse({ reason: '' }).success).toBe(false);
});
it('SEC-003: block response has a closed metadata projection', () => {
  const state = {
    id: bedId,
    branchId: roomId,
    target: input.target,
    range,
    kind: 'manual',
    releasedAt: null,
  };
  expect(inventoryBlockStateSchema.parse(state)).toEqual(state);
  expect(
    inventoryBlockStateSchema.parse({ ...state, releasedAt: '2026-10-15T10:00:00Z' }).releasedAt,
  ).not.toBeNull();
  expect(inventoryBlockStateSchema.safeParse({ ...state, customerUserId: roomId }).success).toBe(
    false,
  );
});

it('ACC-004: block history has bounded explicit filters and a stable cursor', () => {
  expect(inventoryBlockListQuerySchema.parse({})).toEqual({ limit: 20, state: 'unreleased' });
  expect(
    inventoryBlockListQuerySchema.parse({ limit: '1', cursor: bedId, state: 'released' }),
  ).toEqual({ limit: 1, cursor: bedId, state: 'released' });
  expect(inventoryBlockListQuerySchema.parse({ state: 'all' }).state).toBe('all');
});
it.each([
  { limit: 101 },
  { limit: 0 },
  { state: 'booked' },
  { actorUserId: roomId },
  { branchId: roomId },
  { cursor: 'invalid' },
])('ACC-004 / SEC-003: history query rejects invalid scope or pagination %j', (query) => {
  expect(inventoryBlockListQuerySchema.safeParse(query).success).toBe(false);
});
const summary = {
  id: bedId,
  branchId: roomId,
  target: input.target,
  range,
  kind: 'manual',
  releasedAt: null,
  roomLabel: '101',
  bedLabel: null,
  createdAt: '2026-10-15T10:00:00Z',
};
it('ACC-004: block history retains labels and timestamps without private audit data', () => {
  expect(inventoryBlockPageSchema.parse({ data: [summary], nextCursor: null }).data).toEqual([
    summary,
  ]);
  expect(
    inventoryBlockPageSchema.parse({
      data: [{ ...summary, target: { kind: 'bed', roomId, bedId }, bedLabel: 'A' }],
      nextCursor: bedId,
    }).nextCursor,
  ).toBe(bedId);
});
it.each([
  { actorUserId: roomId },
  { reason: 'Private operational note' },
  { roomLabel: undefined },
  { bedLabel: 'A' },
  { createdAt: 'yesterday' },
])('SEC-003: history projection rejects private additions or inconsistent labels %j', (patch) => {
  expect(
    inventoryBlockPageSchema.safeParse({ data: [{ ...summary, ...patch }], nextCursor: null })
      .success,
  ).toBe(false);
});

it('ACC-004: oversized block history responses fail the transport boundary', () => {
  expect(
    inventoryBlockPageSchema.safeParse({
      data: Array.from({ length: 101 }, () => summary),
      nextCursor: null,
    }).success,
  ).toBe(false);
});
