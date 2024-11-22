import { expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { files } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  paymentActor as actor,
  paymentIds as ids,
  paymentNow as now,
  paymentFile,
} from '../../test/unit/stay-payment.fixture.js';
import { authorizeRecordedPaymentProof } from './payment-proof.js';
it('SEC-003 / PAY-008: only actor-owned clean private proof can attach, with mandatory sensitive audit in exact transaction', async () => {
  const f = queryFixture();
  f.enqueue(files, [paymentFile]);
  const audit = new AuditWriter(),
    sensitive = vi.spyOn(audit, 'sensitive').mockResolvedValue();
  await authorizeRecordedPaymentProof(f.transaction, actor, ids.file, 'private-test', now, audit);
  expect(f.locks).toEqual([{ table: files, mode: 'update' }]);
  const predicate = f.predicates[0];
  if (!predicate) throw Error('File scope missing');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([
    ids.file,
    actor.userId,
    'private-test',
    'private',
    'payment_proof',
    'clean',
  ]);
  expect(sensitive).toHaveBeenCalledWith(f.transaction, {
    actorUserId: actor.userId,
    subjectUserId: actor.userId,
    resource: 'private_document',
    resourceId: ids.file,
    purpose: 'Own payment proof attachment to recorded hostel receipt',
    createdAt: now,
  });
});
it.each([
  { id: ids.receipt },
  { uploadedBy: ids.customer },
  { uploadedBy: null },
  { bucket: 'other' },
  { visibility: 'public' },
  { purpose: 'resident_document' },
  { scanStatus: 'pending' },
  { scanStatus: 'rejected' },
  { sha256: null },
  { sha256: Buffer.alloc(31) },
  { objectKey: 'quarantine/payment_proof/' + ids.file + '/source' },
  { objectKey: 'private/payment_proof/' + ids.receipt + '/source' },
])(
  'SEC-003: inaccessible or malformed own proof %# cannot attach to an approved payment',
  async (patch) => {
    const f = queryFixture();
    f.enqueue(files, [{ ...paymentFile, ...patch }]);
    const audit = new AuditWriter(),
      sensitive = vi.spyOn(audit, 'sensitive');
    await expect(
      authorizeRecordedPaymentProof(f.transaction, actor, ids.file, 'private-test', now, audit),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(sensitive).not.toHaveBeenCalled();
  },
);
it('SEC-003: missing proof is opaque404 and default sensitive audit failure propagates', async () => {
  const f = queryFixture();
  await expect(
    authorizeRecordedPaymentProof(f.transaction, actor, ids.file, 'private-test', now),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  f.enqueue(files, [paymentFile]);
  await authorizeRecordedPaymentProof(f.transaction, actor, ids.file, 'private-test', now);
  expect(f.writes).toHaveLength(1);
  const g = queryFixture();
  g.enqueue(files, [paymentFile]);
  const audit = new AuditWriter();
  vi.spyOn(audit, 'sensitive').mockRejectedValue(new Error('Sensitive audit unavailable'));
  await expect(
    authorizeRecordedPaymentProof(g.transaction, actor, ids.file, 'private-test', now, audit),
  ).rejects.toThrow('Sensitive audit unavailable');
});
