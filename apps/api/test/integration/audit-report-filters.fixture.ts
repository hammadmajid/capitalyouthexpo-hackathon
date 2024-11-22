import { expect } from 'vitest';
import { reportSchema, toCsv, transportRouteSchema } from '@hsm/contracts';
import { lifecycleHarness } from './phase-nine-fixture.js';
import { renderReportPdf } from '../../src/insights/report-pdf.js';
type Harness = ReturnType<typeof lifecycleHarness>;
export async function createReportFilterFacts(h: Harness, branchId: string, stayId: string) {
  await h.ok(
    `/v1/me/stays/${stayId}/complaints`,
    {
      category: 'other',
      title: 'Historical room complaint',
      description: 'Synthetic complaint raised in the original assignment',
    },
    h.fixture().customerAToken,
  );
  const route = transportRouteSchema.parse(
    await h.ok(`/v1/branches/${branchId}/transport/routes`, {
      name: 'Synthetic route',
      monthlyChargePaisa: 10000,
      departureTimes: ['07:30'],
      stops: ['Synthetic stop'],
    }),
  );
  await h.ok(
    `/v1/me/stays/${stayId}/transport/subscriptions`,
    {
      routeId: route.id,
      monthlyChargePaisa: 10000,
    },
    h.fixture().customerAToken,
  );
}
export function reportFilterReader(h: Harness, branchId: string) {
  return async (type: string, query: string) => {
    const response = await h.get(`/v1/branches/${branchId}/reports/${type}?${query}`);
    expect(response.statusCode, response.body).toBe(200);
    const report = reportSchema.parse(response.json());
    expect(response.headers['x-hsm-report-truncated']).toBe(String(report.truncated));
    return report;
  };
}
export async function verifyReportFilterFamilies(
  h: Harness,
  item: { branchId: string; roomId: string },
  otherRoom: string,
  residentId: string,
  buildingId: string,
  floorId: string,
) {
  const read = reportFilterReader(h, item.branchId);
  const original = `from=2026-06-25&to=2026-06-26&roomId=${item.roomId}`;
  const other = `from=2026-06-25&to=2026-06-26&roomId=${otherRoom}`;
  for (const type of [
    'residents',
    'bookings',
    'outstanding-dues',
    'payment-history',
    'security-deposits',
    'complaints',
  ]) {
    expect((await read(type, original)).rows, type).toHaveLength(1);
    expect((await read(type, other)).rows, type).toHaveLength(0);
  }
  const combined =
    original + `&residentId=${residentId}&buildingId=${buildingId}&floorId=${floorId}`;
  const outstanding = await read('outstanding-dues', combined);
  expect(outstanding.rows[0]?.at(-1)).toBe('1.00');
  expect(
    (await read('outstanding-dues', combined + '&status=' + outstanding.rows[0]?.[4])).rows,
  ).toHaveLength(1);
  expect((await read('outstanding-dues', combined + '&status=paid')).rows).toHaveLength(0);
  expect((await read('rent-collection', original)).rows[0]?.slice(2)).toEqual([
    '1',
    '18000.00',
    '17999.00',
    '1.00',
    '1',
  ]);
  expect((await read('rent-collection', other)).rows[0]?.slice(2)).toEqual([
    '0',
    '0.00',
    '0.00',
    '0.00',
    '0',
  ]);
  expect((await read('rent-collection', original + '&status=paid')).rows[0]?.slice(2)).toEqual([
    '0',
    '0.00',
    '0.00',
    '0.00',
    '0',
  ]);
  expect((await read('transport-subscribers', original + '&status=requested')).rows).toHaveLength(
    1,
  );
  expect((await read('transport-subscribers', other + '&status=requested')).rows).toHaveLength(0);
  expect((await read('transport-subscribers', original)).rows).toHaveLength(0);
  // Every format must use the same scoped table, including canonical amounts.
  for (const type of [
    'residents',
    'bookings',
    'outstanding-dues',
    'payment-history',
    'security-deposits',
    'complaints',
  ]) {
    const expected = await read(type, original);
    const path = `/v1/branches/${item.branchId}/reports/${type}?${original}`;
    const csv = await h.get(path + '&format=csv');
    expect(csv.statusCode, csv.body).toBe(200);
    expect(csv.body).toBe(toCsv(expected));
    const pdf = await h.get(path + '&format=pdf');
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.rawPayload).toEqual(renderReportPdf(expected, 'HSM report: ' + type));
  }
}
