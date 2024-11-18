import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { ApiFailure, ClientFailure } from './result.js';
import {
  executeInventoryImport,
  inventoryImportTemplate,
  readInventoryImport,
  RetainedInventoryImport,
} from './inventory-import.js';
const branch = randomUUID(),
  run = randomUUID(),
  file = randomUUID(),
  key = randomUUID(),
  type = randomUUID();
const preview = {
  id: run,
  branchId: branch,
  kind: 'rooms',
  status: 'validated',
  totalRows: 2,
  errorRows: 0,
  createdAt: '2026-10-25T10:00:00.000Z',
  committedAt: null,
  rows: [
    { recordNumber: 2, roomTypeId: type, roomNumber: '201', bedLabel: null, errors: [] },
    { recordNumber: 3, roomTypeId: type, roomNumber: '202', bedLabel: null, errors: [] },
  ],
  nextOffset: null,
};
function fixture(value: unknown) {
  const requests: Request[] = [],
    client = createApiClient({
      baseUrl: 'https://example.test',
      authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
      fetch: async (input, init) => {
        requests.push(input instanceof Request ? input : new Request(input, init));
        return Response.json(value);
      },
    });
  return {
    requests,
    client,
    request() {
      const request = requests[0];
      if (!request) throw new Error('Missing request');
      return request;
    },
  };
}
const denial = () =>
  new ApiFailure({
    type: 'about:blank',
    title: 'Denied',
    detail: 'Denied',
    status: 403,
    code: 'FORBIDDEN',
    traceId: 'fixture',
  });
it('PROP-001 / ACC-004: template identifies current branch/kind and exact selected room type', async () => {
  const value = fixture({
    branchId: branch,
    kind: 'rooms',
    fileName: 'hsm-rooms.csv',
    csv: 'room_type_id,room_number\r\n',
  });
  await inventoryImportTemplate(value.client, branch, 'rooms', type);
  expect(new URL(value.request().url).searchParams.get('roomTypeId')).toBe(type);
  const seats = fixture({
    branchId: branch,
    kind: 'seats',
    fileName: 'hsm-seats.csv',
    csv: 'room_number,bed_label\r\n',
  });
  await inventoryImportTemplate(seats.client, branch, 'seats');
  expect(new URL(seats.request().url).searchParams.size).toBe(0);
});
it.each([{ branchId: file }, { kind: 'seats' }, { fileName: 'unexpected.csv' }])(
  'ACC-004: reject mismatched template %j',
  async (patch) => {
    const value = fixture({
      branchId: branch,
      kind: 'rooms',
      fileName: 'hsm-rooms.csv',
      csv: '',
      ...patch,
    });
    await expect(inventoryImportTemplate(value.client, branch, 'rooms')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
it('PROP-001: preview pages preserve exact record positions and continuation without skipping rows', async () => {
  const value = fixture(preview);
  expect(await readInventoryImport(value.client, branch, run)).toEqual(preview);
  const next = fixture({ ...preview, rows: preview.rows.slice(1) });
  await readInventoryImport(next.client, branch, run, { offset: 1, limit: 1 });
  expect(new URL(next.request().url).searchParams.get('offset')).toBe('1');
  const first = fixture({ ...preview, rows: preview.rows.slice(0, 1), nextOffset: 1 });
  expect((await readInventoryImport(first.client, branch, run, { limit: 1 })).nextOffset).toBe(1);
});
it.each([
  { id: file },
  { branchId: file },
  { nextOffset: 1 },
  { rows: [] },
  { rows: [{ ...preview.rows[0], recordNumber: 3 }, preview.rows[1]] },
  { status: 'committed', committedAt: null },
])('ACC-004: reject mismatched or incomplete preview %j', async (patch) => {
  const value = fixture({ ...preview, ...patch });
  await expect(readInventoryImport(value.client, branch, run)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('PROP-001: writes preserve exact kind, source, run identity, key and CSRF', async () => {
  const value = fixture({ id: run, branchId: branch });
  await executeInventoryImport(
    value.client,
    branch,
    { kind: 'validate', body: { kind: 'rooms', fileId: file } },
    key,
  );
  expect(await value.request().json()).toEqual({ kind: 'rooms', fileId: file });
  expect(value.request().headers.get('Idempotency-Key')).toBe(key);
  expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
  const commit = fixture({ id: run, branchId: branch });
  await executeInventoryImport(commit.client, branch, { kind: 'commit', runId: run }, key);
  expect(await commit.request().json()).toEqual({});
  expect(commit.request().url).toContain('/' + run + '/commit');
});
it.each([{ branchId: file }, { id: file }])(
  'ACC-004: reject wrong commit correlation %j',
  async (patch) => {
    const value = fixture({ id: run, branchId: branch, ...patch });
    await expect(
      executeInventoryImport(value.client, branch, { kind: 'commit', runId: run }, key),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('PROP-001: unknown validate/commit outcomes freeze original body/key until resolved, including later denial', async () => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockRejectedValueOnce(denial())
    .mockResolvedValue({});
  const retained = new RetainedInventoryImport(execute),
    draft = { kind: 'validate' as const, body: { kind: 'rooms' as const, fileId: file } };
  await expect(retained.send(draft, key)).rejects.toThrow();
  draft.body.fileId = run;
  expect(retained.locked).toBe(true);
  expect(() => retained.reset()).toThrow();
  expect(() => retained.send({ kind: 'commit', runId: run }, key)).toThrow();
  await expect(retained.retry()).rejects.toThrow();
  expect(retained.locked).toBe(true);
  await retained.retry();
  expect(execute.mock.calls).toEqual(
    Array.from({ length: 3 }, () => [
      { kind: 'validate', body: { kind: 'rooms', fileId: file } },
      key,
    ]),
  );
  expect(() => retained.send({ kind: 'commit', runId: run }, key)).toThrow();
  await expect(retained.retry()).rejects.toThrow();
  retained.reset();
  await retained.send({ kind: 'commit', runId: run }, randomUUID());
});
it('PROP-001: invalid key/first definitive denial permit correction; pending commands cannot race retry', async () => {
  const execute = vi.fn().mockRejectedValueOnce(denial()).mockResolvedValue({}),
    retained = new RetainedInventoryImport(execute);
  expect(() => retained.send({ kind: 'commit', runId: run }, 'invalid')).toThrow();
  await expect(retained.retry()).rejects.toThrow();
  await expect(retained.send({ kind: 'commit', runId: run }, key)).rejects.toThrow();
  expect(retained.locked).toBe(false);
  await retained.send({ kind: 'commit', runId: run }, randomUUID());
  let finish: (value: unknown) => void = () => {
    throw new Error('Not started');
  };
  const pending = new RetainedInventoryImport(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    request = pending.send({ kind: 'commit', runId: run }, key);
  await expect(pending.retry()).rejects.toThrow();
  finish({});
  await request;
});
