import { testKeys } from '../test/keys.js';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  execute: vi.fn(),
  end: vi.fn(),
  connect: vi.fn(),
  ping: vi.fn(),
  eval: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
}));
vi.mock('@hsm/db', () => ({
  createDatabase: () => ({ db: { execute: state.execute }, close: state.end }),
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn(function () {
    return {
      connect: state.connect,
      ping: state.ping,
      eval: state.eval,
      disconnect: state.disconnect,
      on: state.on,
      once: state.once,
      status: 'ready',
    };
  }),
}));
import { LiveInfrastructure, rateKey } from './infrastructure.js';
import { parseEnvironment } from './config.js';
const config = parseEnvironment({
  ...testKeys(),
  DATABASE_URL: 'postgres://localhost/test',
  REDIS_URL: 'redis://localhost',
  CORS_ORIGINS: 'http://localhost:3000',
});
beforeEach(() => {
  vi.resetAllMocks();
  state.connect.mockResolvedValue(undefined);
  state.execute.mockResolvedValue([]);
  state.end.mockResolvedValue(undefined);
  state.ping.mockResolvedValue('PONG');
  state.eval.mockResolvedValue(1);
  state.once.mockImplementation((_event: string, callback: () => void) => queueMicrotask(callback));
});
it('SEC-001: connects required dependencies, uses atomic counters and closes resources', async () => {
  const infrastructure = new LiveInfrastructure(config);
  await infrastructure.connect();
  expect(state.execute).toHaveBeenCalledOnce();
  expect(await infrastructure.increment('counter', 60)).toBe(1);
  expect(state.eval).toHaveBeenCalledWith(
    expect.stringContaining("redis.call('EXPIRE'"),
    1,
    'counter',
    60,
  );
  await infrastructure.close();
  expect(state.disconnect).toHaveBeenCalledOnce();
  expect(state.end).toHaveBeenCalledOnce();
});
it('SEC-001: startup failure closes resources and sanitizes dependency errors', async () => {
  state.connect.mockRejectedValue(new Error('private password'));
  const infrastructure = new LiveInfrastructure(config);
  await expect(infrastructure.connect()).rejects.toThrow('Required API dependencies unavailable');
  expect(state.disconnect).toHaveBeenCalledOnce();
  expect(state.end).toHaveBeenCalledOnce();
});
it('SEC-001: refuses invalid Redis health and counter responses', async () => {
  const infrastructure = new LiveInfrastructure(config);
  state.ping.mockResolvedValue('unexpected');
  await expect(infrastructure.redis()).rejects.toThrow('Redis unavailable');
  state.eval.mockResolvedValue('unexpected');
  await expect(infrastructure.increment('counter', 60)).rejects.toThrow('Invalid rate counter');
});
it('SEC-003: rate keys do not retain client IP addresses', () => {
  expect(rateKey('127.0.0.1', 1)).not.toContain('127.0.0.1');
  expect(rateKey('127.0.0.1', 1)).not.toBe(rateKey('127.0.0.1', 2));
});

it('SEC-001: shutdown waits for Redis end before completing resource cleanup', async () => {
  let finish: (() => void) | undefined;
  state.once.mockImplementation((_event: string, callback: () => void) => {
    finish = callback;
  });
  const infrastructure = new LiveInfrastructure(config);
  const closing = infrastructure.close();
  expect(state.once).toHaveBeenCalledWith('end', expect.any(Function));
  expect(state.end).not.toHaveBeenCalled();
  if (!finish) throw new Error('Redis end listener missing');
  finish();
  await closing;
  expect(state.end).toHaveBeenCalledOnce();
});
