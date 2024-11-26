/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { listListingRules } from '@hsm/api-client';
import { OwnerHostelRules } from './owner-hostel-rules';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
}));
const mockSave = jest.fn(async () => ({}));
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('../lib/fresh-session', () => ({
  withFreshSession: (work: () => Promise<unknown>) => work(),
}));
jest.mock('@hsm/api-client', () => ({
  listListingRules: jest.fn(),
  archiveListingRule: jest.fn(),
  createListingRule: jest.fn(),
  editListingRule: jest.fn(),
}));
jest.mock('./services/use-command', () => ({
  useNativeCommand: () => ({
    mutateAsync: mockSave,
    isPending: false,
    unresolved: false,
  }),
}));
const branchId = '019a1234-1234-7123-8123-000000000003';
const row = {
  id: '019a1234-1234-7123-8123-000000000004',
  branchId,
  body: 'Quiet after 10 pm',
  version: '1',
  sortOrder: 2,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  archivedAt: null,
};
async function mount(canEdit: boolean) {
  jest
    .mocked(listListingRules)
    .mockResolvedValue({ branchId, state: 'active', canEdit, data: [row], nextCursor: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <OwnerHostelRules actorId="owner" branchId={branchId} />
    </QueryClientProvider>,
  );
  await screen.findByText(row.body);
}
beforeEach(() => jest.clearAllMocks());
it('LIST-001 SEC-001: readers see real branch rules without mutation controls', async () => {
  await mount(false);
  expect(listListingRules).toHaveBeenCalledWith({}, branchId, { limit: 20 });
  expect(screen.queryByRole('button', { name: 'Add rule' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive rule' })).toBeNull();
});
it('LIST-001: editing preserves the exact record version and configured order', async () => {
  await mount(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Edit rule' }));
  await fireEvent.changeText(screen.getByLabelText('Rule text'), 'Quiet after 11 pm');
  await fireEvent.press(screen.getByRole('button', { name: 'Save rule' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      kind: 'save',
      body: 'Quiet after 11 pm',
      sortOrder: 2,
      row,
    }),
  );
});
it('SEC-001: archive requires a reason and preserves the target version', async () => {
  await mount(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Archive rule' }));
  expect(screen.getByRole('button', { name: 'Confirm archive' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Archive reason'), 'Superseded policy');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm archive' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({ kind: 'archive', row, reason: 'Superseded policy' }),
  );
});
