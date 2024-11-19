import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  branchLocationSchema,
  hostelBasicsInputSchema,
  hostelOnboardingSchema,
  hostelOnboardingStateSchema,
  hostelPageSchema,
  mainBranchDraftInputSchema,
} from './hostel-onboarding.js';
it('OWN-001 CHG-006: hostel and main-branch drafts accept incomplete progress without fabricated address or location', () => {
  expect(hostelBasicsInputSchema.parse({ name: '  Hostel name  ' })).toEqual({
    name: 'Hostel name',
  });
  expect(
    mainBranchDraftInputSchema.parse({ name: 'Main branch', cityId: randomUUID() }),
  ).not.toHaveProperty('location');
  expect(
    mainBranchDraftInputSchema.parse({
      name: 'Main branch',
      category: null,
      addressLine: null,
      location: null,
    }),
  ).toMatchObject({ location: null });
});
it('OWN-001: hostel contact accepts mobile and landline formatting without verification or publication defaults', () => {
  const input = hostelBasicsInputSchema.parse({ name: 'Hostel name', phone: ' 051-1234567 ' });
  // TRUST-006: stored as the listing's international form so the listing can read it back.
  expect(input.phone).toBe('+92511234567');
  expect(hostelBasicsInputSchema.parse({ name: 'Hostel', phone: '0315 4796657' }).phone).toBe(
    '+923154796657',
  );
  expect(input).not.toHaveProperty('showPublicContact');
});
it.each(['boys', 'girls', 'working_male', 'working_female'])(
  'OWN-001: existing hostel category %s is preserved',
  (category) => {
    expect(hostelBasicsInputSchema.parse({ name: 'Hostel', category }).category).toBe(category);
  },
);
it.each([
  { ownerUserId: randomUUID() },
  { organizationId: randomUUID() },
  { verificationStatus: 'approved' },
  { firstApprovedAt: new Date().toISOString() },
  { isPrimary: false },
  { accountStatus: 'active' },
])('SEC: draft input cannot choose ownership, approval or capability state', (patch) => {
  expect(hostelBasicsInputSchema.safeParse({ name: 'Hostel', ...patch }).success).toBe(false);
  expect(mainBranchDraftInputSchema.safeParse({ name: 'Main branch', ...patch }).success).toBe(
    false,
  );
});
it.each([
  { latitude: 91, longitude: 73 },
  { latitude: -91, longitude: 73 },
  { latitude: 33, longitude: 181 },
  { latitude: 33, longitude: -181 },
  { latitude: NaN, longitude: 73 },
  { latitude: 33, longitude: Infinity },
  { latitude: '33', longitude: 73 },
  { latitude: 33, longitude: 73, srid: 0 },
])('OWN-001 SEC: map boundary rejects invalid or spoofed geography', (location) => {
  expect(branchLocationSchema.safeParse(location).success).toBe(false);
  expect(mainBranchDraftInputSchema.safeParse({ name: 'Main branch', location }).success).toBe(
    false,
  );
});
it('OWN-001: strict geography accepts supported coordinate boundaries and the actual city point', () => {
  for (const location of [
    { latitude: 33.6844, longitude: 73.0479 },
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ])
    expect(branchLocationSchema.parse(location)).toEqual(location);
});
it.each([
  { name: ' ' },
  { name: 'x'.repeat(151) },
  { name: 'Hostel', category: 'unsupported' },
  { name: 'Hostel', phone: 'not a phone' },
  { name: 'Hostel', description: 'x'.repeat(5001) },
  { name: 'Hostel', logoFileId: 'foreign-file-key' },
])('OWN-001: invalid basic fields fail before persistence', (input) => {
  expect(hostelBasicsInputSchema.safeParse(input).success).toBe(false);
});
it('OWN-001: branch address and landmark bounds retain explicit nullable corrections', () => {
  for (const patch of [
    { addressLine: '    ' },
    { addressLine: 'x'.repeat(501) },
    { nearbyLandmark: 'x'.repeat(201) },
    { cityId: 'wrong' },
  ])
    expect(mainBranchDraftInputSchema.safeParse({ name: 'Main branch', ...patch }).success).toBe(
      false,
    );
  expect(
    mainBranchDraftInputSchema.parse({ name: 'Main branch', phone: null, areaId: null }),
  ).toMatchObject({ phone: null, areaId: null });
});
const branch = {
  id: randomUUID(),
  name: 'Main branch',
  isPrimary: true,
  category: null,
  cityId: null,
  areaId: null,
  subAreaId: null,
  addressLine: null,
  location: null,
  nearbyLandmark: null,
  description: null,
  phone: null,
  showPublicContact: false,
  verificationStatus: 'draft',
};
const hostel = {
  id: randomUUID(),
  organizationId: randomUUID(),
  name: 'Hostel name',
  logoFileId: null,
  mainBranch: branch,
  missingFields: ['category', 'city', 'area', 'address', 'location'],
};
it('OWN-001: private owner projection represents pending draft progress and legacy hostels without a main branch', () => {
  expect(hostelOnboardingSchema.parse(hostel)).toEqual(hostel);
  expect(
    hostelOnboardingSchema.parse({ ...hostel, mainBranch: null, missingFields: ['main_branch'] })
      .mainBranch,
  ).toBeNull();
});
it('SEC: onboarding projection excludes occupant identity, rent status, credentials and full CNIC', () => {
  for (const field of ['occupantName', 'rentStatus', 'passwordHash', 'cnic', 'refreshToken']) {
    expect(hostelOnboardingSchema.safeParse({ ...hostel, [field]: 'private' }).success).toBe(false);
    expect(
      hostelOnboardingSchema.safeParse({ ...hostel, mainBranch: { ...branch, [field]: 'private' } })
        .success,
    ).toBe(false);
  }
  expect(
    hostelOnboardingSchema.safeParse({ ...hostel, missingFields: ['unapproved_field'] }).success,
  ).toBe(false);
  expect(
    hostelOnboardingSchema.safeParse({
      ...hostel,
      mainBranch: { ...branch, phoneVerifiedAt: 'spoof' },
    }).success,
  ).toBe(false);
});

it('SEC: mutation replay projection contains only resource identifiers, lifecycle and missing field labels', () => {
  const state = {
    id: hostel.id,
    organizationId: hostel.organizationId,
    mainBranchId: branch.id,
    verificationStatus: 'draft',
    missingFields: hostel.missingFields,
  };
  expect(hostelOnboardingStateSchema.parse(state)).toEqual(state);
  for (const field of [
    'name',
    'description',
    'phone',
    'addressLine',
    'logoFileId',
    'url',
    'token',
    'cnic',
  ])
    expect(
      hostelOnboardingStateSchema.safeParse({ ...state, [field]: 'private-form-value' }).success,
    ).toBe(false);
});
it('OWN-001 SEC: owner hostel pagination is bounded and omits internal or credential fields', () => {
  const summary = {
    id: hostel.id,
    organizationId: hostel.organizationId,
    name: hostel.name,
    logoFileId: null,
  };
  expect(hostelPageSchema.parse({ data: [summary], nextCursor: null })).toEqual({
    data: [summary],
    nextCursor: null,
  });
  expect(
    hostelPageSchema.safeParse({
      data: Array.from({ length: 101 }, () => summary),
      nextCursor: null,
    }).success,
  ).toBe(false);
  expect(
    hostelPageSchema.safeParse({
      data: [{ ...summary, passwordHash: 'private' }],
      nextCursor: null,
    }).success,
  ).toBe(false);
});

it.each(['-------', '() () ()', '+--- --', '+123456', '1234567890123456'])(
  'OWN-001: contact requires seven to fifteen actual digits: %s',
  (phone) => {
    expect(hostelBasicsInputSchema.safeParse({ name: 'Hostel', phone }).success).toBe(false);
    expect(mainBranchDraftInputSchema.safeParse({ name: 'Main branch', phone }).success).toBe(
      false,
    );
  },
);

it.each(['standard', 'premium', 'luxury'])(
  'ONB-001 CHG-018: optional property tier %s and establishment year are canonical saved metadata',
  (propertyTier) => {
    expect(
      hostelBasicsInputSchema.parse({ name: 'Hostel', propertyTier, establishmentYear: 2022 }),
    ).toMatchObject({ propertyTier, establishmentYear: 2022 });
    expect(
      mainBranchDraftInputSchema.parse({
        name: 'Main branch',
        propertyTier: null,
        establishmentYear: null,
      }),
    ).toMatchObject({ propertyTier: null, establishmentYear: null });
  },
);
it.each([
  { propertyTier: 'certified' },
  { establishmentYear: 1799 },
  { establishmentYear: 9999 },
  { establishmentYear: 2022.5 },
  { establishmentYear: '2022' },
])('ONB-001: invalid or future optional metadata is rejected', (patch) => {
  expect(hostelBasicsInputSchema.safeParse({ name: 'Hostel', ...patch }).success).toBe(false);
});
