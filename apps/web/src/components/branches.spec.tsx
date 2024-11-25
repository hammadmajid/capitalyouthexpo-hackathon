import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Branches } from './branches';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('ACC-002: branch selector consumes the actual management data envelope', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            id: randomUUID(),
            organizationId: randomUUID(),
            brandId: randomUUID(),
            name: 'Branch A',
            verificationStatus: 'draft',
          },
        ],
        nextCursor: null,
      }),
    ),
  );
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <Branches context="manager" />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('option', { name: 'Branch A' })).toBeDefined();
  cache.clear();
});

it('SEC-003 / ACC-004: changing accounts must fetch that account branches and discard the previous list', async () => {
  function response(name: string) {
    return Response.json({
      data: [
        {
          id: randomUUID(),
          organizationId: randomUUID(),
          brandId: randomUUID(),
          name,
          verificationStatus: 'draft',
        },
      ],
      nextCursor: null,
    });
  }
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response('First account branch'))
    .mockResolvedValueOnce(response('Second account branch'));
  vi.stubGlobal('fetch', transport);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mounted = render(
    <QueryClientProvider client={cache}>
      <Branches context="manager" actorId={randomUUID()} />
    </QueryClientProvider>,
  );
  await screen.findByRole('option', { name: 'First account branch' });
  mounted.rerender(
    <QueryClientProvider client={cache}>
      <Branches context="manager" actorId={randomUUID()} />
    </QueryClientProvider>,
  );
  await screen.findByRole('option', { name: 'Second account branch' });
  expect(screen.queryByRole('option', { name: 'First account branch' })).toBeNull();
  expect(transport).toHaveBeenCalledTimes(2);
  cache.clear();
});
