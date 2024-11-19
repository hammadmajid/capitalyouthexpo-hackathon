import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { ApiFailure, ClientFailure } from './result.js';
import { duplicateInventoryRoom, RetainedRoomDuplication } from './room-duplication.js';
const branch = randomUUID(),
  room = randomUUID(),
  key = randomUUID();
const input = { roomId: room, body: { roomNumbers: ['201'] } };
const denied = () =>
  new ApiFailure({
    type: 'about:blank',
    title: 'Denied',
    status: 403,
    code: 'FORBIDDEN',
    detail: 'Denied',
    traceId: randomUUID(),
  });
it.each([{ roomNumbers: ['201'] }, { from: 201, to: 201 }])(
  'PROP-001: typed SDK preserves scope, CSRF, key and exact body %j',
  async (body) => {
    const requests: Request[] = [],
      result = { branchId: branch, sourceRoomId: room, roomIds: [randomUUID()] };
    const client = createApiClient({
      baseUrl: 'https://example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch: async (input, init) => {
        requests.push(input instanceof Request ? input : new Request(input, init));
        return Response.json(result);
      },
    });
    expect(await duplicateInventoryRoom(client, branch, room, body, key)).toEqual(result);
    const request = requests[0];
    if (!request) throw new Error('Missing request');
    expect(request.url).toBe(
      `https://example.test/v1/branches/${branch}/inventory/rooms/${room}/duplicate`,
    );
    expect(request.headers.get('Idempotency-Key')).toBe(key);
    expect(request.headers.get('X-CSRF-Token')).toBe('csrf');
    expect(await request.json()).toEqual(body);
  },
);
it.each([
  { branchId: randomUUID() },
  { sourceRoomId: randomUUID() },
  { roomIds: [room] },
  { roomIds: [randomUUID(), randomUUID()] },
])('ACC-004: reject mismatched duplication result %j', async (patch) => {
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async () =>
      Response.json({ branchId: branch, sourceRoomId: room, roomIds: [randomUUID()], ...patch }),
  });
  await expect(duplicateInventoryRoom(client, branch, room, input.body, key)).rejects.toMatchObject(
    { code: 'INVALID_RESPONSE' },
  );
});
it('PROP-001: uncertain commands retain a cloned immutable body/key across retry and later denial', async () => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockRejectedValueOnce(denied())
    .mockResolvedValue({});
  const intent = new RetainedRoomDuplication(execute),
    draft = { roomId: room, body: { roomNumbers: ['201'] } };
  await expect(intent.send(draft, key)).rejects.toThrow();
  draft.body.roomNumbers[0] = '999';
  expect(intent.locked).toBe(true);
  expect(() => intent.reset()).toThrow();
  expect(() => intent.send(input, randomUUID())).toThrow();
  await expect(intent.retry()).rejects.toThrow();
  expect(intent.locked).toBe(true);
  await intent.retry();
  expect(execute.mock.calls).toEqual([
    [input, key],
    [input, key],
    [input, key],
  ]);
  expect(Object.isFrozen(execute.mock.calls[0]?.[0].body.roomNumbers)).toBe(true);
  expect(intent.locked).toBe(false);
  expect(() => intent.send(input, key)).toThrow();
  await expect(intent.retry()).rejects.toThrow();
  intent.reset();
  await intent.send({ roomId: room, body: { from: 1, to: 1 } }, randomUUID());
});
it('ACC-004: first definitive denial permits correction and invalid keys never retain an intent', async () => {
  const execute = vi.fn().mockRejectedValueOnce(denied()).mockResolvedValue({}),
    intent = new RetainedRoomDuplication(execute);
  expect(() => intent.send(input, 'invalid')).toThrow();
  await expect(intent.send(input, key)).rejects.toThrow();
  expect(intent.locked).toBe(false);
  await intent.send(input, randomUUID());
});
it('PROP-001: unresolved pending work cannot race a replacement or retry', async () => {
  let finish: (value: unknown) => void = () => {
    throw new Error('Not started');
  };
  const intent = new RetainedRoomDuplication(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await expect(intent.retry()).rejects.toThrow();
  const pending = intent.send(input, key);
  expect(intent.locked).toBe(true);
  await expect(intent.retry()).rejects.toThrow();
  expect(() => intent.send(input, key)).toThrow();
  finish({});
  await pending;
});
