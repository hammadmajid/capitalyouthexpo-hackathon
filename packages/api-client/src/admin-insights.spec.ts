import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  downloadPlatformAudit,
  readPlatformAudit,
  readPlatformOverview,
} from './admin-insights.js';
const id = '10000000-0000-4000-8000-000000000001',
  at = '2026-10-30T06:00:00.000Z';
function wire(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
      fetch,
    }),
  };
}
it('AUD-001 SEC-003: metadata pagination preserves bound credentials and exact filters', async () => {
  const row = {
    id: '100',
    actorId: id,
    actorRole: 'root',
    action: 'review.hide',
    targetType: 'review',
    targetId: id,
    createdAt: at,
  };
  const f = wire({ data: [row], nextCursor: at + '|100' });
  expect(
    (await readPlatformAudit(f.client, { cursor: at + '|101', action: 'review.hide', limit: 1 }))
      .data,
  ).toEqual([row]);
  const request = required(f.fetch.mock.calls[0])[0] as Request;
  expect(request.headers.get('Authorization')).toBe('Bearer fixture');
  expect(new URL(request.url).searchParams.get('cursor')).toBe(at + '|101');
});
it('RPT-003 SEC-003: malformed date/cursor and raw audit payloads fail closed', async () => {
  const f = wire({});
  expect(() => readPlatformOverview(f.client, { from: 'invalid', to: '2026-10-30' })).toThrow();
  expect(() => readPlatformAudit(f.client, { cursor: at + '|0' })).toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
  const privateBody = wire({
    data: [
      {
        id: '1',
        actorId: id,
        actorRole: 'root',
        action: 'review.hide',
        targetType: 'review',
        targetId: id,
        createdAt: at,
        before: { passwordHash: 'private' },
      },
    ],
    nextCursor: null,
  });
  await expect(readPlatformAudit(privateBody.client)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('AUD-001 RPT-001: CSV download keeps current auth, filter bounds and server truncation', async () => {
  const f = wire({});
  f.fetch.mockResolvedValue(
    new Response('"id"\r\n"1"\r\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-HSM-Report-Truncated': 'true' },
    }),
  );
  expect(await downloadPlatformAudit(f.client, { from: '2026-10-01' })).toMatchObject({
    csv: '"id"\r\n"1"\r\n',
    truncated: true,
  });
  const request = required(f.fetch.mock.calls[0])[0] as Request;
  expect(request.headers.get('Authorization')).toBe('Bearer fixture');
  expect(new URL(request.url).pathname).toBe('/v1/admin/audit-log/export');
  const invalid = wire({});
  invalid.fetch.mockResolvedValue(
    new Response('not csv', { headers: { 'Content-Type': 'text/html' } }),
  );
  await expect(downloadPlatformAudit(invalid.client)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture value');
  return value;
}
