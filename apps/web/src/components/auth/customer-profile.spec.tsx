import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerProfileForm } from './customer-profile';
import { completeCustomerProfile } from '../../lib/customer-profile';
const { replace, state } = vi.hoisted(() => ({ replace: vi.fn(), state: { verified: true } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('../../lib/customer-profile', () => ({ completeCustomerProfile: vi.fn() }));
const profile = {
  user: {
    id: randomUUID(),
    fullName: 'Customer identity',
    email: 'identity@example.test',
    emailVerified: true,
    cnicLast4: null,
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
  vi.mocked(completeCustomerProfile).mockResolvedValue(profile);
});
afterEach(cleanup);
function mount(returnPath?: string) {
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const write = vi.spyOn(cache, 'setQueryData');
  render(
    <QueryClientProvider client={cache}>
      <CustomerProfileForm returnPath={returnPath} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), write };
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of [
    ['Full name', 'Customer identity'],
    ['Mobile number', '03001234567'],
    ['Age (18 or older)', '22'],
  ]) {
    if (!label || !value) throw new Error('Fixture field missing');
    const input = screen.getByLabelText(label, { exact: true });
    fireEvent.change(input, { target: { value } });
    if (!(input instanceof HTMLInputElement)) throw Error('Expected profile input');
    expect(input.value).toBe(value);
  }
  await user.selectOptions(screen.getByLabelText('Gender'), 'female');
}
it('AUTH-C CHG-006: actual Customer form requires adult age and never asks for initial birth date, CNIC or emergency contact', async () => {
  const { user, write } = mount();
  expect(screen.queryByLabelText('CNIC number')).toBeNull();
  expect(screen.queryByLabelText('Date of birth')).toBeNull();
  expect(screen.getByText('identity@example.test')).toBeDefined();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(completeCustomerProfile).toHaveBeenCalledWith(
    {},
    {
      fullName: 'Customer identity',
      phone: '03001234567',
      age: '22',
      gender: 'female',
      institution: '',
    },
  );
  expect(write).toHaveBeenCalledExactlyOnceWith(['session'], profile);
  expect(replace).toHaveBeenCalledWith('/app/customer');
});
it('SEC: unverified email cannot render or submit Customer completion', () => {
  state.verified = false;
  mount();
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe(
    'A verified email is required to complete this profile.',
  );
  expect(completeCustomerProfile).not.toHaveBeenCalled();
});
it('SEC: save or fresh-capability failure stays on the form without exposing private provider text', async () => {
  vi.mocked(completeCustomerProfile).mockRejectedValueOnce(
    new Error('private profile provider value'),
  );
  const { user, write } = mount();
  await fill(user);
  await user.click(screen.getByRole('button', { name: 'Save Customer profile' }));
  await screen.findByRole('alert');
  expect(document.body.textContent).not.toContain('private profile provider value');
  expect(write).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Age (18 or older)') as HTMLInputElement).value).toBe('22');
});

it('AUTH-C SEC: loading saved details cannot expose an empty editable form', async () => {
  mockDetailState.data = undefined;
  mount();
  expect(screen.queryByLabelText('Full name')).toBeNull();
  expect(screen.getByRole('status', { name: 'Loading your saved profile' })).toBeDefined();
});
it('AUTH-C SEC: failed profile read hides the form and offers an explicit retry', async () => {
  mockDetailState.isError = true;
  mount();
  expect(screen.queryByLabelText('Full name')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry profile' }));
  expect(mockDetailState.refetch).toHaveBeenCalledTimes(1);
});
it('AUTH-C CHG-006: saved ordinary values prefill and adult age remains editable', async () => {
  if (!mockDetailState.data) throw new Error('Fixture missing');
  mockDetailState.data = {
    ...mockDetailState.data,
    fullName: 'Saved identity',
    phone: '+923001234567',
    gender: 'female',
    profilePhotoFileId: '550e8400-e29b-41d4-a716-446655440013',
    customer: { age: 24, institution: 'Saved institution', completed: true },
  };
  mount();
  expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('Saved identity');
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Age (18 or older)'));
  await user.type(screen.getByLabelText('Age (18 or older)'), '25');
  await user.click(screen.getByRole('button', { name: 'Save Customer profile' }));
  expect(completeCustomerProfile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      fullName: 'Saved identity',
      phone: '+923001234567',
      age: '25',
      institution: 'Saved institution',
      profilePhotoFileId: '550e8400-e29b-41d4-a716-446655440013',
    }),
  );
});

it.each([
  [
    '/hostels/550e8400-e29b-41d4-a716-446655440000',
    '/hostels/550e8400-e29b-41d4-a716-446655440000',
  ],
  ['https://attacker.example/private', '/app/customer'],
])(
  'BKG-001 / SEC-001: completed Customer profile resumes only a validated intended destination %s',
  async (returnPath, expected) => {
    const { user } = mount(returnPath);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Save Customer profile' }));
    expect(replace).toHaveBeenCalledWith(expected);
    expect(completeCustomerProfile).toHaveBeenCalledTimes(1);
  },
);
