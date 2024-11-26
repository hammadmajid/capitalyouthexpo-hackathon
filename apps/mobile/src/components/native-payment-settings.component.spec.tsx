/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { NativePaymentSettings } from './native-payment-settings';
import { ToolFrame } from './inventory-tools';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-key' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readUpfrontSettings: jest.fn(),
  branchPaymentInstructions: jest.fn(),
  updateUpfrontSettings: jest.fn(),
  addPaymentInstruction: jest.fn(),
  archivePaymentInstruction: jest.fn(),
}));
const branchId = '10000000-0000-4000-8000-000000000001';
const row = {
  id: branchId,
  branchId,
  method: 'easypaisa' as const,
  accountTitle: 'Hostel account',
  accountIdentifier: '03001234567',
  instructions: null,
  createdAt: '2026-11-18T00:00:00Z',
};
let cache: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } },
  });
  jest
    .mocked(sdk.readUpfrontSettings)
    .mockResolvedValue({ requirement: 'deposit_and_first_rent', proofRetryAllowed: true });
  jest.mocked(sdk.branchPaymentInstructions).mockResolvedValue({ branchId, data: [row] });
  jest.mocked(sdk.addPaymentInstruction).mockResolvedValue(row);
  jest
    .mocked(sdk.updateUpfrontSettings)
    .mockResolvedValue({ requirement: 'deposit', proofRetryAllowed: true });
});
afterEach(() => cache.clear());
function show(owner = true, onUnsavedChange = jest.fn()) {
  return render(
    <QueryClientProvider client={cache}>
      <ToolFrame close={() => undefined}>
        <NativePaymentSettings
          actorId="owner"
          branchId={branchId}
          owner={owner}
          onUnsavedChange={onUnsavedChange}
        />
      </ToolFrame>
    </QueryClientProvider>,
  );
}
it('BKG-007 / BR-01: reference chips preserve the selected policy and existing retry setting', async () => {
  await show();
  expect(await screen.findByText('Residents pay the hostel directly')).toBeTruthy();
  expect(
    (await screen.findByRole('button', { name: 'Upfront: Deposit and first rent' })).props
      .accessibilityState.selected,
  ).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Upfront: Deposit' }));
  await waitFor(() =>
    expect(sdk.updateUpfrontSettings).toHaveBeenCalledWith(
      {},
      branchId,
      { requirement: 'deposit', proofRetryAllowed: true },
      'test-key',
    ),
  );
});
it('BKG-007: labelled icon fields keep unfinished account protection and send the chosen method', async () => {
  const unsaved = jest.fn();
  await show(true, unsaved);
  await screen.findByText('Hostel account · 03001234567');
  await fireEvent.press(screen.getByRole('button', { name: 'Method: JazzCash' }));
  await fireEvent.changeText(screen.getByLabelText('Account title'), 'New hostel wallet');
  expect(
    screen.getByRole('button', { name: 'Add account' }).props.accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.changeText(
    screen.getByLabelText('Account number, IBAN or wallet number'),
    '03007654321',
  );
  await waitFor(() => expect(unsaved).toHaveBeenCalledWith(true));
  await fireEvent.press(screen.getByRole('button', { name: 'Add account' }));
  await waitFor(() =>
    expect(sdk.addPaymentInstruction).toHaveBeenCalledWith(
      {},
      branchId,
      {
        method: 'jazzcash',
        accountTitle: 'New hostel wallet',
        accountIdentifier: '03007654321',
        instructions: null,
      },
      'test-key',
    ),
  );
  await waitFor(() => expect(screen.getByLabelText('Account title').props.value).toBe(''));
});
it('ACC-004: read-only staff see destinations without editable policy or account controls', async () => {
  await show(false);
  const deposit = await screen.findByRole('button', { name: 'Upfront: Deposit' });
  expect(deposit.props.accessibilityState.disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Add account' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove Hostel account' })).toBeNull();
});
