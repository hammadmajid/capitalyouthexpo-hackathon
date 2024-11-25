import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readProfileDetails } from '@hsm/api-client';
import { useProfileDetails } from './use-profile-details';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readProfileDetails: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const id = '550e8400-e29b-41d4-a716-446655440000';
const details = {
  userId: id,
  fullName: '',
  email: null,
  emailVerified: true,
  phone: null,
  gender: null,
  cnicLast4: null,
  profilePhotoFileId: null,
  customer: null,
  owner: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readProfileDetails).mockResolvedValue(details);
});
afterEach(cleanup);
function mount(userId: string | undefined, verified: boolean) {
  const cache = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return { cache, ...renderHook(() => useProfileDetails(userId, verified), { wrapper }) };
}
it.each([
  [undefined, true],
  [id, false],
] as const)(
  'SEC: missing or unverified identity cannot request private details',
  (userId, verified) => {
    const q = mount(userId, verified);
    expect(q.result.current.fetchStatus).toBe('idle');
    expect(readProfileDetails).not.toHaveBeenCalled();
  },
);
it('AUTH-C SEC: query is self-keyed and ephemeral', async () => {
  const q = mount(id, true);
  await waitFor(() => expect(q.result.current.data).toEqual(details));
  expect(readProfileDetails).toHaveBeenCalledExactlyOnceWith({}, id);
  const query = q.cache.getQueryCache().getAll()[0];
  expect(query?.queryKey).toEqual(['private-profile-details', id]);
  expect(query?.options.gcTime).toBe(0);
  q.unmount();
  await waitFor(() => expect(q.cache.getQueryCache().getAll()).toHaveLength(0));
});
it('SEC: private read failures are not automatically retried', async () => {
  vi.mocked(readProfileDetails).mockRejectedValue(new Error('private'));
  const q = mount(id, true);
  await waitFor(() => expect(q.result.current.isError).toBe(true));
  expect(readProfileDetails).toHaveBeenCalledTimes(1);
});
