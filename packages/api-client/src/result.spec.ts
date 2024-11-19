import { expect, it } from 'vitest';
import { z } from 'zod';
import { ApiFailure, ClientFailure, readApi } from './result.js';
const schema = z.object({ name: z.string() }).strict();
const problem = {
  type: 'https://example.com/problems/forbidden',
  title: 'Forbidden',
  status: 403,
  code: 'FORBIDDEN',
  detail: 'PRIVATE_MARKER',
  traceId: 'trace',
};
it('SEC-003: validates successful responses and rejects unexpected fields', async () => {
  expect(
    await readApi(
      Promise.resolve({ data: { name: 'Identity' }, response: new Response() }),
      schema,
    ),
  ).toEqual({ name: 'Identity' });
  await expect(
    readApi(
      Promise.resolve({ data: { name: 'Identity', secret: 'private' }, response: new Response() }),
      schema,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: typed problems preserve correlation without exposing detail in exception messages', async () => {
  const failure = await readApi(
    Promise.resolve({ error: problem, response: new Response(null, { status: 403 }) }),
    schema,
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ApiFailure);
  expect(failure).toMatchObject({
    code: 'FORBIDDEN',
    message: 'Request failed',
    problem: { traceId: 'trace' },
  });
});
it.each([{}, { ...problem, status: 401 }, { ...problem, stack: 'private' }])(
  'SEC-003: malformed or mismatched problems fail closed',
  async (error) => {
    await expect(
      readApi(Promise.resolve({ error, response: new Response(null, { status: 403 }) }), schema),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it.each([
  [new SyntaxError('PRIVATE_MARKER'), 'INVALID_RESPONSE'],
  [new Error('PRIVATE_MARKER'), 'NETWORK_UNAVAILABLE'],
])('SEC-003: transport failures use safe messages', async (error, code) => {
  const failure = await readApi(Promise.reject(error), schema).catch((value: unknown) => value);
  expect(failure).toBeInstanceOf(ClientFailure);
  expect(failure).toMatchObject({ code });
  expect((failure as ClientFailure).message).not.toContain('PRIVATE_MARKER');
});
