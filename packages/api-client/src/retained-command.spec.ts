import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiFailure } from './result.js';
import { retainedCommand, RetainedCommand } from './retained-command.js';

function fixture() {
  let now = 0;
  const key = vi.fn().mockReturnValueOnce('original').mockReturnValue('new');
  return {
    command: new RetainedCommand(key, () => now),
    key,
    advance: () => {
      now = 86400000;
    },
  };
}
const rejected = () =>
  new ApiFailure({
    type: 'https://hsm.pk/problems/forbidden',
    title: 'Forbidden',
    status: 403,
    code: 'FORBIDDEN',
    detail: 'Forbidden',
    traceId: 'test',
  });

it.each(['refund', 'complaint', 'announcement', 'checkout'])(
  'PAY-008 / AUD-003: lost %s response repeats the immutable command and key',
  async () => {
    const f = fixture(),
      body = { amount: 100, nested: { reason: 'original' } };
    const run = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValue('ok');
    await expect(f.command.submit(body, run)).rejects.toThrow('response lost');
    body.nested.reason = 'edited';
    await expect(f.command.submit(body, run)).rejects.toMatchObject({ code: 'UNRESOLVED' });
    expect(run).toHaveBeenCalledTimes(1);
    await expect(
      f.command.submit({ amount: 100, nested: { reason: 'original' } }, run),
    ).resolves.toBe('ok');
    expect(run.mock.calls[1]).toEqual(run.mock.calls[0]);
    expect(Object.isFrozen(run.mock.calls[0]?.[0].nested)).toBe(true);
    expect(f.key).toHaveBeenCalledTimes(1);
    expect(f.command.unresolved).toBe(false);
    await f.command.submit({ amount: 200 }, run);
    expect(run.mock.calls[2]?.[1]).toBe('new');
  },
);
it('PAY-008 / AUD-003: definitive initial rejection permits a safe new intent', async () => {
  const f = fixture(),
    run = vi.fn().mockRejectedValueOnce(rejected()).mockResolvedValue('ok');
  await expect(f.command.submit({ amount: 100 }, run)).rejects.toBeInstanceOf(ApiFailure);
  expect(f.command.unresolved).toBe(false);
  await f.command.submit({ amount: 200 }, run);
  expect(run.mock.calls[1]?.[1]).toBe('new');
});
it('PAY-008 / AUD-003: invalid SDK input is correctable before dispatch', async () => {
  const f = fixture(),
    run = vi.fn(async (body: { amount: number }) => {
      z.object({ amount: z.number().positive() }).parse(body);
      return 'ok';
    });
  await expect(f.command.submit({ amount: -1 }, run)).rejects.toBeInstanceOf(z.ZodError);
  expect(f.command.unresolved).toBe(false);
  await expect(f.command.submit({ amount: 100 }, run)).resolves.toBe('ok');
});
it('SEC-001 / AUD-003: permission rejection after an unknown outcome cannot erase its identity', async () => {
  const f = fixture(),
    run = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(rejected())
      .mockResolvedValue('ok');
  await expect(f.command.submit(null, run)).rejects.toThrow('timeout');
  await expect(f.command.submit(null, run)).rejects.toBeInstanceOf(ApiFailure);
  expect(f.command.unresolved).toBe(true);
  await f.command.submit(null, run);
  expect(run.mock.calls.map((call) => call[1])).toEqual(['original', 'original', 'original']);
});
it('PAY-008 / AUD-003: expiry blocks replay without generating a fresh key', async () => {
  const f = fixture(),
    run = vi.fn().mockRejectedValue(new Error('timeout'));
  await expect(f.command.submit(null, run)).rejects.toThrow('timeout');
  f.advance();
  await expect(f.command.submit(null, run)).rejects.toMatchObject({ code: 'EXPIRED' });
  expect(f.key).toHaveBeenCalledTimes(1);
  expect(run).toHaveBeenCalledTimes(1);
});
it('PAY-008 / AUD-003: explicit recovery returns a detached original payload; non-JSON commands never dispatch', async () => {
  const f = fixture(),
    run = vi.fn().mockRejectedValue(new Error('timeout'));
  expect(() => f.command.original()).toThrow();
  await expect(f.command.submit(undefined, run)).rejects.toThrow('JSON');
  expect(run).not.toHaveBeenCalled();
  await expect(f.command.submit({ nested: { amount: 100 } }, run)).rejects.toThrow();
  const original = f.command.original<{ nested: { amount: number } }>();
  original.nested.amount = 200;
  expect(f.command.original()).toEqual({ nested: { amount: 100 } });
});
it('PAY-008 / AUD-003: parallel submissions cannot dispatch two commands', async () => {
  const f = fixture();
  let finish: (value: string) => void = () => undefined;
  const run = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const first = f.command.submit(null, run);
  await expect(f.command.submit(null, run)).rejects.toMatchObject({ code: 'PENDING' });
  finish('ok');
  await first;
  expect(run).toHaveBeenCalledTimes(1);
});
it('SEC-001 / AUD-003: actor, resource and operation namespaces remain isolated', () => {
  const key = () => 'key';
  const a = retainedCommand('actorA:stayA:refund', key);
  expect(retainedCommand('actorA:stayA:refund', key)).toBe(a);
  expect(retainedCommand('actorB:stayA:refund', key)).not.toBe(a);
  expect(retainedCommand('actorA:stayB:refund', key)).not.toBe(a);
  expect(retainedCommand('actorA:stayA:complaint', key)).not.toBe(a);
});
