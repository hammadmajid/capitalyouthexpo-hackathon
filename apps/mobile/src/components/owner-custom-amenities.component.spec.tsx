/// <reference types="jest" />
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readCustomAmenities } from '@hsm/api-client';
import { OwnerCustomAmenities } from './owner-custom-amenities';
const mockMutate = jest.fn();
jest.mock('@hsm/api-client', () => ({ readCustomAmenities: jest.fn() }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn().mockResolvedValue({}) }));
jest.mock('./services/use-command', () => ({
  useNativeCommand: () => ({ mutate: mockMutate, isPending: false, unresolved: false }),
}));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
async function mount(canEdit: boolean) {
  jest.mocked(readCustomAmenities).mockResolvedValue({
    branchId: 'branch',
    organizationId: 'org',
    nextCursor: null,
    canEdit,
    data: [
      {
        code: 'custom_study',
        name: 'Study lounge',
        category: 'facilities',
        organizationId: 'org',
        isActive: true,
        version: 'version',
      },
    ],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const change = jest.fn();
  const view = await render(
    <QueryClientProvider client={client}>
      <OwnerCustomAmenities actorId="actor" branchId="branch" selected={[]} change={change} />
    </QueryClientProvider>,
  );
  await screen.findByRole('radio', { name: 'Study lounge' });
  return {
    change,
    close: () => {
      view.unmount();
      client.clear();
    },
  };
}
it('ACC-002: managers can select scoped offerings without owner CRUD controls', async () => {
  const f = await mount(false);
  expect(screen.queryByRole('button', { name: 'Add custom amenity' })).toBeNull();
  await fireEvent.press(screen.getByRole('radio', { name: 'Study lounge' }));
  expect(f.change).toHaveBeenCalledWith(['custom_study']);
  f.close();
});
it('LIST-001: owner creation sends a validated category/name command', async () => {
  const f = await mount(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Add custom amenity' }));
  await fireEvent.changeText(screen.getByLabelText('Custom amenity name'), 'Laundry service');
  await fireEvent.press(screen.getByRole('radio', { name: 'Services' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save amenity' }));
  expect(mockMutate).toHaveBeenCalledWith(
    { kind: 'create', name: 'Laundry service', category: 'services' },
    expect.any(Object),
  );
  f.close();
});
