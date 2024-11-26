/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { OwnerHostelCard } from './owner-hostel-card';
const ids = {
  brand: '019a1234-1234-7123-8123-000000000021',
  branch: '019a1234-1234-7123-8123-000000000022',
  org: '019a1234-1234-7123-8123-000000000023',
};
let mockStatus = 'changes_requested';
let mockNote: string | undefined = 'Add the complete street address.';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(), sessions: { restore: jest.fn() } }));
jest.mock('./owner-area-picker', () => ({ useAreaNames: () => 'F-8, Islamabad' }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
jest.mock('./use-owner-draft', () => ({
  canAddBranch: jest.requireActual('./use-owner-draft').canAddBranch,
  editableStatuses: ['draft', 'changes_requested', 'rejected'],
  useOwnerHostel: () => ({
    data: {
      mainBranch: {
        id: ids.branch,
        isPrimary: true,
        cityId: 'c',
        areaId: 'a',
        subAreaId: null,
        verificationStatus: mockStatus,
      },
      verificationNote: mockNote,
    },
  }),
  useOwnerDraftDetails: () => ({ gallery: { data: { data: [] } } }),
}));
const branch = {
  id: ids.branch,
  organizationId: ids.org,
  brandId: ids.brand,
  name: 'Main branch',
  verificationStatus: 'changes_requested' as const,
};
const beds = { beds: 4, occupied: 1, available: 3, reserved: 0, blocked: 0, unavailable: 0 };
const row = { branchId: ids.branch, beds, activeResidents: 1 } as never;
beforeEach(() => jest.clearAllMocks());
it('ADM-007 OWN-001: a returned hostel shows HSM’s reason, area and Continue Setup', async () => {
  mockStatus = 'changes_requested';
  mockNote = 'Add the complete street address.';
  await render(
    <OwnerHostelCard
      actorId="u1"
      hostel={{ id: ids.brand, name: 'Comfort Hostel' }}
      branches={[branch]}
      rows={[row]}
    />,
  );
  expect(screen.getByText('F-8, Islamabad')).toBeTruthy();
  expect(screen.getByText('Changes requested')).toBeTruthy();
  expect(screen.getByText('Add the complete street address.')).toBeTruthy();
  expect(screen.getByLabelText('Beds used: 1/4')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue Setup' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-setup',
    params: { brandId: ids.brand },
  });
});
it('OWN-001 BR-05: an approved hostel offers Manage only, never setup or a stale note', async () => {
  mockStatus = 'approved';
  mockNote = undefined;
  await render(
    <OwnerHostelCard
      actorId="u1"
      hostel={{ id: ids.brand, name: 'Comfort Hostel' }}
      branches={[{ ...branch, verificationStatus: 'approved' }]}
      rows={[row]}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Continue Setup' })).toBeNull();
  expect(screen.queryByText(/HSM asked for changes/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Manage branch' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-branch',
    params: { branchId: ids.branch },
  });
});
it('BRN-001: an approved hostel offers Add branch, and a draft extra branch reopens its setup', async () => {
  mockStatus = 'approved';
  mockNote = undefined;
  const extra = { ...branch, id: '019a1234-1234-7123-8123-000000000024', name: 'G-10 branch' };
  await render(
    <OwnerHostelCard
      actorId="u1"
      hostel={{ id: ids.brand, name: 'Comfort Hostel' }}
      branches={[
        { ...branch, verificationStatus: 'approved' },
        { ...extra, verificationStatus: 'draft' },
      ]}
      rows={[row]}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Add branch' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-setup',
    params: { brandId: ids.brand, addBranch: '1' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Continue G-10 branch setup' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/owner-setup',
    params: { brandId: ids.brand, branchId: extra.id },
  });
  expect(screen.getByRole('button', { name: 'Manage Main branch' })).toBeTruthy();
});
it('BRN-001: a hostel whose main branch is still a draft offers no Add branch', async () => {
  mockStatus = 'draft';
  mockNote = undefined;
  await render(
    <OwnerHostelCard
      actorId="u1"
      hostel={{ id: ids.brand, name: 'Comfort Hostel' }}
      branches={[{ ...branch, verificationStatus: 'draft' }]}
      rows={[row]}
    />,
  );
  expect(screen.getByRole('button', { name: 'Continue Setup' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
});
