/// <reference types="jest" />
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { publicGallery } from '@hsm/api-client';
import { PublicGallery } from './gallery';
import { pullToRefresh } from '../../test-utils/pull-refresh';
jest.mock('../../lib/runtime', () => ({ client: {}, config: { apiUrl: 'https://example.test' } }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  publicGallery: jest.fn(),
}));
const branchId = '019a1234-1234-7123-8123-123456789abc',
  photoId = '019a1234-1234-7123-8123-123456789abd',
  secondId = '019a1234-1234-7123-8123-123456789abe';
let cache: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => cache.clear());

test('ROOM-003: actual native gallery continuation appends public photos without credentials or duplicate views', async () => {
  jest
    .mocked(publicGallery)
    .mockResolvedValueOnce({
      branchId,
      data: [{ id: photoId, altText: 'Actual exterior' }],
      nextCursor: '0:' + photoId,
    })
    .mockResolvedValueOnce({
      branchId,
      data: [
        { id: photoId, altText: 'Actual exterior' },
        { id: secondId, altText: 'Actual room' },
      ],
      nextCursor: null,
    });
  await render(<PublicGallery branchId={branchId} />, { wrapper });
  expect(await screen.findByLabelText('Actual exterior')).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Load more hostel photos' }));
  expect(await screen.findByLabelText('Actual room')).toBeOnTheScreen();
  expect(screen.getAllByLabelText('Actual exterior')).toHaveLength(1);
  expect(jest.mocked(publicGallery)).toHaveBeenLastCalledWith({}, branchId, {
    limit: 20,
    cursor: '0:' + photoId,
  });
  expect(screen.getByLabelText('Actual room').props.source).toEqual({
    uri: 'https://example.test/v1/marketplace/media/' + secondId,
  });
  expect(screen.queryByRole('button', { name: 'Load more hostel photos' })).toBeNull();
});
test('ROOM-003: genuine empty native gallery invents no photos', async () => {
  jest.mocked(publicGallery).mockResolvedValue({ branchId, data: [], nextCursor: null });
  await render(<PublicGallery branchId={branchId} />, { wrapper });
  expect(await screen.findByText('No published hostel photos are available.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Load more hostel photos' })).toBeNull();
});
test('SEC-003: failed native controlled image renders its actual description as unavailable', async () => {
  jest.mocked(publicGallery).mockResolvedValue({
    branchId,
    data: [{ id: photoId, altText: 'Actual exterior' }],
    nextCursor: null,
  });
  await render(<PublicGallery branchId={branchId} />, { wrapper });
  const image = await screen.findByLabelText('Actual exterior');
  await fireEvent(image, 'error');
  expect(screen.getByText('Photo unavailable: Actual exterior')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Actual exterior')).toBeNull();
});
test('ACC-002: failed native gallery is retryable and is never presented as empty success', async () => {
  jest
    .mocked(publicGallery)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ branchId, data: [], nextCursor: null });
  await render(<PublicGallery branchId={branchId} />, { wrapper });
  await screen.findByRole('alert');
  expect(screen.queryByText('No published hostel photos are available.')).toBeNull();
  await pullToRefresh(cache);
  expect(await screen.findByText('No published hostel photos are available.')).toBeOnTheScreen();
});

test('ACC-002: failed native refresh hides cached photos instead of presenting withdrawn content as current', async () => {
  jest
    .mocked(publicGallery)
    .mockResolvedValueOnce({
      branchId,
      data: [{ id: photoId, altText: 'Actual exterior' }],
      nextCursor: null,
    })
    .mockRejectedValueOnce(new Error('Withdrawn gallery'));
  await render(<PublicGallery branchId={branchId} />, { wrapper });
  await screen.findByLabelText('Actual exterior');
  await pullToRefresh(cache);
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Actual exterior')).toBeNull();
  expect(screen.queryByText('No published hostel photos are available.')).toBeNull();
});
