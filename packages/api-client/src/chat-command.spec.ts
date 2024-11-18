import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { RetainedChatCommand, executeChatCommand, type ChatCommand } from './chat-command.js';
import { ApiFailure, ClientFailure } from './result.js';
import { createApiClient } from './client.js';
const actorId = randomUUID(),
  conversationId = randomUUID(),
  branchId = randomUUID(),
  key = randomUUID(),
  fileId = randomUUID();
const command: ChatCommand = {
  kind: 'send',
  conversationId,
  branchId: null,
  body: { body: 'Original', attachmentFileIds: [fileId] },
};
const denied = () =>
  new ApiFailure({
    type: 'https://api.example.test/problems/forbidden',
    title: 'Forbidden',
    detail: 'Unavailable',
    traceId: randomUUID(),
    code: 'FORBIDDEN',
    status: 403,
  });
it('COMM-001: uncertain commands freeze text/files, retain later denials and preserve the original key on retry', async () => {
  const execute = vi
    .fn<(command: ChatCommand, key: string) => Promise<unknown>>()
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockRejectedValueOnce(denied())
    .mockResolvedValueOnce({});
  const retained = new RetainedChatCommand(execute);
  await expect(retained.retry()).rejects.toThrow();
  await expect(retained.send(command, key)).rejects.toThrow();
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
  const input = execute.mock.calls[0]?.[0];
  expect(Object.isFrozen(input)).toBe(true);
  if (input?.kind !== 'send') throw new Error('Send absent');
  expect(Object.isFrozen(input.body)).toBe(true);
  expect(Object.isFrozen(input.body.attachmentFileIds)).toBe(true);
  await expect(retained.retry()).rejects.toThrow();
  retained.reset();
  expect(retained.locked).toBe(false);
});
it('COMM-001: definite initial rejection allows deliberate correction; pending commands cannot dispatch twice', async () => {
  const execute = vi
    .fn<(command: ChatCommand, key: string) => Promise<unknown>>()
    .mockRejectedValueOnce(denied())
    .mockResolvedValueOnce({});
  const retained = new RetainedChatCommand(execute);
  await expect(retained.send(command, key)).rejects.toThrow();
  expect(retained.locked).toBe(false);
  await retained.send({ kind: 'read', conversationId, branchId: null }, randomUUID());
  let finish: (() => void) | undefined;
  const pending = new RetainedChatCommand(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const result = pending.send({ kind: 'create', body: { branchId } }, key);
  await expect(pending.retry()).rejects.toThrow();
  finish?.();
  await result;
  await expect(pending.send(command, key)).rejects.toThrow();
});
it('COMM-001: invalid intent/key never reaches execution', async () => {
  const execute = vi.fn(),
    retained = new RetainedChatCommand(execute);
  await expect(retained.send(command, 'invalid')).rejects.toThrow();
  await expect(retained.send({ kind: 'unsafe' }, key)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});
it.each(['create', 'read', 'send'] as const)(
  'COMM-001: dispatcher connects the actual %s SDK operation',
  async (kind) => {
    const now = '2026-10-24T03:00:00.000Z';
    const value =
      kind === 'create'
        ? {
            id: conversationId,
            branchId,
            branchName: 'Hostel',
            customerUserId: actorId,
            customerName: 'Customer',
            lastMessageAt: null,
            createdAt: now,
            lastReadAt: null,
            unreadCount: 0,
          }
        : kind === 'read'
          ? { conversationId, lastReadAt: now }
          : {
              id: randomUUID(),
              conversationId,
              senderUserId: actorId,
              senderName: 'Customer',
              senderSide: 'customer',
              body: 'Original',
              attachmentFileIds: [fileId],
              createdAt: now,
            };
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(value)),
    });
    const input: ChatCommand =
      kind === 'create'
        ? { kind, body: { branchId } }
        : kind === 'read'
          ? { kind, branchId: null, conversationId }
          : command;
    expect(await executeChatCommand(client, actorId, input, key)).toEqual(value);
  },
);
