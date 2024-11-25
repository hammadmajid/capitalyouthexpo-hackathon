// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { loadPublicHostelSummary } from './public-summary';
import { webConfig } from './config';
import { branchId, summary } from '../../test/unit/public-summary.fixture';
it('SEC-003 / p.14: SSR fetches only fresh public transports with no cookie/session forwarding or redirects', async () => {
  const requests: Request[] = [];
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const path = new URL(request.url).pathname;
    return Response.json(
      path.endsWith('/rules')
        ? summary.rules
        : path.endsWith('/room-types')
          ? summary.rooms
          : summary.listing,
    );
  });
  const result = await loadPublicHostelSummary(branchId, {}, transport, webConfig({}));
  expect(result).toEqual(summary);
  expect(requests).toHaveLength(3);
  expect(
    requests.every(
      (request) =>
        request.url.startsWith('http://127.0.0.1:4000/v1/marketplace/') &&
        !request.headers.has('cookie') &&
        !request.headers.has('authorization'),
    ),
  ).toBe(true);
});
it('SEC-003: backend network failure produces no cached or private fallback', async () => {
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE marker'));
  await expect(
    loadPublicHostelSummary(branchId, {}, transport, webConfig({})),
  ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
});
