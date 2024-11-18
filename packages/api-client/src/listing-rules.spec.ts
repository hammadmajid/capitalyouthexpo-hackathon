import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  listPublicListingRules,
  listListingRules,
  readListingRule,
  createListingRule,
  editListingRule,
  archiveListingRule,
} from './listing-rules.js';
const branchId = randomUUID(),
  ruleId = randomUUID(),
  key = randomUUID(),
  version = 'a'.repeat(64);
const input = { body: 'Quiet shared spaces.', sortOrder: 0 };
const rule = { id: ruleId, ...input },
  row = {
    ...rule,
    branchId,
    version,
    createdAt: '2026-10-17T00:00:00Z',
    updatedAt: '2026-10-17T00:00:00Z',
    archivedAt: null,
  },
  state = { ...row, canEdit: true };
const page = { branchId, data: [rule], nextCursor: null },
  privatePage = { branchId, state: 'active', canEdit: false, data: [row], nextCursor: null };
function fixture(response: unknown, cookie = false) {
  const requests: Request[] = [],
    accessToken = vi.fn(async () => 'private-access');
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: cookie
      ? { kind: 'cookie', csrf: () => 'csrf-proof' }
      : { kind: 'bearer', accessToken },
    fetch: async (value, init) => {
      requests.push(value instanceof Request ? value : new Request(value, init));
      return Response.json(response);
    },
  });
  return { client, requests, accessToken };
}
function request(value: ReturnType<typeof fixture>) {
  const result = value.requests[0];
  if (!result) throw new Error('Missing request');
  return result;
}
it('ACC-002: public rule paging uses canonical branch, bounded query and no private credential lookup', async () => {
  const value = fixture(page);
  expect(await listPublicListingRules(value.client, branchId.toUpperCase())).toEqual(page);
  expect(value.accessToken).not.toHaveBeenCalled();
  const sent = request(value);
  expect(sent.headers.has('Authorization')).toBe(false);
  expect(new URL(sent.url).pathname).toBe('/v1/marketplace/' + branchId + '/rules');
  expect(new URL(sent.url).searchParams.get('limit')).toBe('20');
});
it('ACC-002: public continuation and genuine empty pages retain exact semantics', async () => {
  const cursor = '0:' + ruleId,
    value = fixture({ ...page, data: [{ ...rule, sortOrder: 1 }] });
  await listPublicListingRules(value.client, branchId, { limit: 1, cursor });
  expect(new URL(request(value).url).searchParams.get('cursor')).toBe(cursor);
  expect(
    (await listPublicListingRules(fixture({ ...page, data: [] }).client, branchId)).data,
  ).toEqual([]);
});
it('ACC-004: private history and exact current state retain scope, state and authentication', async () => {
  const history = {
      ...privatePage,
      state: 'archived',
      data: [{ ...row, archivedAt: row.updatedAt }],
    },
    value = fixture(history);
  expect(
    await listListingRules(value.client, branchId.toUpperCase(), { state: 'archived' }),
  ).toEqual(history);
  expect(new URL(request(value).url).searchParams.get('state')).toBe('archived');
  expect(request(value).headers.get('Authorization')).toBe('Bearer private-access');
  const current = fixture({ ...state, canEdit: false });
  expect(
    await readListingRule(current.client, branchId.toUpperCase(), ruleId.toUpperCase()),
  ).toEqual({ ...state, canEdit: false });
  expect(new URL(request(current).url).pathname).toBe(
    '/v1/branches/' + branchId + '/rules/' + ruleId,
  );
});
it('TRUST-006 / SEC-001: creation trims explicit text, carries command key and cookie CSRF proof', async () => {
  const value = fixture(state, true);
  expect(
    await createListingRule(
      value.client,
      branchId,
      { ...input, body: '  ' + input.body + '  ' },
      key,
    ),
  ).toEqual(state);
  const sent = request(value);
  expect(sent.method).toBe('POST');
  expect(sent.headers.get('Idempotency-Key')).toBe(key);
  expect(sent.headers.get('X-CSRF-Token')).toBe('csrf-proof');
  expect(sent.headers.has('If-Match')).toBe(false);
  expect(await sent.json()).toEqual(input);
});
it('TRUST-006 / ACC-004: edit and archival carry exact object, version, key and bounded reason', async () => {
  const value = fixture(state);
  await editListingRule(value.client, branchId, ruleId, version, input, key);
  const sent = request(value);
  expect(sent.method).toBe('PUT');
  expect(sent.headers.get('If-Match')).toBe('"' + version + '"');
  expect(sent.headers.get('Idempotency-Key')).toBe(key);
  expect(await sent.json()).toEqual(input);
  const archived = fixture({ ...state, archivedAt: row.updatedAt });
  await archiveListingRule(
    archived.client,
    branchId,
    ruleId,
    version,
    { reason: ' Superseded ' },
    key,
  );
  expect(new URL(request(archived).url).pathname).toBe(
    '/v1/branches/' + branchId + '/rules/' + ruleId + '/archive',
  );
  expect(await request(archived).json()).toEqual({ reason: 'Superseded' });
});
it.each([
  { ...page, branchId: randomUUID() },
  { ...page, data: [{ ...rule, actorUserId: randomUUID() }] },
  { ...page, data: [rule, rule] },
  { ...page, nextCursor: '1:' + ruleId },
])('ACC-002 / SEC-003: malformed or private public page %# is rejected', async (body) => {
  await expect(listPublicListingRules(fixture(body).client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('ACC-002: returned page cannot exceed requested bound or precede its continuation', async () => {
  const other = { ...rule, id: randomUUID(), sortOrder: 1 };
  await expect(
    listPublicListingRules(fixture({ ...page, data: [rule, other] }).client, branchId, {
      limit: 1,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listPublicListingRules(fixture(page).client, branchId, { cursor: '0:' + ruleId }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    listPublicListingRules(fixture({ ...page, nextCursor: '0:' + ruleId }).client, branchId, {
      limit: 2,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('ACC-004: wrong history state or exact object cannot substitute a valid-looking private response', async () => {
  await expect(
    listListingRules(fixture(privatePage).client, branchId, { state: 'archived' }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  for (const body of [
    { ...state, id: randomUUID() },
    { ...state, branchId: randomUUID() },
  ])
    await expect(readListingRule(fixture(body).client, branchId, ruleId)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
});
it.each([
  { ...state, canEdit: false },
  { ...state, archivedAt: row.updatedAt },
  { ...state, body: 'Other text' },
  { ...state, sortOrder: 1 },
  { ...state, branchId: randomUUID() },
])(
  'TRUST-006: persisted creation/edit response %# must match explicit intent and active write authority',
  async (body) => {
    await expect(
      createListingRule(fixture(body).client, branchId, input, key),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      editListingRule(fixture(body).client, branchId, ruleId, version, input, key),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('AUD-001: archive response requires the exact archived child and current write capability', async () => {
  for (const body of [
    state,
    { ...state, archivedAt: row.updatedAt, id: randomUUID() },
    { ...state, archivedAt: row.updatedAt, canEdit: false },
  ])
    await expect(
      archiveListingRule(
        fixture(body).client,
        branchId,
        ruleId,
        version,
        { reason: 'Superseded' },
        key,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: invalid arguments never dispatch network requests', async () => {
  const value = fixture({});
  for (const call of [
    () => listPublicListingRules(value.client, branchId, { state: 'archived' }),
    () => listListingRules(value.client, branchId, { limit: 101 }),
    () => readListingRule(value.client, branchId, 'bad'),
    () => createListingRule(value.client, branchId, { ...input, requiredDocuments: [] }, key),
    () => editListingRule(value.client, branchId, ruleId, 'bad', input, key),
    () => archiveListingRule(value.client, branchId, ruleId, version, { reason: '' }, key),
    () => createListingRule(value.client, 'bad', input, key),
    () => createListingRule(value.client, branchId, input, 'bad'),
  ])
    await expect(call()).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});

it('ACC-002 / ACC-004: absent optional cursors are omitted from public and private wire queries', async () => {
  const publicValue = fixture(page),
    privateValue = fixture(privatePage);
  await listPublicListingRules(publicValue.client, branchId, { cursor: undefined });
  await listListingRules(privateValue.client, branchId, { cursor: undefined });
  for (const value of [publicValue, privateValue]) {
    const query = new URL(request(value).url).searchParams;
    expect(query.has('cursor')).toBe(false);
    expect(query.get('limit')).toBe('20');
  }
});
