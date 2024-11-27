/// <reference types="jest" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { NativeResidentDirectory } from './resident-directory';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('./resident-link-requests', () => ({ ResidentLinkRequests: () => null }));
jest.mock('./resident-profile', () => ({ ResidentProfile: () => null }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readResidentDirectory: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sdk.readResidentDirectory).mockResolvedValue({ data: [], nextCursor: null });
});
it('FIN-001: due and overdue filters reuse the resident directory and send exact server filters', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <NativeResidentDirectory
        actorId="u"
        branchId="b"
        canFinance
        initialBilling="due"
        initialMonth="2026-10"
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(sdk.readResidentDirectory).toHaveBeenCalledWith(
      expect.anything(),
      'b',
      expect.objectContaining({ billing: 'due', month: '2026-10' }),
    ),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Filter residents: Overdue' }));
  await waitFor(() =>
    expect(sdk.readResidentDirectory).toHaveBeenLastCalledWith(
      expect.anything(),
      'b',
      expect.objectContaining({ billing: 'overdue' }),
    ),
  );
  expect(jest.mocked(sdk.readResidentDirectory).mock.calls.at(-1)?.[2]).not.toHaveProperty('month');
});
