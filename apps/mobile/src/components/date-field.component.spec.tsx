/// <reference types="jest" />
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DateField, formatDate } from './date-field';
function Harness(props: { start: string; monthOnly?: boolean; optional?: boolean }) {
  const [value, setValue] = useState(props.start);
  return (
    <DateField
      label="Move-in date"
      value={value}
      onChange={setValue}
      minYear={2025}
      maxYear={2028}
      {...(props.monthOnly ? { monthOnly: true } : {})}
      {...(props.optional ? { optional: true } : {})}
    />
  );
}
test('dates show plainly and the wheels set day, month and year', async () => {
  expect(formatDate('2026-11-05')).toBe('5 Nov 2026');
  expect(formatDate('2026-11-01', true)).toBe('Nov 2026');
  await render(<Harness start="2026-11-05" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Move-in date: 5 Nov 2026' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Month Feb' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Year 2028' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Day 29' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set date' }));
  expect(screen.getByRole('button', { name: 'Move-in date: 29 Feb 2028' })).toBeTruthy();
});
test('a short month clamps the day, and month-only mode saves the first day', async () => {
  await render(<Harness start="2026-01-31" monthOnly />);
  await fireEvent.press(screen.getByRole('button', { name: 'Move-in date: Jan 2026' }));
  expect(screen.queryByLabelText('Day')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Month Apr' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set date' }));
  expect(screen.getByRole('button', { name: 'Move-in date: Apr 2026' })).toBeTruthy();
});
test('an optional empty date can be chosen, then cleared', async () => {
  await render(<Harness start="" optional />);
  await fireEvent.press(screen.getByRole('button', { name: 'Move-in date: not set' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set date' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Clear Move-in date' }));
  expect(screen.getByRole('button', { name: 'Move-in date: not set' })).toBeTruthy();
});
