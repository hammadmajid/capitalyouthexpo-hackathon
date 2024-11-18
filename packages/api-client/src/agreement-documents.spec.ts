import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readAgreementFiles, attachAgreementFile } from './agreement-documents.js';
const id = '10000000-0000-4000-8000-000000000001',
  foreign = '10000000-0000-4000-8000-000000000002';
const target = { branchId: id, stayId: id, agreementId: id };
const row = {
  id,
  ...target,
  fileId: id,
  label: 'Scan',
  uploadedBy: id,
  createdAt: '2026-11-02T10:00:00Z',
};
function client(data: unknown) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'test' },
    fetch: vi.fn(
      async () =>
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  });
}
it('STAY-002 / ACC-004: rejects foreign records and broken continuation', async () => {
  await expect(
    readAgreementFiles(
      client({ ...target, data: [{ ...row, agreementId: foreign }], nextCursor: null }),
      target,
    ),
  ).rejects.toThrow();
  await expect(
    readAgreementFiles(client({ ...target, data: [row], nextCursor: foreign }), target, {
      limit: 1,
    }),
  ).rejects.toThrow();
  await expect(
    readAgreementFiles(client({ ...target, data: [row], nextCursor: null }), target),
  ).resolves.toMatchObject({ data: [row] });
});
it('STAY-002: requires the exact file and label in attachment evidence', async () => {
  await expect(
    attachAgreementFile(
      client({ ...row, fileId: foreign }),
      target,
      { fileId: id, label: 'Scan' },
      id,
    ),
  ).rejects.toThrow();
});
