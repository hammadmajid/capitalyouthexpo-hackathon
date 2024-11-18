import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  listInventoryBlocks,
  createInventoryBlock,
  releaseInventoryBlock,
} from './inventory-blocks.js';
const branchId = randomUUID(),
  roomId = randomUUID(),
  bedId = randomUUID(),
  blockId = randomUUID(),
  key = randomUUID();
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' };
const input = {
  target: { kind: 'room' as const, roomId },
  range,
  kind: 'manual' as const,
  reason: ' Private repair note ',
};
const state = {
  id: blockId,
  branchId,
  target: input.target,
  range,
  kind: input.kind,
  releasedAt: null,
};
const summary = { ...state, roomLabel: '101', bedLabel: null, createdAt: '2026-10-15T10:00:00Z' };
function wire(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (request, init) => {
      requests.push(request instanceof Request ? request : new Request(request, init));
      return Response.json(body);
    },
  });
  function request() {
    const result = requests[0];
    if (!result) throw new Error('Missing request');
    return result;
  }
  return { client, requests, request };
}
it('ACC-004: block history sends bounded scoped filters and the actual returned cursor', async () => {
  const value = wire({ data: [summary], nextCursor: blockId });
  expect(
    await listInventoryBlocks(value.client, branchId, { limit: 1, cursor: blockId, state: 'all' }),
  ).toEqual({ data: [summary], nextCursor: blockId });
  const url = new URL(value.request().url);
  expect(url.pathname).toBe(`/v1/branches/${branchId}/inventory/blocks`);
  expect(url.searchParams.get('state')).toBe('all');
  expect(url.searchParams.get('limit')).toBe('1');
  expect(url.searchParams.get('cursor')).toBe(blockId);
});
it('ACC-004: defaults mean unreleased history, never guessed availability', async () => {
  const value = wire({ data: [], nextCursor: null });
  expect(await listInventoryBlocks(value.client, branchId)).toEqual({ data: [], nextCursor: null });
  expect(new URL(value.request().url).searchParams.get('state')).toBe('unreleased');
});
it('SEC-003: another branch or private audit additions fail the history boundary', async () => {
  for (const row of [
    { ...summary, branchId: randomUUID() },
    { ...summary, reason: 'Private note' },
  ]) {
    await expect(
      listInventoryBlocks(wire({ data: [row], nextCursor: null }).client, branchId),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
});
it.each(['room', 'bed'] as const)(
  'ACC-001: %s creation retains exact target, dates, CSRF and command key',
  async (kind) => {
    const target = kind === 'room' ? input.target : { kind: 'bed' as const, roomId, bedId };
    const value = wire({ ...state, target });
    await createInventoryBlock(value.client, branchId, { ...input, target }, key);
    expect(await value.request().json()).toEqual({
      ...input,
      reason: 'Private repair note',
      target,
    });
    expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
    expect(value.request().headers.get('Idempotency-Key')).toBe(key);
  },
);
it.each([
  { branchId: randomUUID() },
  { target: { kind: 'room', roomId: randomUUID() } },
  { target: { kind: 'bed', roomId, bedId } },
  { kind: 'maintenance' },
  { range: { ...range, moveInDate: '2026-10-31' } },
  { range: { ...range, moveOutDate: '2026-11-04' } },
  { releasedAt: '2026-10-15T10:00:00Z' },
])('SEC-003 / ACC-001: incompatible creation response is rejected %j', async (patch) => {
  await expect(
    createInventoryBlock(wire({ ...state, ...patch }).client, branchId, input, key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-001: release requires persisted release state and keeps its scoped reason/key', async () => {
  const value = wire({ ...state, releasedAt: '2026-10-15T10:00:00Z' });
  await releaseInventoryBlock(value.client, branchId, blockId, ' Repairs complete ', key);
  expect(new URL(value.request().url).pathname).toBe(
    `/v1/branches/${branchId}/inventory/blocks/${blockId}/release`,
  );
  expect(await value.request().json()).toEqual({ reason: 'Repairs complete' });
  expect(value.request().headers.get('Idempotency-Key')).toBe(key);
});
it.each([{ id: randomUUID() }, { branchId: randomUUID() }, { releasedAt: null }])(
  'SEC-003: incompatible release is rejected %j',
  async (patch) => {
    await expect(
      releaseInventoryBlock(
        wire({ ...state, releasedAt: '2026-10-15T10:00:00Z', ...patch }).client,
        branchId,
        blockId,
        'Done',
        key,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('SEC-003: invalid scope, bounds and force flags fail before IO', () => {
  const value = wire(state);
  expect(() => listInventoryBlocks(value.client, branchId, { limit: 101 })).toThrow();
  expect(() =>
    createInventoryBlock(value.client, branchId, Object.assign({ ...input }, { force: true }), key),
  ).toThrow();
  expect(() => releaseInventoryBlock(value.client, branchId, blockId, '', key)).toThrow();
  expect(value.requests).toHaveLength(0);
});

it('ACC-001: a different physical bed cannot be accepted as the requested block', async () => {
  const target = { kind: 'bed' as const, roomId, bedId };
  await expect(
    createInventoryBlock(
      wire({ ...state, target: { ...target, bedId: randomUUID() } }).client,
      branchId,
      { ...input, target },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
