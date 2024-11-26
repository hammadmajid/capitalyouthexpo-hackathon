/// <reference types="jest" />
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { attachAgreementFile, readAgreementFiles, readAgreementFileUrl } from '@hsm/api-client';
import { AgreementDocuments } from './agreement-documents';
const mockPicker = jest.fn((props: { onReady: (id: string) => void }) => {
  void props;
  return null;
});
jest.mock('./private-file-picker', () => ({
  PrivateFilePicker: (props: { onReady: (id: string) => void }) => mockPicker(props),
}));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000008' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  attachAgreementFile: jest.fn(),
  readAgreementFiles: jest.fn(),
  readAgreementFileUrl: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001',
  target = { stayId: id, agreementId: id, branchId: id };
it('STAY-002: lazily loads exact-stay scans, uploads through the checked picker and synchronizes without reopening', async () => {
  const row = {
    id,
    ...target,
    fileId: id,
    label: 'Agreement scan',
    uploadedBy: id,
    createdAt: '2026-11-02T10:00:00Z',
  };
  jest
    .mocked(readAgreementFiles)
    .mockResolvedValue({ branchId: id, stayId: id, agreementId: id, data: [], nextCursor: null });
  jest.mocked(attachAgreementFile).mockImplementation(async () => {
    jest.mocked(readAgreementFiles).mockResolvedValue({
      branchId: id,
      stayId: id,
      agreementId: id,
      data: [row],
      nextCursor: null,
    });
    return row;
  });
  jest.mocked(readAgreementFileUrl).mockResolvedValue({
    url: 'https://files.example.test/private-document',
    expiresAt: '2026-11-02T10:01:00Z',
  });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  const view = await render(
    <QueryClientProvider client={cache}>
      <AgreementDocuments actorId={id} target={target} />
    </QueryClientProvider>,
  );
  expect(readAgreementFiles).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Agreement documents' }));
  await screen.findByText('No photos yet');
  await act(() => mockPicker.mock.calls.at(-1)?.[0].onReady(id));
  await fireEvent.press(screen.getByRole('button', { name: 'Save agreement scan' }));
  const scan = await screen.findByRole('button', { name: 'Agreement scan' });
  expect(attachAgreementFile).toHaveBeenCalledWith(
    {},
    target,
    { fileId: id, label: 'Agreement scan' },
    expect.any(String),
  );
  await fireEvent.press(scan);
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith('https://files.example.test/private-document'),
  );
  expect(readAgreementFileUrl).toHaveBeenCalledWith({}, target, id);
  view.unmount();
  cache.clear();
  open.mockRestore();
});
