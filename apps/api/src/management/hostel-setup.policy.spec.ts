import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { HostelOnboarding } from '@hsm/contracts';
import {
  applyHostelBasics,
  applyMainDraft,
  missingSetupFields,
  newMainBranch,
  requireDraftGeography,
  requireEditableDraft,
  requireSubmission,
  setupState,
} from './hostel-setup.policy.js';
const city = { id: randomUUID(), isActive: true };
const area = {
  id: randomUUID(),
  cityId: city.id,
  parentId: null,
  level: 'area' as const,
  isActive: true,
};
const subArea = {
  id: randomUUID(),
  cityId: city.id,
  parentId: area.id,
  level: 'sub_area' as const,
  isActive: true,
};
const draft = () => newMainBranch(randomUUID(), { name: 'Private hostel' });
const complete = () =>
  applyMainDraft(draft(), {
    name: 'Main branch',
    category: 'girls',
    cityId: city.id,
    areaId: area.id,
    subAreaId: subArea.id,
    addressLine: 'Actual address',
    location: { latitude: 33.68, longitude: 73.04 },
  });
it('OWN-001 ONB-001: new main branch is private and contains no fabricated geography or personal contact', () => {
  const branch = draft();
  expect(branch).toMatchObject({
    name: 'Main branch',
    isPrimary: true,
    verificationStatus: 'draft',
    cityId: null,
    areaId: null,
    addressLine: null,
    location: null,
    phone: null,
    showPublicContact: false,
  });
  expect(missingSetupFields(branch)).toEqual(['category', 'city', 'area', 'address', 'location']);
  expect(missingSetupFields(null)).toEqual(['main_branch']);
});
it('OWN-001: explicit hostel fields initialize the main branch without publication approval', () => {
  expect(
    newMainBranch(randomUUID(), {
      name: 'Hostel',
      category: 'boys',
      description: 'Description',
      phone: '051-1234567',
      showPublicContact: true,
    }),
  ).toMatchObject({
    category: 'boys',
    description: 'Description',
    phone: '051-1234567',
    showPublicContact: true,
    verificationStatus: 'draft',
  });
});
it('OWN-001: partial edits preserve progress and explicit null clears fields', () => {
  const branch = complete();
  expect(applyMainDraft(branch, { name: 'Renamed' })).toMatchObject({
    name: 'Renamed',
    cityId: city.id,
  });
  const cleared = applyMainDraft(branch, { name: branch.name, location: null, addressLine: null });
  expect(missingSetupFields(cleared)).toEqual(['address', 'location']);
  expect(
    applyHostelBasics(branch, { name: 'New hostel', logoFileId: randomUUID(), phone: null }),
  ).toMatchObject({ name: branch.name, phone: null, category: 'girls' });
});
it.each(['draft', 'changes_requested', 'rejected'] as const)(
  'ONB-001: %s can be completed and resubmitted without a manager',
  (verificationStatus) => {
    const branch = { ...complete(), verificationStatus };
    expect(() => requireEditableDraft(branch)).not.toThrow();
    expect(() => requireSubmission(branch)).not.toThrow();
    expect(missingSetupFields(branch)).toEqual([]);
  },
);
it.each(['submitted', 'under_review', 'approved', 'suspended'] as const)(
  'SEC TRUST-006: owners cannot edit or resubmit %s via draft onboarding',
  (verificationStatus) => {
    const branch = { ...complete(), verificationStatus };
    expect(() => requireEditableDraft(branch)).toThrow('not editable');
    expect(() => requireSubmission(branch)).toThrow('not editable');
    expect(() => applyMainDraft(branch, { name: 'Spoof' })).toThrow('not editable');
    expect(() => applyHostelBasics(branch, { name: 'Spoof' })).toThrow('not editable');
  },
);
it('ONB-001: legacy missing primary and every incomplete required field block submission', () => {
  expect(() => requireSubmission(null)).toThrow('Complete main branch');
  expect(() => requireEditableDraft(null)).not.toThrow();
  const branch = complete();
  for (const field of ['category', 'cityId', 'areaId', 'addressLine', 'location'] as const)
    expect(() => requireSubmission({ ...branch, [field]: null })).toThrow('Complete main branch');
  expect(() => requireSubmission({ ...branch, addressLine: '  ' })).toThrow('Complete main branch');
});
it('SEC: replay projection excludes form details and recalculates missing fields', () => {
  const branch = complete();
  const hostel: HostelOnboarding = {
    id: randomUUID(),
    organizationId: randomUUID(),
    name: 'Private',
    logoFileId: randomUUID(),
    mainBranch: branch,
    missingFields: ['main_branch'],
  };
  expect(setupState(hostel)).toEqual({
    id: hostel.id,
    organizationId: hostel.organizationId,
    mainBranchId: branch.id,
    verificationStatus: 'draft',
    missingFields: [],
  });
  expect(setupState({ ...hostel, mainBranch: null })).toEqual({
    id: hostel.id,
    organizationId: hostel.organizationId,
    mainBranchId: null,
    verificationStatus: null,
    missingFields: ['main_branch'],
  });
});
it('ONB-001: city-only and empty drafts are valid; actual active hierarchy is accepted', () => {
  expect(() => requireDraftGeography(draft(), undefined, undefined, undefined)).not.toThrow();
  expect(() =>
    requireDraftGeography({ ...draft(), cityId: city.id }, city, undefined, undefined),
  ).not.toThrow();
  expect(() => requireDraftGeography(complete(), city, area, subArea)).not.toThrow();
});
it.each([undefined, { ...city, isActive: false }, { ...city, id: randomUUID() }])(
  'SEC: unavailable or inactive city is concealed',
  (value) => {
    expect(() => requireDraftGeography(complete(), value, area, subArea)).toThrow(
      'Location unavailable',
    );
  },
);
it.each([
  undefined,
  { ...area, isActive: false },
  { ...area, id: randomUUID() },
  { ...area, cityId: randomUUID() },
  { ...area, level: 'sub_area' as const },
])('SEC: invalid primary area is concealed', (value) => {
  expect(() => requireDraftGeography(complete(), city, value, subArea)).toThrow(
    'Location unavailable',
  );
});
it.each([
  undefined,
  { ...subArea, isActive: false },
  { ...subArea, id: randomUUID() },
  { ...subArea, cityId: randomUUID() },
  { ...subArea, level: 'area' as const },
  { ...subArea, parentId: randomUUID() },
])('SEC: wrong sub-area parent or inactive geography is concealed', (value) => {
  expect(() => requireDraftGeography(complete(), city, area, value)).toThrow(
    'Location unavailable',
  );
});
it('SEC: area without city and sub-area without area cannot be saved', () => {
  expect(() =>
    requireDraftGeography({ ...complete(), cityId: null }, undefined, area, subArea),
  ).toThrow('Location unavailable');
  expect(() =>
    requireDraftGeography({ ...complete(), areaId: null }, city, undefined, subArea),
  ).toThrow('Location unavailable');
});

it.each(['zone', 'sector', 'area'] as const)(
  'ONB-001: existing primary geography level %s and zone parents are supported',
  (level) => {
    expect(() =>
      requireDraftGeography(complete(), city, { ...area, level, parentId: randomUUID() }, subArea),
    ).not.toThrow();
  },
);
it('HSM-SETUP v2.14: optional tier and year save on basics, survive main-branch saves and clear on null', () => {
  const legacy = applyMainDraft(complete(), { name: 'Main branch', category: 'working_male' });
  expect(legacy).toMatchObject({ propertyTier: null, establishmentYear: null });
  const tiered = applyHostelBasics(legacy, {
    name: 'Hostel',
    category: 'working_male',
    propertyTier: 'premium',
    establishmentYear: 2019,
  });
  expect(tiered).toMatchObject({
    category: 'working_male',
    propertyTier: 'premium',
    establishmentYear: 2019,
  });
  expect(
    applyMainDraft(tiered, { name: 'Main branch', addressLine: 'Changed address' }),
  ).toMatchObject({
    propertyTier: 'premium',
    establishmentYear: 2019,
  });
  expect(
    applyHostelBasics(tiered, { name: 'Hostel', propertyTier: null, establishmentYear: null }),
  ).toMatchObject({ propertyTier: null, establishmentYear: null, category: 'working_male' });
});
