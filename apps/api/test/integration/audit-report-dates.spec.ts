import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { reportSchema } from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';

const h = lifecycleHarness();
beforeAll(() => h.start());
afterAll(() => h.close());

it('RPT-001 / AUD-004: real single-day reports include Karachi boundaries and exclude the adjacent day', async () => {
  const { stay, item, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const f = h.fixture(),
    [invoice] = await h.invoices(stay.stayId);
  await h.ok(base + '/payments', {
    amountPaisa: rent,
    method: 'cash',
    paidOn: '2026-06-25',
    note: 'Paid directly',
    allocations: [{ invoiceId: invoice?.id, amountPaisa: rent }],
    depositPaisa: 0,
    advanceCreditPaisa: 0,
  });
  const instants = [
    '2026-06-25T19:00:00.000Z', // June 26, first local instant.
    '2026-06-26T07:00:00.000Z', // June 26, local midday.
    '2026-06-26T18:59:59.999Z', // June 26, last millisecond.
    '2026-06-26T19:00:00.000Z', // June 27, first local instant.
  ];
  for (const [index, instant] of instants.entries()) {
    await h.moveTo(instant);
    // Deliberately bypass the harness's one-minute send tick, not HTTP/auth, so
    // the persisted createdAt is exactly the boundary under test.
    const response = await f.application.inject({
      method: 'POST',
      url: '/v1/me/stays/' + stay.stayId + '/complaints',
      headers: { authorization: 'Bearer ' + f.customerAToken, 'Idempotency-Key': randomUUID() },
      payload: {
        category: 'other',
        title: 'Boundary ' + index,
        description: 'Synthetic boundary complaint for the same scoped Stay',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
  }
  await h.moveTo('2026-06-26T19:00:00.001Z');
  const checkedOut = await f.application.inject({
    method: 'POST',
    url: base + '/checkout',
    headers: { authorization: 'Bearer ' + f.ownerToken, 'Idempotency-Key': randomUUID() },
    payload: {
      expectedVersion: 1,
      reason: 'Synthetic boundary checkout',
      applyAvailableDeposit: false,
    },
  });
  expect(checkedOut.statusCode, checkedOut.body).toBe(200);

  const read = async (type: string, on: string) => {
    const response = await h.get(
      '/v1/owner/reports/' +
        type +
        '?branchIds=' +
        item.branchId +
        '&from=' +
        on +
        '&to=' +
        on +
        '&format=json',
    );
    expect(response.statusCode, response.body).toBe(200);
    const report = reportSchema.parse(response.json());
    expect(report.from).toBe(on);
    expect(report.to).toBe(on);
    expect(report.truncated).toBe(false);
    return report;
  };
  expect((await read('bookings', '2026-06-25')).rows).toHaveLength(1);
  expect((await read('bookings', '2026-06-26')).rows).toHaveLength(0);
  const complaints = await read('complaints', '2026-06-26');
  expect(complaints.rows).toHaveLength(3);
  expect(complaints.rows.every((row) => row[1] === '2026-06-26')).toBe(true);
  const next = await read('complaints', '2026-06-27');
  expect(next.rows).toHaveLength(1);
  expect(next.rows[0]?.[1]).toBe('2026-06-27');
  expect((await read('complaints', '2026-06-25')).rows).toHaveLength(0);
  expect((await read('complaints', '2026-06-28')).rows).toHaveLength(0);
  for (const on of ['2026-06-25', '2026-06-26', '2026-06-27'])
    expect((await read('residents', on)).rows).toHaveLength(1);
  expect((await read('residents', '2026-06-28')).rows).toHaveLength(0);
  const checkout = await read('checkout-history', '2026-06-27');
  expect(checkout.rows).toHaveLength(1);
  expect(checkout.rows[0]?.[1]).toBe('2026-06-27');
  expect((await read('checkout-history', '2026-06-26')).rows).toHaveLength(0);
  expect((await read('checkout-history', '2026-06-28')).rows).toHaveLength(0);
  expect((await read('payment-history', '2026-06-25')).rows).toHaveLength(1);
  expect((await read('payment-history', '2026-06-26')).rows).toHaveLength(0);
});
