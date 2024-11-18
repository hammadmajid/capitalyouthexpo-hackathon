import { expect, it } from 'vitest';
import { ownerBasicsForm, ownerMainForm, ownerInvitationForm } from './owner-setup-form.js';
const geography = { cityId: null, areaId: null, subAreaId: null };
it('ONB-001: blank optional fields clear draft data without inventing a location', () => {
  expect(ownerBasicsForm({ hostelName: '  My hostel  ' })).toEqual({
    name: 'My hostel',
    category: null,
    description: null,
    phone: null,
  });
  expect(ownerMainForm({ branchName: ' Main ' }, geography)).toEqual({
    name: 'Main',
    category: null,
    description: null,
    phone: null,
    addressLine: null,
    nearbyLandmark: null,
    location: null,
    ...geography,
  });
});
it('ONB-001: entered map coordinates, contact and category validate at the shared boundary', () => {
  const logo = '550e8400-e29b-41d4-a716-446655440000';
  expect(
    ownerBasicsForm(
      {
        hostelName: 'Hostel',
        hostelCategory: 'boys',
        hostelDescription: 'Description',
        hostelPhone: '+923001234567',
      },
      logo,
    ).logoFileId,
  ).toBe(logo);
  expect(
    ownerMainForm(
      {
        branchName: 'Branch',
        latitude: '33.7',
        longitude: '73.1',
        address: 'Islamabad address',
        landmark: 'Near university',
      },
      geography,
    ).location,
  ).toEqual({ latitude: 33.7, longitude: 73.1 });
});
it.each([
  { latitude: '33' },
  { longitude: '73' },
  { latitude: 'bad', longitude: '73' },
  { latitude: '91', longitude: '73' },
  { latitude: '33', longitude: '181' },
])('ONB-001: incomplete or invalid coordinates cannot silently become zero %#', (input) => {
  expect(() => ownerMainForm({ branchName: 'Branch', ...input }, geography)).toThrow();
});
it('AUTH-M-001 SEC: auto discards unused secret fields, manual validates and phone normalizes', () => {
  const input = {
    managerName: 'Manager',
    managerPhone: '03001234567',
    temporaryPassword: 'ManualPassword!778',
  };
  expect(ownerInvitationForm(input, false)).toEqual({
    fullName: 'Manager',
    phone: '+923001234567',
    temporaryCredential: { mode: 'auto' },
  });
  expect(ownerInvitationForm(input, true).temporaryCredential).toEqual({
    mode: 'manual',
    password: input.temporaryPassword,
  });
  expect(() => ownerInvitationForm({ ...input, temporaryPassword: 'short' }, true)).toThrow();
});

it('ONB-001 CHG-018: native optional tier/year serialize explicitly while omission preserves older forms', () => {
  expect(
    ownerBasicsForm({ hostelName: 'Hostel', propertyTier: 'premium', establishmentYear: '2022' }),
  ).toMatchObject({ propertyTier: 'premium', establishmentYear: 2022 });
  expect(
    ownerBasicsForm({ hostelName: 'Hostel', propertyTier: '', establishmentYear: '' }),
  ).toMatchObject({ propertyTier: null, establishmentYear: null });
  expect(ownerBasicsForm({ hostelName: 'Hostel' })).not.toHaveProperty('establishmentYear');
});
