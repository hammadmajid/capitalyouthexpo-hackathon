/// <reference types="jest" />
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readProfileDetails } from '@hsm/api-client';
import { useProfileDetails } from './use-profile-details';
jest.mock('@hsm/api-client', () => ({ readProfileDetails: jest.fn() }));
jest.mock('../lib/runtime', () => ({ client: {} }));
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
  jest.resetAllMocks();
  jest.mocked(readProfileDetails).mockResolvedValue(details);
});
async function mount(userId: string | undefined, verified: boolean) {
  const cache = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return { cache, ...(await renderHook(() => useProfileDetails(userId, verified), { wrapper })) };
}
test.each([
  [undefined, true],
  [id, false],
] as const)(
  'SEC: missing or unverified identity cannot request private details',
  async (userId, verified) => {
    const q = await mount(userId, verified);
    expect(q.result.current.fetchStatus).toBe('idle');
    expect(readProfileDetails).not.toHaveBeenCalled();
  },
);
test('AUTH-C SEC: native profile query is scoped to one identity and evicted on unmount', async () => {
  const q = await mount(id, true);
  await waitFor(() => expect(q.result.current.data).toEqual(details));
  expect(readProfileDetails).toHaveBeenCalledTimes(1);
  expect(readProfileDetails).toHaveBeenCalledWith({}, id);
  expect(q.cache.getQueryCache().getAll()[0]?.queryKey).toEqual(['private-profile-details', id]);
  await q.unmount();
  await waitFor(() => expect(q.cache.getQueryCache().getAll()).toHaveLength(0));
});
test('SEC: native private read failures are not retried automatically', async () => {
  jest.mocked(readProfileDetails).mockRejectedValue(new Error('private'));
  const q = await mount(id, true);
  await waitFor(() => expect(q.result.current.isError).toBe(true));
  expect(readProfileDetails).toHaveBeenCalledTimes(1);
});
