import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createManualStay, readInventoryAccess } from '@hsm/api-client';
import { AdmissionSubmission } from './admission-submission';
import { admissionUiManual, admissionUiId as id } from './admission-ui.fixture';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  createManualStay: vi.fn(),
  readInventoryAccess: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const caches: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['stay_manage', 'rent_manage', 'finance_view'],
    canConfigureManagers: false,
  });
  vi.mocked(createManualStay).mockResolvedValue({
    branchId: id,
    stayId: id,
    residentId: id,
    agreementId: id,
    assignmentId: id,
    state: 'active',
    version: 1,
  });
});
afterEach(() => {
  cleanup();
  for (const cache of caches.splice(0)) cache.clear();
});
function fixture() {
  const props = {
    actorId: id,
    branchId: id,
    branchLabel: 'Garden branch',
    residentLabel: 'Original resident',
    targetLabel: 'Room101 · BedA',
    manual: admissionUiManual(),
    unavailable: false,
    onBack: vi.fn(),
    onDone: vi.fn(),
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  const show = (next = props) => (
    <QueryClientProvider client={cache}>
      <AdmissionSubmission {...next} />
    </QueryClientProvider>
  );
  return { ...render(show()), props, show };
}
async function submit() {
  fireEvent.change(await screen.findByLabelText('Rent billing starts'), {
    target: { value: '2028-01-15' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review admission' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Admit resident' }));
}
it('STAY-001 / FIN-004: completed server admission is acknowledged without inventing a payment or receipt', async () => {
  const f = fixture();
  await submit();
  await screen.findByRole('heading', { name: 'Resident admitted' });
  expect(createManualStay).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/^Paid$/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Admit resident' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(f.props.onDone).toHaveBeenCalledTimes(1);
});
it('ACC-004: a lost result retains original reviewed terms and private labels through changed parent inputs', async () => {
  vi.mocked(createManualStay).mockRejectedValueOnce(Error('Connection lost'));
  const f = fixture();
  await submit();
  await screen.findByRole('button', { name: 'Retry same admission' });
  const first = vi.mocked(createManualStay).mock.calls[0];
  const manual = admissionUiManual();
  manual.terms.depositPaisa = 5;
  f.rerender(
    f.show({
      ...f.props,
      manual,
      residentLabel: 'Changed resident',
      targetLabel: 'Different room',
    }),
  );
  expect(screen.queryByText(/Changed resident/)).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry same admission' }));
  await screen.findByRole('heading', { name: 'Resident admitted' });
  expect(vi.mocked(createManualStay).mock.calls[1]?.slice(1)).toEqual(first?.slice(1));
  expect(screen.getByText(/Original resident/)).toBeDefined();
  expect(f.props.onBack).not.toHaveBeenCalled();
});
it('SEC-003: access revocation after completion hides private labels while retaining the known result', async () => {
  const f = fixture();
  await submit();
  await screen.findByRole('heading', { name: 'Resident admitted' });
  f.rerender(f.show({ ...f.props, unavailable: true }));
  expect(screen.getByRole('heading', { name: 'Resident admitted' })).toBeDefined();
  expect(screen.queryByText(/Original resident/)).toBeNull();
  expect(screen.queryByText(/Room101/)).toBeNull();
  expect(createManualStay).toHaveBeenCalledTimes(1);
});
it('SEC-003: unavailable branch context cannot show the financial review or call admission', async () => {
  const f = fixture();
  f.rerender(f.show({ ...f.props, unavailable: true }));
  await waitFor(() => expect(screen.queryByLabelText('Rent billing starts')).toBeNull());
  expect(createManualStay).not.toHaveBeenCalled();
});
it('CHG-054: a new resident’s optional CNIC photo is sent with the admission once', async () => {
  const photo = '11111111-1111-4111-8111-111111111112';
  cleanup();
  const f = fixture();
  cleanup();
  render(f.show({ ...f.props, cnicPhoto: photo } as typeof f.props));
  await submit();
  await screen.findByRole('heading', { name: 'Resident admitted' });
  expect(vi.mocked(createManualStay).mock.calls[0]?.[2]).toMatchObject({ cnicPhotoFileId: photo });
});
