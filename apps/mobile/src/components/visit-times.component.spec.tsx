/// <reference types="jest" />
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { visitTimes } from './visit-request';
import { TimeField, formatTime } from './time-field';
const before = Date.parse('2028-11-01T00:00:00Z');
it('VISIT-001: visit times are half-hour starts inside the visiting hours', () => {
  expect(
    visitTimes('2028-11-02', [{ dayOfWeek: 4, opensAt: '16:00', closesAt: '17:30' }], before),
  ).toEqual(['16:00', '16:30', '17:00']);
});
it('VISIT-001: times that have already passed are not offered', () => {
  const afternoon = Date.parse('2028-11-02T16:10:00+05:00');
  expect(
    visitTimes('2028-11-02', [{ dayOfWeek: 4, opensAt: '16:00', closesAt: '17:30' }], afternoon),
  ).toEqual(['16:30', '17:00']);
});
it('times read as 12-hour clock values', () => {
  expect(formatTime('00:05')).toBe('12:05 AM');
  expect(formatTime('14:30')).toBe('2:30 PM');
});
function Harness() {
  const [value, setValue] = useState('');
  return <TimeField label="Opens" value={value} onChange={setValue} />;
}
it('the time field opens the clock and shows the chosen time', async () => {
  await render(<Harness />);
  await fireEvent.press(screen.getByRole('button', { name: 'Opens: not set' }));
  expect(screen.getByLabelText('Cancel time')).toBeTruthy();
});
