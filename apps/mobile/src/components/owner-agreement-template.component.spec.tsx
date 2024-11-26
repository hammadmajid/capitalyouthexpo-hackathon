/// <reference types="jest" />
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBillingSettings, saveAgreementTemplate } from '@hsm/api-client';
import { OwnerAgreementTemplate } from './owner-agreement-template';
jest.mock('./private-file-picker', () => ({ PrivateFilePicker: () => null }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000008' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBillingSettings: jest.fn(),
  saveAgreementTemplate: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001';
const data = {
  target: { branchId: id },
  canEdit: true,
  localVersion: null,
  effectiveVersion: {
    id,
    policy: {
      agreementTemplate: { title: 'Original template', text: 'Original rules', fileId: null },
    },
  },
};
it('STAY-002: blocks a stale template edit when the effective financial policy version changes', async () => {
  jest.mocked(readBillingSettings).mockResolvedValue(data as never);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={cache}>
      <OwnerAgreementTemplate actorId={id} branchId={id} />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit agreement template' }));
  await fireEvent.changeText(screen.getByLabelText('Agreement terms'), 'Edited rules');
  await act(() =>
    cache.setQueryData(['billing-policy', id, id, 'branch'], {
      ...data,
      effectiveVersion: { ...data.effectiveVersion, id: 'changed-version' },
    }),
  );
  expect(await screen.findByText('Policy changed. Reopen the editor before saving.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(saveAgreementTemplate).not.toHaveBeenCalled();
  view.unmount();
  cache.clear();
});
it('ACC-002: manager read access never exposes template editing', async () => {
  jest.mocked(readBillingSettings).mockResolvedValue({ ...data, canEdit: false } as never);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={cache}>
      <OwnerAgreementTemplate actorId={id} branchId={id} />
    </QueryClientProvider>,
  );
  await screen.findByText('Original template');
  expect(screen.queryByRole('button', { name: 'Edit agreement template' })).toBeNull();
  view.unmount();
  cache.clear();
});
