import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deliverResidentBilling } from '../src/index.js';
import {
  residentCharges,
  residentLedger,
  residentInvoices,
  residentInvoiceCharges,
  residentBillingOrigins,
  residentBillingExecutions,
  residentBillingSchedules,
  notificationOutbox,
  hostelAuditLog,
} from '../src/schema/index.js';
import { billingDeliveryFixture } from './resident-billing-delivery.fixture.js';
import { rentTime } from './resident-rent.fixture.js';
it.each([
  residentCharges,
  residentLedger,
  residentInvoices,
  residentInvoiceCharges,
  residentBillingOrigins,
  residentBillingExecutions,
  notificationOutbox,
  hostelAuditLog,
])(
  'AUD-004 / ACC-004: mandatory insert failure %# rejects the owning transaction',
  async (table) => {
    const f = billingDeliveryFixture({
      stay: { expectedLeaveDate: '2028-04-01' },
      fail: { table, kind: 'insert' },
    });
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'Fixture write failed',
    );
  },
);
it.each([residentBillingSchedules, notificationOutbox])(
  'ACC-004: schedule or acknowledgement update failure %# propagates',
  async (table) => {
    const f = billingDeliveryFixture({ fail: { table, kind: 'update' } });
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'Fixture write failed',
    );
  },
);
it.each([{ ackRows: [] }, { ackRows: [{ id: randomUUID() }] }])(
  'SEC-003: acknowledgement must affect the exact one owned lease: %#',
  async ({ ackRows }) => {
    const f = billingDeliveryFixture({ ackRows });
    await expect(deliverResidentBilling(f.database, f.input, () => rentTime)).rejects.toThrow(
      'Billing lease unavailable',
    );
  },
);
it.each([-1, 60000])(
  'SEC-003: clock movement %s before acknowledgement invalidates the transaction',
  async (delta) => {
    const f = billingDeliveryFixture();
    let calls = 0;
    const clock = () => (calls++ === 0 ? rentTime : new Date(rentTime.getTime() + delta));
    await expect(deliverResidentBilling(f.database, f.input, clock)).rejects.toThrow(
      'Billing lease expired',
    );
  },
);
