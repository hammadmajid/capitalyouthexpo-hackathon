import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  chatMessageInputSchema,
  chatMessageSchema,
  conversationSchema,
  chatPageQuerySchema,
  createConversationSchema,
} from './chat.js';
it('COMM-001 / SEC-003: text, clean-file references or both form explicit strict messages', () => {
  expect(chatMessageInputSchema.parse({ body: ' Hello ' })).toEqual({ body: 'Hello' });
  expect(
    chatMessageInputSchema.parse({ attachmentFileIds: [randomUUID()] }).attachmentFileIds,
  ).toHaveLength(1);
  expect(
    chatMessageInputSchema.parse({ body: 'Hello', attachmentFileIds: [randomUUID()] }).body,
  ).toBe('Hello');
});
it.each([
  {},
  { body: '' },
  { body: ' ' },
  { body: 'x'.repeat(4001) },
  { attachmentFileIds: [] },
  { attachmentFileIds: Array.from({ length: 6 }, () => randomUUID()) },
  { body: 'Hello', senderSide: 'branch' },
  { body: 'Hello', senderUserId: randomUUID() },
])('COMM-001: empty, expanded or unbounded messages are rejected', (value) => {
  expect(chatMessageInputSchema.safeParse(value).success).toBe(false);
});
it('COMM-001: duplicate attachment references cannot expand the message', () => {
  const file = randomUUID();
  expect(chatMessageInputSchema.safeParse({ attachmentFileIds: [file, file] }).success).toBe(false);
});
it('COMM-001: conversation creation and pages have bounded strict inputs', () => {
  const branchId = randomUUID();
  expect(createConversationSchema.parse({ branchId })).toEqual({ branchId });
  expect(
    createConversationSchema.safeParse({ branchId, customerUserId: randomUUID() }).success,
  ).toBe(false);
  expect(chatPageQuerySchema.parse({}).limit).toBe(20);
  expect(chatPageQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
});
it('COMM-001 / COMM-002: private projections reject unintended contact fields and empty messages', () => {
  const now = '2026-10-24T03:00:00.000Z',
    id = randomUUID();
  const conversation = {
    id,
    branchId: randomUUID(),
    branchName: 'Hostel',
    customerUserId: randomUUID(),
    customerName: 'Customer',
    lastMessageAt: null,
    createdAt: now,
    lastReadAt: null,
    unreadCount: 0,
  };
  expect(conversationSchema.parse(conversation)).toEqual(conversation);
  expect(
    conversationSchema.safeParse({ ...conversation, email: 'private@example.test' }).success,
  ).toBe(false);
  const message = {
    id,
    conversationId: id,
    senderUserId: randomUUID(),
    senderName: 'Customer',
    senderSide: 'customer',
    body: null,
    attachmentFileIds: [],
    createdAt: now,
  };
  expect(chatMessageSchema.safeParse(message).success).toBe(false);
  expect(
    chatMessageSchema.parse({ ...message, attachmentFileIds: [randomUUID()] }).body,
  ).toBeNull();
});
