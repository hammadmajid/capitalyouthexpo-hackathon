import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  createConversation,
  listOwnConversations,
  listBranchConversations,
  readChatMessages,
  sendChatMessage,
  markChatRead,
} from './chat.js';
const actorId = randomUUID(),
  branchId = randomUUID(),
  conversationId = randomUUID(),
  messageId = randomUUID(),
  key = randomUUID();
const at = '2026-10-24T03:00:00.000Z';
const conversation = {
  id: conversationId,
  branchId,
  branchName: 'Hostel',
  customerUserId: actorId,
  customerName: 'Customer',
  lastMessageAt: null,
  createdAt: at,
  lastReadAt: null,
  unreadCount: 0,
};
const message = {
  id: messageId,
  conversationId,
  senderUserId: actorId,
  senderName: 'Customer',
  senderSide: 'customer',
  body: 'Hello',
  attachmentFileIds: [],
  createdAt: at,
};
function fixture(value: unknown) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(value));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
    }),
  };
}
it('COMM-001: create validates exact customer/branch and original command key', async () => {
  const f = fixture(conversation);
  expect(await createConversation(f.client, actorId, { branchId }, key)).toEqual(conversation);
  const request = f.fetch.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error('Request absent');
  expect(request.headers.get('idempotency-key')).toBe(key);
  expect(request.headers.get('x-csrf-token')).toBe('csrf');
  expect(await request.json()).toEqual({ branchId });
});
it.each([
  { ...conversation, customerUserId: randomUUID() },
  { ...conversation, branchId: randomUUID() },
  { ...conversation, email: 'private@example.test' },
])('COMM-001 / SEC-003: foreign or expanded conversation results fail closed', async (value) => {
  await expect(
    createConversation(fixture(value).client, actorId, { branchId }, key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('COMM-001: own and branch lists have exact scope and page order', async () => {
  const value = { data: [conversation], nextCursor: null };
  expect(await listOwnConversations(fixture(value).client, actorId)).toEqual(value);
  expect(await listBranchConversations(fixture(value).client, branchId)).toEqual(value);
  await expect(listOwnConversations(fixture(value).client, randomUUID())).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  await expect(listBranchConversations(fixture(value).client, randomUUID())).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it.each([
  { data: [conversation, conversation], nextCursor: null },
  { data: [], nextCursor: conversationId },
  { data: [conversation], nextCursor: conversationId },
])('COMM-001: malformed conversation continuation/duplicates are rejected', async (value) => {
  await expect(listOwnConversations(fixture(value).client, actorId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('COMM-001: exact continuation accepts full pages and rejects stale cursors/page overflow', async () => {
  const value = { data: [conversation], nextCursor: conversationId };
  expect(
    (await listOwnConversations(fixture(value).client, actorId, { limit: 1 })).nextCursor,
  ).toBe(conversationId);
  await expect(
    listOwnConversations(fixture(value).client, actorId, { cursor: conversationId }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listOwnConversations(
      fixture({ data: [conversation, conversation], nextCursor: null }).client,
      actorId,
      { limit: 1 },
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([undefined, branchId])(
  'COMM-001: private message history binds its exact thread and newest-first cursor (%s)',
  async (branch) => {
    const value = { data: [message], nextCursor: null };
    expect(await readChatMessages(fixture(value).client, conversationId, {}, branch)).toEqual(
      value,
    );
    await expect(
      readChatMessages(fixture(value).client, conversationId, { cursor: messageId }, branch),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      readChatMessages(
        fixture({ data: [{ ...message, conversationId: randomUUID() }], nextCursor: null }).client,
        conversationId,
        {},
        branch,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it.each([undefined, branchId])(
  'COMM-001: sends preserve exact sender side, trimmed text and selected file refs (%s)',
  async (branch) => {
    const fileId = randomUUID(),
      result = {
        ...message,
        senderSide: branch ? 'branch' : 'customer',
        attachmentFileIds: [fileId],
      };
    const f = fixture(result);
    expect(
      await sendChatMessage(
        f.client,
        actorId,
        conversationId,
        { body: ' Hello ', attachmentFileIds: [fileId] },
        key,
        branch,
      ),
    ).toEqual(result);
    const request = f.fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Request absent');
    expect(await request.json()).toEqual({ body: 'Hello', attachmentFileIds: [fileId] });
  },
);
it.each([
  { ...message, senderUserId: randomUUID() },
  { ...message, conversationId: randomUUID() },
  { ...message, body: 'Changed' },
  { ...message, senderSide: 'branch' },
  { ...message, attachmentFileIds: [randomUUID()] },
])('COMM-001: mismatched message acknowledgements are rejected', async (value) => {
  await expect(
    sendChatMessage(fixture(value).client, actorId, conversationId, { body: 'Hello' }, key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('COMM-001: attachment-only sending keeps text absent and read markers bind exact thread', async () => {
  const fileId = randomUUID(),
    f = fixture({ ...message, body: null, attachmentFileIds: [fileId] });
  expect(
    (await sendChatMessage(f.client, actorId, conversationId, { attachmentFileIds: [fileId] }, key))
      .body,
  ).toBeNull();
  for (const branch of [undefined, branchId])
    expect(
      await markChatRead(
        fixture({ conversationId, lastReadAt: at }).client,
        conversationId,
        key,
        branch,
      ),
    ).toEqual({ conversationId, lastReadAt: at });
  await expect(
    markChatRead(
      fixture({ conversationId: randomUUID(), lastReadAt: at }).client,
      conversationId,
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('COMM-001: malformed commands fail before transport', async () => {
  const f = fixture(message);
  await expect(sendChatMessage(f.client, actorId, conversationId, {}, key)).rejects.toThrow();
  await expect(listOwnConversations(f.client, actorId, { limit: 101 })).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
