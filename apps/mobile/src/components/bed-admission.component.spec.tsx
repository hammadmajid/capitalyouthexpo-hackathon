/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBranchInventory, readInventoryAccess } from '@hsm/api-client';
import { BedAdmission } from './bed-admission';
const mockAdmission = jest.fn((props: unknown) => {
  void props;
  return null;
});
jest.mock('./manual-admission', () => ({
  NativeManualAdmission: (props: unknown) => mockAdmission(props),
  canAdmitResidents: () => true,
}));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  readBranchInventory: jest.fn(),
  readInventoryAccess: jest.fn(),
}));
it('BED-002 / ACC-004: loads admission only on request and binds it to the exact vacant bed', async () => {
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId: 'branch',
    permissions: ['stay_manage', 'rent_manage', 'finance_view'],
    canConfigureManagers: false,
  });
  jest
    .mocked(readBranchInventory)
    .mockResolvedValue({ rooms: [], roomTypes: [], permissions: [], canConfigureManagers: false });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={cache}>
      <BedAdmission actorId="owner" branchId="branch" bedId="bed" />
    </QueryClientProvider>,
  );
  const assign = await screen.findByRole('button', { name: 'Add resident' });
  expect(readBranchInventory).not.toHaveBeenCalled();
  await fireEvent.press(assign);
  await screen.findByRole('button', { name: 'Close admission' });
  await waitFor(() => expect(mockAdmission).toHaveBeenCalled());
  expect(readBranchInventory).toHaveBeenCalledWith({}, 'branch');
  expect(mockAdmission).toHaveBeenCalledWith(
    expect.objectContaining({ initialBedId: 'bed', branchId: 'branch', actorId: 'owner' }),
  );
  view.unmount();
  cache.clear();
});
