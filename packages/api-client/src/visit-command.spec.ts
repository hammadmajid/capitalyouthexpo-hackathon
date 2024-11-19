import { expect, it, vi } from 'vitest';
import { RetainedVisitCommand } from './visit-command.js';
import { ApiFailure, ClientFailure } from './result.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  key = '10000000-0000-4000-8000-000000000002';
const input = { kind: 'request', body: { branchId, requestedStart: '2026-11-05T05:00:00Z' } };
function rejected(status = 409) {
  return new ApiFailure({
    type: 'https://example.test/conflict',
    title: 'Conflict',
    status,
    code: 'CONFLICT',
    detail: 'Unavailable',
    traceId: 'fixture',
  });
}
it('VISIT-001: uncertain requests retain the original parsed body and exact key', async () => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({ saved: true });
  const command = new RetainedVisitCommand(execute);
  const original = { ...input, body: { ...input.body } };
  await expect(command.send(original, key)).rejects.toThrow();
  original.body.requestedStart = '2026-11-05T06:00:00Z';
  expect(command.locked).toBe(true);
  expect(() => command.reset()).toThrow();
  await expect(command.retry()).resolves.toEqual({ saved: true });
  expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);
  expect(execute.mock.calls[0]?.[0]).toMatchObject({
    body: { requestedStart: '2026-11-05T05:00:00Z' },
  });
  expect(execute.mock.calls[0]?.[1]).toBe(key);
  expect(command.locked).toBe(false);
  await expect(command.retry()).rejects.toThrow();
});
it('VISIT-001: a first definitive rejection unlocks but a later rejection cannot erase uncertainty', async () => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(rejected())
    .mockRejectedValueOnce(new ClientFailure('INVALID_RESPONSE'))
    .mockRejectedValueOnce(rejected());
  const command = new RetainedVisitCommand(execute);
  await expect(command.send({ ...input, body: { ...input.body } }, key)).rejects.toThrow();
  expect(command.locked).toBe(false);
  await expect(command.send(input, key)).rejects.toThrow();
  await expect(command.retry()).rejects.toThrow();
  expect(command.locked).toBe(true);
});
it('VISIT-001: concurrent submissions and replacing unresolved intent are rejected', async () => {
  let resolve: ((value: unknown) => void) | undefined;
  const execute = vi.fn().mockImplementation(
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  const command = new RetainedVisitCommand(execute),
    pending = command.send(input, key);
  expect(command.locked).toBe(true);
  await expect(command.send(input, key)).rejects.toThrow();
  await expect(command.retry()).rejects.toThrow();
  expect(() => command.reset()).toThrow();
  resolve?.({ saved: true });
  await pending;
  expect(execute).toHaveBeenCalledTimes(1);
  command.reset();
  expect(command.locked).toBe(false);
});
it('VISIT-001: invalid local keys never poison an unsent command', async () => {
  const execute = vi.fn().mockResolvedValue({ saved: true }),
    command = new RetainedVisitCommand(execute);
  await expect(command.send(input, 'bad')).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  await expect(command.send(input, key)).resolves.toEqual({ saved: true });
});
