import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  readBookingSettings,
  saveBookingSettings,
  type BookingPolicyTarget,
} from './booking-policy.js';
const id = randomUUID(),
  branchId = randomUUID(),
  versionId = randomUUID(),
  key = randomUUID();
const cases: [BookingPolicyTarget, string][] = [
  [{ level: 'platform' }, '/v1/admin/booking-policy'],
  [{ level: 'hostel', id }, `/v1/owner/brands/${id}/booking-policy`],
  [{ level: 'branch', id: branchId }, `/v1/branches/${branchId}/booking-policy`],
  [
    { level: 'room_type', id, branchId },
    `/v1/branches/${branchId}/inventory/room-types/${id}/booking-policy`,
  ],
];
const policy = {
  bookingMode: 'request',
  holdSeconds: 600,
  requestExpirySeconds: 3600,
  requestReservesInventory: true,
  minimumStayDays: 1,
  maximumStayDays: 365,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 90,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 24,
  allowedStayUnits: ['day'],
  allowEvidenceReuse: true,
  documentReviewRequired: false,
  requiredDocuments: [],
};
const limits = {
  maximumHoldSeconds: 3600,
  maximumActiveHolds: 3,
  maximumRequestExpirySeconds: 86400,
  maximumAdvanceDays: 365,
  maximumFiniteStayDays: 730,
};
function wire(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (request, init) => {
      requests.push(request instanceof Request ? request : new Request(request, init));
      return Response.json(body);
    },
  });
  function request() {
    const result = requests[0];
    if (!result) throw new Error('Expected request');
    return result;
  }
  return { client, requests, request };
}
const descriptor = (target: BookingPolicyTarget) => ({
  level: target.level,
  scopeId: target.level === 'platform' ? null : target.id,
});
it.each(cases)('BKG-006: %j reads only its exact protected settings path', async (target, path) => {
  const response = { configured: false, target: descriptor(target), canEdit: false },
    value = wire(response);
  expect(await readBookingSettings(value.client, target)).toEqual(response);
  expect(new URL(value.request().url).pathname).toBe(path);
  expect(value.request().method).toBe('GET');
  expect(value.request().headers.has('Idempotency-Key')).toBe(false);
  expect(value.request().headers.has('X-CSRF-Token')).toBe(false);
});
it.each(cases)(
  'BKG-006: %j saves explicit policy values with CSRF and stable command key',
  async (target, path) => {
    const response = { ...descriptor(target), id: versionId },
      value = wire(response);
    const body =
      target.level === 'platform'
        ? { policy, limits }
        : { overrides: { holdSeconds: null, requiredDocuments: [] } };
    expect(await saveBookingSettings(value.client, target, body, key)).toEqual(response);
    expect(new URL(value.request().url).pathname).toBe(path);
    expect(value.request().method).toBe('PUT');
    expect(await value.request().json()).toEqual(body);
    expect(value.request().headers.get('Idempotency-Key')).toBe(key);
    expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
  },
);
it('SEC-003: read rejects another target and malformed/private response additions', async () => {
  const target = { level: 'branch' as const, id: branchId };
  for (const response of [
    { configured: false, target: { level: 'branch', scopeId: randomUUID() }, canEdit: true },
    { configured: false, target: { level: 'hostel', scopeId: branchId }, canEdit: true },
    { configured: false, target: descriptor(target), canEdit: true, customerIdentity: 'private' },
  ])
    await expect(readBookingSettings(wire(response).client, target)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
});
it('SEC-003: configured reads reject a local version from another scope', async () => {
  const target = { level: 'branch' as const, id: branchId };
  const value = wire({
    configured: true,
    target: descriptor(target),
    canEdit: true,
    localVersion: { id: versionId, level: 'branch', scopeId: randomUUID() },
    overrides: {},
    inherited: policy,
    effective: policy,
    limits,
    lineage: [{ id: versionId, level: 'platform', scopeId: null }],
  });
  await expect(readBookingSettings(value.client, target)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('BKG-006: configured reads preserve effective values and immutable lineage', async () => {
  const response = {
    configured: true,
    target: { level: 'platform', scopeId: null },
    canEdit: true,
    localVersion: { id: versionId, level: 'platform', scopeId: null },
    overrides: null,
    inherited: null,
    effective: policy,
    limits,
    lineage: [{ id: versionId, level: 'platform', scopeId: null }],
  };
  expect(await readBookingSettings(wire(response).client, { level: 'platform' })).toEqual(response);
});
it('SEC-003: writes reject a response for another target', async () => {
  await expect(
    saveBookingSettings(
      wire({ id: versionId, level: 'hostel', scopeId: id }).client,
      { level: 'branch', id: branchId },
      { overrides: {} },
      key,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: invalid scope, key and input fail before transport', async () => {
  const value = wire({});
  await expect(
    readBookingSettings(value.client, { level: 'branch', id: 'invalid' }),
  ).rejects.toThrow();
  await expect(
    saveBookingSettings(
      value.client,
      { level: 'branch', id: branchId },
      { overrides: {} },
      'invalid',
    ),
  ).rejects.toThrow();
  await expect(
    saveBookingSettings(value.client, { level: 'platform' }, { policy, limits: {} }, key),
  ).rejects.toThrow();
  await expect(
    saveBookingSettings(
      value.client,
      { level: 'branch', id: branchId },
      { overrides: { disableAudit: true } },
      key,
    ),
  ).rejects.toThrow();
  expect(value.requests).toHaveLength(0);
});

it('BKG-006: omitted override fields stay absent while explicit null inheritance is preserved', async () => {
  const value = wire({ id: versionId, level: 'branch', scopeId: branchId });
  await saveBookingSettings(
    value.client,
    { level: 'branch', id: branchId },
    { overrides: { bookingMode: undefined, holdSeconds: undefined, requiredDocuments: null } },
    key,
  );
  expect(await value.request().json()).toEqual({ overrides: { requiredDocuments: null } });
});

it('BKG-006: every explicit override survives the typed wire boundary unchanged', async () => {
  const value = wire({ id: versionId, level: 'branch', scopeId: branchId });
  await saveBookingSettings(
    value.client,
    { level: 'branch', id: branchId },
    { overrides: policy },
    key,
  );
  expect(await value.request().json()).toEqual({ overrides: policy });
});
