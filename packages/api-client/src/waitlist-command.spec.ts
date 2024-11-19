import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  RetainedWaitlistCommand,
  executeWaitlistCommand,
  type WaitlistCommand,
} from './waitlist-command.js';
import { ApiFailure, ClientFailure } from './result.js';
import { createApiClient } from './client.js';
const branchId = randomUUID(),
  entryId = randomUUID(),
  key = randomUUID();
const command = { kind: 'join' as const, body: { branchId } };
function denied() {
  return new ApiFailure({
    type: 'https://api.example.test/problems/forbidden',
    title: 'Forbidden',
    status: 403,
    code: 'FORBIDDEN',
    detail: 'Unavailable',
    traceId: randomUUID(),
  });
}
it('WAIT-001: uncertain sends freeze original preference/key, retain later denials and forbid replacement', async () => {
  const execute = vi
    .fn<(command: WaitlistCommand, key: string) => Promise<unknown>>()
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockRejectedValueOnce(denied())
    .mockResolvedValueOnce({ joined: true });
  const retained = new RetainedWaitlistCommand(execute),
    input = { kind: 'join', body: { branchId } };
  await expect(retained.send(input, key)).rejects.toThrow();
  input.body.branchId = randomUUID();
  expect(retained.locked).toBe(true);
  expect(() => retained.reset()).toThrow();
  await expect(retained.send(command, randomUUID())).rejects.toThrow();
  await expect(retained.retry()).rejects.toThrow();
  expect(retained.locked).toBe(true);
  await retained.retry();
  expect(execute.mock.calls).toEqual([
    [command, key],
    [command, key],
    [command, key],
  ]);
  expect(Object.isFrozen(execute.mock.calls[0]?.[0])).toBe(true);
  expect(
    Object.isFrozen(
      execute.mock.calls[0]?.[0].kind === 'join' ? execute.mock.calls[0][0].body : null,
    ),
  ).toBe(true);
  await expect(retained.retry()).rejects.toThrow();
  retained.reset();
  expect(retained.locked).toBe(false);
});
it('WAIT-001: a definite initial denial permits a deliberate new command', async () => {
  const execute = vi
    .fn<(command: WaitlistCommand, key: string) => Promise<unknown>>()
    .mockRejectedValueOnce(denied())
    .mockResolvedValueOnce({});
  const retained = new RetainedWaitlistCommand(execute);
  await expect(retained.send(command, key)).rejects.toThrow();
  expect(retained.locked).toBe(false);
  await retained.send({ kind: 'leave', entryId }, randomUUID());
});
it('WAIT-001: concurrent dispatch and known-success repetition are refused', async () => {
  let finish: (() => void) | undefined;
  const retained = new RetainedWaitlistCommand(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await expect(retained.retry()).rejects.toThrow();
  const pending = retained.send(command, key);
  expect(retained.locked).toBe(true);
  await expect(retained.retry()).rejects.toThrow();
  await expect(retained.send(command, key)).rejects.toThrow();
  finish?.();
  await pending;
  await expect(retained.send(command, key)).rejects.toThrow();
});
it('WAIT-001: invalid input/key never reaches execution and leave drafts remain frozen', async () => {
  const execute = vi
    .fn<(command: WaitlistCommand, key: string) => Promise<unknown>>()
    .mockResolvedValue({});
  const retained = new RetainedWaitlistCommand(execute);
  await expect(retained.send(command, 'invalid')).rejects.toThrow();
  await expect(retained.send({ kind: 'reserve', body: { branchId } }, key)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  await retained.send({ kind: 'leave', entryId }, key);
  expect(Object.isFrozen(execute.mock.calls[0]?.[0])).toBe(true);
});
it.each(['join', 'leave'] as const)(
  'WAIT-001: dispatcher uses the actual %s API route',
  async (kind) => {
    const row = {
      id: entryId,
      branchId,
      branchName: 'Hostel',
      roomTypeId: null,
      roomTypeName: null,
      expectedVacancyDate: null,
      joinedAt: '2026-10-24T03:00:00.000Z',
      leftAt: kind === 'leave' ? '2026-10-24T03:00:00.000Z' : null,
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(row));
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch,
    });
    expect(
      await executeWaitlistCommand(client, kind === 'join' ? command : { kind, entryId }, key),
    ).toEqual(row);
  },
);
