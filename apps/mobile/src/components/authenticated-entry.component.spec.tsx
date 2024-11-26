/// <reference types="jest" />
import { render, waitFor } from '@testing-library/react-native';
import type { SelfProfile } from '@hsm/contracts';
import AuthenticatedEntry from '../app/authenticated-entry';

let mockProfile: SelfProfile | undefined;
const mockRedirect = jest.fn();
jest.mock('./providers', () => ({ useSession: () => ({ profile: mockProfile }) }));
let mockMode: 'owner' | 'customer' | 'admin' | undefined;
jest.mock('../lib/owner-mode', () => ({
  ...jest.requireActual<typeof import('../lib/owner-mode')>('../lib/owner-mode'),
  readMode: () => Promise.resolve(mockMode),
}));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));
const base: SelfProfile = {
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    fullName: 'Entry fixture',
    email: null,
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: false, owner: false, managerOf: [], admin: null },
};
const cases: {
  name: string;
  changes: Partial<SelfProfile['capabilities']>;
  destination: string;
}[] = [
  { name: 'Customer only', changes: { customer: true }, destination: '/marketplace' },
  { name: 'Owner', changes: { owner: true }, destination: '/owner' },
  {
    name: 'Manager',
    changes: { managerOf: [{ branchId: base.user.id, branchName: 'Entry branch' }] },
    destination: '/manager',
  },
  {
    name: 'Normal Admin',
    changes: { admin: { isRoot: false, roles: ['support'] } },
    destination: '/admin',
  },
  { name: 'Root Admin', changes: { admin: { isRoot: true, roles: [] } }, destination: '/admin' },
  { name: 'Customer and Owner', changes: { customer: true, owner: true }, destination: '/owner' },
  {
    name: 'Owner and Admin',
    changes: { owner: true, admin: { isRoot: false, roles: ['support'] } },
    destination: '/admin',
  },
  {
    name: 'Customer and Manager',
    changes: {
      customer: true,
      managerOf: [{ branchId: base.user.id, branchName: 'Entry branch' }],
    },
    destination: '/manager',
  },
  {
    name: 'Customer and Admin',
    changes: { customer: true, admin: { isRoot: false, roles: ['support'] } },
    destination: '/admin',
  },
  { name: 'Profile needing onboarding', changes: {}, destination: '/account' },
];
beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
  mockMode = undefined;
});
test.each(cases)(
  'AUTH-C / AUTH-M / SEC-001: $name reaches $destination after authenticated entry',
  async ({ changes, destination }) => {
    mockProfile = { ...base, capabilities: { ...base.capabilities, ...changes } };
    await render(<AuthenticatedEntry />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith(destination));
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  },
);
test('AUTH-C OWN-001: a remembered Customer mode is honoured only with a real Customer capability', async () => {
  mockMode = 'customer';
  mockProfile = { ...base, capabilities: { ...base.capabilities, customer: true, owner: true } };
  await render(<AuthenticatedEntry />);
  await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/marketplace'));
  mockRedirect.mockClear();
  mockProfile = { ...base, capabilities: { ...base.capabilities, owner: true } };
  await render(<AuthenticatedEntry />);
  await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/owner'));
});
test('SEC-001: missing profile cannot enter an authenticated destination', async () => {
  await render(<AuthenticatedEntry />);
  expect(mockRedirect).toHaveBeenCalledTimes(1);
  expect(mockRedirect).toHaveBeenCalledWith('/');
});

test.each([true, false])(
  'ADM-002: Admin with remembered Customer mode enters Admin (Root=%s)',
  async (isRoot) => {
    mockMode = 'customer';
    mockProfile = {
      ...base,
      capabilities: {
        ...base.capabilities,
        customer: true,
        admin: { isRoot, roles: isRoot ? [] : ['support'] },
      },
    };
    await render(<AuthenticatedEntry />);
    await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/admin'));
    expect(mockRedirect).not.toHaveBeenCalledWith('/marketplace');
  },
);
