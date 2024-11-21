import { expect, it, vi } from 'vitest';
import { hostelAuditLog, platformAuditLog, sensitiveAccessLog } from '@hsm/db';
import { AuditWriter, type Transaction } from './writer.js';
it('SEC-003: all audit kinds use the supplied business transaction and propagate write failure', async () => {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  const transaction = { insert } as unknown as Transaction;
  const writer = new AuditWriter();
  const event = {
    actorUserId: '1d63425f-b1ca-401a-8572-a13e3e840aa2',
    actorRole: 'owner',
    action: 'manager.suspended',
    targetType: 'manager_assignment',
    targetId: '115b8abc-a9b9-4692-9526-a319020a390b',
    before: { status: 'active' },
    after: { status: 'suspended' },
  };
  await writer.hostel(transaction, {
    ...event,
    organizationId: '18c06d37-187c-4365-8373-40dc48571567',
  });
  expect(insert).toHaveBeenCalledWith(hostelAuditLog);
  await writer.platform(transaction, event);
  expect(insert).toHaveBeenCalledWith(platformAuditLog);
  await writer.sensitive(transaction, {
    actorUserId: event.actorUserId,
    subjectUserId: event.actorUserId,
    resource: 'cnic',
    purpose: 'self identity',
  });
  expect(insert).toHaveBeenCalledWith(sensitiveAccessLog);
  values.mockRejectedValue(new Error('Audit unavailable'));
  await expect(writer.platform(transaction, event)).rejects.toThrow('Audit unavailable');
});
