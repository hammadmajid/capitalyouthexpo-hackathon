import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  emit: vi.fn(),
  io: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ io: mock.io }));
import { subscribeChatRealtime } from './chat-realtime.js';
beforeEach(() => {
  vi.clearAllMocks();
  mock.handlers.clear();
  mock.io.mockReturnValue({
    on: (name: string, callback: (...args: unknown[]) => void) => mock.handlers.set(name, callback),
    timeout: () => ({ emit: mock.emit }),
    connect: mock.connect,
    disconnect: mock.disconnect,
    removeAllListeners: mock.removeAllListeners,
  });
});
function start(browser = true) {
  const conversationId = randomUUID(),
    state = vi.fn(),
    refresh = vi.fn();
  const close = subscribeChatRealtime({
    url: 'https://hostel.example',
    path: '/api/v1/rt',
    conversationId,
    browser,
    refresh,
    state,
  });
  return { conversationId, state, refresh, close };
}
function event(name: string, ...args: unknown[]) {
  mock.handlers.get(name)?.(...args);
}
function answer(error: Error | null, value: unknown) {
  const callback = mock.emit.mock.calls[0]?.[2] as (error: Error | null, value: unknown) => void;
  callback(error, value);
}
it('COMM-001: browser cookie polling joins on every reconnect and refetches source history', () => {
  const f = start();
  expect(mock.io).toHaveBeenCalledWith(
    'https://hostel.example',
    expect.objectContaining({ transports: ['polling'], withCredentials: true, auth: {} }),
  );
  event('connect');
  answer(null, { joined: true });
  expect(f.state).toHaveBeenLastCalledWith('connected');
  expect(f.refresh).toHaveBeenCalledTimes(1);
  event('connect');
  answer(null, { joined: true });
  expect(f.refresh).toHaveBeenCalledTimes(2);
  event('chat.refresh');
  expect(f.refresh).toHaveBeenCalledTimes(3);
  f.close();
  expect(mock.removeAllListeners).toHaveBeenCalled();
  expect(mock.disconnect).toHaveBeenCalled();
  event('chat.refresh');
  expect(f.refresh).toHaveBeenCalledTimes(3);
});
it('COMM-001: native socket token stays in handshake auth and events never append unverified message content', () => {
  const f = start(false);
  expect(mock.io).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ transports: ['websocket'], withCredentials: false }),
  );
  const value = {
    conversationId: f.conversationId,
    messageId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  event('chat.message.created', { ...value, body: 'injected' });
  event('chat.message.created', { ...value, conversationId: randomUUID() });
  event('chat.message.created', 'malformed');
  expect(f.refresh).not.toHaveBeenCalled();
  event('chat.message.created', value);
  expect(f.refresh).toHaveBeenCalledOnce();
});
it.each([null, {}, { joined: false }])('SEC-003: denied joins disconnect', (value) => {
  const f = start();
  event('connect');
  answer(null, value);
  expect(f.state).toHaveBeenLastCalledWith('denied');
  expect(mock.disconnect).toHaveBeenCalled();
  expect(f.refresh).not.toHaveBeenCalled();
});
it('COMM-001: timeout, transport loss and expired sessions are exposed without exposing credentials', () => {
  const f = start();
  event('connect');
  answer(new Error('timeout'), undefined);
  expect(f.state).toHaveBeenLastCalledWith('disconnected');
  event('disconnect');
  event('connect_error', new Error('network'));
  expect(f.state).toHaveBeenLastCalledWith('disconnected');
  event('connect_error', new Error('UNAUTHENTICATED'));
  expect(f.state).toHaveBeenLastCalledWith('denied');
  f.close();
  const calls = f.state.mock.calls.length;
  event('disconnect');
  event('connect_error', new Error('network'));
  answer(null, { joined: true });
  expect(f.state).toHaveBeenCalledTimes(calls);
});
