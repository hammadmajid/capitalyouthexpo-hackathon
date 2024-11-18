import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  ownBookingDocuments,
  pendingBookingDocuments,
  submitBookingDocument,
  reviewBookingDocument,
  downloadBookingDocument,
} from './booking-documents.js';
const branchId = '019a1234-1234-7123-8123-123456789abc',
  id = '019a1234-1234-7123-8123-123456789abd';
const fileId = '019a1234-1234-7123-8123-123456789abe';
const metadata = {
  id,
  branchId,
  bookingId: null,
  kind: 'student_id',
  state: 'pending',
  createdAt: '2026-10-15T10:00:00Z',
  reviewedAt: null,
  rejectionCode: null,
};
function wire(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  function request() {
    const first = requests[0];
    if (!first) throw new Error('Missing request');
    return first;
  }
  return { client, requests, request };
}
it('SEC-003: own document history uses authenticated bounded server pagination', async () => {
  const value = wire({ data: [{ ...metadata, fileId, consumedAt: null }], nextCursor: id });
  const page = await ownBookingDocuments(value.client, branchId, { limit: 5, cursor: id });
  expect(page.data[0]?.fileId).toBe(fileId);
  const url = new URL(value.request().url);
  expect(url.pathname).toBe(`/v1/me/booking-documents/${branchId}`);
  expect(url.searchParams.get('cursor')).toBe(id);
  expect(url.searchParams.get('limit')).toBe('5');
  expect(value.request().credentials).toBe('include');
});
it('CHG-008: Owner queue accepts metadata but rejects private references from a malformed server', async () => {
  const value = wire({ data: [metadata], nextCursor: null });
  expect((await pendingBookingDocuments(value.client, branchId)).data).toEqual([metadata]);
  const unsafe = wire({ data: [{ ...metadata, fileId }], nextCursor: null });
  await expect(pendingBookingDocuments(unsafe.client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('CHG-008: submission sends explicit Owner-sharing consent with CSRF and idempotency', async () => {
  const value = wire({ ...metadata, fileId, consumedAt: null });
  const input = { kind: 'student_id' as const, fileId, shareWithOwner: true as const };
  await submitBookingDocument(value.client, branchId, input, id);
  expect(await value.request().json()).toEqual(input);
  expect(value.request().headers.get('Idempotency-Key')).toBe(id);
  expect(value.request().headers.get('X-CSRF-Token')).toBe('fixture-csrf');
});
it('CHG-008: review sends strict decision to exact Owner document path', async () => {
  const value = wire({
    ...metadata,
    state: 'rejected',
    reviewedAt: metadata.createdAt,
    rejectionCode: 'unreadable',
  });
  await reviewBookingDocument(
    value.client,
    branchId,
    id,
    { state: 'rejected', rejectionCode: 'unreadable' },
    fileId,
  );
  expect(value.request().method).toBe('POST');
  expect(new URL(value.request().url).pathname).toBe(
    `/v1/branches/${branchId}/booking-documents/${id}/review`,
  );
  expect(await value.request().json()).toEqual({ state: 'rejected', rejectionCode: 'unreadable' });
});
it('SEC-003: signed download metadata is validated without leaking raw provider data', async () => {
  const result = {
      url: 'https://storage.example.test/download',
      expiresAt: '2026-10-15T10:01:00Z',
    },
    value = wire(result);
  expect(await downloadBookingDocument(value.client, branchId, id)).toEqual(result);
  expect(new URL(value.request().url).pathname).toBe(
    `/v1/branches/${branchId}/booking-documents/${id}/download`,
  );
});
it('SEC-003: invalid identifiers, injected scope and missing consent fail before IO', () => {
  const value = wire({});
  expect(() => ownBookingDocuments(value.client, 'invalid')).toThrow();
  expect(() =>
    pendingBookingDocuments(value.client, branchId, Object.assign({ limit: 5 }, { userId: id })),
  ).toThrow();
  expect(() => downloadBookingDocument(value.client, branchId, 'invalid')).toThrow();
  const submission = { kind: 'student_id' as const, fileId, shareWithOwner: true as const };
  Reflect.set(submission, 'shareWithOwner', false);
  expect(() => submitBookingDocument(value.client, branchId, submission, id)).toThrow();
  expect(value.requests).toHaveLength(0);
});
