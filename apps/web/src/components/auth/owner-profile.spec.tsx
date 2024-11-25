import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnerProfileForm } from './owner-profile';
import { completeOwnerProfile } from '../../lib/owner-profile';
const { replace, state, ids } = vi.hoisted(() => ({
  replace: vi.fn(),
  state: { verified: true },
  ids: {
    'CNIC front': '10000000-0000-4000-8000-000000000001',
    'CNIC back': '10000000-0000-4000-8000-000000000002',
    'Profile photo (optional)': '10000000-0000-4000-8000-000000000003',
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('../../lib/owner-profile', () => ({ completeOwnerProfile: vi.fn() }));
vi.mock('../private-file-input', () => ({
  PrivateFileInput: ({
    label,
    onReady,
    onBusy,
  }: {
    label: keyof typeof ids;
    onReady: (id: string) => void;
    onBusy: (busy: boolean) => void;
  }) => (
    <div>
      <button onClick={() => onReady(ids[label])}>Choose {label}</button>
      <button onClick={() => onBusy(true)}>Scan {label}</button>
    </div>
  ),
}));
const profile = {
  user: {
    id: randomUUID(),
    fullName: 'Owner identity',
    email: 'owner@example.test',
    emailVerified: true,
    cnicLast4: '5671',
  },
  capabilities: { customer: true, owner: true, managerOf: [], admin: null },
};
vi.mock('../providers', () => ({
  useSession: () => ({
    data: { ...profile, user: { ...profile.user, emailVerified: state.verified } },
  }),
}));
const { mockDetailState } = vi.hoisted(() => ({
  mockDetailState: {
    data: {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      fullName: '',
      email: 'identity@example.test',
      emailVerified: true,
      phone: null,
      gender: null,
      cnicLast4: null,
      profilePhotoFileId: null,
      customer: null,
      owner: null,
    } as import('@hsm/contracts').ProfileDetails | undefined,
    isError: false,
    refetch: vi.fn(),
  },
}));
vi.mock('../use-profile-details', () => ({ useProfileDetails: () => mockDetailState }));
beforeEach(() => {
  mockDetailState.isError = false;
  mockDetailState.data = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    fullName: '',
    email: 'identity@example.test',
    emailVerified: true,
    phone: null,
    gender: null,
    cnicLast4: null,
    profilePhotoFileId: null,
    customer: null,
    owner: null,
  };
  vi.resetAllMocks();
  state.verified = true;
  vi.mocked(completeOwnerProfile).mockResolvedValue(profile);
});
afterEach(cleanup);
function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } }),
    write = vi.spyOn(cache, 'setQueryData');
  render(
    <QueryClientProvider client={cache}>
      <OwnerProfileForm />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), write };
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of Object.entries({
    'Full name': 'Owner identity',
    'Mobile number': '03001234567',
    'CNIC number': '6110112345671',
    'Owner address': 'Owner contact address',
  })) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  }
  // Emit the existing mocked upload-ready events; real agreement/save controls use userEvent.
  fireEvent.click(screen.getByText('Choose CNIC front', { selector: 'button' }));
  fireEvent.click(screen.getByText('Choose CNIC back', { selector: 'button' }));
  await user.click(screen.getByRole('checkbox'));
}
it('AUTH-C CHG-006: real Owner form uses private clean document references, explicit versioned agreement and live additive capability', async () => {
  const f = mount();
  await fill(f.user);
  fireEvent.click(screen.getByText('Choose Profile photo (optional)', { selector: 'button' }));
  await f.user.click(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(completeOwnerProfile).toHaveBeenCalledExactlyOnceWith(
    {},
    {
      fullName: 'Owner identity',
      phone: '03001234567',
      cnic: '6110112345671',
      address: 'Owner contact address',
      cnicFrontFileId: ids['CNIC front'],
      cnicBackFileId: ids['CNIC back'],
      profilePhotoFileId: ids['Profile photo (optional)'],
      agreementAccepted: true,
      agreementVersion: 'owner-foundation-v1',
    },
  );
  expect(f.write).toHaveBeenCalledExactlyOnceWith(['session'], profile);
  expect(replace).toHaveBeenCalledWith('/app/owner');
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
it('SEC: verified email is required before Owner form or uploads appear', () => {
  state.verified = false;
  mount();
  expect(screen.queryByLabelText('CNIC number')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Choose CNIC front' })).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('verified email');
});
it('SEC: a selected file still scanning blocks profile submission', async () => {
  const f = mount();
  await f.user.click(screen.getByRole('button', { name: 'Scan CNIC front' }));
  const save = screen.getByRole('button', { name: 'Save Owner profile' });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  await f.user.click(save);
  expect(completeOwnerProfile).not.toHaveBeenCalled();
});
it('SEC: Owner save failure stays on the form and hides raw private provider text', async () => {
  vi.mocked(completeOwnerProfile).mockRejectedValueOnce(new Error('private CNIC provider text'));
  const f = mount();
  await fill(f.user);
  await f.user.click(screen.getByRole('button', { name: 'Save Owner profile' }));
  await screen.findByRole('alert');
  expect(document.body.textContent).not.toContain('private CNIC provider text');
  expect(f.write).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it('AUTH-C SEC: loading saved details cannot expose an empty editable form', async () => {
  mockDetailState.data = undefined;
  mount();
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByText('Loading your saved profile…')).toBeDefined();
});
it('AUTH-C SEC: failed profile read hides the form and offers an explicit retry', async () => {
  mockDetailState.isError = true;
  mount();
  expect(screen.queryByLabelText('Full name')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry profile' }));
  expect(mockDetailState.refetch).toHaveBeenCalledTimes(1);
});
it('AUTH-C SEC: Owner edit retains private evidence, masks CNIC and requires new consent', async () => {
  if (!mockDetailState.data) throw new Error('Fixture missing');
  mockDetailState.data = {
    ...mockDetailState.data,
    fullName: 'Saved Owner',
    phone: '+923001234567',
    cnicLast4: '5671',
    owner: {
      address: 'Saved private address',
      cnicFrontFileId: '550e8400-e29b-41d4-a716-446655440011',
      cnicBackFileId: '550e8400-e29b-41d4-a716-446655440012',
      agreementVersion: 'owner-foundation-v1',
      agreementAcceptedAt: '2026-10-11T00:00:00.000Z',
      completed: true,
    },
  };
  mount();
  expect((screen.getByLabelText('CNIC number') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('CNIC ending in 5671')).toBeDefined();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('CNIC number'), '6110112345671');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Save Owner profile' }));
  expect(completeOwnerProfile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      fullName: 'Saved Owner',
      address: 'Saved private address',
      cnicFrontFileId: '550e8400-e29b-41d4-a716-446655440011',
      cnicBackFileId: '550e8400-e29b-41d4-a716-446655440012',
      agreementAccepted: true,
    }),
  );
});
