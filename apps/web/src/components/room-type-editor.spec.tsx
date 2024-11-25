import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RoomTypeEditor } from './room-type-editor';
import type { RoomTypeInput } from '@hsm/contracts';
afterEach(cleanup);
const initial: RoomTypeInput = {
  name: 'Two beds',
  inventoryMode: 'both',
  capacity: 2,
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [{ code: 'mess', cadence: 'monthly', amountPaisa: 300000 }],
};
it('BKG-004: editing retains exact prices, disclosed fees and capacity', () => {
  const save = vi.fn();
  render(<RoomTypeEditor initial={initial} pending={false} onSave={save} onCancel={vi.fn()} />);
  expect(screen.getByLabelText('Monthly bed rent (Rs)')).toHaveProperty('value', '18,000.01');
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  expect(save).toHaveBeenCalledWith(initial);
});
it('BKG-004: invalid decimal prices fail before a mutation is called', () => {
  const save = vi.fn();
  render(<RoomTypeEditor initial={initial} pending={false} onSave={save} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Monthly bed rent (Rs)'), {
    target: { value: '18000.001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeDefined();
});
it('BKG-004: per-bed inventory omits whole-room pricing and preserves explicit zero deposit', () => {
  const save = vi.fn();
  render(<RoomTypeEditor initial={initial} pending={false} onSave={save} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Booking inventory'), { target: { value: 'per_bed' } });
  expect(screen.queryByLabelText('Monthly room rent (Rs)')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  expect(save).toHaveBeenCalledWith({
    ...initial,
    inventoryMode: 'per_bed',
    roomMonthlyRentPaisa: null,
  });
});
it('BKG-004: fee duplicates fail, removal restores a valid disclosed price', () => {
  const save = vi.fn();
  render(<RoomTypeEditor initial={initial} pending={false} onSave={save} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add disclosed fee' }));
  fireEvent.change(screen.getByLabelText('Fee 2 code'), { target: { value: 'mess' } });
  fireEvent.change(screen.getByLabelText('Fee 2 frequency'), { target: { value: 'monthly' } });
  fireEvent.change(screen.getByLabelText('Fee 2 amount (Rs)'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove fee 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save room type' }));
  expect(save).toHaveBeenCalledWith(initial);
});
it('ACC-004: pending save disables edits and cancellation', () => {
  const cancel = vi.fn();
  render(<RoomTypeEditor initial={initial} pending onSave={vi.fn()} onCancel={cancel} />);
  expect(screen.getByLabelText('Room type name').matches(':disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel edit' }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Saving room type…' }).matches(':disabled')).toBe(true);
});
