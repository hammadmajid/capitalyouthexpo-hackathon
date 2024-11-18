import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readVerificationDossier,
  readVerificationHistory,
  readVerificationEvidence,
  readVerificationPhotos,
  readVerificationPricing,
  submitVerificationDecision,
} from './admin-verification.js';
const id = '10000000-0000-4000-8000-000000000001';
function wire(body: unknown) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(body));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
      fetch,
    }),
  };
}
it('TRUST-002: dossier preserves current-record provenance and bounded subreader query paths', async () => {
  const dossier = {
    branchId: id,
    branchName: 'Branch',
    organizationName: 'Org',
    status: 'submitted',
    updatedAt: '2026-10-30T10:00:00.000Z',
    submittedAt: null,
    completenessScore: null,
    category: null,
    addressLine: null,
    description: null,
    cityId: null,
    areaId: null,
    location: null,
    publicPhone: null,
    publicEmail: null,
    showPublicContact: false,
    propertyTier: null,
    establishmentYear: null,
    owner: { fullName: 'Owner', cnicLast4: null, profileCompletedAt: null },
    evidence: [],
    source: 'current_record',
  };
  const first = wire(dossier);
  expect(await readVerificationDossier(first.client, id)).toEqual(dossier);
  const page = wire({ data: [], nextCursor: null });
  for (const read of [readVerificationHistory, readVerificationPricing, readVerificationPhotos])
    await read(page.client, id, { cursor: id, limit: 2 });
  for (const [request] of page.fetch.mock.calls) {
    const url = new URL((request as Request).url);
    expect(url.searchParams.get('cursor')).toBe(id);
    expect(url.searchParams.get('limit')).toBe('2');
  }
});
it('SEC-003: evidence access is one explicit purpose POST without a replay key', async () => {
  const value = wire({
    url: 'https://private.example.test/signed',
    expiresAt: '2026-10-30T10:01:00.000Z',
  });
  await readVerificationEvidence(value.client, id, id, { justification: 'Owner identity review' });
  const request = value.fetch.mock.calls[0]?.[0] as Request;
  expect(request.method).toBe('POST');
  expect(request.headers.has('Idempotency-Key')).toBe(false);
  expect(request.url).toContain('/evidence/' + id + '/access');
  expect(await request.json()).toEqual({ justification: 'Owner identity review' });
  expect(value.fetch).toHaveBeenCalledTimes(1);
  expect(() => readVerificationEvidence(value.client, id, id, { justification: '' })).toThrow();
  expect(value.fetch).toHaveBeenCalledTimes(1);
});
it('ADM-007: decision transports exact stale-dossier conditions with original idempotency key', async () => {
  const value = wire({
    branchId: id,
    branchName: 'Branch',
    organizationName: 'Org',
    status: 'approved',
    updatedAt: '2026-10-30T10:00:00.000Z',
  });
  const body = {
    action: 'approve',
    expectedStatus: 'submitted',
    expectedUpdatedAt: '2026-10-30T09:59:00.000Z',
  };
  await submitVerificationDecision(value.client, id, body, id);
  const request = value.fetch.mock.calls[0]?.[0] as Request;
  expect(request.headers.get('Idempotency-Key')).toBe(id);
  expect(await request.json()).toEqual(body);
});
