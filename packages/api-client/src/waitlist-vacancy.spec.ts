import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readExpectedVacancy, saveExpectedVacancy } from './waitlist-vacancy.js';
import {
  RetainedWaitlistCommand,
  executeWaitlistCommand,
  type WaitlistCommand,
} from './waitlist-command.js';
import { ClientFailure } from './result.js';
const branchId = randomUUID(),
  roomTypeId = randomUUID(),
  key = randomUUID();
const version = '2026-10-24T03:00:00.000Z',
  row = { branchId, roomTypeId, expectedVacancyDate: '2026-11-01', version };
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
it('WAIT-001: estimate reads bind exact branch and type', async () => {
  expect(await readExpectedVacancy(fixture(row).client, branchId, roomTypeId)).toEqual(row);
});
it.each([
  { ...row, branchId: randomUUID() },
  { ...row, roomTypeId: randomUUID() },
  { ...row, ownerId: randomUUID() },
])('WAIT-001 / SEC-003: foreign or expanded estimates fail closed', async (value) => {
  await expect(
    readExpectedVacancy(fixture(value).client, branchId, roomTypeId),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([null, '2026-11-01'])(
  'WAIT-001: explicit estimate save/clear (%s) sends the original version/key with CSRF',
  async (date) => {
    const f = fixture({ ...row, expectedVacancyDate: date, version: '2026-10-24T03:00:00.001Z' }),
      body = { expectedVersion: version, expectedVacancyDate: date };
    expect(
      (await saveExpectedVacancy(f.client, branchId, roomTypeId, body, key)).expectedVacancyDate,
    ).toBe(date);
    const request = f.fetch.mock.calls[0]?.[0];
    if (!(request instanceof Request)) throw new Error('Request absent');
    expect(request.headers.get('idempotency-key')).toBe(key);
    expect(request.headers.get('x-csrf-token')).toBe('csrf');
    expect(await request.json()).toEqual(body);
  },
);
it.each([
  { ...row, expectedVacancyDate: null },
  { ...row, version: null },
  { ...row, version: '2026-10-24T02:00:00.000Z' },
  row,
])('WAIT-001: unadvanced or mismatched acknowledgements are rejected', async (value) => {
  await expect(
    saveExpectedVacancy(
      fixture(value).client,
      branchId,
      roomTypeId,
      { expectedVersion: version, expectedVacancyDate: '2026-11-01' },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('WAIT-001: first publication accepts an actual server version without inventing a date', async () => {
  expect(
    await saveExpectedVacancy(
      fixture(row).client,
      branchId,
      roomTypeId,
      { expectedVersion: null, expectedVacancyDate: '2026-11-01' },
      key,
    ),
  ).toEqual(row);
  const f = fixture(row);
  await expect(
    saveExpectedVacancy(
      f.client,
      branchId,
      roomTypeId,
      { expectedVersion: null, expectedVacancyDate: '' },
      key,
    ),
  ).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it('WAIT-001: uncertain estimate intent retains its original date/version/key and dispatches the actual API', async () => {
  const execute = vi
    .fn<(command: WaitlistCommand, key: string) => Promise<unknown>>()
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(row);
  const retained = new RetainedWaitlistCommand(execute);
  const command = {
    kind: 'vacancy' as const,
    branchId,
    roomTypeId,
    body: { expectedVersion: null, expectedVacancyDate: '2026-11-01' },
  };
  await expect(retained.send(command, key)).rejects.toThrow();
  command.body.expectedVacancyDate = '2026-12-01';
  await retained.retry();
  expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);
  expect(execute.mock.calls[0]?.[0]).toMatchObject({ body: { expectedVacancyDate: '2026-11-01' } });
  const f = fixture(row);
  expect(
    await executeWaitlistCommand(
      f.client,
      { ...command, body: { expectedVersion: null, expectedVacancyDate: '2026-11-01' } },
      key,
    ),
  ).toEqual(row);
});
