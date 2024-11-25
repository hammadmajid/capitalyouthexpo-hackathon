import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listOwnerOrganizations, listOwnerHostels, ownerSetupActions } from '@hsm/api-client';
import { OwnerSetup } from './owner-setup';
const mocks = vi.hoisted(() => ({ verified: true, owner: true, create: vi.fn() }));
vi.mock('./providers', () => ({
  useSession: () => ({
    data: {
      user: { id: 'identity', emailVerified: mocks.verified },
      capabilities: { owner: mocks.owner },
    },
  }),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listOwnerOrganizations: vi.fn(),
  listOwnerHostels: vi.fn(),
  ownerSetupActions: vi.fn(),
}));
vi.mock('./setup-wizard/setup-wizard', () => ({
  SetupWizard: ({ brandId }: { brandId: string }) => <p>Opened draft {brandId}</p>,
}));
const org = '550e8400-e29b-41d4-a716-446655440000',
  brand = '550e8400-e29b-41d4-a716-446655440001';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verified = true;
  mocks.owner = true;
  vi.mocked(listOwnerOrganizations).mockResolvedValue({
    data: [{ id: org, name: 'My organization' }],
    nextCursor: null,
  });
  vi.mocked(listOwnerHostels).mockResolvedValue({
    data: [{ id: brand, organizationId: org, name: 'Saved hostel', logoFileId: null }],
    nextCursor: null,
  });
  vi.mocked(ownerSetupActions).mockReturnValue({ create: mocks.create } as unknown as ReturnType<
    typeof ownerSetupActions
  >);
  mocks.create.mockResolvedValue({ id: brand });
});
afterEach(cleanup);
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerSetup />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it.each(['verified', 'owner'] as const)(
  'SEC-001: missing %s capability cannot request Owner setup',
  (field) => {
    mocks[field] = false;
    mount();
    expect(screen.getByRole('alert').textContent).toContain('Complete your verified Owner profile');
    expect(listOwnerOrganizations).not.toHaveBeenCalled();
  },
);
it('ONB-001: the actual setup form resolves owned organization and creates a private resumable draft', async () => {
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'My organization' }));
  await screen.findByRole('button', { name: 'Saved hostel' });
  await user.click(screen.getByLabelText('Hostel name'));
  await user.paste('New hostel');
  await user.selectOptions(screen.getByLabelText('Hostel category'), 'boys');
  await user.click(screen.getByRole('button', { name: 'Create private hostel' }));
  expect(mocks.create).toHaveBeenCalledWith(org, {
    name: 'New hostel',
    category: 'boys',
    description: null,
    phone: null,
  });
  expect(await screen.findByText('Opened draft ' + brand)).toBeDefined();
  expect(listOwnerHostels).toHaveBeenCalledWith({}, org, { limit: 20 });
});
it('ONB-001: a saved hostel resumes without creating a replacement', async () => {
  const user = mount();
  await user.click(await screen.findByRole('button', { name: 'My organization' }));
  await user.click(await screen.findByRole('button', { name: 'Saved hostel' }));
  expect(await screen.findByText('Opened draft ' + brand)).toBeDefined();
  expect(mocks.create).not.toHaveBeenCalled();
});
