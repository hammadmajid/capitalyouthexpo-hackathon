import { z } from 'zod';
import { DomainError, type InventoryImportKind, type InventoryImportRow } from '@hsm/contracts';
function invalid(): never {
  throw new DomainError(
    'VALIDATION_FAILED',
    400,
    'Use a valid UTF-8 CSV template with 1 to 500 records',
  );
}
// RFC4180 quoted fields, embedded newlines and CRLF; no spreadsheet formula evaluation.
function csvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  function field() {
    if (cell.length > 500) invalid();
    record.push(cell);
    cell = '';
    closed = false;
  }
  function row() {
    field();
    if (record.some((value) => value.length)) records.push(record);
    record = [];
    if (records.length > 501) invalid();
  }
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"') {
        if (text.charAt(index + 1) === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === ',') field();
    else if (char === '\n' || char === '\r') {
      row();
      if (char === '\r' && text.charAt(index + 1) === '\n') index++;
    } else {
      if (closed || char === '"') invalid();
      cell += char;
    }
    if (cell.length > 500 || record.length > 3) invalid();
  }
  if (quoted) invalid();
  if (cell || record.length || closed) row();
  return records;
}
export function parseInventoryCsv(bytes: Buffer, kind: InventoryImportKind): InventoryImportRow[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return invalid();
  }
  const records = csvRecords(text),
    header = records.shift(),
    expected = kind === 'rooms' ? ['room_type_id', 'room_number'] : ['room_number', 'bed_label'];
  if (
    !header ||
    header.length !== 2 ||
    header.some((value, index) => value.trim() !== expected[index]) ||
    !records.length
  )
    invalid();
  const identifier = z.string().uuid(),
    label = z.string().trim().min(1).max(80),
    seen = new Set<string>();
  return records.map((record, index) => {
    const left = record[0]?.trim() ?? '',
      right = record[1]?.trim() ?? '',
      key = kind === 'rooms' ? right : left + '\u0000' + right,
      valid =
        record.length === 2 &&
        label.safeParse(right).success &&
        (kind === 'rooms' ? identifier.safeParse(left).success : label.safeParse(left).success);
    const errors: InventoryImportRow['errors'] = [];
    if (!valid) errors.push('INVALID_VALUE');
    if (seen.has(key)) errors.push('DUPLICATE_ROW');
    seen.add(key);
    return {
      recordNumber: index + 2,
      roomTypeId: kind === 'rooms' ? left.slice(0, 80).toLowerCase() : null,
      roomNumber: (kind === 'rooms' ? right : left).slice(0, 80),
      bedLabel: kind === 'seats' ? right.slice(0, 80) : null,
      errors,
    };
  });
}
