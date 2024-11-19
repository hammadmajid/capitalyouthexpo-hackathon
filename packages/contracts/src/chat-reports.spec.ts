import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  chatReportInputSchema,
  chatReportPageQuerySchema,
  chatReportSchema,
  chatSafetyAccessSchema,
  chatSafetyContextSchema,
  reportReasonSchema,
} from './chat-reports.js';
const id = randomUUID(),
  input = { targetType: 'chat_message', targetId: id, reason: 'harassment' };
it('COMM-002: reported-message submissions are strict and bounded', () => {
  expect(chatReportInputSchema.parse({ ...input, details: '  Specific concern  ' })).toEqual({
    ...input,
    details: 'Specific concern',
  });
  expect(reportReasonSchema.options).toHaveLength(8);
  expect(chatReportPageQuerySchema.parse({ status: 'open' })).toMatchObject({
    status: 'open',
    limit: 20,
  });
  expect(
    chatReportSchema.parse({
      ...input,
      id,
      reporterUserId: randomUUID(),
      details: null,
      status: 'open',
      createdAt: new Date().toISOString(),
    }).targetId,
  ).toBe(id);
});
it.each([
  { targetType: 'user' },
  { targetId: 'bad' },
  { reason: 'invented' },
  { details: '' },
  { details: 'x'.repeat(4001) },
  { participantUserId: randomUUID() },
  { attachmentUrl: 'https://private.example' },
])('SEC-003: invalid or expanded report input cannot change source authority', (patch) => {
  expect(chatReportInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
it.each(['', '  ', 'x'.repeat(1001)])(
  'COMM-002: safety access requires a bounded, nonblank justification',
  (justification) => {
    expect(chatSafetyAccessSchema.safeParse({ justification }).success).toBe(false);
  },
);
it('COMM-002: safety windows contain the actual reported message with at most two neighbors on each side', () => {
  const ids = [1, 2, 3, 4, 5, 6].map(
    (value) => '10000000-0000-4000-8000-' + String(value).padStart(12, '0'),
  );
  const messages = ids.map((messageId) => ({
    id: messageId,
    senderSide: 'customer',
    body: 'Private case evidence',
    attachmentCount: 0,
    createdAt: new Date().toISOString(),
    removed: false,
  }));
  const context = { reportId: id, reportedMessageId: ids[2], messages: messages.slice(0, 5) };
  expect(chatSafetyContextSchema.safeParse(context).success).toBe(true);
  expect(chatSafetyContextSchema.safeParse({ ...context, messages }).success).toBe(false);
  expect(
    chatSafetyContextSchema.safeParse({ ...context, reportedMessageId: randomUUID() }).success,
  ).toBe(false);
  expect(chatSafetyContextSchema.safeParse({ ...context, reportedMessageId: ids[0] }).success).toBe(
    false,
  );
  expect(
    chatSafetyContextSchema.safeParse({ ...context, messages: [...context.messages].reverse() })
      .success,
  ).toBe(false);
  expect(
    chatSafetyContextSchema.safeParse({ ...context, messages: [messages[2], messages[2]] }).success,
  ).toBe(false);
  expect(
    chatSafetyContextSchema.safeParse({ ...context, messageBody: 'unbounded disclosure' }).success,
  ).toBe(false);
});
