import { expect, it } from 'vitest';
import { groupNumberInput, groupedNumberEdit, ungroupNumberInput } from './number-input.js';
it.each([
  ['1000', '1,000'],
  ['1234567.89', '1,234,567.89'],
  ['0.', '0.'],
  ['90071992547409.91', '90,071,992,547,409.91'],
  ['-12345.6700', '-12,345.6700'],
])('UI-001: grouping preserves exact numeric text %s', (raw, display) => {
  expect(groupNumberInput(raw)).toBe(display);
  expect(ungroupNumberInput(display)).toBe(raw);
});
it('UI-001: live edits retain the decimal, exact digits and caret in the middle', () => {
  expect(groupedNumberEdit('999', '9990')).toEqual({ value: '9990', text: '9,990', cursor: 5 });
  expect(groupedNumberEdit('12,345', '129,345')).toEqual({
    value: '129345',
    text: '129,345',
    cursor: 4,
  });
  expect(groupedNumberEdit('1,234', '1,23')).toEqual({ value: '123', text: '123', cursor: 3 });
  expect(groupedNumberEdit('0', '01')).toEqual({ value: '1', text: '1', cursor: 1 });
  expect(ungroupNumberInput('.50')).toBe('0.50');
});
it('UI-001: invalid input stays visible for validation rather than becoming a different number', () => {
  expect(groupNumberInput('1e6')).toBe('1e6');
  expect(ungroupNumberInput('abc123')).toBe('abc123');
});

it('UI-001: deleting a comma removes the adjacent digit without trapping the caret', () => {
  expect(groupedNumberEdit('1,234', '1234', 64, 2)).toEqual({
    value: '234',
    text: '234',
    cursor: 0,
  });
  expect(groupedNumberEdit('1,234', '1234', 64, 1)).toEqual({
    value: '134',
    text: '134',
    cursor: 1,
  });
});
