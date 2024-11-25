import { expect, it } from 'vitest';
import { bedStatusText, bedTone } from './bed-tone';
it('PAY-008 / CHG-048: green (paid) only for an occupied bed whose rent is paid', () => {
  expect(bedTone({ state: 'occupied', rentStatus: 'paid' })).toBe('paid');
  expect(bedTone({ state: 'occupied', rentStatus: 'proof_pending' })).toBe('proof');
  expect(bedTone({ state: 'available', rentStatus: 'paid' } as never)).toBe('vacant');
  expect(bedTone({ state: 'reserved', rentStatus: 'clear' } as never)).toBe('reserved');
});
it('CHG-048: spoken status keeps occupancy and rent together', () => {
  expect(bedStatusText({ state: 'occupied', rentStatus: 'overdue' })).toBe('Occupied, Overdue');
  expect(bedStatusText({ state: 'occupied', rentStatus: 'clear' })).toBe(
    'Occupied, nothing billed yet',
  );
});
