import { expect, it } from 'vitest';
import { projectDiscoveryPage, projectDiscoveryRow } from './discovery-state.js';
const first = '019a1234-1234-7123-8123-123456789abc',
  second = '019a1234-1234-7123-8123-123456789abd';
const row = {
  branchId: first,
  brandName: 'Actual brand',
  name: 'Actual branch',
  slug: 'actual',
  category: 'boys',
  city: 'Islamabad',
  area: null,
  latitude: 33.68,
  longitude: 73.04,
  distanceMeters: null,
  priceFromPaisa: '1800001',
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [{ code: 'wifi', name: 'Wi-Fi' }],
  media: [],
};
it('ACC-002 / BKG-004: exact decimal paisa and known-empty/undated availability remain truthful', () => {
  expect(projectDiscoveryRow(row, false)).toMatchObject({
    verified: true,
    priceFromPaisa: 1800001,
    availableBeds: null,
    availableWholeRooms: null,
  });
  expect(
    projectDiscoveryRow(
      { ...row, priceFromPaisa: null, availableBeds: '0', availableWholeRooms: '0' },
      true,
    ),
  ).toMatchObject({ priceFromPaisa: null, availableBeds: 0, availableWholeRooms: 0 });
  expect(
    projectDiscoveryRow({ ...row, availableBeds: '2', availableWholeRooms: '1' }, true),
  ).toMatchObject({ availableBeds: 2, availableWholeRooms: 1 });
  expect(
    projectDiscoveryRow({ ...row, priceFromPaisa: String(Number.MAX_SAFE_INTEGER) }, false)
      .priceFromPaisa,
  ).toBe(Number.MAX_SAFE_INTEGER);
});
it.each([
  '-1',
  '1.5',
  '01',
  'NaN',
  'Infinity',
  ' ',
  '0x10',
  '1e3',
  '9'.repeat(33),
  '9007199254740992',
])(
  'ACC-002 / BKG-004: invalid/unsafe aggregate %s cannot become public money or a count',
  (value) => {
    expect(() => projectDiscoveryRow({ ...row, priceFromPaisa: value }, false)).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
    expect(() =>
      projectDiscoveryRow({ ...row, availableBeds: value, availableWholeRooms: '0' }, true),
    ).toThrowError(expect.objectContaining({ code: 'INTERNAL' }));
  },
);
it('ACC-002: a date-state mismatch cannot invent live counts or erase a failed aggregate', () => {
  for (const [input, dated] of [
    [row, true],
    [{ ...row, availableBeds: '0' }, false],
    [{ ...row, availableBeds: '0', availableWholeRooms: null }, true],
  ] as const)
    expect(() => projectDiscoveryRow(input, dated)).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
});
it('ACC-002 / SEC-003: private, malformed, duplicate or oversized metadata fails closed', () => {
  for (const input of [
    { ...row, occupantName: 'Private identity' },
    { ...row, latitude: 100 },
    { ...row, media: [{ id: first, altText: 'Actual image', objectKey: 'private/key' }] },
    {
      ...row,
      media: [
        { id: first, altText: 'A' },
        { id: second, altText: 'B' },
      ],
    },
    { ...row, amenities: [row.amenities[0], row.amenities[0]] },
    { ...row, amenities: Array.from({ length: 101 }, () => row.amenities[0]) },
    { ...row, amenities: [{ code: 'wifi', name: 'Wi-Fi', customerId: first }] },
    { ...row, availableBeds: undefined },
    { ...row, priceFromPaisa: 1800001 },
  ])
    expect(() => projectDiscoveryRow(input, false)).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
});
it('ACC-002: public paging uses the actual final returned UUID and preserves genuine empty state', () => {
  expect(projectDiscoveryPage([], 20, false)).toEqual({ data: [], nextCursor: null });
  const page = projectDiscoveryPage([row, { ...row, branchId: second }], 1, false);
  expect(page.data.map((item) => item.branchId)).toEqual([first]);
  expect(page.nextCursor).toBe(first);
  expect(
    projectDiscoveryPage([{ ...row, branchId: second }], 1, false, first, [second]).nextCursor,
  ).toBeNull();
});
it('ACC-002: every probe row is ordered, unique, bounded and within requested scope', () => {
  for (const rows of [
    [row, row],
    [{ ...row, branchId: second }, row],
    [row, { ...row, branchId: second }, row],
    [row, { ...row, occupantName: 'Private probe' }],
  ])
    expect(() => projectDiscoveryPage(rows, 1, false)).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
  expect(() => projectDiscoveryPage([row], 20, false, first)).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  expect(() => projectDiscoveryPage([row], 20, false, undefined, [second])).toThrowError(
    expect.objectContaining({ code: 'INTERNAL' }),
  );
  for (const limit of [0, -1, 101, 1.5])
    expect(() => projectDiscoveryPage([], limit, false)).toThrowError(
      expect.objectContaining({ code: 'INTERNAL' }),
    );
});
