import { BookingPolicyReadController } from '../../src/inventory/policy-read.controller.js';
import { InventoryLifecycleController } from '../../src/inventory/lifecycle.controller.js';
import { CustomerBookingDocumentController } from '../../src/booking/documents.customer.controller.js';
import { OwnerBookingDocumentController } from '../../src/booking/documents.owner.controller.js';
import { BookingEvidenceController } from '../../src/booking/evidence.controller.js';
import { expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { assertRouteScopes, declaration } from '../../src/authorization/scope.js';
import { BookingPolicyController } from '../../src/inventory/policy.controller.js';
import { InstitutionController } from '../../src/marketplace/directory.controller.js';
it('ACC-004: Phase 2 policy and directory routes declare valid default-deny access', () => {
  expect(() => assertRouteScopes([BookingPolicyController, InstitutionController])).not.toThrow();
  const scope = declaration(
    new Reflector(),
    BookingPolicyController.prototype.platform,
    BookingPolicyController,
  );
  expect(scope.success).toBe(true);
  if (scope.success) expect(scope.data).toMatchObject({ kind: 'admin', rootOnly: true });
});

it('CHG-008 / ACC-004: private booking evidence declares Owner-only branch authorization', () => {
  expect(() => assertRouteScopes([BookingEvidenceController])).not.toThrow();
  const scope = declaration(
    new Reflector(),
    BookingEvidenceController.prototype.download,
    BookingEvidenceController,
  );
  expect(scope.success).toBe(true);
  if (scope.success)
    expect(scope.data).toEqual({ kind: 'branch', branchParam: 'branchId', ownerOnly: true });
});

it('CHG-008 / ACC-004: document workflow declares self/Customer and Owner-only boundaries', () => {
  expect(() =>
    assertRouteScopes([CustomerBookingDocumentController, OwnerBookingDocumentController]),
  ).not.toThrow();
  const reflector = new Reflector();
  for (const method of ['queue', 'review'] as const) {
    const scope = declaration(
      reflector,
      OwnerBookingDocumentController.prototype[method],
      OwnerBookingDocumentController,
    );
    expect(scope.success).toBe(true);
    if (scope.success)
      expect(scope.data).toEqual({ kind: 'branch', branchParam: 'branchId', ownerOnly: true });
  }
  const submit = declaration(
    reflector,
    CustomerBookingDocumentController.prototype.submit,
    CustomerBookingDocumentController,
  );
  expect(submit.success).toBe(true);
  if (submit.success) expect(submit.data).toMatchObject({ kind: 'customer' });
});

it('ACC-004: every physical inventory lifecycle route declares exact branch authorization', () => {
  expect(() => assertRouteScopes([InventoryLifecycleController])).not.toThrow();
  for (const method of [
    'roomState',
    'seatState',
    'archiveRoomType',
    'archiveRoom',
    'archiveSeat',
  ] as const) {
    const scope = declaration(
      new Reflector(),
      InventoryLifecycleController.prototype[method],
      InventoryLifecycleController,
    );
    expect(scope.success).toBe(true);
    if (scope.success)
      expect(scope.data).toEqual({ kind: 'branch', branchParam: 'branchId', ownerOnly: false });
  }
});

it('BKG-006 ACC-004: policy reads preserve Root/Owner/assigned branch default-deny scopes', () => {
  expect(() => assertRouteScopes([BookingPolicyReadController])).not.toThrow();
  for (const method of ['platform', 'hostel', 'branch', 'roomType'] as const) {
    const scope = declaration(
      new Reflector(),
      BookingPolicyReadController.prototype[method],
      BookingPolicyReadController,
    );
    expect(scope.success).toBe(true);
    if (!scope.success) throw new Error('Missing scope declaration');
    if (method === 'platform') expect(scope.data).toMatchObject({ kind: 'admin', rootOnly: true });
    else if (method === 'hostel') expect(scope.data).toMatchObject({ kind: 'owner' });
    else expect(scope.data).toEqual({ kind: 'branch', branchParam: 'branchId', ownerOnly: false });
  }
});
