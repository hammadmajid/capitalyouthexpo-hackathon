import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { acknowledgeStayAgreement } from './agreement-acceptance.js';
const stayId = '10000000-0000-4000-8000-000000000001',
  agreementId = '10000000-0000-4000-8000-000000000002';
const input = { version: 2, termsDigest: 'a'.repeat(64), acknowledged: true };
const evidence = {
  id: stayId,
  branchId: stayId,
  stayId,
  agreementId,
  agreementVersion: 2,
  acceptedByUserId: stayId,
  acceptedAt: '2026-11-02T10:00:00.000Z',
  termsDigest: input.termsDigest,
  method: 'authenticated_acknowledgement',
};
function client(data: unknown) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'test-access' },
    fetch: vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  });
}
it('STAY-002: accepts only evidence for the exact original stay/version/digest', async () => {
  await expect(
    acknowledgeStayAgreement(client(evidence), stayId, agreementId, input, stayId),
  ).resolves.toEqual(evidence);
  for (const invalid of [
    { ...evidence, stayId: agreementId },
    { ...evidence, agreementId: stayId },
    { ...evidence, agreementVersion: 3 },
    { ...evidence, termsDigest: 'b'.repeat(64) },
    { ...evidence, actorSessionId: stayId },
  ])
    await expect(
      acknowledgeStayAgreement(client(invalid), stayId, agreementId, input, stayId),
    ).rejects.toThrow();
});
