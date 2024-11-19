import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readReport, reportDownloadPath, type ReportClientQuery } from './platform-admin.js';
const branch = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const building = '30000000-0000-4000-8000-000000000001';
const floor = '40000000-0000-4000-8000-000000000001';
const resident = '50000000-0000-4000-8000-000000000001';
it('RPT-001 / AUD-010: JSON and both downloads preserve every selected filter and owner branches', async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    expect(input).toBeInstanceOf(Request);
    return Response.json({
      type: 'residents',
      from: null,
      to: null,
      columns: [],
      rows: [],
      truncated: false,
    });
  });
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => undefined },
    fetch,
  });
  const query = {
    branchIds: [branch],
    buildingId: building,
    floorId: floor,
    roomId: room,
    residentId: resident,
    status: 'active' as const,
    from: '2026-06-25',
    to: '2026-06-28',
  };
  await readReport(client, 'residents', query);
  const request = fetch.mock.calls[0]?.[0] as Request | undefined;
  expect(request).toBeDefined();
  for (const url of [
    request?.url ?? '',
    ...(['csv', 'pdf'] as const).map(
      (format) => 'https://example.test' + reportDownloadPath('residents', format, query),
    ),
  ]) {
    const params = new URL(url).searchParams;
    expect(params.get('roomId')).toBe(room);
    expect(params.get('buildingId')).toBe(building);
    expect(params.get('floorId')).toBe(floor);
    expect(params.get('residentId')).toBe(resident);
    expect(params.get('status')).toBe('active');
    expect(params.getAll('branchIds')).toEqual([branch]);
    expect(params.get('from')).toBe('2026-06-25');
    expect(params.get('to')).toBe('2026-06-28');
  }
});
it.each([
  ['occupancy', { residentId: resident }],
  ['payment-history', { status: 'active' }],
  ['residents', { status: 'paid' }],
  ['residents', { roomId: 'invalid' }],
  ['residents', { branchIds: [] }],
  ['residents', { branchId: branch, branchIds: [room] }],
  ['residents', { from: '2026-06-30', to: '2026-06-25' }],
] satisfies [string, ReportClientQuery][])(
  'RPT-001 / AUD-010: invalid scope never produces an ignored-filter download: %s %o',
  (kind, query) => {
    expect(() => reportDownloadPath(kind, 'csv', query)).toThrow();
  },
);
