import { expect, it } from 'vitest';
import { inboxItemSchema, inboxPageSchema, inboxReadSchema } from './inbox.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const time = '2026-10-14T12:00:00.000Z';
const item = {
  id,
  type: 'account.email_verified',
  title: 'Email verified',
  body: 'Your email address has been verified.',
  readAt: null,
  createdAt: time,
};
it('NTF-002 SEC-003: own inbox DTO excludes raw data and recipient identity', () => {
  expect(inboxItemSchema.parse(item)).toEqual(item);
  expect(inboxItemSchema.safeParse({ ...item, userId: id }).success).toBe(false);
  expect(inboxItemSchema.safeParse({ ...item, data: { private: true } }).success).toBe(false);
  expect(inboxItemSchema.safeParse({ ...item, deepLink: 'https://example.test' }).success).toBe(
    false,
  );
});
it('NTF-002: unread counts and server timestamps are strictly bounded', () => {
  expect(
    inboxPageSchema.parse({ data: [item], nextCursor: null, unreadCount: 1 }).unreadCount,
  ).toBe(1);
  expect(inboxPageSchema.safeParse({ data: [], nextCursor: null, unreadCount: -1 }).success).toBe(
    false,
  );
  expect(inboxReadSchema.parse({ id, readAt: time })).toEqual({ id, readAt: time });
  expect(inboxReadSchema.safeParse({ id, readAt: null }).success).toBe(false);
});
