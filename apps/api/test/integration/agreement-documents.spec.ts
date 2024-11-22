import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { agreementFiles, files, users, stayAgreements } from '@hsm/db';
import {
  billingPolicyVersionSchema,
  manualAdmissionResultSchema,
  stayRecordSchema,
  agreementFileSchema,
  agreementFilePageSchema,
  downloadResponseSchema,
} from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { manualAdmissionFixture, admitResident } from './manual-admission.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
async function file(
  purpose: 'agreement_template' | 'stay_agreement' | 'avatar',
  uploader = f.ownerId,
  clean = true,
) {
  const id = randomUUID(),
    key = verifiedKey(purpose, id);
  const bytes = await readFile(new URL('./fixtures/gallery.png', import.meta.url));
  await f.storage.storage.putVerified(key, 'image/png', bytes);
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: uploader,
    visibility: 'private',
    bucket: f.storage.bucket,
    objectKey: key,
    purpose,
    mimeType: 'image/png',
    sizeBytes: BigInt(bytes.length),
    scanStatus: clean ? 'clean' : 'pending',
    sha256: clean ? createHash('sha256').update(bytes).digest() : null,
  });
  return id;
}
function get(url: string, token = f.ownerToken) {
  return f.application.inject({ url, headers: { authorization: 'Bearer ' + token } });
}
function command(
  url: string,
  payload: unknown,
  token = f.ownerToken,
  method: 'POST' | 'PUT' = 'POST',
  key = randomUUID(),
) {
  return f.application.inject({
    method,
    url,
    payload: JSON.stringify(payload),
    headers: {
      authorization: 'Bearer ' + token,
      'Idempotency-Key': key,
      'content-type': 'application/json',
    },
  });
}
it('STAY-002 / SEC-003: versions template terms, scopes scans to original stays and retains immutable evidence', async () => {
  const item = await manualAdmissionFixture(f, f.customerB),
    templateId = await file('agreement_template');
  const template = {
    title: 'House agreement',
    text: 'Visitor and resident conduct rules',
    fileId: templateId,
  };
  const templateUrl = `/v1/branches/${item.branchId}/agreement-template`;
  const save = await command(
    templateUrl,
    { policyVersionId: item.input.manual.terms.policyVersionId, template },
    f.ownerToken,
    'PUT',
  );
  expect(save.statusCode, save.body).toBe(200);
  const version = billingPolicyVersionSchema.parse(save.json());
  expect(version.policy).toEqual({
    ...item.input.manual.terms.policy,
    agreementTemplate: template,
  });
  expect(
    (
      await command(
        templateUrl,
        { policyVersionId: item.input.manual.terms.policyVersionId, template },
        f.ownerToken,
        'PUT',
      )
    ).statusCode,
  ).toBe(412);
  expect(
    (await command(templateUrl, { policyVersionId: version.id, template }, f.customerAToken, 'PUT'))
      .statusCode,
  ).toBe(403);
  const admission = await admitResident(f, item, randomUUID(), f.ownerToken, {
    ...item.input,
    manual: {
      ...item.input.manual,
      terms: { ...item.input.manual.terms, policyVersionId: version.id, policy: version.policy },
    },
  });
  expect(admission.statusCode, admission.body).toBe(201);
  const stay = manualAdmissionResultSchema.parse(admission.json());
  const recordUrl = `/v1/me/stays/${stay.stayId}/record`;
  const record = stayRecordSchema.parse((await get(recordUrl, f.customerBToken)).json());
  const agreement = record.agreements[0];
  if (!agreement) throw new Error('Missing original agreement');
  const avatar = await file('avatar', f.customerB);
  await f.connection.db
    .update(users)
    .set({ profilePhotoFileId: avatar })
    .where(eq(users.id, f.customerB));
  for (const photoUrl of [
    `/v1/me/stays/${stay.stayId}/resident-photo`,
    `/v1/branches/${item.branchId}/stays/${stay.stayId}/resident-photo`,
  ]) {
    const response = await get(
      photoUrl,
      photoUrl.includes('/me/') ? f.customerBToken : f.ownerToken,
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(downloadResponseSchema.parse(response.json()).url).toContain(avatar);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(
    (await get(`/v1/me/stays/${stay.stayId}/resident-photo`, f.customerAToken)).statusCode,
  ).toBe(404);
  const own = `/v1/me/stays/${stay.stayId}/agreements/${agreement.id}/files`;
  const staff = `/v1/branches/${item.branchId}/stays/${stay.stayId}/agreements/${agreement.id}/files`;
  expect((await get(own, f.customerAToken)).statusCode).toBe(404);
  const scanId = await file('stay_agreement', f.customerB),
    key = randomUUID();
  const attach = await command(
    own,
    { fileId: scanId, label: 'Signed scan' },
    f.customerBToken,
    'POST',
    key,
  );
  expect(attach.statusCode, attach.body).toBe(201);
  const evidence = agreementFileSchema.parse(attach.json());
  expect(evidence).toMatchObject({
    stayId: stay.stayId,
    agreementId: agreement.id,
    uploadedBy: f.customerB,
  });
  const replay = await command(
    own,
    { fileId: scanId, label: 'Signed scan' },
    f.customerBToken,
    'POST',
    key,
  );
  expect(agreementFileSchema.parse(replay.json()).id).toBe(evidence.id);
  expect(agreementFilePageSchema.parse((await get(staff)).json()).data[0]?.id).toBe(evidence.id);
  expect((await get(staff + '?limit=51')).statusCode).toBe(400);
  for (const base of [own, staff]) {
    const token = base === own ? f.customerBToken : f.ownerToken;
    for (const id of [scanId, templateId]) {
      const download = await get(base + '/' + id + '/download', token);
      expect(download.statusCode, download.body).toBe(200);
      expect(downloadResponseSchema.parse(download.json()).url).toContain(id);
      expect(download.headers['cache-control']).toBe('no-store');
    }
  }
  const foreignFile = await file('stay_agreement', f.customerA);
  expect(
    (await command(own, { fileId: foreignFile, label: 'Wrong resident' }, f.customerBToken))
      .statusCode,
  ).toBe(404);
  expect((await get(staff + '/' + foreignFile + '/download')).statusCode).toBe(404);
  const pending = await file('stay_agreement', f.ownerId, false);
  expect((await command(staff, { fileId: pending, label: 'Pending scan' })).statusCode).toBe(409);
  const changed = await command(
    templateUrl,
    { policyVersionId: version.id, template: { ...template, text: 'Future terms only' } },
    f.ownerToken,
    'PUT',
  );
  expect(changed.statusCode, changed.body).toBe(200);
  expect(
    stayRecordSchema.parse((await get(recordUrl, f.customerBToken)).json()).agreements[0]?.terms
      .policy.agreementTemplate,
  ).toEqual(template);
  await expect(
    f.connection.db
      .update(agreementFiles)
      .set({ label: 'Rewritten' })
      .where(eq(agreementFiles.id, evidence.id)),
  ).rejects.toThrow();
  const [original] = await f.connection.db
    .select()
    .from(stayAgreements)
    .where(eq(stayAgreements.id, agreement.id));
  if (!original) throw new Error('Original agreement missing');
  await f.connection.db.insert(stayAgreements).values(
    Array.from({ length: 51 }, (_, index) => ({
      ...original,
      id: randomUUID(),
      version: index + 2,
      reason: 'Historical agreement pagination fixture',
    })),
  );
  const recent = stayRecordSchema.parse((await get(recordUrl, f.customerBToken)).json());
  expect(recent.agreements).toHaveLength(50);
  expect(recent.nextAgreementBeforeVersion).toBe(3);
  const older = stayRecordSchema.parse(
    (await get(recordUrl + '?beforeAgreementVersion=3', f.customerBToken)).json(),
  );
  expect(older.agreements.map((row) => row.version)).toEqual([2, 1]);
  expect(older.agreements[1]?.id).toBe(agreement.id);
  expect(older.nextAgreementBeforeVersion).toBeUndefined();
  expect((await get(recordUrl + '?beforeAgreementVersion=0', f.customerBToken)).statusCode).toBe(
    400,
  );
});
