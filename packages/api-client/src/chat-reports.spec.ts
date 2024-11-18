import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { reportChatMessage, listChatReports, readChatSafetyContext } from './chat-reports.js';
import { RetainedChatCommand, executeChatCommand } from './chat-command.js';
import { ClientFailure } from './result.js';
const actorId = randomUUID(),
  messageId = randomUUID(),
  reportId = randomUUID(),
  key = randomUUID(),
  conversationId = randomUUID(),
  branchId = randomUUID();
const input = {
    targetType: 'chat_message' as const,
    targetId: messageId,
    reason: 'harassment' as const,
    details: 'Specific incident',
  },
  report = {
    ...input,
    id: reportId,
    reporterUserId: actorId,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
function fixture(value: unknown) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(value));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch,
    }),
  };
}
it.each([undefined, branchId])(
  'COMM-002: report commands preserve actor, message, scope, evidence and idempotency key',
  async (branch) => {
    const f = fixture(report);
    expect(
      await reportChatMessage(
        f.client,
        actorId,
        input,
        key,
        branch,
        branch ? conversationId : undefined,
      ),
    ).toEqual(report);
    const request = f.fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Missing request');
    expect(request.headers.get('idempotency-key')).toBe(key);
    expect(request.headers.get('x-csrf-token')).toBe('csrf');
    expect(await request.json()).toEqual(input);
    expect(request.url).toContain(
      branch
        ? '/branches/' + branch + '/conversations/' + conversationId + '/reports'
        : '/me/reports',
    );
  },
);
it.each([
  { reporterUserId: randomUUID() },
  { targetId: randomUUID() },
  { reason: 'spam' },
  { details: 'Rewritten' },
  { status: 'investigating' },
  { email: 'private@example.test' },
])('SEC-003: foreign or changed report acknowledgements fail closed', async (patch) => {
  await expect(
    reportChatMessage(fixture({ ...report, ...patch }).client, actorId, input, key),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('COMM-002: incomplete staff scope cannot silently become an own-context report', async () => {
  const f = fixture(report);
  await expect(reportChatMessage(f.client, actorId, input, key, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  await expect(
    reportChatMessage(f.client, actorId, input, key, undefined, conversationId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(f.fetch).not.toHaveBeenCalled();
});
it('COMM-002 / ACC-006: uncertain report retries retain exact evidence, branch and key', async () => {
  const f = fixture(report),
    execute = vi
      .fn()
      .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
      .mockResolvedValueOnce(report),
    retained = new RetainedChatCommand(execute);
  const command = { kind: 'report', conversationId, branchId, body: input };
  await expect(retained.send(command, key)).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  expect(retained.locked).toBe(true);
  expect(() => retained.reset()).toThrow();
  await retained.retry();
  expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0]);
  expect(retained.locked).toBe(false);
  expect(await executeChatCommand(f.client, actorId, { ...command, kind: 'report' }, key)).toEqual(
    report,
  );
});
it('COMM-002: safety queues correlate filters and cursor boundaries without message content', async () => {
  const ordered = [report, { ...report, id: randomUUID() }].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const f = fixture({ data: ordered, nextCursor: ordered[1]?.id });
  expect((await listChatReports(f.client, { status: 'open', limit: 2 })).data).toEqual(ordered);
  for (const page of [
    { data: [...ordered].reverse(), nextCursor: null },
    { data: [report], nextCursor: randomUUID() },
    { data: [{ ...report, status: 'dismissed' }], nextCursor: null },
    { data: ordered, nextCursor: null },
  ]) {
    await expect(
      listChatReports(fixture(page).client, { status: 'open', limit: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
  expect(
    await listChatReports(fixture({ data: [], nextCursor: null }).client, { cursor: reportId }),
  ).toEqual({ data: [], nextCursor: null });
});
it('COMM-002: safety access binds the exact case and explicit justification; expanded disclosures are rejected', async () => {
  const context = {
      reportId,
      reportedMessageId: messageId,
      messages: [
        {
          id: messageId,
          senderSide: 'customer',
          body: 'Reported evidence',
          attachmentCount: 0,
          createdAt: new Date().toISOString(),
          removed: false,
        },
      ],
    },
    f = fixture(context);
  expect(
    await readChatSafetyContext(f.client, reportId, { justification: ' Review case evidence ' }),
  ).toEqual(context);
  const request = f.fetch.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error('Missing request');
  expect(await request.json()).toEqual({ justification: 'Review case evidence' });
  await expect(
    readChatSafetyContext(fixture({ ...context, reportId: randomUUID() }).client, reportId, {
      justification: 'Review',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    readChatSafetyContext(
      fixture({ ...context, fileUrls: ['https://private.test'] }).client,
      reportId,
      { justification: 'Review' },
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
