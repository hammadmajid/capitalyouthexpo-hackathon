import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { notificationOutbox } from '../src/schema/index.js';
import { enqueueResidentLifecycle } from '../src/resident-lifecycle.js';
import {
  admissionWriterFixture as fixture,
  admissionNow as now,
  admissionIds as ids,
} from './resident-manual-admission.fixture.js';
const input = { event: 'resident.admitted', stayId: ids.stay, historyId: ids.history };
it('NTF-002 / ACC-004: admission domain event is recipient-free and bound to immutable history in the caller transaction', async () => {
  const f = fixture();
  await enqueueResidentLifecycle(f.tx, input, now);
  expect(f.writes).toEqual([
    {
      table: notificationOutbox,
      value: {
        eventType: 'resident.lifecycle',
        channel: 'in_app',
        recipientUserId: null,
        payload: input,
        dedupeKey: 'resident.lifecycle:resident.admitted:' + ids.history,
        createdAt: now,
        nextAttemptAt: now,
      },
    },
  ]);
});
it('ACC-004: mandatory event failure propagates rather than completing half an admission', async () => {
  await expect(
    enqueueResidentLifecycle(fixture(notificationOutbox).tx, input, now),
  ).rejects.toThrow('Required admission write failed');
});
it.each([
  { stayId: 'bad' },
  { historyId: 'bad' },
  { event: 'resident.paid' },
  { recipientUserId: randomUUID() },
  { phone: '+923001234567' },
  { body: 'Private text' },
])(
  'SEC-003 / NTF-002: malformed or recipient/content-injected domain job %# rejects before writes',
  async (patch) => {
    const f = fixture();
    await expect(enqueueResidentLifecycle(f.tx, { ...input, ...patch }, now)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  },
);
it('SEC-003: invalid server event clock cannot enqueue a job', async () => {
  const f = fixture();
  await expect(enqueueResidentLifecycle(f.tx, input, new Date(Number.NaN))).rejects.toThrow();
  expect(f.writes).toEqual([]);
});
