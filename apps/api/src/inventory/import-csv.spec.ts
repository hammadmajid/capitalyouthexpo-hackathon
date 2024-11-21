import { expect, it } from 'vitest';
import { parseInventoryCsv } from './import-csv.js';
const type = '10000000-0000-4000-8000-000000000001';
it('PROP-001: CSV parses UTF-8/BOM, CRLF, quoted delimiters, escapes and newlines without evaluating cells', () => {
  expect(
    parseInventoryCsv(
      Buffer.from('\uFEFFroom_type_id,room_number\r\n' + type + ',"201, A"\r\n'),
      'rooms',
    )[0],
  ).toMatchObject({ roomTypeId: type, roomNumber: '201, A', errors: [] });
  expect(
    parseInventoryCsv(Buffer.from('room_number,bed_label\n"Room ""A""","Bed\n1"'), 'seats')[0],
  ).toMatchObject({ roomNumber: 'Room "A"', bedLabel: 'Bed\n1', errors: [] });
});
it('PROP-001: row validation records wrong field counts, identifiers, blanks and duplicates without accepting truncated values', () => {
  const result = parseInventoryCsv(
    Buffer.from(
      'room_type_id,room_number\ninvalid,\n' +
        type +
        ',201\n' +
        type +
        ',201\n' +
        type +
        ',' +
        'a'.repeat(81) +
        '\n' +
        type +
        ',202,extra',
    ),
    'rooms',
  );
  expect(result.map((row) => row.errors)).toEqual([
    ['INVALID_VALUE'],
    [],
    ['DUPLICATE_ROW'],
    ['INVALID_VALUE'],
    ['INVALID_VALUE'],
  ]);
  expect(result[3]?.roomNumber).toHaveLength(80);
});
it.each([
  '',
  'wrong,header\n201,B1',
  'room_number,bed_label',
  'room_number,bed_label\n"unfinished,B1',
  'room_number,bed_label\n201,B"1',
  'room_number,bed_label\n"201"x,B1',
  'room_number,bed_label\n201,' + 'x'.repeat(501),
  'room_number,bed_label\n1,2,3,4,5',
])('PROP-001: reject malformed or oversized CSV before persistence', (text) => {
  expect(() => parseInventoryCsv(Buffer.from(text), 'seats')).toThrow();
});
it('PROP-001: invalid UTF-8 and more than 500 records reject the whole file', () => {
  expect(() => parseInventoryCsv(Buffer.from([0xff, 0xfe]), 'rooms')).toThrow();
  const text =
    'room_number,bed_label\n' +
    Array.from({ length: 500 }, (_, index) => '201,B' + index).join('\n');
  expect(parseInventoryCsv(Buffer.from(text), 'seats')).toHaveLength(500);
  expect(() => parseInventoryCsv(Buffer.from(text + '\n201,B501'), 'seats')).toThrow();
});
